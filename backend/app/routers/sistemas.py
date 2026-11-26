"""Departamento de sistemas (rol «sistemas» y CEO): estado, errores, funciones, accesos, publicaciones, actividad y avisos."""
import datetime as dt
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import sistemas as S
from ..auditoria import ROL_TEXTO, en_linea
from ..db import get_db
from ..deps import current_user
from ..models import CARACAS, ActividadPanel, ChequeoSistema, ErrorSistema, SesionPanel, User, ahora

router = APIRouter(prefix="/sistemas", tags=["sistemas"])


def solo_sistemas(user: User = Depends(current_user)) -> User:
    if not S.puede_ver(user):
        raise HTTPException(403, "Solo el Departamento de sistemas y el CEO pueden ver esto")
    return user


def _iso(x):
    return x.isoformat() + "Z" if x else None


def _vista_chequeo(c: ChequeoSistema) -> dict:
    return {"clave": c.clave, "grupo": c.grupo, "nombre": c.nombre, "nivel": c.nivel, "valor": c.valor, "detalle": c.detalle, "ms": c.ms,
            "en": _iso(c.en), "desde": _iso(c.desde)}


def _estado(db: Session) -> dict:
    cs = db.scalars(select(ChequeoSistema)).all()
    orden = ["api", "base", "procesos", "tunel", "correo", "push", "tasa", "disco", "publicador", "respaldo"]
    estado = sorted([c for c in cs if c.grupo == "estado"], key=lambda c: orden.index(c.clave) if c.clave in orden else 99)
    funciones = [c for c in cs if c.grupo == "funcion"]
    avisos = [f"{c.nombre}: {c.valor}" for c in estado + funciones if c.nivel != "ok"]
    nivel = "mal" if any(c.nivel == "mal" for c in cs) else "pend" if avisos else "ok"
    errores = db.scalar(select(func.count()).select_from(ErrorSistema).where(ErrorSistema.estado != "resuelto")) or 0
    return {"nivel": nivel, "texto": "Todo funciona" if not avisos else f"Funciona con {len(avisos)} aviso(s)" if nivel == "pend" else f"Hay {len(avisos)} problema(s)",
            "avisos": avisos, "revisado_en": _iso(max((c.en for c in cs), default=None)), "errores_abiertos": errores,
            "estado": [_vista_chequeo(c) for c in estado], "funciones": [_vista_chequeo(c) for c in funciones]}


@router.get("/estado")
def estado(user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    if not db.scalar(select(func.count()).select_from(ChequeoSistema)):
        S.revisar(db)
    return _estado(db) | {"accesos_alertas": len([a for a in S.alertas_acceso(db, dias=1) if a["nivel"] in ("mal", "pend")])}


@router.post("/probar")
def probar(user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    S.revisar(db)
    return _estado(db)


@router.get("/procesos")
def ver_procesos(user: User = Depends(solo_sistemas)):
    return S.procesos()


# ---------- Errores ----------
def _vista_error(db: Session, e: ErrorSistema) -> dict:
    a = db.get(User, e.atendido_por) if e.atendido_por else None
    return {"id": e.id, "origen": e.origen, "mensaje": e.mensaje, "donde": e.donde, "usuario": e.usuario or "—", "veces": e.veces, "estado": e.estado,
            "nota": e.nota, "atendido_por": a.nombre if a else None, "primera": _iso(e.primera), "ultima": _iso(e.ultima)}


@router.get("/errores")
def errores(user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    return [_vista_error(db, e) for e in db.scalars(select(ErrorSistema).order_by(ErrorSistema.ultima.desc()).limit(500))]


class Atender(BaseModel):
    estado: str = Field(pattern="^(nuevo|revision|resuelto)$")
    nota: str = Field(default="", max_length=300)


@router.put("/errores/{eid}")
def atender(eid: int, body: Atender, user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    e = db.get(ErrorSistema, eid)
    if not e:
        raise HTTPException(404, "Error no encontrado")
    e.estado, e.nota, e.atendido_por = body.estado, body.nota.strip() or e.nota, user.id
    db.commit()
    return _vista_error(db, e)


class ErrorPanel(BaseModel):
    mensaje: str = Field(min_length=2, max_length=500)
    donde: str = Field(default="", max_length=200)


@router.post("/errores/panel")
def error_del_panel(body: ErrorPanel, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """El panel avisa solo cuando una pantalla falla en el navegador de alguien del equipo."""
    if user.rol in ("cliente", "tecnico", "ayudante"):
        return {"ok": True}
    mensaje = re.sub(r"https?://\S+", "", body.mensaje)[:300]
    S.registrar_error(db, "panel", mensaje, body.donde, user.nombre)
    return {"ok": True}


# ---------- Accesos ----------
@router.get("/accesos")
def accesos(user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    equipo = db.scalars(select(User).where(User.rol.in_(("superadmin", "supervisor", "ventas", "sistemas", "agente", "tecnico_supervisor")))).all()
    alertas = S.alertas_acceso(db)
    dia = ahora() - dt.timedelta(days=1)
    fallidos = db.scalar(select(func.count()).select_from(ActividadPanel).where(ActividadPanel.tipo == "ingreso_fallido", ActividadPanel.creado >= dia)) or 0
    dentro = []
    for s in db.scalars(select(SesionPanel).where(SesionPanel.cerrada.is_(False), SesionPanel.ultima >= ahora() - dt.timedelta(minutes=30)).order_by(SesionPanel.ultima.desc())):
        u = db.get(User, s.user_id)
        if not u:
            continue
        dentro.append({"sesion": s.id, "user_id": u.id, "nombre": u.nombre, "rol": "CEO" if u.es_ceo else ROL_TEXTO.get(u.rol, u.rol), "dispositivo": s.dispositivo,
                       "ip": s.ip, "ultima": _iso(s.ultima), "principal": u.email in __import__("app.config", fromlist=["CEO_EMAILS"]).CEO_EMAILS, "soy_yo": u.id == user.id})
    cuenta = lambda t: len([a for a in alertas if a["tipo"] == t])  # noqa: E731
    return {"en_linea": sum(1 for u in equipo if en_linea(u)), "total": len(equipo), "fallidos_24h": fallidos,
            "fallidos_seguidos": cuenta("intentos_fallidos"), "equipos_nuevos": cuenta("equipo_nuevo"), "fuera_horario": cuenta("fuera_horario"),
            "inactivas": cuenta("inactiva"), "claves_temporales": cuenta("clave_temporal"), "alertas": alertas[:60], "dentro": dentro, "puede_pausar": bool(user.es_ceo)}


@router.post("/sesiones/{sid}/cerrar")
def cerrar_sesion(sid: str, user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    """Cierra a distancia todas las sesiones abiertas de esa persona (por ejemplo, si perdió el equipo)."""
    s = db.get(SesionPanel, sid)
    if not s:
        raise HTTPException(404, "Sesión no encontrada")
    u = db.get(User, s.user_id)
    from .. import config
    if u.id == user.id:
        raise HTTPException(422, "No puedes cerrar tu propia sesión desde aquí: usa «Cerrar sesión»")
    if u.es_ceo and not user.es_ceo:
        raise HTTPException(403, "La sesión de un CEO solo la cierra otro CEO")
    if u.email in config.CEO_EMAILS:
        raise HTTPException(403, "La sesión de la cuenta CEO principal no se cierra a distancia")
    u.sesiones_desde = ahora()
    for x in db.scalars(select(SesionPanel).where(SesionPanel.user_id == u.id, SesionPanel.cerrada.is_(False))):
        x.cerrada = True
    from ..actividad import anotar
    anotar(db, "", u, "cierre_sesion", f"Su sesión fue cerrada a distancia por {user.nombre}", "", "")
    db.commit()
    return {"ok": True}


# ---------- Publicaciones y respaldos ----------
@router.get("/publicaciones")
def publicaciones(user: User = Depends(solo_sistemas)):
    pubs = []
    try:
        lineas = (S.OPS / "publicar.log").read_text(encoding="utf-8", errors="ignore").splitlines()[-400:]
    except OSError:
        lineas = []
    pruebas = None
    for x in lineas:
        if "pruebas ok" in x:
            m = re.search(r"(\d+) passed", x)
            pruebas = f"{m.group(1)} correctas" if m else "Correctas"
        elif "PUBLICADO" in x:
            pubs.append({"en": x[:16], "version": x.split()[-1][:8], "pruebas": pruebas or "—", "resultado": "Publicado", "nivel": "ok"})
            pruebas = None
        elif re.search(r"VUELTA ATR|REVERTIDO|rollback", x, re.I):
            pubs.append({"en": x[:16], "version": "—", "pruebas": pruebas or "—", "resultado": "Volvió a la versión anterior", "nivel": "mal"})
        elif " error" in x.lower():
            if pubs and pubs[-1]["resultado"] == x[20:120]:
                continue
            pubs.append({"en": x[:16], "version": "—", "pruebas": "—", "resultado": x[20:120], "nivel": "mal"})
    respaldos = []
    try:
        for f in sorted(list(S.RESPALDOS.glob("ahahome-*.db")) + list(S.RESPALDOS.glob("ahahome-*.dump")), key=lambda p: p.stat().st_mtime, reverse=True)[:12]:
            respaldos.append({"archivo": f.name, "tipo": "Antes de publicar" if "antes-de-publicar" in f.name else "Diario",
                              "tamano_kb": f.stat().st_size // 1024, "en": dt.datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M")})
    except OSError:
        pass
    r2 = (S.OPS / "r2.json").exists()
    version = next((p["version"] for p in reversed(pubs) if p["nivel"] == "ok"), None)
    return {"version": version, "publicaciones": list(reversed(pubs))[:30], "respaldos": respaldos, "copia_externa": r2,
            "ultimo_respaldo": respaldos[0] if respaldos else None}


# ---------- Actividad ----------
@router.get("/actividad")
def actividad(user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    hoy0 = dt.datetime.combine((ahora() + CARACAS).date(), dt.time()) - CARACAS
    acts = db.scalars(select(ActividadPanel).where(ActividadPanel.creado >= hoy0)).all()
    from ..models import Auditoria
    aud = db.scalars(select(Auditoria).where(Auditoria.creado >= hoy0)).all()
    por_hora = [0] * 24
    for x in list(acts) + list(aud):
        por_hora[(x.creado + CARACAS).hour] += 1
    semana = db.scalars(select(ActividadPanel).where(ActividadPanel.tipo == "consulta", ActividadPanel.duracion_ms > 0,
                                                     ActividadPanel.creado >= ahora() - dt.timedelta(days=7))).all()
    tiempos = {}
    for x in semana:
        tiempos.setdefault(x.texto.removeprefix("Abrió "), []).append(x.duracion_ms)
    lentas = sorted(({"pantalla": k, "ms": sum(v) // len(v), "veces": len(v)} for k, v in tiempos.items()), key=lambda x: -x["ms"])[:6]
    return {"personas": len({x.user_id for x in acts} | {x.user_id for x in aud}), "pantallas": sum(1 for x in acts if x.tipo == "consulta"),
            "ordenes": S.ordenes_hoy(db), "por_hora": por_hora, "pico": max(range(24), key=lambda h: por_hora[h]) if any(por_hora) else None, "lentas": lentas}


# ---------- Ajustes ----------
@router.get("/ajustes")
def ver_ajustes(user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    return S.ajustes(db) | {"reglas_texto": S.REGLAS_TEXTO}


class Ajustes(BaseModel):
    correos: list[str]
    canales: dict[str, bool]
    hora_resumen: int = Field(ge=0, le=23)
    reglas: dict[str, bool]
    retencion: dict[str, int]


@router.put("/ajustes")
def guardar_ajustes(body: Ajustes, user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    correos = [c.strip().lower() for c in body.correos if c.strip()]
    malos = [c for c in correos if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", c)]
    if malos:
        raise HTTPException(422, f"Correo no válido: {', '.join(malos)}")
    if not correos:
        raise HTTPException(422, "Deja al menos un correo para los avisos")
    ret = {k: max(7, min(int(body.retencion.get(k, v)), 3650)) for k, v in S.AJUSTES_BASE["retencion"].items()}
    S._guardar_cfg(db, "ajustes", {"correos": correos, "canales": {k: bool(body.canales.get(k, v)) for k, v in S.AJUSTES_BASE["canales"].items()},
                                    "hora_resumen": body.hora_resumen, "reglas": {k: bool(body.reglas.get(k, v)) for k, v in S.AJUSTES_BASE["reglas"].items()}, "retencion": ret})
    db.commit()
    return S.ajustes(db) | {"reglas_texto": S.REGLAS_TEXTO}


@router.post("/resumen")
def enviar_resumen(user: User = Depends(solo_sistemas), db: Session = Depends(get_db)):
    """Manda ahora el resumen por correo (para probar que llega)."""
    S.resumen_diario(db, forzar=True)
    return {"ok": True, "a": S.ajustes(db)["correos"]}
