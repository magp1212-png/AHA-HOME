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
