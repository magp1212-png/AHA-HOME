"""Registro, inicio de sesión (contraseña o PIN del técnico), verificación del correo y datos de la cuenta."""
import base64
import binascii
import datetime as dt
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import config, correo
from ..db import get_db
from ..deps import current_user
from ..models import Notificacion, Orden, User, ahora
from ..security import hash_password, make_token, verify_password

router = APIRouter(tags=["cuenta"])
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def limpiar_tel(t: str | None) -> str | None:
    if not t:
        return None
    d = "".join(ch for ch in t if ch.isdigit())
    if d.startswith("58"):
        d = "0" + d[2:]
    return d or None


def normalizar_cedula(c: str) -> str:
    c = c.upper().replace(".", "").replace(" ", "").replace("-", "")
    letra = c[0] if c[:1] in ("V", "E") else "V"
    num = "".join(ch for ch in c if ch.isdigit())
    if not 5 <= len(num) <= 9:
        raise HTTPException(422, "Número de cédula inválido")
    return f"{letra}-{int(num):,}".replace(",", ".")


def perfil(u: User) -> dict:
    d = {"id": u.id, "nombre": u.nombre, "telefono": u.telefono, "email": u.email, "rol": u.rol, "cedula": u.cedula,
         "tienda_id": u.tienda_id, "foto": u.foto, "email_verificado": u.email_verificado, "es_ceo": bool(u.es_ceo and u.rol == "superadmin"), "clave_temporal": bool(u.clave_temporal),
         "verificacion_vence": u.verificacion_vence.isoformat() + "Z" if u.verificacion_vence and not u.email_verificado else None}
    if u.rol in ("agente", "tecnico_supervisor", "supervisor", "superadmin"):
        from ..deps import permisos_de
        d["permisos"] = permisos_de(u)
    if u.tecnico:
        t = u.tecnico
        d["tecnico"] = {"id": t.id, "grupo": t.grupo, "tienda": t.tienda.nombre, "zona": t.tienda.zona,
                        "es_ayudante": t.es_ayudante, "jefe": t.jefe.user.nombre if t.jefe else None,
                        "verificado": t.verificado, "tiene_pin": bool(t.pin_hash),
                        "onboarding_completo": bool(t.foto_rostro and t.selfie_cedula)}
    return d


# ---------- Verificación del correo (24 horas) ----------

def purgar_no_verificados(db: Session) -> int:
    """Elimina del registro a los clientes que no verificaron su correo a tiempo."""
    vencidos = db.scalars(select(User).where(User.rol == "cliente", User.email_verificado.is_(False),
                                             User.verificacion_vence < ahora())).all()
    for u in vencidos:
        for n in db.scalars(select(Notificacion).where(Notificacion.user_id == u.id)):
            db.delete(n)
        db.delete(u)
    if vencidos:
        db.commit()
    return len(vencidos)


def enviar_verificacion(u: User) -> None:
    url = f"{config.PUBLIC_URL}/auth/verificar?token={u.verificacion_token}"
    vence = (u.verificacion_vence + dt.timedelta(hours=config.UTC_OFFSET_HOURS)).strftime("%d/%m/%Y %I:%M %p")
    cuerpo = (f'<p>Hola {u.nombre.split()[0]}, confirma tu correo para activar tu cuenta de AHA HOME.</p>'
              f'<p style="margin:22px 0">{correo.boton(url, "Verificar mi correo")}</p>'
              f'<p style="color:#4A5568">Este enlace vence en {config.VERIFICACION_HORAS} horas ({vence}, hora de Caracas). '
              f'Si no lo verificas a tiempo, tu cuenta se elimina del registro y tendrás que registrarte de nuevo.</p>')
    correo.enviar(u.email, "Verifica tu correo · AHA HOME", correo.plantilla("Verifica tu correo", cuerpo),
                  f"Verifica tu correo de AHA HOME en las próximas {config.VERIFICACION_HORAS} horas: {url}")


class Registro(BaseModel):
    """Registro rápido del cliente: foto, cédula, teléfono y correo (más nombre y contraseña para entrar)."""
    nombre: str = Field(min_length=2, max_length=120)
    cedula: str = Field(min_length=5, max_length=20)
    telefono: str = Field(min_length=7, max_length=30)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=6, max_length=100)
    foto: str = Field(min_length=20, max_length=9_000_000)  # selfie en base64


@router.post("/auth/registro")
def registro(body: Registro, db: Session = Depends(get_db)):
    from .. import config
    if config.SOLO_EQUIPO:
        raise HTTPException(403, config.MENSAJE_SOLO_EQUIPO)
    purgar_no_verificados(db)  # libera teléfonos y correos de registros vencidos
    tel = limpiar_tel(body.telefono)
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Correo inválido")
    cedula = normalizar_cedula(body.cedula)
    if db.scalar(select(User).where(User.telefono == tel)):
        raise HTTPException(409, "Ese teléfono ya está registrado")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Ese correo ya está registrado")
    if db.scalar(select(User).where(User.cedula == cedula)):
        raise HTTPException(409, "Esa cédula ya está registrada")
    try:
        datos = base64.b64decode(body.foto.split(",")[-1], validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "La foto llegó dañada; tómala de nuevo")
    if len(datos) > config.MAX_IMAGE_BYTES:
        raise HTTPException(413, "La foto pesa demasiado")
    config.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    nombre_foto = secrets.token_urlsafe(18) + ".jpg"
    (config.UPLOADS_DIR / nombre_foto).write_bytes(datos)
    u = User(nombre=body.nombre.strip(), cedula=cedula, telefono=tel, email=email, password_hash=hash_password(body.password),
             rol="cliente", foto=f"/archivos/{nombre_foto}", email_verificado=False, verificacion_token=secrets.token_urlsafe(32),
             verificacion_vence=ahora() + dt.timedelta(hours=config.VERIFICACION_HORAS))
    db.add(u)
    db.commit()
    db.refresh(u)
    enviar_verificacion(u)
    return {"token": make_token(u.id), "usuario": perfil(u)}


@router.post("/auth/reenviar-verificacion")
def reenviar(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.email_verificado:
        return {"ok": True, "ya_verificado": True}
    user.verificacion_token = secrets.token_urlsafe(32)  # el enlace anterior deja de servir; el plazo de 24 h no cambia
    db.commit()
    enviar_verificacion(user)
    return {"ok": True}


def _pagina(titulo: str, texto: str, ok: bool) -> HTMLResponse:
    color = "#167A45" if ok else "#B42318"
    html = (f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{titulo} · AHA HOME</title></head><body style="margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;'
            f'background:#F4F7FB;color:#1A1C3D"><div style="max-width:480px;margin:40px auto;padding:0 16px">'
            f'<div style="background:#21244D;border-radius:16px;padding:18px 20px"><div style="font-weight:900;font-size:22px;color:#fff">AHA HOME</div>'
            f'<div style="color:#CFD72A;font-weight:700">Hacemos todo por ti</div></div>'
            f'<h1 style="color:{color};font-size:24px">{titulo}</h1><p style="font-size:17px;line-height:1.5">{texto}</p></div></body></html>')
    return HTMLResponse(html, status_code=200 if ok else 400)


@router.get("/auth/verificar", response_class=HTMLResponse)
def verificar(token: str, db: Session = Depends(get_db)):
    purgar_no_verificados(db)
    u = db.scalar(select(User).where(User.verificacion_token == token)) if token else None
    if not u:
        return _pagina("Enlace no válido", "Este enlace ya no sirve. Si pasaron más de 24 horas, regístrate de nuevo en la app.", False)
    if not u.email_verificado:
        u.email_verificado, u.verificacion_token = True, None
        # Ahora sí: los pedidos que le crearon en caja con su teléfono quedan en su cuenta
        for o in db.scalars(select(Orden).where(Orden.cliente_telefono == u.telefono, Orden.cliente_id.is_(None))):
            o.cliente_id = u.id
        db.commit()
    return _pagina("¡Correo verificado!", f"Gracias, {u.nombre.split()[0]}. Tu cuenta de AHA HOME está activa. Vuelve a la app.", True)


class Login(BaseModel):
    usuario: str  # teléfono o correo
    password: str


@router.post("/auth/login")
def login(body: Login, db: Session = Depends(get_db)):
    purgar_no_verificados(db)
    ident = body.usuario.strip().lower()
    u = db.scalar(select(User).where(or_(User.email == ident, User.telefono == limpiar_tel(ident))))
    if not u or not u.activo or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Teléfono, correo o contraseña incorrectos. Si no verificaste tu correo en 24 horas, regístrate de nuevo.")
    from .. import config
    if config.SOLO_EQUIPO and u.rol not in config.ROLES_EQUIPO:
        raise HTTPException(403, config.MENSAJE_SOLO_EQUIPO)
    from ..auditoria import registrar
    registrar(db, u, "POST", "/auth/login", 200, "", "Inició sesión")
    db.commit()
    return {"token": make_token(u.id), "usuario": perfil(u)}


class LoginPin(BaseModel):
    telefono: str
    pin: str = Field(min_length=4, max_length=8)


@router.post("/auth/login-pin")
def login_pin(body: LoginPin, db: Session = Depends(get_db)):
    """Acceso del técnico o ayudante con su PIN personal (la app pide antes huella o rostro del teléfono)."""
    from .. import config
    if config.SOLO_EQUIPO:
        raise HTTPException(403, config.MENSAJE_SOLO_EQUIPO)
    u = db.scalar(select(User).where(User.telefono == limpiar_tel(body.telefono), User.rol.in_(("tecnico", "ayudante"))))
    if not u or not u.activo or not u.tecnico or not verify_password(body.pin, u.tecnico.pin_hash):
        raise HTTPException(401, "Teléfono o PIN incorrectos")
    return {"token": make_token(u.id), "usuario": perfil(u)}


@router.get("/yo")
def yo(user: User = Depends(current_user)):
    return perfil(user)


class PushToken(BaseModel):
    token: str = Field(max_length=200)


@router.post("/yo/push")
def guardar_push(body: PushToken, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.push_token = body.token
    db.commit()
    return {"ok": True}


@router.post("/yo/push/quitar")
def quitar_push(body: PushToken, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Al cerrar sesión: este teléfono deja de recibir los avisos de esta cuenta."""
    if user.push_token == body.token:
        user.push_token = None
        db.commit()
    return {"ok": True}


class DatosPersonales(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    telefono: str = Field(min_length=7, max_length=30)
    email: str = Field(default="", max_length=160)


@router.put("/yo")
def editar_datos(body: DatosPersonales, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Mi perfil · Datos personales (AHA HOGAR v2). La cédula no se cambia desde la app."""
    tel = limpiar_tel(body.telefono)
    if not tel or not re.fullmatch(r"04(12|14|16|22|24|26)\d{7}", tel):
        raise HTTPException(422, "Teléfono venezolano no válido (0412, 0414, 0416, 0422, 0424 o 0426 + 7 dígitos)")
    email = body.email.strip().lower() or None
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(422, "Correo no válido")
    if db.scalar(select(User).where(User.telefono == tel, User.id != user.id)):
        raise HTTPException(409, "Ese teléfono ya está registrado en otra cuenta")
    if email and db.scalar(select(User).where(User.email == email, User.id != user.id)):
        raise HTTPException(409, "Ese correo ya está registrado en otra cuenta")
    user.nombre, user.telefono = body.nombre.strip(), tel
    if user.rol != "cliente" or email:
        user.email = email or user.email
    db.commit()
    return perfil(user)


class CambioClave(BaseModel):
    actual: str = Field(max_length=100)
    nueva: str = Field(max_length=100)
    repetir: str = Field(max_length=100)


@router.post("/yo/contrasena")
def cambiar_contrasena(body: CambioClave, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Mi perfil · Contraseña y seguridad: 8 caracteres o más, con una letra y un número."""
    if not user.password_hash or not verify_password(body.actual, user.password_hash):
        raise HTTPException(422, "La contraseña actual no es correcta")
    if len(body.nueva) < 8 or not re.search(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]", body.nueva) or not re.search(r"\d", body.nueva):
        raise HTTPException(422, "La nueva contraseña debe tener al menos 8 caracteres, una letra y un número")
    if body.nueva != body.repetir:
        raise HTTPException(422, "Las contraseñas nuevas no coinciden")
    if verify_password(body.nueva, user.password_hash):
        raise HTTPException(422, "La nueva contraseña debe ser distinta de la actual")
    user.password_hash = hash_password(body.nueva)
    user.clave_temporal = False
    from ..notificar import notificar
    notificar(db, user.id, "Cambiaste tu contraseña", "Si no fuiste tú, escribe de inmediato a Soporte AHA HOME.")
    db.commit()
    return {"ok": True}


@router.get("/notificaciones")
def notificaciones(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ns = db.scalars(select(Notificacion).where(Notificacion.user_id == user.id).order_by(Notificacion.id.desc()).limit(50)).all()
    return [{"id": n.id, "titulo": n.titulo, "texto": n.texto, "orden_id": n.orden_id, "leida": n.leida,
             "fecha": n.creado.isoformat() + "Z"} for n in ns]


@router.post("/notificaciones/{nid}/leer")
def leer_una(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(Notificacion, nid)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Aviso no encontrado")
    n.leida = True
    db.commit()
    return {"ok": True}


@router.post("/notificaciones/leer")
def leer_todas(user: User = Depends(current_user), db: Session = Depends(get_db)):
    for n in db.scalars(select(Notificacion).where(Notificacion.user_id == user.id, Notificacion.leida.is_(False))):
        n.leida = True
    db.commit()
    return {"ok": True}
