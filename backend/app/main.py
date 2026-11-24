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

from . import config
from .db import Base, engine
from .routers import admin, archivos, auth, banners, chat, legal, ordenes, ceo, conformidad, panel, penalidad, precios, presupuestos, retiro_tienda, soporte, supervisor, tasa, tecnico

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
        db.commit()


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


for r in (auth.router, ordenes.router, tecnico.router, supervisor.router, admin.router, archivos.router, legal.router, presupuestos.router, penalidad.router, chat.router, banners.router, tasa.router, retiro_tienda.router, conformidad.router, soporte.router, ceo.router, panel.router, precios.router):
    app.include_router(r)


@app.on_event("startup")
def crear_tablas() -> None:
    Base.metadata.create_all(engine)
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
    return {"ok": True, "app": "AHA HOME", "version": config.APP_VERSION, "solo_equipo": config.SOLO_EQUIPO}


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
