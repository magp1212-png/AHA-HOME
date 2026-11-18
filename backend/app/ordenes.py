"""Reglas de la orden de servicio: estados, asignación, avisos y lo que ve cada rol."""
import datetime as dt

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import asignacion
from .models import (CHECKLIST_INSTALACION, CHECKLIST_RESIDUOS, ESTADO_CANCELADO, ESTADO_TEXTO, ESTADOS, FOTOS_CIERRE,
                     Evento, Orden, Tecnico, User, ahora)
from .notificar import notificar

TIPO_TEXTO = {"nevera": "nevera", "lavadora": "lavadora", "secadora": "secadora", "aire_acondicionado": "aire acondicionado"}


def nuevo_codigo(db: Session) -> str:
    n = (db.scalar(select(func.max(Orden.id))) or 0) + 4921  # numeración legible: WO-4921, WO-4922…
    return f"WO-{n}"


def registrar(db: Session, orden: Orden, estado: str, actor: User | None, nota: str = "") -> None:
    orden.estado = estado
    db.add(Evento(orden_id=orden.id, estado=estado, nota=nota, actor_id=actor.id if actor else None))


def asignar(db: Session, orden: Orden, actor: User | None, nota: str = "Asignación automática") -> Tecnico | None:
    tec = asignacion.elegir_tecnico(db, orden)
    if not tec:
        notificar_supervisores(db, orden, "Orden sin técnico", f"{orden.codigo}: no hay técnico de guardia disponible. Activa la Guardia Retén.")
        return None
    orden.tecnico_id = tec.id
    orden.tecnico = tec
    registrar(db, orden, "tecnico_asignado", actor, f"{nota}: {tec.user.nombre} (Grupo {tec.grupo}, {tec.tienda.nombre})")
    equipo = TIPO_TEXTO.get(orden.tipo_equipo, orden.tipo_equipo)
    notificar(db, tec.user_id, f"Nueva orden {orden.codigo}",
              f"Instalación de {equipo} · {orden.fecha} {orden.franja} · {orden.direccion}", orden.id)
    notificar(db, orden.cliente_id, "Técnico asignado", f"Tu instalación {orden.codigo} ya tiene técnico asignado.", orden.id)
    return tec


def notificar_supervisores(db: Session, orden: Orden, titulo: str, texto: str) -> None:
    sups = db.scalars(select(User).where(User.rol == "supervisor", User.activo.is_(True))).all()
    for s in sups:  # por ahora todos los supervisores ven toda Caracas
        notificar(db, s.id, titulo, texto, orden.id)


def exigir_estado(orden: Orden, *permitidos: str) -> None:
    if orden.estado not in permitidos:
        raise HTTPException(409, f"La orden está en «{ESTADO_TEXTO.get(orden.estado, orden.estado)}»; este paso no aplica ahora")


def faltantes_cierre(orden: Orden) -> list[str]:
    hechos = orden.checklist or {}
    fotos = orden.fotos or {}
    falta = [k for k in CHECKLIST_INSTALACION + CHECKLIST_RESIDUOS if not hechos.get(k)]
    falta += [f"foto_{k}" for k in FOTOS_CIERRE if not fotos.get(k)]
    return falta


def ficha_tecnico(tec: Tecnico | None) -> dict | None:
    if not tec:
        return None
    return {"id": tec.id, "nombre": tec.user.nombre, "cedula": tec.user.cedula, "telefono": tec.user.telefono,
            "foto": tec.foto_rostro, "grupo": tec.grupo, "tienda": tec.tienda.nombre, "verificado": tec.verificado}


def _iso(x: dt.datetime | None) -> str | None:
    return x.isoformat() + "Z" if x else None


def linea_de_tiempo(orden: Orden) -> list[dict]:
    cuando = {}
    for e in orden.eventos:
        cuando.setdefault(e.estado, e.creado)
    actual = ESTADOS.index(orden.estado) if orden.estado in ESTADOS else -1
    return [{"estado": s, "texto": ESTADO_TEXTO[s], "hecho": i <= actual, "actual": i == actual, "fecha": _iso(cuando.get(s))}
            for i, s in enumerate(ESTADOS)]


def vista(orden: Orden, rol: str) -> dict:
    """Lo que ve cada rol. El cliente recibe la ficha de seguridad del técnico solo cuando ya retiró el equipo."""
    d = {
        "id": orden.id, "codigo": orden.codigo, "estado": orden.estado, "estado_texto": ESTADO_TEXTO.get(orden.estado),
        "cliente": {"nombre": orden.cliente_nombre, "telefono": orden.cliente_telefono, "direccion": orden.direccion,
                    "referencia": orden.referencia, "lat": orden.lat, "lng": orden.lng, "zona": orden.zona},
        "equipo": {"tipo": orden.tipo_equipo, "marca": orden.marca, "modelo": orden.modelo, "serial": orden.serial,
                   "fecha_compra": orden.fecha_compra, "garantia": orden.garantia, "factura": orden.factura},
        "fecha": orden.fecha, "franja": orden.franja,
        "tienda": {"id": orden.tienda.id, "nombre": orden.tienda.nombre, "direccion": orden.tienda.direccion,
                   "lat": orden.tienda.lat, "lng": orden.tienda.lng},
        "linea_de_tiempo": linea_de_tiempo(orden),
        "retirado_en": _iso(orden.retirado_en), "completado_en": _iso(orden.completado_en),
        "checklist": orden.checklist or {}, "fotos": orden.fotos or {},
        "calificacion": orden.calificacion, "comentario": orden.comentario,
        "creado": _iso(orden.creado),
    }
    if rol == "cliente":
        d["tecnico"] = ficha_tecnico(orden.tecnico) if orden.retirado_en else None
        d["tecnico_asignado"] = orden.tecnico is not None
    else:
        d["tecnico"] = ficha_tecnico(orden.tecnico)
        d["faltantes_cierre"] = faltantes_cierre(orden)
    if rol in ("agente", "supervisor", "admin"):
        d["qr"] = f"AHAHOME:{orden.qr_token}"
        d["eventos"] = [{"estado": e.estado, "nota": e.nota, "fecha": _iso(e.creado)} for e in orden.eventos]
    return d


def cancelar(db: Session, orden: Orden, actor: User, motivo: str) -> None:
    exigir_estado(orden, "solicitud_enviada", "tecnico_asignado", "cita_confirmada")
    registrar(db, orden, ESTADO_CANCELADO, actor, motivo or "Cancelada")
    if orden.tecnico:
        notificar(db, orden.tecnico.user_id, f"{orden.codigo} cancelada", motivo or "El cliente canceló la orden", orden.id)


def marcar_completada(db: Session, orden: Orden, actor: User) -> None:
    falta = faltantes_cierre(orden)
    if falta:
        raise HTTPException(422, {"mensaje": "Completa el checklist y las fotos antes de cerrar", "faltan": falta})
    orden.completado_en = ahora()
    registrar(db, orden, "completado", actor, "Instalación y retiro de embalaje completados")
    notificar(db, orden.cliente_id, "¡Instalación completada!", f"{orden.codigo}: cuéntanos cómo te fue y califica el servicio.", orden.id)
