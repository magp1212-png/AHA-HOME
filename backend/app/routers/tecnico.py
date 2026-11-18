"""Módulo del técnico instalador: alta con biometría, guardia, retiro con QR, checklist y cierre."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import asignacion
from .. import ordenes as svc
from ..db import get_db
from ..deps import require
from ..models import (CHECKLIST_INSTALACION, CHECKLIST_RESIDUOS, FOTOS_CIERRE, Incidencia, Orden, Tecnico, User, ahora)
from ..notificar import notificar
from ..security import hash_password
from .ordenes import obtener

router = APIRouter(prefix="/tecnico", tags=["tecnico"])
solo_tecnico = require("tecnico")


def mi_tecnico(user: User) -> Tecnico:
    if not user.tecnico:
        raise HTTPException(403, "Tu usuario no está registrado como técnico")
    return user.tecnico


def verificado(user: User) -> Tecnico:
    t = mi_tecnico(user)
    if not t.verificado:
        raise HTTPException(403, "Tu identidad aún no ha sido verificada por el supervisor")
    return t


class Onboarding(BaseModel):
    foto_rostro: str = Field(min_length=5, max_length=200)    # captura facial activa
    selfie_cedula: str = Field(min_length=5, max_length=200)  # cédula laminada a la altura del pecho
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


@router.post("/onboarding")
def onboarding(body: Onboarding, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    t = mi_tecnico(user)
    t.foto_rostro, t.selfie_cedula, t.pin_hash = body.foto_rostro, body.selfie_cedula, hash_password(body.pin)
    t.verificado = False  # el supervisor revisa las fotos contra la cédula y aprueba
    for s in db.scalars(select(User).where(User.rol == "supervisor", User.activo.is_(True))):
        notificar(db, s.id, "Técnico por verificar", f"{user.nombre} completó su registro biométrico.")
    db.commit()
    return {"ok": True, "verificado": False}


@router.get("/hoy")
def hoy(user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    t = mi_tecnico(user)
    fecha = asignacion.hoy()
    guardia = asignacion.grupo_de_guardia(fecha)
    de_guardia = t.grupo == guardia or (t.grupo == "RETEN" and t.reten_activo)
    ords = db.scalars(select(Orden).where(Orden.tecnico_id == t.id, Orden.fecha == fecha.isoformat(),
                                          Orden.estado.not_in(("cancelado",))).order_by(Orden.franja, Orden.id)).all()
    abiertas = [o for o in ords if o.estado != "completado"]
    activa = next((o for o in abiertas if o.estado in ("en_ruta", "en_progreso")), abiertas[0] if abiertas else None)
    sup = db.scalar(select(User).where(User.rol == "supervisor", User.activo.is_(True)).order_by(User.id))
    return {
        "fecha": fecha.isoformat(),
        "grupo": t.grupo, "grupo_de_guardia_hoy": guardia, "de_guardia": de_guardia,
        "verificado": t.verificado, "tienda": t.tienda.nombre, "zona": t.tienda.zona,
        "supervisor": {"nombre": sup.nombre, "telefono": sup.telefono} if sup else None,
        "orden_activa": svc.vista(activa, "tecnico") if activa else None,
        "pendientes": [svc.vista(o, "tecnico") for o in abiertas if not activa or o.id != activa.id],
        "completadas": sum(1 for o in ords if o.estado == "completado"),
    }


@router.post("/ordenes/{orden_id}/confirmar")
def confirmar_cita(orden_id: int, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    verificado(user)
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "tecnico_asignado")
    svc.registrar(db, o, "cita_confirmada", user, f"Cita confirmada para {o.fecha} {o.franja}")
    notificar(db, o.cliente_id, "Cita confirmada", f"{o.codigo}: te visitamos el {o.fecha} entre {o.franja}.", o.id)
    db.commit()
    return svc.vista(o, "tecnico")


class Retiro(BaseModel):
    qr: str = Field(max_length=200)
    serial: str = Field(default="", max_length=80)  # si en caja no se escaneó, se completa aquí


@router.post("/retiro")
def retiro_en_almacen(body: Retiro, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    """Fase B: el técnico (ya validado con huella/rostro en su teléfono) escanea el QR en despacho."""
    t = verificado(user)
    token = body.qr.strip().removeprefix("AHAHOME:")
    o = db.scalar(select(Orden).where(Orden.qr_token == token))
    if not o:
        raise HTTPException(404, "Código QR no válido")
    if o.tecnico_id != t.id:
        raise HTTPException(403, "Esta orden está asignada a otro técnico. Contacta a tu supervisor.")
    svc.exigir_estado(o, "tecnico_asignado", "cita_confirmada")
    if body.serial and not o.serial:
        o.serial = body.serial.strip()
    o.retirado_en = ahora()
    svc.registrar(db, o, "en_ruta", user,
                  f"Retiro: {user.nombre} · {o.marca} {o.modelo} serial {o.serial or 's/n'} · {o.tienda.nombre}")
    notificar(db, o.cliente_id, "Tu equipo va en camino",
              f"{user.nombre} (C.I. {user.cedula or '—'}) retiró tu equipo en {o.tienda.nombre}. Abre la app para ver su ficha.", o.id)
    db.commit()
    return svc.vista(o, "tecnico")


@router.post("/ordenes/{orden_id}/llegada")
def llegada(orden_id: int, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_ruta")
    svc.registrar(db, o, "en_progreso", user, "Técnico en el domicilio")
    notificar(db, o.cliente_id, "El técnico llegó", f"{o.codigo}: comenzó la instalación.", o.id)
    db.commit()
    return svc.vista(o, "tecnico")


class Checklist(BaseModel):
    items: dict[str, bool]


@router.put("/ordenes/{orden_id}/checklist")
def checklist(orden_id: int, body: Checklist, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_progreso")
    validos = set(CHECKLIST_INSTALACION + CHECKLIST_RESIDUOS)
    malos = [k for k in body.items if k not in validos]
    if malos:
        raise HTTPException(422, f"Puntos desconocidos: {', '.join(malos)}")
    o.checklist = {**(o.checklist or {}), **body.items}
    db.commit()
    return svc.vista(o, "tecnico")


class Fotos(BaseModel):
    fotos: dict[str, str]


@router.put("/ordenes/{orden_id}/fotos")
def fotos(orden_id: int, body: Fotos, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_progreso")
    malos = [k for k in body.fotos if k not in FOTOS_CIERRE]
    if malos:
        raise HTTPException(422, f"Fotos desconocidas: {', '.join(malos)}")
    o.fotos = {**(o.fotos or {}), **body.fotos}
    db.commit()
    return svc.vista(o, "tecnico")


@router.post("/ordenes/{orden_id}/completar")
def completar(orden_id: int, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_progreso")
    svc.marcar_completada(db, o, user)
    db.commit()
    return svc.vista(o, "tecnico")


class NuevaIncidencia(BaseModel):
    orden_id: int | None = None
    texto: str = Field(min_length=3, max_length=500)


@router.post("/incidencias")
def incidencia(body: NuevaIncidencia, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    t = mi_tecnico(user)
    o = obtener(db, body.orden_id, user) if body.orden_id else None
    inc = Incidencia(orden_id=o.id if o else None, tecnico_id=t.id, texto=body.texto.strip())
    db.add(inc)
    for s in db.scalars(select(User).where(User.rol == "supervisor", User.activo.is_(True))):
        notificar(db, s.id, "Incidencia" + (f" en {o.codigo}" if o else ""), f"{user.nombre}: {inc.texto}", o.id if o else None)
    db.commit()
    return {"id": inc.id}
