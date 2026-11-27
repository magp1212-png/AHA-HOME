"""Perfil del cliente en el panel: sus datos, su cuenta, dónde se le presta el servicio, sus equipos, órdenes, pagos,
reseñas y lo que ha hablado con soporte. Lo ven quienes tienen «Clientes»; lo editan quienes tienen «Editar datos de clientes».
"""
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import codigos
from .. import ordenes as svc
from ..db import get_db
from ..deps import exigir_permiso, permisos_de, require
from ..models import (ESTADO_TEXTO, METODO_PAGO_TEXTO, TIPO_EQUIPO_TEXTO, TIPO_SERVICIO_TEXTO, ClienteCambio, Incidencia, Orden, ReclamoFinanciero,
                      SoporteMensaje, User, ahora)
from ..notificar import notificar

router = APIRouter(prefix="/clientes", tags=["clientes"])
_EQUIPO = require("supervisor", "sistemas")  # además, cada acción pide su permiso


def _iso(x):
    return x.isoformat() + "Z" if x else None


def _cliente(db: Session, cid: int) -> User:
    u = db.get(User, cid)
    if not u or u.rol != "cliente":
        raise HTTPException(404, "Cliente no encontrado")
    return u


def ordenes_de(db: Session, u: User) -> list[Orden]:
    """Sus órdenes: las de su cuenta y las que la caja registró con su teléfono."""
    cond = [Orden.cliente_id == u.id]
    if u.telefono:
        cond.append(Orden.cliente_telefono == u.telefono)
    return db.scalars(select(Orden).where(or_(*cond)).order_by(Orden.id.desc())).all()


def vista(db: Session, u: User, user: User) -> dict:
    ords = ordenes_de(db, u)
    cuenta = Counter(o.estado for o in ords)
    pagos = []
    for o in ords:
        if o.pagado_en:
            pagos.append({"en": _iso(o.pagado_en), "orden": o.codigo, "concepto": "Servicio cobrado en caja", "metodo": METODO_PAGO_TEXTO.get(o.pago_metodo or "", "—"),
                          "monto": svc.dinero(o.monto_instalacion_centavos + o.inspeccion_centavos), "centavos": o.monto_instalacion_centavos + o.inspeccion_centavos})
        for p in o.presupuestos:
            if p.pago_registrado_en:
                pagos.append({"en": _iso(p.pago_registrado_en), "orden": o.codigo, "concepto": "Presupuesto" + ("" if p.pago_confirmado_en else " (por confirmar)"),
                              "metodo": METODO_PAGO_TEXTO.get(p.pago_metodo or "", "—"), "monto": svc.dinero(p.a_pagar_centavos), "centavos": p.a_pagar_centavos})
        if o.penalidad_pagada_en:
            pagos.append({"en": _iso(o.penalidad_pagada_en), "orden": o.codigo, "concepto": "Penalidad por entrega fallida", "metodo": METODO_PAGO_TEXTO.get(o.penalidad_metodo or "", "—"),
                          "monto": svc.dinero(o.penalidad_centavos or 0), "centavos": o.penalidad_centavos or 0})
    pagos.sort(key=lambda x: x["en"] or "", reverse=True)
    dirs: dict[str, dict] = {}
    for o in ords:
        d = dirs.setdefault(o.direccion.strip().lower(), {"direccion": o.direccion, "zona": o.zona, "lat": o.lat, "lng": o.lng, "veces": 0, "ultima": o.fecha})
        d["veces"] += 1
        d["ultima"] = max(d["ultima"] or "", o.fecha or "")
    califs = [o for o in ords if o.calificacion]
    codigos_ord = {o.codigo for o in ords}
    ids_ord = [o.id for o in ords]
    soporte = db.scalars(select(SoporteMensaje).where(SoporteMensaje.hilo_id == u.id).order_by(SoporteMensaje.id.desc()).limit(8)).all()
    incid = db.scalars(select(Incidencia).where(Incidencia.orden_id.in_(ids_ord))).all() if ids_ord else []
    reclamos = db.scalars(select(ReclamoFinanciero).where(or_(ReclamoFinanciero.orden_codigo.in_(codigos_ord), ReclamoFinanciero.cliente == u.nombre))).all()
    cambios = db.scalars(select(ClienteCambio).where(ClienteCambio.cliente_id == u.id).order_by(ClienteCambio.id.desc()).limit(40)).all()
    quien = {x.id: x.nombre for x in db.scalars(select(User).where(User.id.in_({c.user_id for c in cambios if c.user_id})))} if cambios else {}
    return {
        "id": u.id, "codigo": codigos.cliente(u), "nombre": u.nombre, "cedula": u.cedula or "", "telefono": u.telefono or "", "email": u.email or "",
        "foto": u.foto, "registrado": _iso(u.creado), "activo": u.activo,
        "cuenta": {"correo_verificado": u.email_verificado, "ultimo_acceso": _iso(u.ultimo_acceso_en), "ultimo_ip": u.ultimo_ip or "",
                   "notificaciones": bool(u.push_token), "con_clave": bool(u.password_hash)},
        "resumen": {"ordenes": len(ords), "completadas": cuenta.get("completado", 0), "en_curso": sum(v for k, v in cuenta.items() if k not in ("completado", "cancelado", "entrega_fallida")),
                    "canceladas": cuenta.get("cancelado", 0), "fallidas": cuenta.get("entrega_fallida", 0),
                    "pagado": svc.dinero(sum(p["centavos"] for p in pagos)), "calificacion_dada": round(sum(o.calificacion for o in califs) / len(califs), 2) if califs else None,
                    "cliente_desde": min(o.fecha for o in ords) if ords else None, "ultima_orden": max(o.fecha for o in ords) if ords else None},
        "direcciones": sorted(dirs.values(), key=lambda d: -d["veces"])[:8],
        "equipos": [{"orden": o.codigo, "tipo": TIPO_EQUIPO_TEXTO.get(a.tipo, a.descripcion or a.tipo), "descripcion": a.descripcion, "marca": a.marca, "modelo": a.modelo,
                     "serial": a.serial, "garantia": a.garantia, "instalado": a.instalar, "fecha": o.fecha} for o in ords for a in o.articulos][:30],
        "ordenes": [{"id": o.id, "codigo": o.codigo, "fecha": o.fecha, "franja": o.franja, "servicio": TIPO_SERVICIO_TEXTO.get(o.tipo_servicio, o.tipo_servicio),
                     "tienda": o.tienda.nombre if o.tienda else "", "profesional": o.tecnico.user.nombre if o.tecnico else "Sin asignar",
                     "estado": ESTADO_TEXTO.get(o.estado, o.estado), "estado_clave": o.estado} for o in ords[:30]],
        "pagos": [{k: v for k, v in p.items() if k != "centavos"} for p in pagos[:30]],
        "resenas": [{"orden": o.codigo, "fecha": o.fecha, "estrellas": o.calificacion, "comentario": o.comentario or "",
                     "profesional": o.tecnico.user.nombre if o.tecnico else "—"} for o in califs[:15]],
        "soporte": {"mensajes": [{"en": _iso(m.creado), "tema": m.tema or "", "texto": m.texto or ("📷 foto" if m.foto else ""), "de_cliente": m.autor_id == u.id} for m in soporte],
                    "incidencias": [{"en": _iso(i.creado), "texto": i.texto, "abierta": i.abierta} for i in incid],
                    "reclamos": [{"en": _iso(r.creado), "orden": r.orden_codigo, "motivo": r.motivo, "monto": svc.dinero(r.monto_centavos), "estado": r.estado} for r in reclamos]},
        "cambios": [{"en": _iso(c.creado), "quien": quien.get(c.user_id, "—"), "texto": c.texto, "antes": c.antes, "despues": c.despues} for c in cambios],
        "puede_editar": "editar_clientes" in permisos_de(user),
    }


def _ver(user: User = Depends(_EQUIPO)) -> User:
    exigir_permiso(user, "ver_clientes")
    return user


@router.get("/{cid}")
def ver(cid: int, user: User = Depends(_ver), db: Session = Depends(get_db)):
    return vista(db, _cliente(db, cid), user)


class Edicion(BaseModel):
    nombre: str | None = Field(default=None, max_length=120)
    cedula: str | None = Field(default=None, max_length=20)
    telefono: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=160)


ETIQUETAS = {"nombre": "el nombre", "cedula": "la cédula", "telefono": "el teléfono", "email": "el correo"}


@router.put("/{cid}")
def editar(cid: int, body: Edicion, user: User = Depends(_EQUIPO), db: Session = Depends(get_db)):
    from .auth import limpiar_tel
    from .tecnico import normalizar_cedula
    exigir_permiso(user, "editar_clientes")
    u = _cliente(db, cid)
    cambios = []

    def pon(campo, valor):
        if str(getattr(u, campo) or "") != str(valor or ""):
            cambios.append((f"cambió {ETIQUETAS[campo]}", str(getattr(u, campo) or "—")[:160], str(valor or "—")[:160]))
            setattr(u, campo, valor)

    if body.nombre is not None:
        if len(body.nombre.strip()) < 3:
            raise HTTPException(422, "Escribe el nombre completo")
        pon("nombre", body.nombre.strip())
    if body.cedula is not None:
        pon("cedula", normalizar_cedula(body.cedula) if body.cedula.strip() else None)
    if body.telefono is not None:
        tel = limpiar_tel(body.telefono) if body.telefono.strip() else None
        if tel and db.scalar(select(User).where(User.telefono == tel, User.id != u.id)):
            raise HTTPException(409, "Ese teléfono ya está registrado")
        pon("telefono", tel)
    if body.email is not None:
        e = body.email.strip().lower() or None
        if e and ("@" not in e or db.scalar(select(User).where(User.email == e, User.id != u.id))):
            raise HTTPException(409, "Ese correo ya está registrado o no es válido")
        pon("email", e)
    for texto, antes, despues in cambios:
        db.add(ClienteCambio(cliente_id=u.id, user_id=user.id, texto=texto, antes=antes, despues=despues))
    if cambios:
        notificar(db, u.id, "Tus datos fueron actualizados", f"AHA HOME {', '.join(x[0] for x in cambios)}. Si no lo pediste, escríbenos.")
    db.commit()
    return vista(db, u, user)


@router.post("/{cid}/cerrar-sesiones")
def cerrar_sesiones(cid: int, user: User = Depends(_EQUIPO), db: Session = Depends(get_db)):
    """Cierra su sesión en todos sus teléfonos (por ejemplo, si lo pierde)."""
    exigir_permiso(user, "editar_clientes")
    u = _cliente(db, cid)
    u.sesiones_desde = ahora()
    db.add(ClienteCambio(cliente_id=u.id, user_id=user.id, texto="cerró su sesión en todos sus teléfonos"))
    db.commit()
    return vista(db, u, user)
