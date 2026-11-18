"""Subida de fotos: factura, rostro y cédula del técnico, evidencias de cierre."""
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

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


@router.get("/archivos/{nombre}")
def ver(nombre: str):
    if "/" in nombre or "\\" in nombre or nombre.startswith("."):
        raise HTTPException(404)
    ruta = config.UPLOADS_DIR / nombre
    if not ruta.is_file():
        raise HTTPException(404)
    return FileResponse(ruta)
