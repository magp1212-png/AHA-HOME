"""Comunicación directa con AHA HOME (fusión con AHA HOGAR: «Soporte AHA HOGAR» del cliente y la línea directa
del técnico). Cada cliente, técnico o caja tiene su conversación con el centro de control, aparte de las órdenes."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..deps import require
from ..models import SoporteLectura, SoporteMensaje, User
from ..notificar import notificar

router = APIRouter(tags=["soporte"])
PROPIOS = ("cliente", "tecnico", "ayudante", "agente")
CONTROL = ("tecnico_supervisor", "supervisor", "superadmin")
TEMAS = {"pedido": "Mi pedido", "fecha": "Cambio de fecha", "reclamo": "Reclamo", "pagos": "Pagos", "documentos": "Documentos",
         "app": "La app", "guardia": "Mi guardia", "emergencia": "Emergencia", "": ""}
ROL_TEXTO = {"cliente": "cliente", "tecnico": "técnico", "ayudante": "ayudante", "agente": "caja"}


def telefono_control(db: Session) -> str:
    if config.TELEFONO_CONTROL:
        return config.TELEFONO_CONTROL
    u = db.scalar(select(User).where(User.rol == "supervisor", User.activo.is_(True)).order_by(User.id))
    return u.telefono if u and u.telefono else ""


def mensaje_sistema(db: Session, hilo_id: int, texto: str, tema: str = "") -> None:
    db.add(SoporteMensaje(hilo_id=hilo_id, autor_id=None, texto=texto, tema=tema))


def _no_leidos(db: Session, hilo_id: int, user_id: int, de_otros: bool = True) -> int:
    lect = db.get(SoporteLectura, (hilo_id, user_id))
    q = select(func.count(SoporteMensaje.id)).where(SoporteMensaje.hilo_id == hilo_id, SoporteMensaje.id > (lect.ultimo_id if lect else 0))
    if de_otros:
        q = q.where((SoporteMensaje.autor_id != user_id) | SoporteMensaje.autor_id.is_(None))
    return db.scalar(q) or 0


def _marcar_leido(db: Session, hilo_id: int, user_id: int, ultimo: int) -> None:
    r = db.get(SoporteLectura, (hilo_id, user_id)) or SoporteLectura(hilo_id=hilo_id, user_id=user_id)
    r.ultimo_id = ultimo
    db.add(r)


def _vista_msg(db: Session, m: SoporteMensaje, yo: User) -> dict:
    autor = db.get(User, m.autor_id) if m.autor_id else None
    return {"id": m.id, "texto": m.texto, "foto": m.foto or None, "tema": m.tema, "tema_texto": TEMAS.get(m.tema, ""),
            "creado": m.creado.isoformat() + "Z", "mio": m.autor_id == yo.id, "sistema": m.autor_id is None,
            "autor": autor.nombre.split()[0] if autor else None, "control": bool(autor and autor.rol in CONTROL)}


def _hilo(db: Session, hilo: User, yo: User) -> dict:
    ms = db.scalars(select(SoporteMensaje).where(SoporteMensaje.hilo_id == hilo.id).order_by(SoporteMensaje.id)).all()
    if ms:
        _marcar_leido(db, hilo.id, yo.id, ms[-1].id)
        db.commit()
    return {"hilo_id": hilo.id, "con": {"nombre": hilo.nombre, "rol": ROL_TEXTO.get(hilo.rol, hilo.rol), "telefono": hilo.telefono if yo.rol in CONTROL else None},
            "temas": {k: v for k, v in TEMAS.items() if k and (k not in ("guardia", "documentos") or hilo.rol != "cliente") and (k not in ("pedido", "fecha", "reclamo") or hilo.rol == "cliente")},
            "llamar": hilo.telefono if yo.rol in CONTROL else telefono_control(db),
            "mensajes": [_vista_msg(db, m, yo) for m in ms]}


class Nuevo(BaseModel):
    texto: str = Field(default="", max_length=1000)
    foto: str = Field(default="", max_length=200)
    tema: str = Field(default="", max_length=20)


def _crear(db: Session, hilo: User, autor: User, body: Nuevo) -> None:
    if not body.texto.strip() and not body.foto:
        raise HTTPException(422, "Escribe un mensaje o envía una foto")
    if body.tema not in TEMAS:
        raise HTTPException(422, "Tema no válido")
    m = SoporteMensaje(hilo_id=hilo.id, autor_id=autor.id, texto=body.texto.strip(), foto=body.foto, tema=body.tema)
    db.add(m)
    db.flush()
    _marcar_leido(db, hilo.id, autor.id, m.id)
    if autor.id == hilo.id:  # escribe el cliente o el técnico: avisa al centro de control
        titulo = ("🚨 EMERGENCIA de " if body.tema == "emergencia" else "Mensaje de soporte · ") + f"{ROL_TEXTO.get(hilo.rol, hilo.rol)} {hilo.nombre}"
        for s in db.scalars(select(User).where(User.activo.is_(True), User.rol.in_(CONTROL))):
            if s.rol != "tecnico_supervisor" or not hilo.tienda_id or s.tienda_id == hilo.tienda_id:
                notificar(db, s.id, titulo, (body.texto.strip() or "📷 foto")[:200])
    else:
        notificar(db, hilo.id, "AHA HOME te respondió", (body.texto.strip() or "📷 foto")[:200])


@router.get("/soporte")
def mi_soporte(solo_resumen: bool = False, user: User = Depends(require(*PROPIOS)), db: Session = Depends(get_db)):
    if solo_resumen:
        return {"no_leidos": _no_leidos(db, user.id, user.id)}
    return _hilo(db, user, user)


@router.post("/soporte")
def escribir(body: Nuevo, user: User = Depends(require(*PROPIOS)), db: Session = Depends(get_db)):
    _crear(db, user, user, body)
    db.commit()
    return _hilo(db, user, user)


@router.get("/supervisor/soporte")
def bandeja(user: User = Depends(require(*CONTROL)), db: Session = Depends(get_db)):
    """Conversaciones de soporte: las emergencias sin leer primero, luego las más recientes."""
    ultimos = db.execute(select(SoporteMensaje.hilo_id, func.max(SoporteMensaje.id)).group_by(SoporteMensaje.hilo_id)).all()
    filas = []
    for hilo_id, ult in ultimos:
        hilo = db.get(User, hilo_id)
        if not hilo or (user.rol == "tecnico_supervisor" and hilo.tienda_id and hilo.tienda_id != user.tienda_id):
            continue
        m = db.get(SoporteMensaje, ult)
        tema_ult = db.scalar(select(SoporteMensaje.tema).where(SoporteMensaje.hilo_id == hilo_id, SoporteMensaje.tema != "").order_by(SoporteMensaje.id.desc()).limit(1)) or ""
        nl = _no_leidos(db, hilo_id, user.id)
        filas.append({"hilo_id": hilo_id, "nombre": hilo.nombre, "rol": ROL_TEXTO.get(hilo.rol, hilo.rol), "tema": tema_ult, "tema_texto": TEMAS.get(tema_ult, ""),
                      "ultimo": m.texto or "📷 foto", "creado": m.creado.isoformat() + "Z", "no_leidos": nl,
                      "emergencia": tema_ult == "emergencia" and nl > 0, "telefono": hilo.telefono})
    filas.sort(key=lambda f: (not f["emergencia"], f["no_leidos"] == 0, f["creado"]), reverse=False)
    filas.sort(key=lambda f: f["creado"], reverse=True)
    filas.sort(key=lambda f: (not f["emergencia"], f["no_leidos"] == 0))
    return filas


@router.get("/supervisor/soporte/{hilo_id}")
def ver_hilo(hilo_id: int, user: User = Depends(require(*CONTROL)), db: Session = Depends(get_db)):
    hilo = db.get(User, hilo_id)
    if not hilo or hilo.rol not in PROPIOS:
        raise HTTPException(404, "Conversación no encontrada")
    return _hilo(db, hilo, user)


@router.post("/supervisor/soporte/{hilo_id}")
def responder(hilo_id: int, body: Nuevo, user: User = Depends(require(*CONTROL)), db: Session = Depends(get_db)):
    hilo = db.get(User, hilo_id)
    if not hilo or hilo.rol not in PROPIOS:
        raise HTTPException(404, "Conversación no encontrada")
    _crear(db, hilo, user, body)
    db.commit()
    return _hilo(db, hilo, user)
