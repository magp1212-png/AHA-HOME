"""Fusión con AHA HOGAR: «Aprueba tu orden» y «Acta de conformidad».

- Aprobar: al ver su orden, el cliente confirma que el equipo puede pasar hasta el lugar, que hay tomas (si hay
  instalación) y que un adulto estará presente. Si no reconoce la orden, avisa al centro de control.
- Acta: con la cuadrilla en casa, el cliente revisa el servicio (puntos según el servicio), dice quién recibe
  (nombre, cédula, mayor de edad y presente) y recién ahí ve su código de cierre para dictarlo o enviarlo.
"""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import ordenes as svc
from ..db import get_db
from ..deps import require
from ..models import Orden, User, ahora
from .ordenes import obtener

router = APIRouter(tags=["conformidad"])
ANTES = ("solicitud_enviada", "tecnico_asignado", "cita_confirmada")
DIAS_CAJA = 30


def puntos_aprobacion(o: Orden) -> list[dict]:
    p = [{"id": "acceso", "texto": "El equipo puede pasar hasta el lugar donde va (puertas, escaleras o ascensor)."}]
    if o.tipo_servicio != "traslado":
        p.append({"id": "tomas", "texto": "Hay toma eléctrica y de agua en el punto exacto de instalación."})
    p.append({"id": "adulto", "texto": "Un adulto estará presente para recibir y confirmar el acta."})
    return p


def puntos_acta(o: Orden) -> list[dict]:
    if o.tipo_servicio == "traslado":
        return [{"id": "completo", "texto": "Recibí todos mis artículos, en su empaque original."},
                {"id": "sin_danos", "texto": "No tienen golpes ni daños visibles."}]
    p = [{"id": "funciona", "texto": "El equipo encendió y funciona correctamente."},
         {"id": "sin_danos", "texto": "No tiene abolladuras, rayones ni daños estéticos."},
         {"id": "conexiones", "texto": "Las conexiones de agua, desagüe y electricidad quedaron bien."}]
    if o.retirar_residuos is not False:
        p.append({"id": "residuos", "texto": "Se llevaron las cajas, el anime y los plásticos, y el espacio quedó limpio."})
    else:
        p.append({"id": "caja", "texto": f"Acepto conservar la caja original, animes, manuales y accesorios por {DIAS_CAJA} días para cualquier garantía."})
    return p


def info(o: Orden) -> dict:
    acta = o.acta or {}
    caja_hasta = (o.completado_en + dt.timedelta(days=DIAS_CAJA)).date().isoformat() if o.completado_en and o.retirar_residuos is False else None
    return {
        "aprobacion": {"aprobada": o.cliente_aprobo_en is not None, "en": o.cliente_aprobo_en.isoformat() + "Z" if o.cliente_aprobo_en else None,
                       "puntos": puntos_aprobacion(o)},
        "acta": {"confirmada": bool(acta.get("en")), "puntos": puntos_acta(o), "recibe_nombre": acta.get("recibe_nombre"),
                 "recibe_cedula": acta.get("recibe_cedula"), "en": acta.get("en"), "caja_hasta": caja_hasta},
    }


class Aprobar(BaseModel):
    puntos: dict[str, bool]


@router.post("/ordenes/{orden_id}/aprobar")
def aprobar(orden_id: int, body: Aprobar, user: User = Depends(require("cliente")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, *ANTES)
    faltan = [p["id"] for p in puntos_aprobacion(o) if not body.puntos.get(p["id"])]
    if faltan:
        raise HTTPException(422, f"Confirma los {len(puntos_aprobacion(o))} puntos para aprobar tu orden")
    if not o.cliente_aprobo_en:
        o.cliente_aprobo_en = ahora()
        svc.registrar(db, o, o.estado, user, "El cliente aprobó la orden (acceso, tomas y adulto presente confirmados)")
    db.commit()
    return svc.vista(o, user.rol)


class NoReconozco(BaseModel):
    motivo: str = Field(default="", max_length=300)


@router.post("/ordenes/{orden_id}/no-reconozco")
def no_reconozco(orden_id: int, body: NoReconozco, user: User = Depends(require("cliente")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, *ANTES)
    nota = "El cliente NO reconoce esta orden" + (f": {body.motivo.strip()}" if body.motivo.strip() else "")
    svc.registrar(db, o, o.estado, user, nota)
    svc.avisar_seguimiento(db, o, f"{o.codigo}: el cliente no reconoce la orden", nota)
    from .soporte import mensaje_sistema
    mensaje_sistema(db, user.id, f"Reportaste que no reconoces la orden {o.codigo}. El centro de control la está revisando y te escribe aquí.", "pedido")
    db.commit()
    return svc.vista(o, user.rol)


class Acta(BaseModel):
    puntos: dict[str, bool]
    recibe_nombre: str = Field(min_length=3, max_length=120)
    recibe_cedula: str = Field(max_length=20)
    mayor_edad: bool


@router.post("/ordenes/{orden_id}/acta")
def acta(orden_id: int, body: Acta, user: User = Depends(require("cliente")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_progreso")
    if [p["id"] for p in puntos_acta(o) if not body.puntos.get(p["id"])]:
        raise HTTPException(422, "Confirma cada punto del acta. Si algo está mal, repórtalo al técnico o a soporte.")
    ced = "".join(ch for ch in body.recibe_cedula if ch.isdigit())
    if not 6 <= len(ced) <= 9:
        raise HTTPException(422, "Cédula de quien recibe: de 6 a 9 números")
    if not body.mayor_edad:
        raise HTTPException(422, "Quien recibe debe ser mayor de edad y estar presente")
    o.acta = {"puntos": {p["id"]: True for p in puntos_acta(o)}, "recibe_nombre": body.recibe_nombre.strip(),
              "recibe_cedula": ced, "mayor_edad": True, "en": ahora().isoformat() + "Z"}
    svc.registrar(db, o, o.estado, user, f"Acta de conformidad confirmada por {o.acta['recibe_nombre']} (C.I. {ced})")
    svc.emitir_codigo_cierre(db, o)
    db.commit()
    return svc.vista(o, user.rol)


@router.post("/ordenes/{orden_id}/cierre/nuevo-codigo")
def nuevo_codigo(orden_id: int, user: User = Depends(require("cliente")), db: Session = Depends(get_db)):
    """«Pedir otro código» (a los 60 s): reemplaza el anterior para el cliente y el técnico."""
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_progreso")
    if not (o.acta or {}).get("en"):
        raise HTTPException(409, "Primero confirma el acta de conformidad")
    if o.token_emitido_en and (ahora() - o.token_emitido_en).total_seconds() < 60:
        raise HTTPException(429, "Espera un minuto para pedir otro código")
    svc.emitir_codigo_cierre(db, o)
    if o.tecnico:
        from ..notificar import notificar
        notificar(db, o.tecnico.user_id, "El cliente pidió otro código", f"{o.codigo}: el código anterior ya no sirve. Pídele el nuevo.", o.id)
    db.commit()
    return svc.vista(o, user.rol)
