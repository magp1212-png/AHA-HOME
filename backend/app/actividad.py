"""Historial de actividad del panel: cada sesión del superadministrador y del centro de control, con sus ingresos,
intentos fallidos, pantallas consultadas, cambios y descargas. No se guardan claves ni lo que escribieron."""
import re
import secrets

from sqlalchemy.orm import Session

from .models import ActividadPanel, SesionPanel, User, ahora

ROLES = ("superadmin", "supervisor", "ventas")  # quienes usan el panel
TIPOS = {"ingreso": "Ingreso", "ingreso_fallido": "Ingreso fallido", "consulta": "Consulta", "cambio": "Cambio", "descarga": "Descarga",
         "cierre_sesion": "Cierre de sesión"}


def dispositivo(ua: str) -> str:
    ua = ua or ""
    nav = next((n for p, n in ((r"Edg/", "Edge"), (r"OPR/|Opera", "Opera"), (r"Chrome/", "Chrome"), (r"Firefox/", "Firefox"), (r"Safari/", "Safari")) if re.search(p, ua)), "Otro")
    so = next((n for p, n in ((r"Windows", "Windows"), (r"iPhone|iPad", "iOS"), (r"Android", "Android"), (r"Mac OS X|Macintosh", "Mac"), (r"Linux", "Linux")) if re.search(p, ua)), "")
    return f"{nav} · {so}" if so else nav


def abrir_sesion(db: Session, user: User, ip: str, ua: str) -> str:
    sid = secrets.token_hex(5)
    db.add(SesionPanel(id=sid, user_id=user.id, rol=user.rol, ip=ip[:64], dispositivo=dispositivo(ua)))
    db.flush()  # la sesión debe existir antes de anotar su primer ingreso
    anotar(db, sid, user, "ingreso", "Inició sesión", ip, ua)
    return sid


def anotar(db: Session, sid: str, user: User | None, tipo: str, texto: str, ip: str, ua: str) -> None:
    if user is not None and user.rol not in ROLES:
        return
    db.add(ActividadPanel(sesion_id=sid or "", user_id=user.id if user else None, rol=user.rol if user else "", tipo=tipo, texto=texto[:200],
                          ip=ip[:64], dispositivo=dispositivo(ua)))
    s = db.get(SesionPanel, sid) if sid else None
    if s and (user is None or s.user_id == user.id):
        s.ultima, s.actividades = ahora(), s.actividades + 1
        if tipo == "cierre_sesion":
            s.cerrada = True
