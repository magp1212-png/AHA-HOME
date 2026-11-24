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

ROLES_PERSONAL = {"superadmin": "Superadministrador", "supervisor": "Centro de control", "tecnico_supervisor": "Técnico supervisor", "agente": "Operador de caja"}


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
            "es_ceo": bool(u.es_ceo), "permisos": permisos_de(u), "personalizados": u.permisos is not None,
            "clave_temporal": bool(u.clave_temporal), "ultimo_acceso": _iso(u.ultimo_acceso_en), "creado": _iso(u.creado)}


@router.get("/permisos")
def catalogo(user: User = Depends(solo_ceo)):
    return {"permisos": [{"clave": k, "grupo": g, "texto": t} for k, g, t in PERMISOS], "por_rol": PERMISOS_POR_ROL, "roles": ROLES_PERSONAL}


@router.get("/usuarios")
def personal(user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    return [_vista_personal(db, u) for u in db.scalars(select(User).where(User.rol.in_(tuple(ROLES_PERSONAL))).order_by(User.rol, User.nombre))]


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
    email = body.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(422, "Correo no válido")
    tel = limpiar_tel(body.telefono) if body.telefono.strip() else None
    if db.scalar(select(User).where(User.email == email)) or (tel and db.scalar(select(User).where(User.telefono == tel))):
        raise HTTPException(409, "Ya existe una cuenta con ese correo o teléfono")
    clave = body.clave.strip() or _clave_generada()
    _validar_clave(clave)
    u = User(nombre=body.nombre.strip(), email=email, telefono=tel, rol=body.rol, tienda_id=body.tienda_id if body.rol in ("agente", "tecnico_supervisor") else None,
             password_hash=hash_password(clave), permisos=body.permisos, clave_temporal=True, creado_por=user.id, email_verificado=True)
    db.add(u)
    db.commit()
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
    if not u or u.rol not in ROLES_PERSONAL:
        raise HTTPException(404, "Usuario no encontrado")
    if u.es_ceo and u.id != user.id:
        raise HTTPException(403, "Las cuentas CEO no se editan desde aquí")
    rol = body.rol or u.rol
    _comprobar(db, rol, body.tienda_id if body.tienda_id is not None else u.tienda_id, body.permisos)
    if u.id == user.id and (body.activo is False or (body.rol and body.rol != "superadmin")):
        raise HTTPException(422, "No puedes desactivarte ni quitarte el rol a ti mismo")
    if body.nombre:
        u.nombre = body.nombre.strip()
    u.rol = rol
    if body.tienda_id is not None:
        u.tienda_id = body.tienda_id
    if body.usar_permisos_del_rol:
        u.permisos = None
    elif body.permisos is not None:
        u.permisos = body.permisos
    if body.activo is not None:
        u.activo = body.activo
    db.commit()
    return _vista_personal(db, u)


@router.post("/usuarios/{uid}/clave")
def restablecer_clave(uid: int, user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    """Clave nueva generada: se muestra una sola vez al CEO; la persona debe cambiarla al entrar."""
    u = db.get(User, uid)
    if not u or u.rol not in ROLES_PERSONAL or (u.es_ceo and u.id != user.id):
        raise HTTPException(404, "Usuario no encontrado")
    clave = _clave_generada()
    u.password_hash, u.clave_temporal = hash_password(clave), True
    db.commit()
    return {"clave": clave}
