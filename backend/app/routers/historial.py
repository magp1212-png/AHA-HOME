"""Historial de actividad (centro de mando del CEO): actividad y sesiones del equipo que usa el panel."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..actividad import ROLES, TIPOS, anotar
from ..auditoria import ROL_TEXTO
from ..db import get_db
from ..deps import current_user
from ..models import ActividadPanel, CARACAS, SesionPanel, User, ahora
from .ceo import solo_ceo

router = APIRouter(tags=["historial"])


class Nota(BaseModel):
    tipo: str = Field(pattern="^(consulta|descarga|cierre_sesion)$")
    texto: str = Field(min_length=2, max_length=200)
    ms: int = Field(default=0, ge=0, le=600000)


@router.post("/panel-api/actividad")
def anotar_actividad(body: Nota, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """El panel avisa qué pantalla se abrió, qué se descargó o que se cerró la sesión."""
    if user.rol in ROLES:
        ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "")
        anotar(db, request.headers.get("x-sesion", "")[:12], user, body.tipo, body.texto, ip, request.headers.get("user-agent", ""), body.ms)
        db.commit()
    return {"ok": True}


def _rango(desde: str | None, hasta: str | None) -> tuple[dt.datetime, dt.datetime]:
    hoy = (ahora() + CARACAS).date()
    d1 = dt.date.fromisoformat(hasta) if hasta else hoy
    d0 = dt.date.fromisoformat(desde) if desde else d1 - dt.timedelta(days=29)
    if d0 > d1:
        raise HTTPException(422, "La fecha «Desde» no puede ser posterior a «Hasta»")
    return dt.datetime.combine(d0, dt.time()) - CARACAS, dt.datetime.combine(d1 + dt.timedelta(days=1), dt.time()) - CARACAS


@router.get("/ceo/historial")
def historial(desde: str | None = None, hasta: str | None = None, user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    a, b = _rango(desde, hasta)
    usuarios = {u.id: u for u in db.scalars(select(User).where(User.rol.in_(ROLES)))}
    filas = []
    for x in db.scalars(select(ActividadPanel).where(ActividadPanel.creado >= a, ActividadPanel.creado < b).order_by(ActividadPanel.id.desc()).limit(5000)):
        u = usuarios.get(x.user_id)
        filas.append({"id": x.id, "en": x.creado.isoformat() + "Z", "usuario": u.nombre if u else "Desconocido", "user_id": x.user_id,
                      "rol": "CEO" if u and u.es_ceo else ROL_TEXTO.get(x.rol, x.rol or "—"), "tipo": x.tipo, "tipo_texto": TIPOS.get(x.tipo, x.tipo),
                      "texto": x.texto, "ip": x.ip, "dispositivo": x.dispositivo, "sesion": x.sesion_id})
    return filas


@router.get("/ceo/sesiones")
def sesiones(desde: str | None = None, hasta: str | None = None, user: User = Depends(solo_ceo), db: Session = Depends(get_db)):
    a, b = _rango(desde, hasta)
    filas = []
    for s in db.scalars(select(SesionPanel).where(SesionPanel.inicio >= a, SesionPanel.inicio < b).order_by(SesionPanel.inicio.desc()).limit(500)):
        u = db.get(User, s.user_id)
        minutos = int((s.ultima - s.inicio).total_seconds() // 60)
        activa = not s.cerrada and ahora() - s.ultima < dt.timedelta(minutes=30)
        filas.append({"id": s.id, "usuario": u.nombre if u else "—", "user_id": s.user_id, "rol": "CEO" if u and u.es_ceo else ROL_TEXTO.get(s.rol, s.rol),
                      "inicio": s.inicio.isoformat() + "Z", "ultima": s.ultima.isoformat() + "Z", "minutos": minutos, "actividades": s.actividades,
                      "ip": s.ip, "dispositivo": s.dispositivo, "estado": "activa" if activa else ("cerrada" if s.cerrada else "sin actividad")})
    return filas
