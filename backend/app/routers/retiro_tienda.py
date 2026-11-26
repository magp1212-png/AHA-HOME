"""QR fijo de cada tienda Damasco (lo genera el superadmin).

El técnico llega a la tienda y escanea el QR: en su pantalla aparece todo lo que tiene para retirar y a la caja
le llega un aviso con la misma información. La persona de caja revisa y autoriza con un OK: ahí las órdenes quedan
retiradas y la cuadrilla en ruta.
"""
import io
import secrets

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ordenes as svc
from ..db import get_db
from ..deps import require, exigir_permiso
from ..models import Orden, Tienda, User, VisitaRetiro, ahora, con_retiro
from ..notificar import notificar
from .tecnico import _salida, verificado

router = APIRouter(tags=["retiro en tienda"])
PREFIJO = "AHATIENDA:"
CAJA = ("agente", "tecnico_supervisor", "supervisor", "superadmin")


def _iso(x):
    return x.isoformat() + "Z" if x else None


# ---------- Superadmin: QR de cada tienda ----------

def vista_tienda(t: Tienda) -> dict:
    return {"id": t.id, "nombre": t.nombre, "zona": t.zona, "direccion": t.direccion,
            "qr": f"{PREFIJO}{t.qr_token}" if t.qr_token else None}


@router.get("/admin/tiendas-qr")
def tiendas(user: User = Depends(require("superadmin")), db: Session = Depends(get_db)):
    return [vista_tienda(t) for t in db.scalars(select(Tienda).order_by(Tienda.id))]


@router.post("/admin/tiendas/{tienda_id}/qr")
def generar_qr(tienda_id: int, user: User = Depends(require("superadmin")), db: Session = Depends(get_db)):
    """Crea (o cambia, si el impreso se perdió) el QR de la tienda. El anterior deja de servir."""
    exigir_permiso(user, "qr_tiendas")
    t = db.get(Tienda, tienda_id)
    if not t:
        raise HTTPException(404, "Tienda no encontrada")
    t.qr_token = secrets.token_urlsafe(12)
    db.commit()
    return vista_tienda(t)


@router.get("/admin/tiendas/{tienda_id}/qr.png")
def qr_png(tienda_id: int, user: User = Depends(require("superadmin")), db: Session = Depends(get_db)):
    t = db.get(Tienda, tienda_id)
    if not t or not t.qr_token:
        raise HTTPException(404, "Esta tienda todavía no tiene QR")
    buf = io.BytesIO()
    qrcode.make(f"{PREFIJO}{t.qr_token}", box_size=12, border=2).save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")


# ---------- Vista de una visita (la ven el técnico y la caja) ----------

def vista_visita(db: Session, v: VisitaRetiro) -> dict:
    ords = [o for o in (db.get(Orden, i) for i in v.ordenes) if o]
    tec = v.tecnico
    return {
        "id": v.id, "estado": v.estado, "motivo": v.motivo, "creado": _iso(v.creado), "resuelto_en": _iso(v.resuelto_en),
        "tienda": {"id": v.tienda.id, "nombre": v.tienda.nombre},
        "tecnico": svc.ficha(tec), "ayudantes": [svc.ficha(a) for a in tec.ayudantes],
        "ordenes": [{
            "id": o.id, "codigo": o.codigo, "tipo_servicio": o.tipo_servicio, "tipo_servicio_texto": svc.TIPO_SERVICIO_TEXTO.get(o.tipo_servicio),
            "retiro": "Solo traslado" if o.tipo_servicio == "traslado" else "Retiro para traslado e instalación",
            "cliente": o.cliente_nombre, "zona": o.zona, "inmueble": svc.TIPO_INMUEBLE_TEXTO.get(o.tipo_inmueble, ""), "fecha": o.fecha, "franja": o.franja, "numero_factura": o.numero_factura,
            "articulos": [{"nombre": svc.nombre_articulo(a), "modelo": a.modelo, "serial": a.serial, "instalar": a.instalar} for a in o.articulos],
        } for o in ords],
        "total_articulos": sum(len(o.articulos) for o in ords),
    }


def _avisar_caja(db: Session, tienda: Tienda, titulo: str, texto: str) -> None:
    for u in db.scalars(select(User).where(User.activo.is_(True), User.tienda_id == tienda.id, User.rol.in_(("agente", "tecnico_supervisor")))):
        notificar(db, u.id, titulo, texto, None)


# ---------- Técnico ----------

class Escaneo(BaseModel):
    qr: str = Field(max_length=200)


@router.post("/tecnico/tienda/escanear")
def escanear_tienda(body: Escaneo, user: User = Depends(require("tecnico")), db: Session = Depends(get_db)):
    t = verificado(user)
    token = body.qr.strip().removeprefix(PREFIJO)
    from .qr_tiendas import buscar_token
    tienda = buscar_token(db, token) if token else None
    if not tienda:
        raise HTTPException(404, "Este no es un QR de tienda AHA HOME válido")
    from .presupuestos import listo_para_instalar
    ords = db.scalars(select(Orden).where(Orden.tecnico_id == t.id, Orden.tienda_id == tienda.id,
                                          Orden.estado.in_(("tecnico_asignado", "cita_confirmada"))).order_by(Orden.fecha, Orden.franja)).all()
    ords = [o for o in ords if con_retiro(o.tipo_servicio) and listo_para_instalar(o)]
    if not ords:
        raise HTTPException(404, f"No tienes órdenes listas para retirar en {tienda.nombre}")
    for vieja in db.scalars(select(VisitaRetiro).where(VisitaRetiro.tecnico_id == t.id, VisitaRetiro.estado == "pendiente")):
        vieja.estado = "cancelada"
    v = VisitaRetiro(tienda_id=tienda.id, tecnico_id=t.id, ordenes=[o.id for o in ords])
    db.add(v)
    db.flush()
    tipos = ", ".join(sorted({"solo traslado" if o.tipo_servicio == "traslado" else "traslado e instalación" for o in ords}))
    _avisar_caja(db, tienda, "Técnico en caja para retirar",
                 f"{user.nombre} (C.I. {user.cedula}) llegó a retirar {len(ords)} orden(es): {', '.join(o.codigo for o in ords)} · {tipos}. Revisa y autoriza con OK.")
    db.commit()
    return vista_visita(db, v)


@router.get("/tecnico/tienda/visita")
def mi_visita(user: User = Depends(require("tecnico")), db: Session = Depends(get_db)):
    t = verificado(user)
    v = db.scalar(select(VisitaRetiro).where(VisitaRetiro.tecnico_id == t.id).order_by(VisitaRetiro.id.desc()).limit(1))
    return vista_visita(db, v) if v else None


# ---------- Caja ----------

def _de_mi_tienda(db: Session, visita_id: int, user: User) -> VisitaRetiro:
    v = db.get(VisitaRetiro, visita_id)
    if not v or (user.rol in ("agente", "tecnico_supervisor") and v.tienda_id != user.tienda_id):
        raise HTTPException(404, "Visita no encontrada")
    return v


@router.get("/caja/visitas")
def visitas(user: User = Depends(require(*CAJA)), db: Session = Depends(get_db)):
    """Técnicos que escanearon el QR de la tienda y esperan el OK de caja."""
    q = select(VisitaRetiro).where(VisitaRetiro.estado == "pendiente").order_by(VisitaRetiro.id)
    if user.rol in ("agente", "tecnico_supervisor"):
        q = q.where(VisitaRetiro.tienda_id == user.tienda_id)
    return [vista_visita(db, v) for v in db.scalars(q)]


@router.post("/caja/visitas/{visita_id}/autorizar")
def autorizar(visita_id: int, user: User = Depends(require(*CAJA)), db: Session = Depends(get_db)):
    v = _de_mi_tienda(db, visita_id, user)
    if v.estado != "pendiente":
        raise HTTPException(409, "Esta visita ya fue atendida")
    hechas = []
    for o in (db.get(Orden, i) for i in v.ordenes):
        if not o or o.tecnico_id != v.tecnico_id or o.estado not in ("tecnico_asignado", "cita_confirmada"):
            continue  # cambió mientras esperaba (reasignada o cancelada)
        o.retirado_en = ahora()
        lista = "; ".join(f"{svc.nombre_articulo(a)} {a.modelo} serial {a.serial or 's/n'}".strip() for a in o.articulos)
        _salida(db, o, user, f"Retiro autorizado en caja por {user.nombre}: {svc.nombres_cuadrilla(o)} · {lista} · {v.tienda.nombre}")
        hechas.append(o.codigo)
    if not hechas:
        raise HTTPException(409, "Las órdenes de esta visita ya no están disponibles para retirar")
    v.estado, v.resuelto_por, v.resuelto_en = "autorizada", user.id, ahora()
    notificar(db, v.tecnico.user_id, "Retiro autorizado ✓", f"Caja de {v.tienda.nombre} autorizó: {', '.join(hechas)}. ¡Buen viaje!", None)
    db.commit()
    return vista_visita(db, v)


class Rechazo(BaseModel):
    motivo: str = Field(min_length=3, max_length=300)


@router.post("/caja/visitas/{visita_id}/rechazar")
def rechazar(visita_id: int, body: Rechazo, user: User = Depends(require(*CAJA)), db: Session = Depends(get_db)):
    v = _de_mi_tienda(db, visita_id, user)
    if v.estado != "pendiente":
        raise HTTPException(409, "Esta visita ya fue atendida")
    v.estado, v.motivo, v.resuelto_por, v.resuelto_en = "rechazada", body.motivo.strip(), user.id, ahora()
    notificar(db, v.tecnico.user_id, "Retiro no autorizado", f"Caja de {v.tienda.nombre}: {v.motivo}", None)
    for o in (db.get(Orden, i) for i in v.ordenes):
        if o:
            svc.avisar_seguimiento(db, o, f"{o.codigo}: caja no autorizó el retiro", v.motivo)
    db.commit()
    return vista_visita(db, v)
