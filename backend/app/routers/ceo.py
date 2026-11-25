"""Centro de mando del CEO: quién del equipo está dentro y qué ha hecho cada uno (auditoría)."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auditoria import EQUIPO, ROL_TEXTO, en_linea
from ..db import get_db
from ..deps import current_user
from ..models import Auditoria, Tienda, User, ahora

router = APIRouter(prefix="/ceo", tags=["centro de mando"])


def solo_ceo(user: User = Depends(current_user)) -> User:
    if not (user.rol == "superadmin" and user.es_ceo):
        raise HTTPException(403, "Solo el CEO puede ver el centro de mando")
    return user


def _iso(x):
    return x.isoformat() + "Z" if x else None


@router.get("/equipo")
def equipo(user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    """Todas las personas del equipo con su último acceso, si están en línea y cuántas acciones hicieron hoy."""
    hoy = ahora().replace(hour=0, minute=0, second=0, microsecond=0)
    cuentas = dict(db.execute(select(Auditoria.user_id, func.count(Auditoria.id)).where(Auditoria.creado >= hoy).group_by(Auditoria.user_id)).all())
    filas = []
    for u in db.scalars(select(User).where(User.rol.in_(EQUIPO)).order_by(User.rol, User.nombre)):
        ult = db.scalar(select(Auditoria).where(Auditoria.user_id == u.id).order_by(Auditoria.id.desc()).limit(1))
        tienda = db.get(Tienda, u.tienda_id).nombre if u.tienda_id else None
        filas.append({"id": u.id, "nombre": u.nombre, "email": u.email, "rol": u.rol, "rol_texto": "CEO" if u.es_ceo else ROL_TEXTO.get(u.rol, u.rol),
                      "tienda": tienda, "activo": u.activo, "en_linea": en_linea(u), "ultimo_acceso": _iso(u.ultimo_acceso_en), "ip": u.ultimo_ip,
                      "acciones_hoy": cuentas.get(u.id, 0), "ultima_accion": ult.accion if ult else None, "ultima_accion_en": _iso(ult.creado) if ult else None})
    filas.sort(key=lambda f: (not f["en_linea"], f["ultimo_acceso"] is None, -(dt.datetime.fromisoformat(f["ultimo_acceso"][:-1]).timestamp()) if f["ultimo_acceso"] else 0))
    return {"en_linea": sum(f["en_linea"] for f in filas), "total": len(filas), "equipo": filas}


@router.get("/actividad")
def actividad(usuario_id: int | None = None, rol: str | None = None, limite: int = 200, user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    """Registro de lo que hizo el equipo, lo más reciente primero. Se puede filtrar por persona o por rol."""
    q = select(Auditoria).order_by(Auditoria.id.desc()).limit(max(1, min(limite, 1000)))
    if usuario_id:
        q = q.where(Auditoria.user_id == usuario_id)
    if rol:
        q = q.where(Auditoria.rol == rol)
    filas = []
    nombres: dict[int, User] = {}
    for a in db.scalars(q):
        u = nombres.get(a.user_id) or db.get(User, a.user_id)
        nombres[a.user_id] = u
        filas.append({"id": a.id, "quien": u.nombre if u else "?", "rol": a.rol, "rol_texto": "CEO" if u and u.es_ceo else ROL_TEXTO.get(a.rol, a.rol),
                      "accion": a.accion, "ruta": a.ruta, "estado": a.estado, "ip": a.ip, "en": _iso(a.creado)})
    return filas


# ---------- Usuarios del personal: los crea el CEO con su clave y sus limitaciones ----------
import re
import secrets as _secrets

from pydantic import BaseModel, Field

from ..deps import PERMISOS, PERMISOS_POR_ROL, permisos_de
from ..security import hash_password

ROLES_PERSONAL = {"ceo": "CEO (acceso total)", "superadmin": "Superadministrador", "supervisor": "Centro de control", "tecnico_supervisor": "Técnico supervisor", "agente": "Operador de caja", "ventas": "Departamento de ventas"}
ROLES_CUENTA = ("superadmin", "supervisor", "tecnico_supervisor", "agente", "ventas")  # roles guardados en la cuenta; «ceo» es un superadmin con es_ceo


def _es_principal(u: User) -> bool:
    """La cuenta CEO dueña (AHAHOME_CEO_EMAILS): ningún otro CEO la puede editar, desactivar ni cambiarle la clave."""
    return bool(u.es_ceo and u.email and u.email.lower() in config.CEO_EMAILS)


def _clave_generada() -> str:
    letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(_secrets.choice(letras) for _ in range(6)) + "".join(_secrets.choice("23456789") for _ in range(4))


def _validar_clave(c: str) -> None:
    if len(c) < 8 or not re.search(r"[A-Za-z]", c) or not re.search(r"\d", c):
        raise HTTPException(422, "La clave debe tener al menos 8 caracteres, una letra y un número")


def _vista_personal(db: Session, u: User) -> dict:
    tienda = db.get(Tienda, u.tienda_id).nombre if u.tienda_id else None
    return {"id": u.id, "nombre": u.nombre, "email": u.email, "telefono": u.telefono, "rol": u.rol,
            "rol_texto": "CEO" if u.es_ceo else ROL_TEXTO.get(u.rol, u.rol), "tienda_id": u.tienda_id, "tienda": tienda, "activo": u.activo,
            "es_ceo": bool(u.es_ceo), "principal": _es_principal(u), "rol_panel": "ceo" if u.es_ceo else u.rol, "permisos": permisos_de(u), "personalizados": u.permisos is not None,
            "clave_temporal": bool(u.clave_temporal), "ultimo_acceso": _iso(u.ultimo_acceso_en), "creado": _iso(u.creado)}


@router.get("/permisos")
def catalogo(user: User = Depends(solo_ceo)):
    return {"permisos": [{"clave": k, "grupo": g, "texto": t} for k, g, t in PERMISOS],
            "por_rol": PERMISOS_POR_ROL | {"ceo": [k for k, _, _ in PERMISOS]}, "roles": ROLES_PERSONAL}


@router.get("/usuarios")
def personal(user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    filas = [_vista_personal(db, u) for u in db.scalars(select(User).where(User.rol.in_(ROLES_CUENTA)).order_by(User.rol, User.nombre))]
    filas.sort(key=lambda f: (not f["es_ceo"], not f["principal"], f["rol"], f["nombre"]))
    return [f | {"soy_yo": f["id"] == user.id} for f in filas]


class NuevoPersonal(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    email: str = Field(min_length=5, max_length=160)
    telefono: str = Field(default="", max_length=30)
    rol: str
    tienda_id: int | None = None
    clave: str = Field(default="", max_length=100)  # vacía = la genera el sistema
    permisos: list[str] | None = None


def _comprobar(db: Session, rol: str, tienda_id: int | None, permisos: list[str] | None) -> None:
    if rol not in ROLES_PERSONAL:
        raise HTTPException(422, "Rol no válido")
    if rol in ("agente", "tecnico_supervisor") and not (tienda_id and db.get(Tienda, tienda_id)):
        raise HTTPException(422, "Indica la tienda de este usuario")
    if permisos is not None:
        malos = [p for p in permisos if p not in {k for k, _, _ in PERMISOS}]
        if malos:
            raise HTTPException(422, f"Permisos no válidos: {', '.join(malos)}")


@router.post("/usuarios")
def crear_personal(body: NuevoPersonal, user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    from .auth import limpiar_tel
    _comprobar(db, body.rol, body.tienda_id, body.permisos)
    ceo_nuevo = body.rol == "ceo"
    email = body.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(422, "Correo no válido")
    tel = limpiar_tel(body.telefono) if body.telefono.strip() else None
    if db.scalar(select(User).where(User.email == email)) or (tel and db.scalar(select(User).where(User.telefono == tel))):
        raise HTTPException(409, "Ya existe una cuenta con ese correo o teléfono")
    clave = body.clave.strip() or _clave_generada()
    _validar_clave(clave)
    u = User(nombre=body.nombre.strip(), email=email, telefono=tel, rol="superadmin" if ceo_nuevo else body.rol,
             tienda_id=body.tienda_id if body.rol in ("agente", "tecnico_supervisor") else None, es_ceo=ceo_nuevo,
             password_hash=hash_password(clave), permisos=None if ceo_nuevo else body.permisos, clave_temporal=True, creado_por=user.id, email_verificado=True)
    db.add(u)
    db.commit()
    registrar_correo_persona(db, u)
    return _vista_personal(db, u) | {"clave": clave}


class EditarPersonal(BaseModel):
    nombre: str | None = Field(default=None, max_length=120)
    rol: str | None = None
    tienda_id: int | None = None
    permisos: list[str] | None = None
    usar_permisos_del_rol: bool = False
    activo: bool | None = None


@router.put("/usuarios/{uid}")
def editar_personal(uid: int, body: EditarPersonal, user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u or u.rol not in ROLES_CUENTA:
        raise HTTPException(404, "Usuario no encontrado")
    if _es_principal(u) and u.id != user.id:
        raise HTTPException(403, "La cuenta CEO principal solo la cambia su dueño")
    rol = body.rol or ("ceo" if u.es_ceo else u.rol)
    _comprobar(db, rol, body.tienda_id if body.tienda_id is not None else u.tienda_id, body.permisos)
    if u.id == user.id and (body.activo is False or rol != "ceo"):
        raise HTTPException(422, "No puedes desactivarte ni quitarte el rol de CEO a ti mismo")
    if body.nombre:
        u.nombre = body.nombre.strip()
    u.es_ceo = rol == "ceo"
    u.rol = "superadmin" if rol == "ceo" else rol
    if u.es_ceo:
        u.permisos = None
    if body.tienda_id is not None:
        u.tienda_id = body.tienda_id
    if body.usar_permisos_del_rol:
        u.permisos = None
    elif body.permisos is not None and not u.es_ceo:
        u.permisos = body.permisos
    if body.activo is not None:
        u.activo = body.activo
    db.commit()
    return _vista_personal(db, u)


@router.post("/usuarios/{uid}/clave")
def restablecer_clave(uid: int, user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    """Clave nueva generada: se muestra una sola vez al CEO; la persona debe cambiarla al entrar."""
    u = db.get(User, uid)
    if not u or u.rol not in ROLES_CUENTA:
        raise HTTPException(404, "Usuario no encontrado")
    if _es_principal(u) and u.id != user.id:
        raise HTTPException(403, "La cuenta CEO principal solo la cambia su dueño")
    clave = _clave_generada()
    u.password_hash, u.clave_temporal = hash_password(clave), True
    db.commit()
    return {"clave": clave}


# ---------- Base de datos de correos corporativos (@aha-go.com) ----------
from .. import config
from ..models import CORREOS_BASE, CorreoCorporativo


def sembrar_correos(db: Session) -> None:
    """Crea las direcciones de área y del sistema y la del CEO si aún no existen."""
    dom = config.CORREO_DOMINIO
    existentes = set(db.scalars(select(CorreoCorporativo.direccion)))
    for nombre, tipo, desc in CORREOS_BASE:
        if f"{nombre}@{dom}" not in existentes:
            db.add(CorreoCorporativo(direccion=f"{nombre}@{dom}", tipo=tipo, descripcion=desc))
    for e in config.CEO_EMAILS:
        if e.endswith("@" + dom) and e not in existentes:
            u = db.scalar(select(User).where(User.email == e))
            db.add(CorreoCorporativo(direccion=e, tipo="persona", descripcion="CEO", user_id=u.id if u else None))
    db.commit()


def registrar_correo_persona(db: Session, u: User) -> None:
    """Cuando el CEO crea a alguien con correo @aha-go.com, queda en la base de datos de correos."""
    if not u.email.endswith("@" + config.CORREO_DOMINIO):
        return
    c = db.scalar(select(CorreoCorporativo).where(CorreoCorporativo.direccion == u.email))
    if c:
        c.user_id = u.id
    else:
        db.add(CorreoCorporativo(direccion=u.email, tipo="persona", descripcion="CEO" if u.es_ceo else ROLES_PERSONAL.get(u.rol, u.rol), user_id=u.id))
    db.commit()


def _vista_correo(db: Session, c: CorreoCorporativo) -> dict:
    u = db.get(User, c.user_id) if c.user_id else None
    return {"id": c.id, "direccion": c.direccion, "tipo": c.tipo, "descripcion": c.descripcion, "reenviar_a": c.reenviar_a or "",
            "activo": c.activo, "persona": u.nombre if u else None, "persona_id": u.id if u else None,
            "rol_texto": ("CEO" if u.es_ceo else ROL_TEXTO.get(u.rol, u.rol)) if u else None, "creado": _iso(c.creado)}


@router.get("/correos")
def correos(user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    sembrar_correos(db)
    orden = {"persona": 0, "area": 1, "sistema": 2}
    filas = [_vista_correo(db, c) for c in db.scalars(select(CorreoCorporativo))]
    filas.sort(key=lambda f: (orden.get(f["tipo"], 9), f["direccion"]))
    return {"dominio": config.CORREO_DOMINIO, "correos": filas}


class DatosCorreo(BaseModel):
    usuario: str = Field(default="", max_length=80)  # la parte antes de la @
    tipo: str = "area"
    descripcion: str = Field(default="", max_length=200)
    reenviar_a: str = Field(default="", max_length=300)
    activo: bool = True


def _reenvios(txt: str) -> str | None:
    lista = [x.strip().lower() for x in txt.replace(";", ",").split(",") if x.strip()]
    for x in lista:
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", x):
            raise HTTPException(422, f"Correo de reenvío no válido: {x}")
    return ", ".join(lista) or None


@router.post("/correos")
def crear_correo(body: DatosCorreo, user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    nombre = body.usuario.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,62}", nombre):
        raise HTTPException(422, "Escribe solo la parte antes de la @ (letras, números, punto, guion)")
    if body.tipo not in ("persona", "area", "sistema"):
        raise HTTPException(422, "Tipo no válido")
    direccion = f"{nombre}@{config.CORREO_DOMINIO}"
    if db.scalar(select(CorreoCorporativo).where(CorreoCorporativo.direccion == direccion)):
        raise HTTPException(409, "Ese correo ya está en la base de datos")
    u = db.scalar(select(User).where(User.email == direccion))
    c = CorreoCorporativo(direccion=direccion, tipo=body.tipo, descripcion=body.descripcion.strip(), reenviar_a=_reenvios(body.reenviar_a),
                          activo=body.activo, user_id=u.id if u else None)
    db.add(c)
    db.commit()
    return _vista_correo(db, c)


@router.put("/correos/{cid}")
def editar_correo(cid: int, body: DatosCorreo, user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    c = db.get(CorreoCorporativo, cid)
    if not c:
        raise HTTPException(404, "Correo no encontrado")
    if body.tipo in ("persona", "area", "sistema"):
        c.tipo = body.tipo
    c.descripcion, c.reenviar_a, c.activo = body.descripcion.strip(), _reenvios(body.reenviar_a), body.activo
    db.commit()
    return _vista_correo(db, c)
