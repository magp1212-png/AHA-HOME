"""Subida de fotos: factura, rostro y cédula del técnico, evidencias de cierre."""
import base64
import binascii
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import config
from ..deps import current_user
from ..models import User

router = APIRouter(tags=["archivos"])
TIPOS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}


@router.post("/archivos")
async def subir(archivo: UploadFile = File(...), user: User = Depends(current_user)):
    ext = TIPOS.get(archivo.content_type or "")
    if not ext:
        raise HTTPException(415, "Solo se aceptan fotos (JPG, PNG, WEBP o HEIC)")
    data = await archivo.read(config.MAX_IMAGE_BYTES + 1)
    if len(data) > config.MAX_IMAGE_BYTES:
        raise HTTPException(413, "La foto pesa demasiado (máximo 6 MB)")
    config.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    nombre = secrets.token_urlsafe(18) + ext  # nombre imposible de adivinar
    (config.UPLOADS_DIR / nombre).write_bytes(data)
    return {"url": f"/archivos/{nombre}"}


class FotoBase64(BaseModel):
    data: str = Field(max_length=9_000_000)  # la app envía la foto en base64 (como en Anunciate)
    tipo: str = "image/jpeg"


@router.post("/archivos/base64")
def subir_base64(body: FotoBase64, user: User = Depends(current_user)):
    ext = TIPOS.get(body.tipo)
    if not ext:
        raise HTTPException(415, "Solo se aceptan fotos (JPG, PNG, WEBP o HEIC)")
    try:
        data = base64.b64decode(body.data.split(",")[-1], validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "La foto llegó dañada; intenta de nuevo")
    if len(data) > config.MAX_IMAGE_BYTES:
        raise HTTPException(413, "La foto pesa demasiado (máximo 6 MB)")
    config.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    nombre = secrets.token_urlsafe(18) + ext
    (config.UPLOADS_DIR / nombre).write_bytes(data)
    return {"url": f"/archivos/{nombre}"}


@router.get("/archivos/{nombre}")
def ver(nombre: str):
    if "/" in nombre or "\\" in nombre or nombre.startswith("."):
        raise HTTPException(404)
    ruta = config.UPLOADS_DIR / nombre
    if not ruta.is_file():
        raise HTTPException(404)
    return FileResponse(ruta)
