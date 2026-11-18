"""Ajustes leídos de variables de entorno, con valores seguros para pruebas locales."""
import os
import pathlib

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent

APP_VERSION = "0.1.0"

DATABASE_URL = os.environ.get("AHAHOME_DATABASE_URL", f"sqlite:///{BASE_DIR / 'ahahome.db'}")

_secret_file = BASE_DIR / ".secreto-jwt.txt"
JWT_SECRET = os.environ.get("AHAHOME_JWT_SECRET") or (
    _secret_file.read_text(encoding="utf-8").strip() if _secret_file.exists() else "solo-desarrollo-local")
JWT_DAYS = int(os.environ.get("AHAHOME_JWT_DAYS", "30"))

# Fotos: facturas, cédula en pecho, rostro del técnico y evidencias de cierre.
UPLOADS_DIR = pathlib.Path(os.environ.get("AHAHOME_UPLOADS_DIR", BASE_DIR / "uploads"))
MAX_IMAGE_BYTES = 6 * 1024 * 1024

# Notificaciones push con el servicio gratuito de Expo; las pruebas lo apagan.
PUSH_ENABLED = os.environ.get("AHAHOME_PUSH", "1") == "1"

# Hora de Caracas (UTC-4, sin horario de verano) para saber qué grupo está de guardia hoy.
UTC_OFFSET_HOURS = -4
