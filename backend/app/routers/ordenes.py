"""Órdenes de servicio: las crea el agente en caja (o el propio cliente) y las sigue el cliente."""
import datetime as dt
import io
import re

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ordenes as svc
from ..db import get_db
from ..deps import current_user, require
from ..models import TIPOS_EQUIPO, ZONAS, Orden, Tienda, User
from ..security import new_qr_token
from .auth import limpiar_tel

router = APIRouter(tags=["ordenes"])
FRANJA_RE = re.compile(r"^\d{1,2}:\d{2}-\d{1,2}:\d{2}$")


def normalizar_franja(v: str) -> str:
    v = v.replace(" ", "").replace("–", "-")
    if not FRANJA_RE.match(v):
        raise ValueError("Franja inválida, ej. 10:00-12:00")
    return v


@router.get("/tiendas")
def tiendas(db: Session = Depends(get_db)):
    return [{"id": t.id, "nombre": t.nombre, "zona": t.zona, "direccion": t.direccion, "lat": t.lat, "lng": t.lng}
            for t in db.scalars(select(Tienda).order_by(Tienda.id))]


class NuevaOrden(BaseModel):
    cliente_nombre: str = Field(min_length=2, max_length=120)
    cliente_telefono: str = Field(min_length=7, max_length=30)
    direccion: str = Field(min_length=5, max_length=250)
    referencia: str = Field(default="", max_length=250)
    lat: float | None = None
    lng: float | None = None
    zona: str
    tipo_equipo: str
    marca: str = Field(min_length=1, max_length=60)
    modelo: str = Field(min_length=1, max_length=80)
    serial: str = Field(default="", max_length=80)
    fecha_compra: str = Field(default="", max_length=10)
    garantia: str = Field(default="", max_length=60)
    factura: str | None = Field(default=None, max_length=200)
    fecha: dt.date
    franja: str
    tienda_id: int | None = None  # el agente usa su tienda; el cliente la elige
    acepta_terminos: bool

    @field_validator("zona")
    @classmethod
    def _zona(cls, v):
        if v not in ZONAS:
            raise ValueError("Zona inválida (Oeste, Central o Este)")
        return v

    @field_validator("tipo_equipo")
    @classmethod
    def _tipo(cls, v):
        if v not in TIPOS_EQUIPO:
            raise ValueError("Tipo de equipo inválido")
        return v

    @field_validator("franja")
    @classmethod
    def _franja(cls, v):
        return normalizar_franja(v)


def obtener(db: Session, orden_id: int, user: User) -> Orden:
    o = db.get(Orden, orden_id)
    if not o:
        raise HTTPException(404, "Orden no encontrada")
    if user.rol == "cliente" and o.cliente_id != user.id:
        raise HTTPException(404, "Orden no encontrada")
    if user.rol == "tecnico" and (not user.tecnico or o.tecnico_id != user.tecnico.id):
        raise HTTPException(404, "Orden no encontrada")
    if user.rol == "agente" and o.tienda_id != user.tienda_id:
        raise HTTPException(404, "Orden no encontrada")
    return o


@router.post("/ordenes")
def crear(body: NuevaOrden, user: User = Depends(require("agente", "cliente", "supervisor")), db: Session = Depends(get_db)):
    if not body.acepta_terminos:
        raise HTTPException(422, "Debe aceptar los términos del servicio")
    if body.fecha < dt.date.today() - dt.timedelta(days=1):
        raise HTTPException(422, "La fecha de instalación ya pasó")
    tienda_id = user.tienda_id if user.rol == "agente" else body.tienda_id
    tienda = db.get(Tienda, tienda_id) if tienda_id else None
    if not tienda:
        raise HTTPException(422, "Indica la tienda Damasco donde se compró el equipo")
    tel = limpiar_tel(body.cliente_telefono)
    cliente = user if user.rol == "cliente" else db.scalar(select(User).where(User.telefono == tel, User.rol == "cliente"))
    o = Orden(codigo=svc.nuevo_codigo(db), cliente_id=cliente.id if cliente else None,
              cliente_nombre=body.cliente_nombre.strip(), cliente_telefono=tel, direccion=body.direccion.strip(),
              referencia=body.referencia.strip(), lat=body.lat, lng=body.lng, zona=body.zona,
              tipo_equipo=body.tipo_equipo, marca=body.marca.strip(), modelo=body.modelo.strip(), serial=body.serial.strip(),
              fecha_compra=body.fecha_compra, garantia=body.garantia, factura=body.factura,
              fecha=body.fecha.isoformat(), franja=body.franja, tienda_id=tienda.id,
              agente_id=user.id if user.rol == "agente" else None, qr_token=new_qr_token(), checklist={}, fotos={})
    db.add(o)
    db.flush()
    o.tienda = tienda
    svc.registrar(db, o, "solicitud_enviada", user, f"Registrada en {tienda.nombre}")
    svc.asignar(db, o, user)
    db.commit()
    db.refresh(o)
    return svc.vista(o, user.rol)


@router.get("/ordenes")
def listar(fecha: dt.date | None = None, zona: str | None = None, estado: str | None = None,
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Orden).order_by(Orden.fecha.desc(), Orden.id.desc())
    if user.rol == "cliente":
        q = q.where(Orden.cliente_id == user.id)
    elif user.rol == "agente":
        q = q.where(Orden.tienda_id == user.tienda_id)
    elif user.rol == "tecnico":
        q = q.where(Orden.tecnico_id == (user.tecnico.id if user.tecnico else -1))
    if fecha:
        q = q.where(Orden.fecha == fecha.isoformat())
    if zona:
        q = q.where(Orden.zona == zona)
    if estado:
        q = q.where(Orden.estado == estado)
    return [svc.vista(o, user.rol) for o in db.scalars(q.limit(200))]


@router.get("/ordenes/{orden_id}")
def detalle(orden_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return svc.vista(obtener(db, orden_id, user), user.rol)


@router.get("/ordenes/{orden_id}/qr.png")
def qr_png(orden_id: int, user: User = Depends(require("agente", "supervisor")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    img = qrcode.make(f"AHAHOME:{o.qr_token}", box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")


class Motivo(BaseModel):
    motivo: str = Field(default="", max_length=300)


@router.post("/ordenes/{orden_id}/cancelar")
def cancelar(orden_id: int, body: Motivo, user: User = Depends(require("cliente", "agente", "supervisor")),
             db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.cancelar(db, o, user, body.motivo)
    db.commit()
    return svc.vista(o, user.rol)


class Reprogramar(BaseModel):
    fecha: dt.date
    franja: str

    @field_validator("franja")
    @classmethod
    def _franja(cls, v):
        return normalizar_franja(v)


@router.post("/ordenes/{orden_id}/reprogramar")
def reprogramar(orden_id: int, body: Reprogramar, user: User = Depends(require("cliente", "agente", "supervisor")),
                db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "solicitud_enviada", "tecnico_asignado", "cita_confirmada")
    anterior = o.tecnico
    o.fecha, o.franja = body.fecha.isoformat(), body.franja
    svc.registrar(db, o, "solicitud_enviada", user, f"Reprogramada para {o.fecha} {o.franja}")
    o.tecnico_id, o.tecnico = None, None
    db.flush()
    nuevo = svc.asignar(db, o, user, "Reasignada por cambio de fecha")
    if anterior and (not nuevo or nuevo.id != anterior.id):
        from ..notificar import notificar
        notificar(db, anterior.user_id, f"{o.codigo} reprogramada", "Esta orden ya no está en tu ruta.", o.id)
    db.commit()
    return svc.vista(o, user.rol)


class Calificar(BaseModel):
    estrellas: int = Field(ge=1, le=5)
    comentario: str = Field(default="", max_length=1000)


@router.post("/ordenes/{orden_id}/calificar")
def calificar(orden_id: int, body: Calificar, user: User = Depends(require("cliente")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "completado")
    o.calificacion, o.comentario = body.estrellas, body.comentario.strip()
    db.commit()
    return svc.vista(o, user.rol)
