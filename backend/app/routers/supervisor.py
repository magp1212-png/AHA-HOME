"""Centro de control: técnico supervisor (su tienda), equipo supervisor y superadmin (todas las tiendas)."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import asignacion
from .. import ordenes as svc
from ..db import get_db
from ..deps import require
from ..models import (DOCUMENTOS_OBLIGATORIOS, GRUPOS, ROLES, TIPOS_DOCUMENTO, Documento, Incidencia, Orden, Tecnico, Tienda,
                      User, ahora)
from ..notificar import notificar
from ..security import hash_password
from .auth import limpiar_tel, perfil

router = APIRouter(prefix="/supervisor", tags=["supervisor"])
control = require("tecnico_supervisor", "supervisor")

# Quién puede crear qué usuario
PUEDE_CREAR = {
    "tecnico_supervisor": ("tecnico", "ayudante"),
    "supervisor": ("agente", "tecnico", "ayudante", "tecnico_supervisor"),
    "superadmin": ROLES,
}


def tienda_permitida(user: User, tienda_id: int | None) -> int | None:
    """El técnico supervisor solo ve su tienda; supervisor y superadmin ven todas (o filtran una)."""
    if user.rol == "tecnico_supervisor":
        if tienda_id and tienda_id != user.tienda_id:
            raise HTTPException(403, "Solo puedes ver tu tienda")
        return user.tienda_id
    return tienda_id


def tecnico_dict(db: Session, t: Tecnico, fecha: str) -> dict:
    return {"id": t.id, "nombre": t.user.nombre, "telefono": t.user.telefono, "cedula": t.user.cedula,
            "rol": "ayudante" if t.es_ayudante else "tecnico", "grupo": t.grupo, "tienda": t.tienda.nombre,
            "zona": t.tienda.zona, "verificado": t.verificado, "disponible": t.disponible, "reten_activo": t.reten_activo,
            "foto_rostro": t.foto_rostro, "selfie_cedula": t.selfie_cedula, "foto_perfil": t.foto_perfil,
            "huella_registrada": t.huella_registrada, "email": t.user.email,
            "registro_app_completo": bool(t.foto_rostro and t.selfie_cedula and t.huella_registrada),
            "documentos_faltantes": [d for d in DOCUMENTOS_OBLIGATORIOS if d not in {x.tipo for x in t.documentos}],
            "alta_en": t.alta_en.isoformat() + "Z" if t.alta_en else None,
            "jefe": t.jefe.user.nombre if t.jefe else None,
            "ayudantes": [{"id": a.id, "nombre": a.user.nombre, "verificado": a.verificado} for a in t.ayudantes],
            "ordenes_hoy": asignacion.carga(db, t.id, fecha) if not t.es_ayudante else None}


@router.get("/resumen")
def resumen(fecha: dt.date | None = None, zona: str | None = None, tienda_id: int | None = None,
            user: User = Depends(control), db: Session = Depends(get_db)):
    f = fecha or asignacion.hoy()
    tid = tienda_permitida(user, tienda_id)
    q = select(Orden).where(Orden.fecha == f.isoformat()).order_by(Orden.franja, Orden.id)
    if zona:
        q = q.where(Orden.zona == zona)
    if tid:
        q = q.where(Orden.tienda_id == tid)
    ords = db.scalars(q).all()
    cuenta = lambda *est: sum(1 for o in ords if o.estado in est)
    guardia = asignacion.grupo_de_guardia(f)
    tecs = [t for t in db.scalars(select(Tecnico).order_by(Tecnico.tienda_id, Tecnico.grupo, Tecnico.id)) if not tid or t.tienda_id == tid]
    principales = [t for t in tecs if not t.es_ayudante]
    tiendas = [ti for ti in db.scalars(select(Tienda).order_by(Tienda.id)) if not tid or ti.id == tid]
    incs = [i for i in db.scalars(select(Incidencia).where(Incidencia.abierta.is_(True)).order_by(Incidencia.id.desc()))
            if not tid or (i.tecnico_id and db.get(Tecnico, i.tecnico_id).tienda_id == tid)]
    por_tipo = {k: sum(1 for o in ords if o.tipo_servicio == k) for k in ("traslado", "instalacion", "traslado_instalacion")}
    return {
        "fecha": f.isoformat(), "grupo_de_guardia": guardia,
        "indicadores": {"ordenes": len(ords), "sin_tecnico": sum(1 for o in ords if not o.tecnico_id and o.estado != "cancelado"),
                        "en_ruta_o_en_servicio": cuenta("en_ruta", "en_progreso"), "completadas": cuenta("completado"),
                        "incidencias_abiertas": len(incs),
                        "en_pausa_inspeccion": sum(1 for o in ords if o.requiere_inspeccion and o.estado in ("solicitud_enviada", "tecnico_asignado", "cita_confirmada") and o.pausa_desde is not None), "por_tipo_servicio": por_tipo},
        "ordenes": [svc.vista(o, user.rol) for o in ords],
        "incidencias": [{"id": i.id, "texto": i.texto, "orden_id": i.orden_id,
                         "tecnico": db.get(Tecnico, i.tecnico_id).user.nombre if i.tecnico_id else None,
                         "fecha": i.creado.isoformat() + "Z"} for i in incs],
        "reten": [tecnico_dict(db, t, f.isoformat()) for t in principales if t.grupo == "RETEN"],
        "tiendas": [{"id": ti.id, "nombre": ti.nombre, "zona": ti.zona,
                     "grupos": [{"grupo": g, "de_guardia": g == guardia,
                                 "tecnicos": [tecnico_dict(db, t, f.isoformat()) for t in principales if t.tienda_id == ti.id and t.grupo == g]}
                                for g in GRUPOS if g != "RETEN"]} for ti in tiendas],
        "pendientes_de_alta": [tecnico_dict(db, t, f.isoformat()) for t in tecs if not t.verificado and t.alta_en is None],
    }


def orden_controlada(db: Session, user: User, orden_id: int) -> Orden:
    o = db.get(Orden, orden_id)
    if not o or (user.rol == "tecnico_supervisor" and o.tienda_id != user.tienda_id):
        raise HTTPException(404, "Orden no encontrada")
    return o


def tecnico_controlado(db: Session, user: User, tec_id: int) -> Tecnico:
    t = db.get(Tecnico, tec_id)
    if not t or (user.rol == "tecnico_supervisor" and t.tienda_id != user.tienda_id):
        raise HTTPException(404, "Técnico no encontrado")
    return t


class Reasignar(BaseModel):
    tecnico_id: int | None = None       # vacío = el sistema elige
    ayudantes: list[int] | None = None  # vacío = los ayudantes del técnico


@router.post("/ordenes/{orden_id}/reasignar")
def reasignar(orden_id: int, body: Reasignar, user: User = Depends(control), db: Session = Depends(get_db)):
    o = orden_controlada(db, user, orden_id)
    svc.exigir_estado(o, "solicitud_enviada", "tecnico_asignado", "cita_confirmada")
    anteriores = ([o.tecnico] if o.tecnico else []) + list(o.ayudantes)
    if body.tecnico_id:
        t = tecnico_controlado(db, user, body.tecnico_id)
        if not t.verificado or t.es_ayudante:
            raise HTTPException(422, "Elige un técnico principal verificado")
        ayud = None
        if body.ayudantes is not None:
            ayud = [tecnico_controlado(db, user, i) for i in body.ayudantes]
            if any(not a.es_ayudante or not a.verificado for a in ayud):
                raise HTTPException(422, "Los ayudantes deben estar registrados como ayudantes y verificados")
        svc.poner_cuadrilla(db, o, t, ayud)
        svc.registrar(db, o, "tecnico_asignado", user, f"Asignada por {user.nombre} a {svc.nombres_cuadrilla(o)}")
        svc.avisar_cuadrilla(db, o)
    else:
        svc.poner_cuadrilla(db, o, None)
        db.flush()
        if not svc.asignar(db, o, user, f"Reasignación automática pedida por {user.nombre}"):
            svc.registrar(db, o, "solicitud_enviada", user, "Sin técnico disponible")
    actuales = ([o.tecnico] if o.tecnico else []) + list(o.ayudantes)
    for t in anteriores:
        if t not in actuales:
            notificar(db, t.user_id, f"{o.codigo} reasignada", "Esta orden ya no está en tu ruta.", o.id)
    svc.avisar_seguimiento(db, o, f"{o.codigo} reasignada", svc.nombres_cuadrilla(o))
    db.commit()
    return svc.vista(o, user.rol)


@router.post("/incidencias/{inc_id}/resolver")
def resolver(inc_id: int, user: User = Depends(control), db: Session = Depends(get_db)):
    i = db.get(Incidencia, inc_id)
    if not i:
        raise HTTPException(404)
    if i.tecnico_id:
        tecnico_controlado(db, user, i.tecnico_id)
    i.abierta = False
    db.commit()
    return {"ok": True}


class Activo(BaseModel):
    activo: bool


@router.post("/tecnicos/{tec_id}/reten")
def activar_reten(tec_id: int, body: Activo, user: User = Depends(control), db: Session = Depends(get_db)):
    t = tecnico_controlado(db, user, tec_id)
    if t.grupo != "RETEN" or t.es_ayudante:
        raise HTTPException(422, "Ese técnico no es de la Guardia Retén")
    t.reten_activo = body.activo
    if body.activo:
        notificar(db, t.user_id, "Guardia Retén activada", "Quedas disponible para recibir órdenes hoy.")
        for a in t.ayudantes:
            notificar(db, a.user_id, "Guardia Retén activada", f"Sales con {t.user.nombre} si llega una orden.")
        db.flush()
        for o in db.scalars(select(Orden).where(Orden.tecnico_id.is_(None), Orden.estado == "solicitud_enviada")):
            if svc.asignar(db, o, user, "Asignada a Guardia Retén"):
                svc.avisar_seguimiento(db, o, f"{o.codigo} asignada", svc.nombres_cuadrilla(o))
    db.commit()
    return tecnico_dict(db, t, asignacion.hoy().isoformat())


# ---------- Expediente y alta en la oficina ----------

def doc_dict(d: Documento) -> dict:
    return {"id": d.id, "tipo": d.tipo, "tipo_texto": TIPOS_DOCUMENTO.get(d.tipo, d.tipo), "url": d.url,
            "descripcion": d.descripcion, "vence": d.vence, "fecha": d.creado.isoformat() + "Z"}


@router.get("/tecnicos/{tec_id}/expediente")
def expediente(tec_id: int, user: User = Depends(control), db: Session = Depends(get_db)):
    t = tecnico_controlado(db, user, tec_id)
    from .presupuestos import cuenta_tecnico
    return tecnico_dict(db, t, asignacion.hoy().isoformat()) | {
        "documentos": [doc_dict(d) for d in t.documentos], "tipos_documento": TIPOS_DOCUMENTO, "cuenta_pago": cuenta_tecnico(t)}


class NuevoDocumento(BaseModel):
    tipo: str
    url: str = Field(min_length=5, max_length=200)  # foto subida antes con POST /archivos
    descripcion: str = Field(default="", max_length=200)
    vence: str = Field(default="", max_length=10)


@router.post("/tecnicos/{tec_id}/documentos")
def agregar_documento(tec_id: int, body: NuevoDocumento, user: User = Depends(control), db: Session = Depends(get_db)):
    """En la oficina: foto de perfil, cédula, licencia, documentos del vehículo y otros."""
    t = tecnico_controlado(db, user, tec_id)
    if body.tipo not in TIPOS_DOCUMENTO:
        raise HTTPException(422, "Tipo de documento inválido")
    d = Documento(tecnico_id=t.id, tipo=body.tipo, url=body.url, descripcion=body.descripcion.strip(), vence=body.vence,
                  subido_por=user.id)
    db.add(d)
    if body.tipo == "foto_perfil":
        t.foto_perfil = body.url
    db.commit()
    return doc_dict(d)


@router.delete("/tecnicos/{tec_id}/documentos/{doc_id}")
def borrar_documento(tec_id: int, doc_id: int, user: User = Depends(control), db: Session = Depends(get_db)):
    t = tecnico_controlado(db, user, tec_id)
    d = db.get(Documento, doc_id)
    if not d or d.tecnico_id != t.id:
        raise HTTPException(404)
    if d.tipo == "foto_perfil" and t.foto_perfil == d.url:
        t.foto_perfil = None
    db.delete(d)
    db.commit()
    return {"ok": True}


class Alta(BaseModel):
    grupo: str | None = None    # técnicos: A, B, C (o RETEN)
    jefe_id: int | None = None  # ayudantes: técnico con el que salen (toma su grupo)


@router.post("/tecnicos/{tec_id}/alta")
def dar_de_alta(tec_id: int, body: Alta, user: User = Depends(control), db: Session = Depends(get_db)):
    """Alta inmediata en la oficina: exige registro completo en la app y expediente mínimo."""
    t = tecnico_controlado(db, user, tec_id)
    falta = []
    if not t.es_ayudante:  # el técnico se registra en la app; el ayudante puede registrarse completo en la oficina
        if not (t.foto_rostro and t.selfie_cedula):
            falta.append("escaneo facial y foto con la cédula (desde la app)")
        if not t.huella_registrada:
            falta.append("huella (desde la app)")
    if not t.es_ayudante:
        from .presupuestos import cuenta_tecnico
        if not cuenta_tecnico(t)["registrada"]:
            falta.append("datos bancarios o de pago móvil (para pagarle sus servicios)")
    tipos = {d.tipo for d in t.documentos}
    falta += [TIPOS_DOCUMENTO[d] for d in DOCUMENTOS_OBLIGATORIOS if d not in tipos]
    if falta:
        raise HTTPException(422, {"mensaje": "Falta completar el registro", "faltan": falta})
    if t.es_ayudante:
        jefe_id = body.jefe_id or t.jefe_id  # si su técnico ya lo anotó, sale con él
        jefe = tecnico_controlado(db, user, jefe_id) if jefe_id else None
        if not jefe or jefe.es_ayudante or jefe.tienda_id != t.tienda_id:
            raise HTTPException(422, "Indica el técnico de la tienda con el que saldrá el ayudante")
        t.jefe_id, t.grupo = jefe.id, jefe.grupo
    else:
        if body.grupo not in GRUPOS:
            raise HTTPException(422, "Asigna uno de los grupos: A, B o C (o RETEN)")
        t.grupo = body.grupo
        for a in t.ayudantes:
            a.grupo = t.grupo
    t.verificado, t.alta_en, t.alta_por = True, ahora(), user.id
    grupo_txt = f"Grupo {t.grupo}" if t.grupo != "RETEN" else "Guardia Retén"
    notificar(db, t.user_id, "¡Bienvenido a AHA HOME!", f"Tu alta está lista: {t.tienda.nombre}, {grupo_txt}. Ya puedes recibir órdenes.")
    db.commit()
    return tecnico_dict(db, t, asignacion.hoy().isoformat())


@router.post("/tecnicos/{tec_id}/suspender")
def suspender(tec_id: int, body: Activo, user: User = Depends(control), db: Session = Depends(get_db)):
    """Quita (activo=true) o devuelve (activo=false) la verificación: un técnico suspendido no recibe órdenes."""
    t = tecnico_controlado(db, user, tec_id)
    if not body.activo and t.alta_en is None:
        raise HTTPException(422, "Ese técnico aún no tiene alta; usa «dar de alta»")
    t.verificado = not body.activo
    notificar(db, t.user_id, "Cuenta suspendida" if body.activo else "Cuenta reactivada",
              "Comunícate con la oficina." if body.activo else "Ya puedes recibir órdenes.")
    db.commit()
    return tecnico_dict(db, t, asignacion.hoy().isoformat())


@router.post("/tecnicos/{tec_id}/disponible")
def disponible(tec_id: int, body: Activo, user: User = Depends(control), db: Session = Depends(get_db)):
    t = tecnico_controlado(db, user, tec_id)
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
    grupo: str | None = None   # técnicos: A, B, C o RETEN
    jefe_id: int | None = None  # ayudantes: el técnico con el que salen
    lat: float | None = None
    lng: float | None = None


@router.post("/usuarios")
def crear_usuario(body: NuevoUsuario, user: User = Depends(control), db: Session = Depends(get_db)):
    if body.rol not in PUEDE_CREAR.get(user.rol, ()):
        raise HTTPException(403, "No puedes crear usuarios con ese rol")
    tienda_id = user.tienda_id if user.rol == "tecnico_supervisor" else body.tienda_id
    tel = limpiar_tel(body.telefono)
    if db.scalar(select(User).where(User.telefono == tel)):
        raise HTTPException(409, "Ese teléfono ya está registrado")
    if body.rol in ("agente", "tecnico", "ayudante", "tecnico_supervisor") and not db.get(Tienda, tienda_id or 0):
        raise HTTPException(422, "Indica la tienda Damasco")
    jefe = None
    if body.rol == "ayudante":
        jefe = db.get(Tecnico, body.jefe_id or 0)
        if not jefe or jefe.es_ayudante or jefe.tienda_id != tienda_id:
            raise HTTPException(422, "Indica el técnico de esa tienda con el que sale el ayudante")
    if body.rol == "tecnico" and body.grupo not in GRUPOS:
        raise HTTPException(422, "Grupo inválido (A, B, C o RETEN)")
    u = User(nombre=body.nombre.strip(), telefono=tel, email=(body.email or "").strip().lower() or None, cedula=body.cedula,
             password_hash=hash_password(body.password), rol=body.rol, tienda_id=tienda_id)
    db.add(u)
    db.flush()
    if body.rol in ("tecnico", "ayudante"):
        db.add(Tecnico(user_id=u.id, tienda_id=tienda_id, grupo=jefe.grupo if jefe else body.grupo,
                       lat=body.lat, lng=body.lng, es_ayudante=bool(jefe), jefe_id=jefe.id if jefe else None))
    db.commit()
    db.refresh(u)
    return perfil(u)


class CambiarJefe(BaseModel):
    jefe_id: int


@router.post("/ayudantes/{tec_id}/jefe")
def cambiar_jefe(tec_id: int, body: CambiarJefe, user: User = Depends(control), db: Session = Depends(get_db)):
    a = tecnico_controlado(db, user, tec_id)
    jefe = tecnico_controlado(db, user, body.jefe_id)
    if not a.es_ayudante or jefe.es_ayudante:
        raise HTTPException(422, "Asigna un ayudante a un técnico principal")
    a.jefe_id, a.grupo = jefe.id, jefe.grupo
    db.commit()
    return tecnico_dict(db, a, asignacion.hoy().isoformat())


# ---------- Analítica y mapa en vivo ----------

@router.get("/analitica")
def ver_analitica(desde: dt.date | None = None, hasta: dt.date | None = None, tienda_id: int | None = None,
                  user: User = Depends(control), db: Session = Depends(get_db)):
    from .. import analitica
    h = hasta or asignacion.hoy()
    d = desde or (h - dt.timedelta(days=29))
    return analitica.calcular(db, d, h, tienda_permitida(user, tienda_id))


@router.get("/mapa")
def mapa(user: User = Depends(control), db: Session = Depends(get_db)):
    """Tiendas, cuadrillas con su última posición GPS y destino, para el mapa en vivo."""
    tid = tienda_permitida(user, None)
    hoy = asignacion.hoy().isoformat()
    tiendas = [t for t in db.scalars(select(Tienda)) if not tid or t.id == tid]
    abiertas = db.scalars(select(Orden).where(Orden.fecha == hoy, Orden.estado.in_(("tecnico_asignado", "cita_confirmada", "en_ruta", "en_progreso")))).all()
    por_tec = {}
    for o in abiertas:
        if o.tecnico_id and (o.tecnico_id not in por_tec or o.estado in ("en_ruta", "en_progreso")):
            por_tec[o.tecnico_id] = o
    guardia = asignacion.grupo_de_guardia(asignacion.hoy())
    tecs = []
    for t in db.scalars(select(Tecnico).where(Tecnico.es_ayudante.is_(False), Tecnico.verificado.is_(True))):
        if tid and t.tienda_id != tid:
            continue
        o = por_tec.get(t.id)
        de_guardia = (t.grupo == guardia or (t.grupo == "RETEN" and t.reten_activo) or t.respaldo_activo_fecha == hoy) and t.ausente_fecha != hoy
        if not o and not de_guardia:
            continue
        estado = "en_ruta" if o and o.estado == "en_ruta" else "en_servicio" if o and o.estado == "en_progreso" else "asignado" if o else "disponible"
        tecs.append({"id": t.id, "nombre": t.user.nombre, "ayudantes": [a.user.nombre for a in t.ayudantes], "grupo": t.grupo,
                     "estado": estado, "luz": "roja" if estado in ("en_ruta", "en_servicio") else "verde", "lat": t.lat_actual or t.lat or t.tienda.lat, "lng": t.lng_actual or t.lng or t.tienda.lng,
                     "gps_en": t.ubicacion_en.isoformat() + "Z" if t.ubicacion_en else None,
                     "orden": {"codigo": o.codigo, "servicio": o.tipo_servicio, "direccion": o.direccion, "lat": o.lat, "lng": o.lng,
                               "franja": o.franja} if o else None})
    return {"tiendas": [{"id": t.id, "nombre": t.nombre, "zona": t.zona, "direccion": t.direccion, "lat": t.lat, "lng": t.lng} for t in tiendas],
            "tecnicos": tecs}


# ---------- Equipo de hoy: luz verde/roja y respaldo del día ----------

def _luz(db: Session, t: Tecnico, hoy_: str, guardia: str) -> dict:
    activa = db.scalar(select(Orden).where(Orden.tecnico_id == t.id, Orden.fecha == hoy_, Orden.estado.in_(("en_ruta", "en_progreso"))))
    pendientes = db.scalars(select(Orden).where(Orden.tecnico_id == t.id, Orden.fecha == hoy_,
                                                Orden.estado.in_(("tecnico_asignado", "cita_confirmada")))).all()
    trabaja = (t.grupo == guardia or (t.grupo == "RETEN" and t.reten_activo) or t.respaldo_activo_fecha == hoy_)
    if t.ausente_fecha == hoy_ or not t.disponible:
        luz, texto = "gris", "No disponible hoy"
    elif activa:
        luz, texto = "roja", f"Ocupado · {activa.codigo} {'en ruta' if activa.estado == 'en_ruta' else 'en servicio'}"
    else:
        luz, texto = "verde", "Disponible" + (f" · {len(pendientes)} orden(es) más tarde" if pendientes else "")
    return tecnico_dict(db, t, hoy_) | {"luz": luz, "estado_texto": texto, "trabaja_hoy": trabaja,
                                         "ausente_motivo": t.ausente_motivo if t.ausente_fecha == hoy_ else "",
                                         "orden_activa": activa.codigo if activa else None, "pendientes_hoy": len(pendientes),
                                         "respaldo_ofrecido": t.respaldo_fecha == hoy_, "respaldo_activo": t.respaldo_activo_fecha == hoy_}


@router.get("/equipo-hoy")
def equipo_hoy(user: User = Depends(control), db: Session = Depends(get_db)):
    """Quién trabaja hoy (luz verde = disponible, roja = ocupado, gris = no disponible) y el respaldo del día."""
    tid = tienda_permitida(user, None)
    hoy_d = asignacion.hoy()
    hoy_, guardia = hoy_d.isoformat(), asignacion.grupo_de_guardia(hoy_d)
    tecs = [t for t in db.scalars(select(Tecnico).where(Tecnico.es_ayudante.is_(False), Tecnico.verificado.is_(True)).order_by(Tecnico.id))
            if not tid or t.tienda_id == tid]
    filas = [_luz(db, t, hoy_, guardia) for t in tecs]
    equipo = [f for f in filas if f["trabaja_hoy"]]
    respaldo = [f for f in filas if not f["trabaja_hoy"] and (f["grupo"] == "RETEN" or f["respaldo_ofrecido"]) and f["luz"] != "gris"]
    sin_tecnico = db.scalar(select(func.count(Orden.id)).where(Orden.fecha == hoy_, Orden.tecnico_id.is_(None), Orden.estado == "solicitud_enviada")) or 0
    ausentes = [f for f in equipo if f["luz"] == "gris"]
    por_reasignar = sum(f["pendientes_hoy"] for f in ausentes)
    return {
        "fecha": hoy_, "grupo_de_guardia": guardia,
        "resumen": {"verdes": sum(f["luz"] == "verde" for f in equipo), "rojas": sum(f["luz"] == "roja" for f in equipo),
                    "grises": len(ausentes), "ordenes_sin_tecnico": sin_tecnico, "ordenes_de_ausentes": por_reasignar},
        "faltan_tecnicos": bool(ausentes or sin_tecnico),
        "equipo": equipo,
        "respaldo": respaldo,
    }


@router.post("/tecnicos/{tec_id}/respaldo")
def activar_respaldo(tec_id: int, body: Activo, user: User = Depends(control), db: Session = Depends(get_db)):
    """Activa a un técnico de respaldo para hoy y le pasa las órdenes sin técnico o de técnicos ausentes."""
    t = tecnico_controlado(db, user, tec_id)
    if t.es_ayudante or not t.verificado:
        raise HTTPException(422, "Elige un técnico principal con alta")
    hoy_ = asignacion.hoy().isoformat()
    t.respaldo_activo_fecha = hoy_ if body.activo else None
    if t.grupo == "RETEN":
        t.reten_activo = body.activo
    reasignadas = []
    if body.activo:
        notificar(db, t.user_id, "Te activaron como respaldo", "Hoy recibirás órdenes. Revisa tu app.")
        for a in t.ayudantes:
            notificar(db, a.user_id, "Respaldo activado", f"Hoy sales con {t.user.nombre}.")
        db.flush()
        huerfanas = db.scalars(select(Orden).where(Orden.fecha == hoy_, Orden.estado.in_(("solicitud_enviada", "tecnico_asignado", "cita_confirmada")))).all()
        for o in huerfanas:
            ausente = o.tecnico and (o.tecnico.ausente_fecha == hoy_ or not o.tecnico.disponible)
            if o.tecnico_id is None or ausente:
                anteriores = ([o.tecnico] if o.tecnico else []) + list(o.ayudantes)
                svc.poner_cuadrilla(db, o, None)
                db.flush()
                if svc.asignar(db, o, user, "Reasignada al respaldo del día"):
                    reasignadas.append(o.codigo)
                    for x in anteriores:
                        notificar(db, x.user_id, f"{o.codigo} reasignada", "Esta orden pasó al respaldo del día.", o.id)
                    svc.avisar_seguimiento(db, o, f"{o.codigo} reasignada", svc.nombres_cuadrilla(o))
                else:
                    svc.registrar(db, o, "solicitud_enviada", user, "Sin técnico disponible")
    db.commit()
    return {"activo": body.activo, "reasignadas": reasignadas}
