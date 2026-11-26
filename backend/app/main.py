"""AHA HOME API · Hacemos todo por ti."""
import logging
import os
import pathlib
import threading
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from . import config, sistemas  # sistemas primero: mide cuánto tarda en arrancar
from .db import Base, engine
from .routers import sistemas as sistemas_rutas
from .routers import admin, archivos, auth, banners, chat, legal, ordenes, ceo, conformidad, panel, penalidad, precios, finanzas, finanzas_libro, qr_tiendas, historial, interfaz, ventas, presupuestos, retiro_tienda, soporte, supervisor, tasa, tecnico

log = logging.getLogger("ahahome")
app = FastAPI(title="AHA HOME API", version=config.APP_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


def _auditar(request: Request, estado: int) -> None:
    """Último acceso y auditoría del equipo (no se guarda el contenido enviado)."""
    from .auditoria import EQUIPO, marcar_acceso, registrar
    from .db import SessionLocal
    from .models import User
    from .security import read_token
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    uid = read_token(token) if token else None
    if not uid:
        return
    ip = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")
    with SessionLocal() as db:
        u = db.get(User, uid)
        if not u or u.rol not in EQUIPO:
            return
        marcar_acceso(db, u, ip)
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            registrar(db, u, request.method, request.url.path, estado, ip)
            from .actividad import anotar
            from .auditoria import describir
            texto = describir(request.method, request.url.path)
            if texto and estado < 400:
                anotar(db, request.headers.get("x-sesion", "")[:12], u, "cambio", texto, ip, request.headers.get("user-agent", ""))
        db.commit()


@app.exception_handler(Exception)
async def error_del_servidor(request: Request, exc: Exception):
    """Cualquier error inesperado queda en el Departamento de sistemas; la persona ve un mensaje claro."""
    from fastapi.responses import JSONResponse
    log.exception("error en %s %s", request.method, request.url.path)
    try:
        from starlette.concurrency import run_in_threadpool
        await run_in_threadpool(_anotar_error, request, exc)
    except Exception:  # noqa: BLE001
        pass
    return JSONResponse({"detail": "Ocurrió un error en el servidor. El Departamento de sistemas ya fue avisado."}, status_code=500)


def _anotar_error(request: Request, exc: Exception) -> None:
    import re as _re
    from .db import SessionLocal
    from .models import User
    from .security import read_token
    uid = read_token(request.headers.get("authorization", "").removeprefix("Bearer ").strip() or "x")
    with SessionLocal() as db:
        u = db.get(User, uid) if uid else None
        ruta = _re.sub(r"/\d+", "/#", request.url.path)
        sistemas.registrar_error(db, "servidor", f"{type(exc).__name__}: {exc}", f"{request.method} {ruta}", u.nombre if u else "")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    # superad.aha-go.com abre directo el superadministrador
    if request.url.path == "/" and request.headers.get("host", "").split(":")[0].startswith("superad."):
        from fastapi.responses import RedirectResponse
        return RedirectResponse("/panel/", status_code=302)
    # aha-go.com (sin www) lleva a www.aha-go.com
    if request.headers.get("host", "").split(":")[0] == "aha-go.com":
        from fastapi.responses import RedirectResponse
        q = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(f"https://www.aha-go.com{request.url.path}{q}", status_code=301)
    response = await call_next(request)
    try:
        from starlette.concurrency import run_in_threadpool
        await run_in_threadpool(_auditar, request, response.status_code)
    except Exception:  # la auditoría nunca debe tumbar la petición
        pass
    for k, v in SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    return response


for r in (auth.router, ordenes.router, tecnico.router, supervisor.router, admin.router, archivos.router, legal.router, presupuestos.router, penalidad.router, chat.router, banners.router, tasa.router, retiro_tienda.router, conformidad.router, soporte.router, ceo.router, panel.router, precios.router, finanzas.router, finanzas_libro.router, qr_tiendas.router, historial.router, sistemas_rutas.router, interfaz.router, ventas.router):
    app.include_router(r)


def _llave_compartida() -> None:
    """Con PostgreSQL compartido, todos los servidores firman las sesiones con la misma llave (guardada en la base
    de datos): si una persona entra por un servidor y la atiende el otro, sigue conectada."""
    from . import config
    if config.DATABASE_URL.startswith("sqlite") or os.environ.get("AHAHOME_JWT_SECRET"):
        return
    import secrets as _s
    from sqlalchemy.exc import IntegrityError
    from .db import SessionLocal
    from .models import Ajuste
    with SessionLocal() as db:
        a = db.get(Ajuste, "jwt_secreto")
        if not a:
            try:
                db.add(Ajuste(clave="jwt_secreto", valor=_s.token_urlsafe(48)))
                db.commit()
            except IntegrityError:  # el otro servidor la creó al mismo tiempo
                db.rollback()
            a = db.get(Ajuste, "jwt_secreto")
        config.JWT_SECRET = a.valor


@app.on_event("startup")
def crear_tablas() -> None:
    Base.metadata.create_all(engine)
    _llave_compartida()
    from .db import agregar_columnas_nuevas
    nuevas = agregar_columnas_nuevas(engine)
    if nuevas:
        log.info("columnas nuevas agregadas: %s", ", ".join(nuevas))
    # cuentas CEO por configuración (AHAHOME_CEO_EMAILS)
    from . import config
    if config.CEO_EMAILS:
        from sqlalchemy import select
        from .db import SessionLocal
        from .models import User
        with SessionLocal() as db:
            for u in db.scalars(select(User).where(User.email.in_(config.CEO_EMAILS), User.rol == "superadmin")):
                u.es_ceo = True
            db.commit()
            from .routers.ceo import sembrar_correos
            sembrar_correos(db)
    if os.environ.get("AHAHOME_PURGA", "1") == "1":
        threading.Thread(target=_purga_periodica, daemon=True).start()
    sistemas.arrancar()  # revisa el estado cada 5 minutos y anota cuánto tardó en arrancar


def _purga_periodica() -> None:
    """Cada hora elimina los registros de clientes que no verificaron su correo en 24 horas."""
    from .db import SessionLocal
    from .routers.auth import purgar_no_verificados
    while True:
        try:
            with SessionLocal() as db:
                n = purgar_no_verificados(db)
                if n:
                    log.info("registros sin verificar eliminados: %s", n)
                from .routers.presupuestos import revisar_pausas
                if revisar_pausas(db):
                    log.info("avisos de pausa por inspección vencida enviados")
        except Exception:
            log.exception("falló la purga de registros sin verificar")
        time.sleep(3600)


@app.get("/salud")
def salud():
    """La app consulta esto para saber si el servidor responde (sirve igual en la nube o en tu servidor físico)."""
    with engine.connect() as c:
        c.execute(text("SELECT 1"))
    return {"ok": True, "app": "AHA HOME", "version": config.APP_VERSION, "solo_equipo": config.SOLO_EQUIPO,
            "base": engine.dialect.name}


# La app web (misma app que el teléfono) en "/", después de todas las rutas de la API
# Panel web del superadministrador y del equipo (computadora): /panel
_PANEL = pathlib.Path(__file__).resolve().parent / "panel_web"


def _version_panel() -> str:
    """Huella de los archivos del panel: cambia con cada publicación, así nadie se queda con una versión vieja guardada."""
    import hashlib
    h = hashlib.sha256()
    for f in sorted(_PANEL.glob("*.*")):
        h.update(f.read_bytes())
    return h.hexdigest()[:10]


@app.get("/panel", include_in_schema=False)
@app.get("/panel/", include_in_schema=False)
@app.get("/panel/index.html", include_in_schema=False)
def panel_inicio():
    """La portada del panel nunca se guarda en caché y pide sus archivos con la versión actual (panel.js?v=…)."""
    from fastapi.responses import HTMLResponse
    v = _version_panel()
    html = (_PANEL / "index.html").read_text(encoding="utf-8")
    for nombre in ("panel.css", "ios.css", "panel.js"):
        html = html.replace(f'"{nombre}"', f'"/panel/{nombre}?v={v}"')
    return HTMLResponse(html, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


if _PANEL.is_dir():
    app.mount("/panel", StaticFiles(directory=_PANEL, html=True), name="panel")
if config.WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=config.WEB_DIR, html=True), name="web")
