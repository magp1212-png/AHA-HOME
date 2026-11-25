"""Diseño de la app desde el panel: colores, textos de la portada, menús de cada perfil y un aviso para todos.

El superadmin edita un BORRADOR, lo ve en la vista previa y luego lo PUBLICA. La app descarga la versión
publicada al abrir (GET /interfaz), así que los cambios llegan sin publicar una app nueva. Cada publicación
queda en el historial y se puede volver a una versión anterior."""
import copy
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import exigir_permiso, require
from ..models import InterfazVersion, User, ahora

router = APIRouter(tags=["diseño"])

# Lo que se puede cambiar desde el panel, con los valores con que arranca la app
DEFECTO = {
    "marca": {"nombre": "AHA HOME", "eslogan": "Hacemos todo por ti",
              "colores": {"marino": "#21244D", "lima": "#CFD72A", "naranja": "#C8461B", "fondo": "#F4F7FB"}},
    "portada": {"titulo": "Hacemos todo por ti", "subtitulo": "Desde la caja de Damasco hasta tu casa, con tu compra instalada y sin cajas que botar.",
                "pasos": [{"titulo": "Retiramos tu compra", "detalle": "en la tienda"}, {"titulo": "La llevamos a tu casa", "detalle": "con seguimiento en vivo"},
                          {"titulo": "Desembalamos e instalamos", "detalle": "técnicos verificados"}, {"titulo": "Nos llevamos los desechos", "detalle": "cajas, anime y plásticos"}],
                "boton_crear": "CREAR MI CUENTA", "boton_entrar": "YA TENGO CUENTA · ENTRAR"},
    "menus": {
        "cliente": [{"id": "inicio", "texto": "Inicio", "visible": True}, {"id": "pedidos", "texto": "Mis pedidos", "visible": True},
                    {"id": "mensajes", "texto": "Mensajes", "visible": True}, {"id": "cuenta", "texto": "Mi cuenta", "visible": True}],
        "cliente_lateral": [{"id": "inicio", "texto": "Inicio", "visible": True}, {"id": "pedidos", "texto": "Mis pedidos", "visible": True},
                            {"id": "mensajes", "texto": "Mensajes", "visible": True}, {"id": "avisos", "texto": "Avisos", "visible": True},
                            {"id": "soporte", "texto": "Soporte AHA HOME", "visible": True}, {"id": "cuenta", "texto": "Mi cuenta", "visible": True}],
        "tecnico": [{"id": "inicio", "texto": "Inicio", "visible": True}, {"id": "ordenes", "texto": "Órdenes", "visible": True},
                    {"id": "mapa", "texto": "Mapa", "visible": True}, {"id": "perfil", "texto": "Perfil", "visible": True}],
    },
    "aviso": {"activo": False, "texto": "", "tono": "info", "para": ["cliente", "tecnico", "agente"]},
}
MENUS_FIJOS = {"cliente": "inicio", "cliente_lateral": "inicio", "tecnico": "inicio"}  # siempre visibles: sin ellos nadie vuelve al inicio
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _texto(v, defecto: str, largo: int) -> str:
    v = str(v if v is not None else defecto).strip()
    return (v or defecto)[:largo]


def limpiar(datos: dict | None) -> dict:
    """Une lo enviado con los valores por defecto y descarta lo que no se puede cambiar."""
    d, out = datos or {}, copy.deepcopy(DEFECTO)
    m = d.get("marca") or {}
    out["marca"]["nombre"] = _texto(m.get("nombre"), DEFECTO["marca"]["nombre"], 30)
    out["marca"]["eslogan"] = _texto(m.get("eslogan"), DEFECTO["marca"]["eslogan"], 60)
    for k, v in (m.get("colores") or {}).items():
        if k in out["marca"]["colores"] and isinstance(v, str) and HEX.match(v):
            out["marca"]["colores"][k] = v.upper()
    p = d.get("portada") or {}
    for k, largo in (("titulo", 60), ("subtitulo", 180), ("boton_crear", 30), ("boton_entrar", 34)):
        out["portada"][k] = _texto(p.get(k), DEFECTO["portada"][k], largo)
    for i, paso in enumerate((p.get("pasos") or [])[:4]):
        out["portada"]["pasos"][i] = {"titulo": _texto(paso.get("titulo"), DEFECTO["portada"]["pasos"][i]["titulo"], 40),
                                      "detalle": _texto(paso.get("detalle"), DEFECTO["portada"]["pasos"][i]["detalle"], 50)}
    for menu, base in DEFECTO["menus"].items():
        enviados = {x.get("id"): x for x in ((d.get("menus") or {}).get(menu) or []) if isinstance(x, dict)}
        orden = [x.get("id") for x in ((d.get("menus") or {}).get(menu) or []) if isinstance(x, dict) and x.get("id") in {b["id"] for b in base}]
        orden += [b["id"] for b in base if b["id"] not in orden]
        por_id = {b["id"]: b for b in base}
        out["menus"][menu] = [{"id": i, "texto": _texto(enviados.get(i, {}).get("texto"), por_id[i]["texto"], 22),
                               "visible": True if i == MENUS_FIJOS[menu] else bool(enviados.get(i, por_id[i]).get("visible", True))} for i in orden]
    a = d.get("aviso") or {}
    out["aviso"] = {"activo": bool(a.get("activo")) and bool(str(a.get("texto") or "").strip()), "texto": _texto(a.get("texto"), "", 160),
                    "tono": a.get("tono") if a.get("tono") in ("info", "ok", "alerta") else "info",
                    "para": [x for x in (a.get("para") or DEFECTO["aviso"]["para"]) if x in ("cliente", "tecnico", "agente")]}
    return out


def _ultima(db: Session, estado: str) -> InterfazVersion | None:
    return db.scalar(select(InterfazVersion).where(InterfazVersion.estado == estado).order_by(InterfazVersion.id.desc()).limit(1))


def publicada(db: Session) -> dict:
    v = _ultima(db, "publicada")
    return limpiar(v.datos if v else None)


@router.get("/interfaz")
def interfaz(db: Session = Depends(get_db)):
    """La app la pide al abrir. Pública: solo colores, textos y menús (nada privado)."""
    v = _ultima(db, "publicada")
    return {"version": v.id if v else 0, **publicada(db)}


def disenador(user: User = Depends(require("superadmin"))) -> User:
    exigir_permiso(user, "diseno")
    return user


def _vista(db: Session) -> dict:
    pub, bor = _ultima(db, "publicada"), _ultima(db, "borrador")
    hist = db.scalars(select(InterfazVersion).where(InterfazVersion.estado.in_(("publicada", "archivada"))).order_by(InterfazVersion.id.desc()).limit(12)).all()
    nombres = {u.id: u.nombre for u in db.scalars(select(User).where(User.id.in_({h.creado_por for h in hist if h.creado_por})))}
    datos_pub = limpiar(pub.datos if pub else None)
    datos_bor = limpiar(bor.datos) if bor else datos_pub
    return {"publicada": datos_pub, "borrador": datos_bor, "hay_cambios": datos_bor != datos_pub, "defecto": DEFECTO,
            "version": pub.id if pub else 0,
            "historial": [{"id": h.id, "estado": h.estado, "nota": h.nota, "en": h.creado.isoformat() + "Z", "por": nombres.get(h.creado_por, "—")} for h in hist]}


@router.get("/admin/interfaz")
def ver(user: User = Depends(disenador), db: Session = Depends(get_db)):
    return _vista(db)


class Borrador(BaseModel):
    datos: dict


@router.put("/admin/interfaz/borrador")
def guardar_borrador(body: Borrador, user: User = Depends(disenador), db: Session = Depends(get_db)):
    """Guarda los cambios sin que la app los vea todavía."""
    bor = _ultima(db, "borrador")
    if not bor:
        bor = InterfazVersion(estado="borrador", creado_por=user.id)
        db.add(bor)
    bor.datos, bor.creado, bor.creado_por = limpiar(body.datos), ahora(), user.id
    db.commit()
    return _vista(db)


class Publicar(BaseModel):
    nota: str = Field(default="", max_length=120)


@router.post("/admin/interfaz/publicar")
def publicar(body: Publicar, user: User = Depends(disenador), db: Session = Depends(get_db)):
    bor = _ultima(db, "borrador")
    if not bor:
        raise HTTPException(409, "No hay cambios en el borrador")
    pub = _ultima(db, "publicada")
    if pub:
        pub.estado = "archivada"
    bor.estado, bor.nota, bor.creado, bor.creado_por = "publicada", body.nota.strip() or "Cambios de diseño", ahora(), user.id
    db.commit()
    return _vista(db)


@router.post("/admin/interfaz/descartar")
def descartar(user: User = Depends(disenador), db: Session = Depends(get_db)):
    bor = _ultima(db, "borrador")
    if bor:
        db.delete(bor)
        db.commit()
    return _vista(db)


@router.post("/admin/interfaz/restaurar/{vid}")
def restaurar(vid: int, user: User = Depends(disenador), db: Session = Depends(get_db)):
    """Copia una versión anterior al borrador, para revisarla y volver a publicarla."""
    v = db.get(InterfazVersion, vid)
    if not v or v.estado == "borrador":
        raise HTTPException(404, "Versión no encontrada")
    return guardar_borrador(Borrador(datos=v.datos), user, db)
