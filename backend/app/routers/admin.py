"""Superadministrador: seguimiento completo de todo el proceso, tiendas y usuarios.

El equipo supervisor también puede consultar el seguimiento; solo el superadmin crea tiendas
y activa o desactiva usuarios.
"""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ordenes as svc
from ..db import get_db
from ..deps import require
from ..models import ESTADOS, TIPO_EQUIPO_TEXTO, TIPOS_EQUIPO, ZONAS, Orden, Tarifa, Tienda, User
from .auth import perfil

router = APIRouter(prefix="/admin", tags=["superadmin"])
seguimiento_roles = require("supervisor")
solo_superadmin = require("superadmin")


def _minutos(a: dt.datetime | None, b: dt.datetime | None) -> int | None:
    return int((b - a).total_seconds() // 60) if a and b else None


@router.get("/seguimiento")
def seguimiento(desde: dt.date | None = None, hasta: dt.date | None = None, tienda_id: int | None = None,
                estado: str | None = None, tipo_servicio: str | None = None,
                user: User = Depends(seguimiento_roles), db: Session = Depends(get_db)):
    """Cada orden con su bitácora completa (quién hizo qué y cuándo) y los tiempos de cada fase."""
    q = select(Orden).order_by(Orden.fecha.desc(), Orden.id.desc())
    if desde:
        q = q.where(Orden.fecha >= desde.isoformat())
    if hasta:
        q = q.where(Orden.fecha <= hasta.isoformat())
    if tienda_id:
        q = q.where(Orden.tienda_id == tienda_id)
    if estado:
        q = q.where(Orden.estado == estado)
    if tipo_servicio:
        q = q.where(Orden.tipo_servicio == tipo_servicio)
    salida = []
    for o in db.scalars(q.limit(500)):
        primero = {}
        for e in o.eventos:
            primero.setdefault(e.estado, e.creado)
        d = svc.vista(o, "superadmin")
        d["tiempos_min"] = {
            "hasta_asignar": _minutos(primero.get("solicitud_enviada"), primero.get("tecnico_asignado")),
            "hasta_salir": _minutos(primero.get("tecnico_asignado"), primero.get("en_ruta")),
            "traslado": _minutos(primero.get("en_ruta"), primero.get("en_progreso")),
            "servicio": _minutos(primero.get("en_progreso"), primero.get("completado")),
            "total": _minutos(primero.get("solicitud_enviada"), primero.get("completado")),
        }
        salida.append(d)
    califs = [o["calificacion"] for o in salida if o["calificacion"]]
    return {
        "total": len(salida),
        "por_estado": {s: sum(1 for o in salida if o["estado"] == s) for s in ESTADOS + ("cancelado",)},
        "calificacion_promedio": round(sum(califs) / len(califs), 2) if califs else None,
        "ordenes": salida,
    }


class NuevaTienda(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    zona: str
    direccion: str = Field(default="", max_length=250)
    lat: float
    lng: float


@router.get("/tiendas")
def tiendas(user: User = Depends(seguimiento_roles), db: Session = Depends(get_db)):
    return [{"id": t.id, "nombre": t.nombre, "zona": t.zona, "direccion": t.direccion, "lat": t.lat, "lng": t.lng}
            for t in db.scalars(select(Tienda).order_by(Tienda.id))]


@router.post("/tiendas")
def crear_tienda(body: NuevaTienda, user: User = Depends(solo_superadmin), db: Session = Depends(get_db)):
    """Para replicar AHA HOME en otra sucursal Damasco después del piloto."""
    if body.zona not in ZONAS:
        raise HTTPException(422, "Zona inválida (Oeste, Central o Este)")
    t = Tienda(nombre=body.nombre.strip(), zona=body.zona, direccion=body.direccion.strip(), lat=body.lat, lng=body.lng)
    db.add(t)
    db.commit()
    return {"id": t.id, "nombre": t.nombre, "zona": t.zona, "direccion": t.direccion, "lat": t.lat, "lng": t.lng}


@router.put("/tiendas/{tienda_id}")
def editar_tienda(tienda_id: int, body: NuevaTienda, user: User = Depends(solo_superadmin), db: Session = Depends(get_db)):
    t = db.get(Tienda, tienda_id)
    if not t:
        raise HTTPException(404)
    if body.zona not in ZONAS:
        raise HTTPException(422, "Zona inválida (Oeste, Central o Este)")
    t.nombre, t.zona, t.direccion, t.lat, t.lng = body.nombre.strip(), body.zona, body.direccion.strip(), body.lat, body.lng
    db.commit()
    return {"id": t.id, "nombre": t.nombre, "zona": t.zona, "direccion": t.direccion, "lat": t.lat, "lng": t.lng}


@router.get("/usuarios")
def usuarios(rol: str | None = None, tienda_id: int | None = None, user: User = Depends(seguimiento_roles),
             db: Session = Depends(get_db)):
    q = select(User).order_by(User.rol, User.nombre)
    if rol:
        q = q.where(User.rol == rol)
    us = db.scalars(q).all()
    if tienda_id:
        us = [u for u in us if (u.tecnico.tienda_id if u.tecnico else u.tienda_id) == tienda_id]
    return [perfil(u) | {"activo": u.activo} for u in us]


class Activo(BaseModel):
    activo: bool


@router.post("/usuarios/{user_id}/activo")
def activar_usuario(user_id: int, body: Activo, user: User = Depends(solo_superadmin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404)
    if u.id == user.id:
        raise HTTPException(422, "No puedes desactivarte a ti mismo")
    u.activo = body.activo
    db.commit()
    return perfil(u) | {"activo": u.activo}


# ---------- Tarifas de instalación (se cobran en caja) ----------

@router.get("/tarifas")
def ver_tarifas(user: User = Depends(seguimiento_roles), db: Session = Depends(get_db)):
    actuales = {x.tipo: x for x in db.scalars(select(Tarifa))}
    return [{"tipo": k, "tipo_texto": TIPO_EQUIPO_TEXTO[k],
             "precio": svc.dinero(actuales[k].precio_centavos) if k in actuales else None,
             "activa": actuales[k].activa if k in actuales else False} for k in TIPOS_EQUIPO]


class TarifaIn(BaseModel):
    precio: float = Field(ge=0, le=10000)  # USD
    activa: bool = True


@router.put("/tarifas/{tipo}")
def fijar_tarifa(tipo: str, body: TarifaIn, user: User = Depends(solo_superadmin), db: Session = Depends(get_db)):
    if tipo not in TIPOS_EQUIPO:
        raise HTTPException(404, "Tipo de artículo desconocido")
    x = db.get(Tarifa, tipo) or Tarifa(tipo=tipo, precio_centavos=0)
    x.precio_centavos, x.activa = round(body.precio * 100), body.activa
    db.add(x)
    db.commit()
    return {"tipo": tipo, "precio": svc.dinero(x.precio_centavos), "activa": x.activa}
