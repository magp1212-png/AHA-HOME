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
        db.add(Mensaje(orden_id=o.id, autor_id=None, texto=f"{user.nombre} · centro de control se unió al chat"))
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
