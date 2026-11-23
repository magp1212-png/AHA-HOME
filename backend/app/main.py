"""AHA HOME API · Hacemos todo por ti."""
import logging
import os
import threading
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from . import config
from .db import Base, engine
from .routers import admin, archivos, auth, banners, chat, legal, ordenes, ceo, conformidad, penalidad, presupuestos, retiro_tienda, soporte, supervisor, tasa, tecnico

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
    response = await call_next(request)
    try:
        from starlette.concurrency import run_in_threadpool
        await run_in_threadpool(_auditar, request, response.status_code)
    except Exception:  # la auditoría nunca debe tumbar la petición
        pass
    for k, v in SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    return response


for r in (auth.router, ordenes.router, tecnico.router, supervisor.router, admin.router, archivos.router, legal.router, presupuestos.router, penalidad.router, chat.router, banners.router, tasa.router, retiro_tienda.router, conformidad.router, soporte.router, ceo.router):
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
    return {"ok": True, "app": "AHA HOME", "version": config.APP_VERSION}


# La app web (misma app que el teléfono) en "/", después de todas las rutas de la API
if config.WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=config.WEB_DIR, html=True), name="web")
