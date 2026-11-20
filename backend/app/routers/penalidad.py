"""Reprogramación con anticipación y penalidad por entrega fallida.

- El cliente puede reprogramar sin costo mientras no se haya retirado su compra y avisando con
  REPROGRAMAR_HORAS_ANTES horas de anticipación antes del inicio de su franja.
- Si la cuadrilla ya retiró y salió, pero no pudo entregar (el cliente no estaba, no recibió, etc.) y regresó,
  la orden queda en «entrega fallida» y se cobra el servicio completo como penalidad. Pagada (o exonerada por
  el control), se puede reprogramar.
"""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from .. import ordenes as svc
from ..db import get_db
from ..deps import require
from ..models import ESTADO_FALLIDA, METODOS_PAGO, Orden, User, ahora
from ..notificar import notificar
from .ordenes import obtener
from .presupuestos import _avisar, _control

router = APIRouter(tags=["penalidad"])


def dinero(c: int) -> str:
    return f"{c / 100:.2f}"


def inicio_franja(o) -> dt.datetime:
    """Inicio de la franja de la orden en hora de Caracas, expresado en UTC sin zona (como ahora())."""
    hora = (o.franja or "08:00").split("-")[0].strip()
    h, m = (int(x) for x in hora.split(":"))
    local = dt.datetime.fromisoformat(o.fecha).replace(hour=h, minute=m)
    return local - dt.timedelta(hours=config.UTC_OFFSET_HOURS)


def info_reprogramar(o) -> dict:
    """Si el cliente puede reprogramar ahora sin costo, y hasta cuándo."""
    antes = o.estado in ("solicitud_enviada", "tecnico_asignado", "cita_confirmada")
    limite = inicio_franja(o) - dt.timedelta(hours=config.REPROGRAMAR_HORAS_ANTES)
    if o.estado == ESTADO_FALLIDA:
        libre = o.penalidad_estado in ("pagada", "exonerada")
        motivo = "" if libre else "Primero se paga la penalidad por la entrega fallida."
    elif not antes:
        libre, motivo = False, "Tu compra ya fue retirada: para cambiar la fecha comunícate con AHA HOME."
    elif ahora() > limite:
        libre, motivo = False, f"Solo se puede reprogramar hasta {config.REPROGRAMAR_HORAS_ANTES} h antes de tu franja. Comunícate con AHA HOME."
    else:
        libre, motivo = True, ""
    return {"puede": libre, "motivo": motivo, "horas_antes": config.REPROGRAMAR_HORAS_ANTES,
            "limite": (limite.isoformat() + "Z") if antes else None}


def info_penalidad(o) -> dict | None:
    if not o.penalidad_estado:
        return None
    return {"estado": o.penalidad_estado, "motivo": o.penalidad_motivo, "monto": dinero(o.penalidad_centavos),
            "por_definir": o.penalidad_centavos == 0 and o.penalidad_estado == "pendiente",
            "metodo": o.penalidad_metodo, "referencia": o.penalidad_referencia}


def monto_servicio_completo(o) -> int:
    """El servicio completo: lo cobrado por la instalación más lo que tenga precio en la tabla (si ya existe)."""
    return o.monto_instalacion_centavos or sum(a.precio_instalacion_centavos for a in o.articulos)


class EntregaFallida(BaseModel):
    motivo: str = Field(min_length=3, max_length=300)


@router.post("/tecnico/ordenes/{orden_id}/entrega-fallida")
def entrega_fallida(orden_id: int, body: EntregaFallida, user: User = Depends(require("tecnico")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_ruta", "en_progreso")
    o.estado = ESTADO_FALLIDA
    o.penalidad_estado, o.penalidad_motivo, o.penalidad_en = "pendiente", body.motivo.strip(), ahora()
    o.penalidad_centavos = monto_servicio_completo(o)
    svc.registrar(db, o, ESTADO_FALLIDA, user, f"No se pudo entregar: {o.penalidad_motivo}. La compra regresa a la tienda; penalidad por el servicio completo")
    monto = f"USD {dinero(o.penalidad_centavos)}" if o.penalidad_centavos else "el servicio completo (monto por confirmar)"
    if o.cliente_id:
        notificar(db, o.cliente_id, "No pudimos entregar tu compra",
                  f"{o.codigo}: {o.penalidad_motivo}. La compra regresa a la tienda y se cobra {monto} como penalidad. Luego puedes reprogramar.", o.id)
    _avisar(db, _control(db, o), "Entrega fallida", f"{o.codigo}: {o.penalidad_motivo} · penalidad {monto}", o.id)
    db.commit()
    return svc.vista(o, user.rol)


class MontoPenalidad(BaseModel):
    monto: float = Field(ge=0, le=100000)  # USD; 0 = exonerar


@router.post("/supervisor/ordenes/{orden_id}/penalidad/monto")
def fijar_monto(orden_id: int, body: MontoPenalidad, user: User = Depends(require("supervisor")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    if o.penalidad_estado not in ("pendiente", "pago_registrado"):
        raise HTTPException(409, "Esta orden no tiene una penalidad por cobrar")
    o.penalidad_centavos = round(body.monto * 100)
    if o.penalidad_centavos == 0:
        o.penalidad_estado = "exonerada"
        svc.registrar(db, o, o.estado, user, "Penalidad exonerada por el control")
        if o.cliente_id:
            notificar(db, o.cliente_id, "Penalidad exonerada", f"{o.codigo}: ya puedes reprogramar tu servicio.", o.id)
    else:
        svc.registrar(db, o, o.estado, user, f"Penalidad fijada en USD {dinero(o.penalidad_centavos)}")
        if o.cliente_id:
            notificar(db, o.cliente_id, "Penalidad por entrega fallida", f"{o.codigo}: el monto es USD {dinero(o.penalidad_centavos)}.", o.id)
    db.commit()
    return svc.vista(o, user.rol)


class PagoPenalidad(BaseModel):
    metodo: str
    referencia: str = Field(default="", max_length=60)

    @field_validator("metodo")
    @classmethod
    def _m(cls, v):
        if v not in METODOS_PAGO:
            raise ValueError("Método de pago inválido")
        return v


@router.post("/ordenes/{orden_id}/penalidad/pago")
def pagar_penalidad(orden_id: int, body: PagoPenalidad, user: User = Depends(require("cliente", "agente", "supervisor")),
                    db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    if o.penalidad_estado != "pendiente":
        raise HTTPException(409, "No hay una penalidad pendiente de pago")
    if not o.penalidad_centavos:
        raise HTTPException(409, "AHA HOME todavía está confirmando el monto de la penalidad")
    if not body.metodo.startswith("efectivo") and len(body.referencia.strip()) < 2:
        raise HTTPException(422, "Escribe la referencia del pago")
    o.penalidad_estado, o.penalidad_metodo, o.penalidad_referencia = "pago_registrado", body.metodo, body.referencia.strip()
    svc.registrar(db, o, o.estado, user, f"Pago de penalidad registrado: {body.metodo} {o.penalidad_referencia}")
    _avisar(db, _control(db, o), "Penalidad por confirmar", f"{o.codigo}: USD {dinero(o.penalidad_centavos)} por {body.metodo}", o.id)
    db.commit()
    return svc.vista(o, user.rol)


@router.post("/supervisor/ordenes/{orden_id}/penalidad/confirmar")
def confirmar_penalidad(orden_id: int, user: User = Depends(require("supervisor")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    if o.penalidad_estado != "pago_registrado":
        raise HTTPException(409, "No hay un pago de penalidad por confirmar")
    o.penalidad_estado, o.penalidad_pagada_en = "pagada", ahora()
    svc.registrar(db, o, o.estado, user, "Pago de penalidad confirmado")
    if o.cliente_id:
        notificar(db, o.cliente_id, "Penalidad pagada", f"{o.codigo}: ya puedes reprogramar tu servicio.", o.id)
    db.commit()
    return svc.vista(o, user.rol)


@router.get("/supervisor/penalidades")
def penalidades(user: User = Depends(require("tecnico_supervisor", "supervisor")), db: Session = Depends(get_db)):
    """Entregas fallidas con penalidad por fijar, cobrar o confirmar."""
    q = select(Orden).where(Orden.penalidad_estado.in_(("pendiente", "pago_registrado"))).order_by(Orden.id.desc())
    if user.rol == "tecnico_supervisor":
        q = q.where(Orden.tienda_id == user.tienda_id)
    return [{"orden_id": o.id, "codigo": o.codigo, "cliente": o.cliente_nombre, "tecnico": o.tecnico.user.nombre if o.tecnico else None,
             **info_penalidad(o)} for o in db.scalars(q)]
