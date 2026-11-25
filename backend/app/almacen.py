"""Dónde se guardan las fotos (facturas, cédulas, rostros, evidencias).

- Un solo servidor con SQLite: en la carpeta backend/uploads (como siempre).
- Varios servidores trabajando juntos (PostgreSQL compartido): dentro de la base de datos, así cualquiera
  de los dos servidores ve las fotos que subió el otro. Las fotos viejas que estén en disco se siguen leyendo.
"""
import mimetypes
import tempfile
from pathlib import Path

from sqlalchemy import select

from . import config


def en_bd() -> bool:
    return config.FOTOS_EN_BD


def guardar(nombre: str, datos: bytes) -> None:
    if en_bd():
        from .db import SessionLocal
        from .models import ArchivoFoto
        with SessionLocal() as db:
            db.merge(ArchivoFoto(nombre=nombre, datos=datos))
            db.commit()
        return
    config.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    (config.UPLOADS_DIR / nombre).write_bytes(datos)


def leer(nombre: str) -> bytes | None:
    if "/" in nombre or "\\" in nombre or nombre.startswith("."):
        return None
    if en_bd():
        from .db import SessionLocal
        from .models import ArchivoFoto
        with SessionLocal() as db:
            datos = db.scalar(select(ArchivoFoto.datos).where(ArchivoFoto.nombre == nombre))
        if datos is not None:
            return bytes(datos)
    ruta = config.UPLOADS_DIR / nombre
    return ruta.read_bytes() if ruta.is_file() else None


def tipo(nombre: str) -> str:
    return mimetypes.guess_type(nombre)[0] or "application/octet-stream"


def a_archivo_temporal(nombre: str) -> Path | None:
    """Para la verificación facial (OpenCV lee archivos): copia la foto a un archivo temporal."""
    ruta = config.UPLOADS_DIR / nombre
    if not en_bd() and ruta.is_file():
        return ruta
    datos = leer(nombre)
    if datos is None:
        return None
    t = tempfile.NamedTemporaryFile(delete=False, suffix=Path(nombre).suffix or ".jpg")
    t.write(datos)
    t.close()
    return Path(t.name)
