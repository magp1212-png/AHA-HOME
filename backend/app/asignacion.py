"""Asignación automática del técnico (spec, sección 4).

Orden de preferencia:
1. Técnicos del grupo de guardia de ese día, de una tienda de la misma zona del cliente.
2. Asignación inter-zonal: técnicos de guardia de la zona vecina que ya no tienen órdenes ese día.
3. Guardia Retén activada por el supervisor (primero los de la misma zona).
Dentro de cada nivel gana quien tiene menos órdenes ese día y, a igualdad, quien vive más cerca.
"""
import datetime as dt
import math

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import config
from .models import Orden, Tecnico, Tienda, User

VECINAS = {"Oeste": ("Central",), "Central": ("Oeste", "Este"), "Este": ("Central",)}
CERRADAS = ("completado", "cancelado")


def hoy() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=config.UTC_OFFSET_HOURS)).date()


def grupo_de_guardia(fecha: dt.date) -> str:
    """A el lunes, B el martes, C el miércoles y se repite (jueves A, viernes B, sábado C, domingo A)."""
    return "ABC"[fecha.weekday() % 3]


def distancia_km(lat1, lng1, lat2, lng2) -> float:
    if None in (lat1, lng1, lat2, lng2):
        return 9999.0
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def carga(db: Session, tecnico_id: int, fecha: str) -> int:
    return db.scalar(select(func.count(Orden.id)).where(
        Orden.tecnico_id == tecnico_id, Orden.fecha == fecha, Orden.estado.not_in(CERRADAS))) or 0


def _candidatos(db: Session):
    return db.scalars(select(Tecnico).join(User, User.id == Tecnico.user_id).join(Tienda, Tienda.id == Tecnico.tienda_id)
                      .where(Tecnico.verificado.is_(True), Tecnico.disponible.is_(True), User.activo.is_(True))).all()


def elegir_tecnico(db: Session, orden: Orden) -> Tecnico | None:
    fecha = dt.date.fromisoformat(orden.fecha)
    guardia = grupo_de_guardia(fecha)
    lat = orden.lat if orden.lat is not None else orden.tienda.lat
    lng = orden.lng if orden.lng is not None else orden.tienda.lng
    todos = [t for t in _candidatos(db) if t.id != orden.tecnico_id]

    def mejor(lista):
        if not lista:
            return None
        return min(lista, key=lambda t: (carga(db, t.id, orden.fecha),
                                         distancia_km(t.lat if t.lat is not None else t.tienda.lat,
                                                      t.lng if t.lng is not None else t.tienda.lng, lat, lng)))

    misma_zona = [t for t in todos if t.grupo == guardia and t.tienda.zona == orden.zona]
    if (t := mejor(misma_zona)):
        return t
    vecinos = [t for t in todos if t.grupo == guardia and t.tienda.zona in VECINAS.get(orden.zona, ())
               and carga(db, t.id, orden.fecha) == 0]
    if (t := mejor(vecinos)):
        return t
    reten = [t for t in todos if t.grupo == "RETEN" and t.reten_activo]
    reten.sort(key=lambda t: t.tienda.zona != orden.zona)
    same = [t for t in reten if t.tienda.zona == orden.zona]
    return mejor(same) or mejor(reten)
