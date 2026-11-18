"""AHA HOME API · Hacemos todo por ti."""
import logging
import os
import threading
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import config
from .db import Base, engine
from .routers import admin, archivos, auth, ordenes, supervisor, tecnico

log = logging.getLogger("ahahome")
app = FastAPI(title="AHA HOME API", version=config.APP_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    return response


for r in (auth.router, ordenes.router, tecnico.router, supervisor.router, admin.router, archivos.router):
    app.include_router(r)


@app.on_event("startup")
def crear_tablas() -> None:
    Base.metadata.create_all(engine)
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
        except Exception:
            log.exception("falló la purga de registros sin verificar")
        time.sleep(3600)


@app.get("/salud")
def salud():
    """La app consulta esto para saber si el servidor responde (sirve igual en la nube o en tu servidor físico)."""
    with engine.connect() as c:
        c.execute(text("SELECT 1"))
    return {"ok": True, "app": "AHA HOME", "version": config.APP_VERSION}
