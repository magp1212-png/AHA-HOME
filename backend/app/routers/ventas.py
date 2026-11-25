"""Departamento de ventas: servicios nuevos, cancelados, reprogramados, entregas fallidas y completados."""
import datetime as dt
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ordenes as svc
from ..db import get_db
from ..deps import current_user, exigir_permiso, permisos_de
from ..models import METODO_PAGO_TEXTO, TIPO_SERVICIO_TEXTO, Evento, Orden, User, ahora
from ..ventas_avisos import TIPOS, tipo_de

router = APIRouter(prefix="/ventas", tags=["ventas"])


def ventas(user: User = Depends(current_user)) -> User:
    if user.rol not in ("ventas", "supervisor", "superadmin") or "ver_ventas" not in permisos_de(user):
        raise HTTPException(403, "No tienes permiso para: Ventas. Pídeselo al CEO.")
    return user


def _iso(x):
    return x.isoformat() + "Z" if x else None


def _movimientos(db: Session, desde: dt.datetime) -> list[dict]:
    filas, usuarios = [], {}
    q = select(Evento).where(Evento.creado >= desde).order_by(Evento.id.desc())
    for e in db.scalars(q):
        tipo = tipo_de(e.estado, e.nota)
        if not tipo:
            continue
        o = e.orden
        if e.actor_id and e.actor_id not in usuarios:
            usuarios[e.actor_id] = db.get(User, e.actor_id)
        quien = usuarios.get(e.actor_id)
        cajero = db.get(User, o.agente_id) if o.agente_id else None
        monto = o.monto_instalacion_centavos + o.inspeccion_centavos
        filas.append({"id": e.id, "tipo": tipo, "tipo_texto": TIPOS[tipo], "en": _iso(e.creado), "orden_id": o.id, "orden": o.codigo,
                      "cliente": o.cliente_nombre, "tienda": o.tienda.nombre if o.tienda else "", "cajero": cajero.nombre if cajero else "—",
                      "por": quien.nombre if quien else "Sistema", "servicio": TIPO_SERVICIO_TEXTO.get(o.tipo_servicio, o.tipo_servicio),
                      "articulos": len(o.articulos), "monto_usd": svc.dinero(monto), "_monto": monto, "pago": METODO_PAGO_TEXTO.get(o.pago_metodo or "", "—"),
                      "cita": f"{o.fecha} {o.franja}", "estado_actual": svc.ESTADO_TEXTO.get(o.estado, o.estado) if hasattr(svc, "ESTADO_TEXTO") else o.estado,
                      "nota": e.nota})
    return filas


@router.get("/resumen")
def resumen(dias: int = 30, user: User = Depends(ventas), db: Session = Depends(get_db)):
    dias = max(1, min(dias, 365))
    desde = ahora() - dt.timedelta(days=dias)
    movs = _movimientos(db, desde)
    cuenta = Counter(m["tipo"] for m in movs)
    nuevos = [m for m in movs if m["tipo"] == "nuevo"]
    vendido = sum(m["_monto"] for m in nuevos)
    serie_n, serie_c = defaultdict(int), defaultdict(int)
    for m in movs:
        d = m["en"][:10]
        if m["tipo"] == "nuevo":
            serie_n[d] += 1
        elif m["tipo"] in ("cancelado", "fallido"):
            serie_c[d] += 1
    dias_lista = [(ahora() - dt.timedelta(days=dias - 1 - i)).date().isoformat() for i in range(dias)]
    por_tienda, por_cajero = Counter(), defaultdict(lambda: {"servicios": 0, "monto": 0})
    for m in nuevos:
        por_tienda[m["tienda"]] += 1
        por_cajero[m["cajero"]]["servicios"] += 1
        por_cajero[m["cajero"]]["monto"] += m["_monto"]
    en_curso = db.query(Orden).filter(Orden.estado.in_(("solicitud_enviada", "tecnico_asignado", "cita_confirmada", "en_ruta", "en_progreso"))).count()
    return {"dias": dias, "nuevos": cuenta["nuevo"], "cancelados": cuenta["cancelado"], "reprogramados": cuenta["reprogramado"],
            "fallidos": cuenta["fallido"], "completados": cuenta["completado"], "en_curso": en_curso,
            "vendido_usd": svc.dinero(vendido), "ticket_usd": svc.dinero(round(vendido / len(nuevos)) if nuevos else 0),
            "tasa_cancelacion": round(cuenta["cancelado"] * 100 / cuenta["nuevo"]) if cuenta["nuevo"] else None,
            "por_servicio": dict(Counter(m["servicio"] for m in nuevos)), "por_tienda": dict(por_tienda),
            "por_cajero": sorted(({"cajero": k, "servicios": v["servicios"], "monto_usd": svc.dinero(v["monto"])} for k, v in por_cajero.items()), key=lambda x: -x["servicios"]),
            "serie_nuevos": [serie_n[d] for d in dias_lista], "serie_bajas": [serie_c[d] for d in dias_lista],
            "ultimos": [{k: v for k, v in m.items() if not k.startswith("_")} for m in movs[:8]]}


@router.get("/movimientos")
def movimientos(tipo: str = "", dias: int = 30, user: User = Depends(ventas), db: Session = Depends(get_db)):
    movs = _movimientos(db, ahora() - dt.timedelta(days=max(1, min(dias, 365))))
    return [{k: v for k, v in m.items() if not k.startswith("_")} for m in movs if not tipo or m["tipo"] == tipo]
