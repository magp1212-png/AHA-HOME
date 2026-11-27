"""Chat de cada orden entre el cliente y la cuadrilla, supervisado por el centro de control.

Participan el cliente, el técnico y su ayudante. El técnico supervisor de la tienda, el equipo supervisor y el
superadmin ven todos los chats y pueden escribir. Abierto mientras el servicio está activo; después queda de lectura.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config
from .. import ordenes as svc
from ..db import get_db
from ..deps import current_user
from ..models import ChatLectura, Mensaje, Orden, User
from ..notificar import notificar

router = APIRouter(tags=["chat"])
CONTROL = ("tecnico_supervisor", "supervisor", "superadmin")
ROL_TEXTO = {"cliente": "cliente", "tecnico": "técnico", "ayudante": "ayudante", "tecnico_supervisor": "centro de control",
             "supervisor": "centro de control", "superadmin": "centro de control", "agente": "caja"}
CERRADOS = ("completado", "cancelado")


def orden_del_chat(db: Session, orden_id: int, user: User) -> Orden:
    o = db.get(Orden, orden_id)
    ok = bool(o) and (
        (user.rol == "cliente" and o.cliente_id == user.id)
        or (user.rol == "tecnico" and user.tecnico and o.tecnico_id == user.tecnico.id)
        or (user.rol == "ayudante" and user.tecnico and user.tecnico in o.ayudantes)
        or (user.rol == "tecnico_supervisor" and o.tienda_id == user.tienda_id)
        or user.rol in ("supervisor", "superadmin"))
    if not ok:
        raise HTTPException(404, "Orden no encontrada")
    return o


def participantes(o: Orden) -> list[int]:
    ids = [o.cliente_id] if o.cliente_id else []
    if o.tecnico:
        ids.append(o.tecnico.user_id)
    ids += [a.user_id for a in o.ayudantes]
    return ids


def leido(db: Session, orden_id: int, user_id: int) -> int:
    r = db.get(ChatLectura, (orden_id, user_id))
    return r.ultimo_id if r else 0


def no_leidos(db: Session, orden_id: int, user_id: int) -> int:
    return db.scalar(select(func.count(Mensaje.id)).where(Mensaje.orden_id == orden_id, Mensaje.id > leido(db, orden_id, user_id),
                                                         (Mensaje.autor_id != user_id) | Mensaje.autor_id.is_(None))) or 0


VE_CUADRILLA = ("en_ruta", "en_progreso", "completado")


def vista_mensaje(db: Session, m: Mensaje, yo: User) -> dict:
    autor = db.get(User, m.autor_id) if m.autor_id else None
    nombre = autor.nombre if autor else None
    # por seguridad, el cliente conoce el nombre de la cuadrilla cuando sale con su pedido
    if autor and yo.rol == "cliente" and autor.rol in ("tecnico", "ayudante"):
        o = db.get(Orden, m.orden_id)
        if o.estado not in VE_CUADRILLA:
            nombre = "Tu técnico" if autor.rol == "tecnico" else "Tu ayudante"
    return {"id": m.id, "texto": m.texto, "foto": m.foto or None, "creado": m.creado.isoformat() + "Z", "mio": m.autor_id == yo.id,
            "sistema": autor is None, "autor": nombre, "rol": ROL_TEXTO.get(autor.rol) if autor else None,
            "control": bool(autor and autor.rol in CONTROL)}


def telefono_control(db: Session, o: Orden) -> str:
    if config.TELEFONO_CONTROL:
        return config.TELEFONO_CONTROL
    u = (db.scalar(select(User).where(User.rol == "tecnico_supervisor", User.tienda_id == o.tienda_id, User.activo.is_(True)).order_by(User.id))
         or db.scalar(select(User).where(User.rol == "supervisor", User.activo.is_(True)).order_by(User.id)))
    return u.telefono if u and u.telefono else ""


def opciones_llamada(db: Session, o: Orden, user: User) -> list[dict]:
    """Llamar desde el chat. Cliente y cuadrilla llaman al centro de control, que los comunica sin compartir números;
    el centro de control llama directo al cliente o al técnico."""
    if user.rol in CONTROL:
        ops = [{"texto": "Llamar al cliente", "telefono": o.cliente_telefono}]
        if o.tecnico:
            ops.append({"texto": f"Llamar al técnico ({o.tecnico.user.nombre.split()[0]})", "telefono": o.tecnico.user.telefono})
        return [x for x in ops if x["telefono"]]
    tel = telefono_control(db, o)
    otro = "tu técnico" if user.rol == "cliente" else "el cliente"
    return [{"texto": "Llamar al centro de control", "detalle": f"Te comunicamos con {otro} sin compartir números", "telefono": tel}] if tel else []


@router.get("/ordenes/{orden_id}/chat")
def ver_chat(orden_id: int, solo_resumen: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = orden_del_chat(db, orden_id, user)
    pendientes = no_leidos(db, o.id, user.id)
    if solo_resumen:
        return {"no_leidos": pendientes}
    ms = db.scalars(select(Mensaje).where(Mensaje.orden_id == o.id).order_by(Mensaje.id)).all()
    if ms:  # al abrir el chat queda leído
        r = db.get(ChatLectura, (o.id, user.id)) or ChatLectura(orden_id=o.id, user_id=user.id)
        r.ultimo_id = ms[-1].id
        db.add(r)
        db.commit()
    otro = o.tecnico if user.rol == "cliente" else None
    return {"orden_id": o.id, "codigo": o.codigo, "abierto": o.estado not in CERRADOS, "estado_texto": svc.ESTADO_TEXTO.get(o.estado),
            "no_leidos": pendientes, "supervisado": True, "llamar": opciones_llamada(db, o, user),
            "monitoreo": {"activo": bool(monitoreos_activos(db, o.id)),
                          "texto": "El equipo de soporte de AHA HOME está monitoreando esta conversación en este momento."},
            "con": (({"nombre": otro.user.nombre, "foto": otro.foto_perfil or otro.foto_rostro, "rol": "técnico"} if o.estado in VE_CUADRILLA
                     else {"nombre": "Tu técnico", "foto": None, "rol": "técnico asignado"}) if otro
                    else {"nombre": o.cliente_nombre, "foto": None, "rol": "cliente"}),
            "mensajes": [vista_mensaje(db, m, user) for m in ms]}


class NuevoMensaje(BaseModel):
    texto: str = Field(default="", max_length=1000)
    foto: str = Field(default="", max_length=200)


@router.post("/ordenes/{orden_id}/chat")
def escribir(orden_id: int, body: NuevoMensaje, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = orden_del_chat(db, orden_id, user)
    if o.estado in CERRADOS:
        raise HTTPException(409, "El chat de esta orden ya está cerrado")
    texto = body.texto.strip()
    if not texto and not body.foto:
        raise HTTPException(422, "Escribe un mensaje o envía una foto")
    if user.rol in CONTROL and not db.scalar(select(Mensaje.id).where(Mensaje.orden_id == o.id, Mensaje.autor_id == user.id)):
        db.add(Mensaje(orden_id=o.id, autor_id=None, texto=f"🛡 {user.nombre.split(' ')[0]}, del equipo de soporte de AHA HOME, intervino en la conversación"))
    m = Mensaje(orden_id=o.id, autor_id=user.id, texto=texto, foto=body.foto)
    db.add(m)
    db.flush()
    r = db.get(ChatLectura, (o.id, user.id)) or ChatLectura(orden_id=o.id, user_id=user.id)
    r.ultimo_id = m.id
    db.add(r)
    quien = f"{user.nombre.split(' ')[0]} ({ROL_TEXTO.get(user.rol, user.rol)})"
    for uid in participantes(o):
        if uid != user.id:
            notificar(db, uid, f"Mensaje de {quien}", f"{o.codigo}: {texto[:120] or '📷 Foto'}", o.id)
    db.commit()
    return vista_mensaje(db, m, user)


@router.get("/supervisor/chats")
def chats_activos(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Para el centro de control: los chats con mensajes, del más reciente al más antiguo."""
    if user.rol not in CONTROL:
        raise HTTPException(403, "Solo el centro de control")
    ultimos = db.execute(select(Mensaje.orden_id, func.max(Mensaje.id)).group_by(Mensaje.orden_id).order_by(func.max(Mensaje.id).desc()).limit(50)).all()
    out = []
    for oid, mid in ultimos:
        o = db.get(Orden, oid)
        if user.rol == "tecnico_supervisor" and o.tienda_id != user.tienda_id:
            continue
        m = db.get(Mensaje, mid)
        out.append({"orden_id": oid, "codigo": o.codigo, "cliente": o.cliente_nombre, "tecnico": o.tecnico.user.nombre if o.tecnico else None,
                    "ultimo": vista_mensaje(db, m, user), "no_leidos": no_leidos(db, oid, user.id), "abierto": o.estado not in CERRADOS})
    return out


# ---------- Soporte: chats cliente ↔ profesional en vivo, monitoreo e intervención (panel › Mensajería) ----------
from ..deps import exigir_permiso, require  # noqa: E402
from ..models import ChatMonitoreo, TIPO_SERVICIO_TEXTO  # noqa: E402
from .. import codigos  # noqa: E402
import datetime as _dt  # noqa: E402

SOPORTE = require("supervisor")  # supervisor (soporte) y superadmin
LATIDO = _dt.timedelta(seconds=75)        # sin latido del panel, el monitoreo se da por terminado
AVISO_DE_NUEVO = _dt.timedelta(minutes=30)  # para no repetir el aviso si soporte vuelve enseguida


def _soporte(user: User = Depends(SOPORTE)) -> User:
    exigir_permiso(user, "ver_soporte")
    return user


def monitoreos_activos(db: Session, orden_id: int) -> list[ChatMonitoreo]:
    limite = svc_ahora() - LATIDO
    return db.scalars(select(ChatMonitoreo).where(ChatMonitoreo.orden_id == orden_id, ChatMonitoreo.fin.is_(None), ChatMonitoreo.visto_en >= limite)).all()


def svc_ahora():
    from ..models import ahora
    return ahora()


def _rol_chat(u: User | None) -> str:
    if not u:
        return "sistema"
    return {"cliente": "cliente", "tecnico": "profesional", "ayudante": "ayudante"}.get(u.rol, "soporte")


def _monitorear(db: Session, o: Orden, user: User) -> ChatMonitoreo:
    """Empieza (o mantiene) el monitoreo y avisa en el chat al cliente y al profesional."""
    ahora_ = svc_ahora()
    mio = db.scalar(select(ChatMonitoreo).where(ChatMonitoreo.orden_id == o.id, ChatMonitoreo.user_id == user.id, ChatMonitoreo.fin.is_(None)))
    if mio and mio.visto_en >= ahora_ - LATIDO:
        mio.visto_en = ahora_
        return mio
    if mio:
        mio.fin = mio.visto_en
    reciente = db.scalar(select(ChatMonitoreo).where(ChatMonitoreo.orden_id == o.id, ChatMonitoreo.visto_en >= ahora_ - AVISO_DE_NUEVO).order_by(ChatMonitoreo.id.desc()))
    nuevo = ChatMonitoreo(orden_id=o.id, user_id=user.id, inicio=ahora_, visto_en=ahora_)
    db.add(nuevo)
    if not reciente and o.estado not in CERRADOS:
        db.add(Mensaje(orden_id=o.id, autor_id=None, texto="🛡 El equipo de soporte de AHA HOME está monitoreando esta conversación para cuidar tu servicio."))
        for uid in participantes(o):
            notificar(db, uid, "Soporte está acompañando tu chat", f"{o.codigo}: el equipo de soporte de AHA HOME está monitoreando la conversación.", o.id)
    db.flush()
    return nuevo


def _fila(db: Session, o: Orden, ultimo: Mensaje | None, total: int, user: User) -> dict:
    mons = monitoreos_activos(db, o.id)
    autor = db.get(User, ultimo.autor_id) if ultimo and ultimo.autor_id else None
    return {"orden_id": o.id, "codigo": o.codigo, "estado": svc.ESTADO_TEXTO.get(o.estado, o.estado), "abierto": o.estado not in CERRADOS,
            "servicio": TIPO_SERVICIO_TEXTO.get(o.tipo_servicio, o.tipo_servicio), "cliente": o.cliente_nombre,
            "profesional": o.tecnico.user.nombre if o.tecnico else "Sin asignar", "mensajes": total,
            "ultimo": {"texto": (ultimo.texto or "📷 Foto") if ultimo else "", "en": ultimo.creado.isoformat() + "Z" if ultimo else None,
                       "de": _rol_chat(autor) if ultimo else ""},
            "no_leidos": no_leidos(db, o.id, user.id), "monitoreado_por": [db.get(User, m.user_id).nombre for m in mons]}


@router.get("/soporte/chats")
def lista_chats(filtro: str = "activos", q: str = "", user: User = Depends(_soporte), db: Session = Depends(get_db)):
    filas = db.execute(select(Mensaje.orden_id, func.max(Mensaje.id), func.count(Mensaje.id)).group_by(Mensaje.orden_id).order_by(func.max(Mensaje.id).desc()).limit(200)).all()
    out = []
    for oid, mid, total in filas:
        o = db.get(Orden, oid)
        if filtro == "activos" and o.estado in CERRADOS:
            continue
        f = _fila(db, o, db.get(Mensaje, mid), total, user)
        if q.strip() and q.strip().lower() not in f"{o.codigo} {o.cliente_nombre} {f['profesional']}".lower():
            continue
        out.append(f)
    return out


@router.get("/soporte/chats/{orden_id}")
def ver_chat_soporte(orden_id: int, desde: int = 0, monitorear: bool = True, user: User = Depends(_soporte), db: Session = Depends(get_db)):
    """Conversación en vivo. Mientras el panel la tenga abierta (latido cada pocos segundos), queda monitoreada."""
    o = db.get(Orden, orden_id)
    if not o:
        raise HTTPException(404, "Orden no encontrada")
    if monitorear:
        _monitorear(db, o, user)
    ms = db.scalars(select(Mensaje).where(Mensaje.orden_id == o.id, Mensaje.id > desde).order_by(Mensaje.id)).all()
    if ms:
        r = db.get(ChatLectura, (o.id, user.id)) or ChatLectura(orden_id=o.id, user_id=user.id)
        r.ultimo_id = max(r.ultimo_id or 0, ms[-1].id)
        db.add(r)
    db.commit()
    autores = {u.id: u for u in db.scalars(select(User).where(User.id.in_({m.autor_id for m in ms if m.autor_id})))} if ms else {}
    t = o.tecnico
    return {"orden": {"id": o.id, "codigo": o.codigo, "estado": svc.ESTADO_TEXTO.get(o.estado, o.estado), "abierto": o.estado not in CERRADOS,
                      "servicio": TIPO_SERVICIO_TEXTO.get(o.tipo_servicio, o.tipo_servicio), "fecha": o.fecha, "franja": o.franja, "direccion": o.direccion,
                      "tienda": o.tienda.nombre if o.tienda else ""},
            "cliente": {"id": o.cliente_id, "nombre": o.cliente_nombre, "telefono": o.cliente_telefono},
            "profesional": {"id": t.id, "nombre": t.user.nombre, "codigo": codigos.profesional(t), "telefono": t.user.telefono} if t else None,
            "ayudantes": [a.user.nombre for a in o.ayudantes],
            "mensajes": [{"id": m.id, "texto": m.texto, "foto": m.foto or None, "en": m.creado.isoformat() + "Z", "de": _rol_chat(autores.get(m.autor_id)),
                          "autor": autores[m.autor_id].nombre if m.autor_id in autores else None, "mio": m.autor_id == user.id} for m in ms],
            "monitoreo": [{"quien": db.get(User, m.user_id).nombre, "desde": m.inicio.isoformat() + "Z", "yo": m.user_id == user.id} for m in monitoreos_activos(db, o.id)]}


@router.post("/soporte/chats/{orden_id}/terminar")
def terminar_monitoreo(orden_id: int, avisar: bool = False, user: User = Depends(_soporte), db: Session = Depends(get_db)):
    """Termina el monitoreo. Con avisar=1 (botón «Terminar monitoreo») queda el aviso en el chat; al cambiar de conversación, no."""
    o = db.get(Orden, orden_id)
    if not o:
        raise HTTPException(404, "Orden no encontrada")
    abiertos = db.scalars(select(ChatMonitoreo).where(ChatMonitoreo.orden_id == o.id, ChatMonitoreo.user_id == user.id, ChatMonitoreo.fin.is_(None))).all()
    for m in abiertos:
        m.fin = svc_ahora()
    db.flush()
    if avisar and abiertos and not monitoreos_activos(db, o.id) and o.estado not in CERRADOS:
        db.add(Mensaje(orden_id=o.id, autor_id=None, texto="El equipo de soporte de AHA HOME terminó el monitoreo de esta conversación."))
    db.commit()
    return {"ok": True}


@router.post("/soporte/chats/{orden_id}/mensaje")
def intervenir(orden_id: int, body: NuevoMensaje, user: User = Depends(_soporte), db: Session = Depends(get_db)):
    """Soporte interviene en la conversación (queda monitoreada y el mensaje sale como del equipo de soporte)."""
    o = db.get(Orden, orden_id)
    if not o:
        raise HTTPException(404, "Orden no encontrada")
    _monitorear(db, o, user)
    db.commit()
    return escribir(orden_id, body, user, db)
