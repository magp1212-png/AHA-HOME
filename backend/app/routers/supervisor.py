"""Centro de control del supervisor: resumen por zona, reasignación, retén, incidencias y personal."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import asignacion
from .. import ordenes as svc
from ..db import get_db
from ..deps import require
from ..models import GRUPOS, ROLES, Incidencia, Orden, Tecnico, Tienda, User
from ..notificar import notificar
from ..security import hash_password
from .auth import limpiar_tel, perfil

router = APIRouter(prefix="/supervisor", tags=["supervisor"])
solo_sup = require("supervisor")


def tecnico_dict(db: Session, t: Tecnico, fecha: str) -> dict:
    return {"id": t.id, "nombre": t.user.nombre, "telefono": t.user.telefono, "cedula": t.user.cedula,
            "grupo": t.grupo, "tienda": t.tienda.nombre, "zona": t.tienda.zona, "verificado": t.verificado,
            "disponible": t.disponible, "reten_activo": t.reten_activo, "foto_rostro": t.foto_rostro,
            "selfie_cedula": t.selfie_cedula, "ordenes_hoy": asignacion.carga(db, t.id, fecha)}


@router.get("/resumen")
def resumen(fecha: dt.date | None = None, zona: str | None = None, user: User = Depends(solo_sup), db: Session = Depends(get_db)):
    f = fecha or asignacion.hoy()
    q = select(Orden).where(Orden.fecha == f.isoformat()).order_by(Orden.franja, Orden.id)
    if zona:
        q = q.where(Orden.zona == zona)
    ords = db.scalars(q).all()
    cuenta = lambda *est: sum(1 for o in ords if o.estado in est)
    guardia = asignacion.grupo_de_guardia(f)
    tecs = db.scalars(select(Tecnico).order_by(Tecnico.tienda_id, Tecnico.grupo, Tecnico.id)).all()
    tiendas = db.scalars(select(Tienda).order_by(Tienda.id)).all()
    incs = db.scalars(select(Incidencia).where(Incidencia.abierta.is_(True)).order_by(Incidencia.id.desc())).all()
    return {
        "fecha": f.isoformat(), "grupo_de_guardia": guardia,
        "indicadores": {"ordenes": len(ords), "sin_tecnico": sum(1 for o in ords if not o.tecnico_id and o.estado != "cancelado"),
                        "en_ruta_o_instalando": cuenta("en_ruta", "en_progreso"), "completadas": cuenta("completado"),
                        "incidencias_abiertas": len(incs)},
        "ordenes": [svc.vista(o, "supervisor") for o in ords],
        "incidencias": [{"id": i.id, "texto": i.texto, "orden_id": i.orden_id,
                         "tecnico": db.get(Tecnico, i.tecnico_id).user.nombre if i.tecnico_id else None,
                         "fecha": i.creado.isoformat() + "Z"} for i in incs],
        "reten": [tecnico_dict(db, t, f.isoformat()) for t in tecs if t.grupo == "RETEN"],
        "tiendas": [{"id": ti.id, "nombre": ti.nombre, "zona": ti.zona,
                     "grupos": [{"grupo": g, "de_guardia": g == guardia,
                                 "tecnicos": [tecnico_dict(db, t, f.isoformat()) for t in tecs if t.tienda_id == ti.id and t.grupo == g]}
                                for g in GRUPOS if g != "RETEN"]} for ti in tiendas],
        "por_verificar": [tecnico_dict(db, t, f.isoformat()) for t in tecs if not t.verificado and t.foto_rostro and t.selfie_cedula],
    }


class Reasignar(BaseModel):
    tecnico_id: int | None = None  # vacío = el sistema elige


@router.post("/ordenes/{orden_id}/reasignar")
def reasignar(orden_id: int, body: Reasignar, user: User = Depends(solo_sup), db: Session = Depends(get_db)):
    o = db.get(Orden, orden_id)
    if not o:
        raise HTTPException(404, "Orden no encontrada")
    svc.exigir_estado(o, "solicitud_enviada", "tecnico_asignado", "cita_confirmada")
    anterior = o.tecnico
    if body.tecnico_id:
        t = db.get(Tecnico, body.tecnico_id)
        if not t or not t.verificado:
            raise HTTPException(422, "Técnico no válido o sin verificar")
        o.tecnico_id, o.tecnico = t.id, t
        svc.registrar(db, o, "tecnico_asignado", user, f"Reasignada por el supervisor a {t.user.nombre}")
        notificar(db, t.user_id, f"Nueva orden {o.codigo}", f"{o.fecha} {o.franja} · {o.direccion}", o.id)
        nuevo = t
    else:
        nuevo = svc.asignar(db, o, user, "Reasignación automática")
        if not nuevo:
            o.tecnico_id, o.tecnico = None, None
            svc.registrar(db, o, "solicitud_enviada", user, "Sin técnico disponible")
    if anterior and (not nuevo or nuevo.id != anterior.id):
        notificar(db, anterior.user_id, f"{o.codigo} reasignada", "Esta orden ya no está en tu ruta.", o.id)
    db.commit()
    return svc.vista(o, "supervisor")


@router.post("/incidencias/{inc_id}/resolver")
def resolver(inc_id: int, user: User = Depends(solo_sup), db: Session = Depends(get_db)):
    i = db.get(Incidencia, inc_id)
    if not i:
        raise HTTPException(404)
    i.abierta = False
    db.commit()
    return {"ok": True}


class Activo(BaseModel):
    activo: bool


@router.post("/tecnicos/{tec_id}/reten")
def activar_reten(tec_id: int, body: Activo, user: User = Depends(solo_sup), db: Session = Depends(get_db)):
    t = db.get(Tecnico, tec_id)
    if not t or t.grupo != "RETEN":
        raise HTTPException(422, "Ese técnico no es de la Guardia Retén")
    t.reten_activo = body.activo
    if body.activo:
        notificar(db, t.user_id, "Guardia Retén activada", "Quedas disponible para recibir órdenes hoy.")
    # órdenes que quedaron sin técnico se intentan asignar de nuevo
    if body.activo:
        for o in db.scalars(select(Orden).where(Orden.tecnico_id.is_(None), Orden.estado == "solicitud_enviada")):
            svc.asignar(db, o, user, "Asignada a Guardia Retén")
    db.commit()
    return tecnico_dict(db, t, asignacion.hoy().isoformat())


@router.post("/tecnicos/{tec_id}/verificar")
def verificar(tec_id: int, body: Activo, user: User = Depends(solo_sup), db: Session = Depends(get_db)):
    t = db.get(Tecnico, tec_id)
    if not t:
        raise HTTPException(404)
    if body.activo and not (t.foto_rostro and t.selfie_cedula):
        raise HTTPException(422, "El técnico aún no subió su foto de rostro y su selfie con la cédula")
    t.verificado = body.activo
    notificar(db, t.user_id, "Identidad verificada" if body.activo else "Verificación rechazada",
              "Ya puedes recibir órdenes." if body.activo else "Repite el registro de rostro y cédula.")
    db.commit()
    return tecnico_dict(db, t, asignacion.hoy().isoformat())


@router.post("/tecnicos/{tec_id}/disponible")
def disponible(tec_id: int, body: Activo, user: User = Depends(solo_sup), db: Session = Depends(get_db)):
    t = db.get(Tecnico, tec_id)
    if not t:
        raise HTTPException(404)
    t.disponible = body.activo
    db.commit()
    return tecnico_dict(db, t, asignacion.hoy().isoformat())


class NuevoUsuario(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    telefono: str = Field(min_length=7, max_length=30)
    email: str | None = None
    cedula: str | None = Field(default=None, max_length=20)
    password: str = Field(min_length=6, max_length=100)
    rol: str
    tienda_id: int | None = None
    grupo: str | None = None  # para técnicos
    lat: float | None = None
    lng: float | None = None


@router.post("/usuarios")
def crear_usuario(body: NuevoUsuario, user: User = Depends(solo_sup), db: Session = Depends(get_db)):
    permitidos = ("agente", "tecnico") if user.rol == "supervisor" else ROLES
    if body.rol not in permitidos:
        raise HTTPException(403, "No puedes crear usuarios con ese rol")
    tel = limpiar_tel(body.telefono)
    if db.scalar(select(User).where(User.telefono == tel)):
        raise HTTPException(409, "Ese teléfono ya está registrado")
    if body.rol in ("agente", "tecnico") and not db.get(Tienda, body.tienda_id or 0):
        raise HTTPException(422, "Indica la tienda Damasco")
    u = User(nombre=body.nombre.strip(), telefono=tel, email=(body.email or "").strip().lower() or None, cedula=body.cedula,
             password_hash=hash_password(body.password), rol=body.rol, tienda_id=body.tienda_id if body.rol != "tecnico" else None)
    db.add(u)
    db.flush()
    if body.rol == "tecnico":
        if body.grupo not in GRUPOS:
            raise HTTPException(422, "Grupo inválido (A, B, C o RETEN)")
        db.add(Tecnico(user_id=u.id, tienda_id=body.tienda_id, grupo=body.grupo, lat=body.lat, lng=body.lng))
    db.commit()
    db.refresh(u)
    return perfil(u)
