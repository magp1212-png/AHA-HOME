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

from .. import config
from .. import ordenes as svc
from ..db import get_db
from ..deps import current_user, require
from ..models import METODOS_PAGO, TIPOS_EQUIPO, ZONAS, Articulo, Orden, Tarifa, Tienda, User, ahora, orden_ayudantes
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


class ArticuloIn(BaseModel):
    tipo: str
    descripcion: str = Field(default="", max_length=120)  # ej. "Juego de comedor 6 puestos"
    marca: str = Field(default="", max_length=60)
    modelo: str = Field(default="", max_length=80)
    serial: str = Field(default="", max_length=80)
    garantia: str = Field(default="", max_length=60)
    instalar: bool = False  # el cliente lo elige en caja y lo paga en ese momento

    @field_validator("tipo")
    @classmethod
    def _tipo(cls, v):
        if v not in TIPOS_EQUIPO:
            raise ValueError("Tipo de artículo inválido")
        return v


class PagoIn(BaseModel):
    metodo: str
    referencia: str = Field(default="", max_length=60)

    @field_validator("metodo")
    @classmethod
    def _metodo(cls, v):
        if v not in METODOS_PAGO:
            raise ValueError("Método de pago inválido")
        return v


@router.get("/metodos-pago")
def metodos_pago():
    from ..models import METODO_PAGO_TEXTO
    return [{"id": k, "texto": METODO_PAGO_TEXTO[k]} for k in METODOS_PAGO]


@router.get("/inspeccion/costo")
def costo_inspeccion():
    """Lo que cuesta la visita de inspección (se cobra en caja si el cliente la pide al comprar)."""
    return {"costo": svc.dinero(round(config.INSPECCION_USD * 100))}


@router.get("/tarifas")
def tarifas(db: Session = Depends(get_db)):
    """Precios de instalación vigentes (los usa la caja para cobrar)."""
    from ..models import TIPO_EQUIPO_TEXTO
    return [{"tipo": x.tipo, "tipo_texto": TIPO_EQUIPO_TEXTO.get(x.tipo, x.tipo), "precio": svc.dinero(x.precio_centavos)}
            for x in db.scalars(select(Tarifa).where(Tarifa.activa.is_(True)).order_by(Tarifa.tipo))]


class NuevaOrden(BaseModel):
    cliente_nombre: str = Field(min_length=2, max_length=120)
    cliente_telefono: str = Field(min_length=7, max_length=30)
    direccion: str = Field(min_length=5, max_length=250)
    referencia: str = Field(default="", max_length=250)
    lat: float | None = None
    lng: float | None = None
    zona: str
    articulos: list[ArticuloIn] = Field(min_length=1, max_length=30)
    solo_instalacion: bool = False  # el cliente ya tiene los artículos en casa: no hay traslado
    requiere_inspeccion: bool = False  # el cliente pide que el técnico inspeccione y presupueste antes del retiro
    pago: PagoIn | None = None      # obligatorio si hay artículos para instalar
    numero_factura: str = Field(default="", max_length=40)
    fecha_compra: str = Field(default="", max_length=10)
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
    if user.rol == "ayudante" and (not user.tecnico or user.tecnico not in o.ayudantes):
        raise HTTPException(404, "Orden no encontrada")
    if user.rol in ("agente", "tecnico_supervisor") and o.tienda_id != user.tienda_id:
        raise HTTPException(404, "Orden no encontrada")
    return o


@router.post("/ordenes")
def crear(body: NuevaOrden, user: User = Depends(require("agente", "supervisor")), db: Session = Depends(get_db)):
    """Se crea en la caja Damasco. Traslado de todo lo comprado; instalación solo de lo que el cliente elige y paga ahí mismo."""
    if not body.acepta_terminos:
        raise HTTPException(422, "Debe aceptar los términos del servicio")
    if body.fecha < dt.date.today() - dt.timedelta(days=1):
        raise HTTPException(422, "La fecha de instalación ya pasó")
    tienda_id = user.tienda_id if user.rol == "agente" else body.tienda_id
    tienda = db.get(Tienda, tienda_id) if tienda_id else None
    if not tienda:
        raise HTTPException(422, "Indica la tienda Damasco donde se compró el equipo")
    # Tipo de servicio según lo que el cliente pidió
    a_instalar = [a for a in body.articulos if a.instalar]
    if body.solo_instalacion:
        if len(a_instalar) != len(body.articulos):
            raise HTTPException(422, "En «solo instalación» todos los artículos deben ser para instalar")
        tipo_servicio = "instalacion"
    else:
        tipo_servicio = "traslado_instalacion" if a_instalar else "traslado"
    precios = {x.tipo: x.precio_centavos for x in db.scalars(select(Tarifa).where(Tarifa.activa.is_(True)))}
    # Mientras no se publique la tabla de precios, la instalación queda «precio por definir» (sin cobro en caja)
    total = sum(precios.get(a.tipo, 0) for a in a_instalar)
    # La inspección se cobra en caja, en el momento, junto con la instalación
    insp = round(config.INSPECCION_USD * 100) if body.requiere_inspeccion else 0
    if (total or insp) and not body.pago:
        raise HTTPException(422, "Registra el pago en caja")

    tel = limpiar_tel(body.cliente_telefono)
    cliente = db.scalar(select(User).where(User.telefono == tel, User.rol == "cliente"))
    o = Orden(codigo=svc.nuevo_codigo(db), cliente_id=cliente.id if cliente else None,
              cliente_nombre=body.cliente_nombre.strip(), cliente_telefono=tel, direccion=body.direccion.strip(),
              referencia=body.referencia.strip(), lat=body.lat, lng=body.lng, zona=body.zona, tipo_servicio=tipo_servicio,
              numero_factura=body.numero_factura.strip(), fecha_compra=body.fecha_compra, factura=body.factura,
              monto_instalacion_centavos=total, inspeccion_centavos=insp, requiere_inspeccion=body.requiere_inspeccion,
              inspeccion_fecha=body.fecha.isoformat() if body.requiere_inspeccion else "", inspeccion_franja=body.franja if body.requiere_inspeccion else "", fecha=body.fecha.isoformat(), franja=body.franja, tienda_id=tienda.id,
              agente_id=user.id if user.rol == "agente" else None, qr_token=new_qr_token(), checklist={}, fotos={})
    if body.requiere_inspeccion:
        o.pausa_desde = ahora()
    if total or insp:
        o.pago_metodo, o.pago_referencia, o.pagado_en, o.cobrado_por = body.pago.metodo, body.pago.referencia.strip(), ahora(), user.id
    o.articulos = [Articulo(tipo=a.tipo, descripcion=a.descripcion.strip(), marca=a.marca.strip(), modelo=a.modelo.strip(),
                            serial=a.serial.strip(), garantia=a.garantia.strip(), instalar=a.instalar,
                            precio_instalacion_centavos=precios.get(a.tipo, 0) if a.instalar else 0) for a in body.articulos]
    db.add(o)
    db.flush()
    o.tienda = tienda
    pago = (f" · cobrado en caja USD {svc.dinero(total + insp)} ({o.pago_metodo})"
            + (f": instalación {svc.dinero(total)} + inspección {svc.dinero(insp)}" if insp else "")) if total or insp else ""
    svc.registrar(db, o, "solicitud_enviada", user, f"Registrada en {tienda.nombre}: {len(o.articulos)} artículo(s){pago}")
    svc.asignar(db, o, user)
    svc.avisar_nueva_orden(db, o)
    db.commit()
    db.refresh(o)
    return svc.vista(o, user.rol)


@router.get("/ordenes")
def listar(fecha: dt.date | None = None, zona: str | None = None, estado: str | None = None,
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Orden).order_by(Orden.fecha.desc(), Orden.id.desc())
    if user.rol == "cliente":
        q = q.where(Orden.cliente_id == user.id)
    elif user.rol in ("agente", "tecnico_supervisor"):
        q = q.where(Orden.tienda_id == user.tienda_id)
    elif user.rol == "tecnico":
        q = q.where(Orden.tecnico_id == (user.tecnico.id if user.tecnico else -1))
    elif user.rol == "ayudante":
        q = q.join(orden_ayudantes, orden_ayudantes.c.orden_id == Orden.id).where(
            orden_ayudantes.c.tecnico_id == (user.tecnico.id if user.tecnico else -1))
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
def qr_png(orden_id: int, user: User = Depends(require("agente", "tecnico_supervisor", "supervisor")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    if o.tipo_servicio == "instalacion":
        raise HTTPException(404, "Las órdenes de solo instalación no pasan por el almacén")
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
    from .penalidad import info_reprogramar
    info = info_reprogramar(o)
    if o.estado == "entrega_fallida":
        if not info["puede"]:
            raise HTTPException(409, info["motivo"])
        o.retirado_en = None
    else:
        svc.exigir_estado(o, "solicitud_enviada", "tecnico_asignado", "cita_confirmada")
        if user.rol == "cliente" and not info["puede"]:
            raise HTTPException(409, info["motivo"])
    anteriores = ([o.tecnico] if o.tecnico else []) + list(o.ayudantes)
    o.fecha, o.franja = body.fecha.isoformat(), body.franja
    svc.registrar(db, o, "solicitud_enviada", user, f"Reprogramada para {o.fecha} {o.franja}")
    svc.poner_cuadrilla(db, o, None)
    db.flush()
    svc.asignar(db, o, user, "Reasignada por cambio de fecha")
    actuales = ([o.tecnico] if o.tecnico else []) + list(o.ayudantes)
    from ..notificar import notificar
    for t in anteriores:
        if t not in actuales:
            notificar(db, t.user_id, f"{o.codigo} reprogramada", "Esta orden ya no está en tu ruta.", o.id)
    svc.avisar_seguimiento(db, o, f"{o.codigo} reprogramada", f"{o.fecha} {o.franja} · {svc.nombres_cuadrilla(o)}")
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
