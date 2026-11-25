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

# Dirección pública del servidor, para los enlaces de los correos (ej. https://api-home.aha-go.com)
PUBLIC_URL = os.environ.get("AHAHOME_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/")
# Dirección del panel del equipo (para el enlace de «recuperar clave»)
PANEL_URL = os.environ.get("AHAHOME_PANEL_URL", "https://superad.aha-go.com").rstrip("/")

# El cliente tiene 24 horas para verificar su correo; si no, su cuenta se elimina del registro.
VERIFICACION_HORAS = int(os.environ.get("AHAHOME_VERIFICACION_HORAS", "24"))

# Versión web de la app (mobile/dist-web): el servidor la sirve en "/" para www.aha-go.com y los paneles
WEB_DIR = pathlib.Path(os.environ.get("AHAHOME_WEB_DIR", BASE_DIR.parent / "mobile" / "dist-web"))

# Hora de Caracas (UTC-4, sin horario de verano) para saber qué grupo está de guardia hoy.
UTC_OFFSET_HOURS = -4

# Una orden en pausa por inspección avisa al control si pasa este tiempo sin quedar lista para retirar.
# El cliente puede reprogramar sin costo hasta estas horas antes del inicio de su franja (y antes del retiro).
REPROGRAMAR_HORAS_ANTES = int(os.environ.get("AHAHOME_REPROGRAMAR_HORAS", "3"))
PAUSA_INSPECCION_HORAS = int(os.environ.get("AHAHOME_PAUSA_INSPECCION_HORAS", "48"))
# Costo de la visita de inspección (USD); se suma al pago del presupuesto cuando el cliente la pidió.
# Teléfono del centro de control (si está vacío, se usa el del técnico supervisor de la tienda o el del supervisor)
TELEFONO_CONTROL = os.environ.get("AHAHOME_TELEFONO_CONTROL", "").strip()
# Modelos de verificación facial (python descargar_modelos.py)
MODELOS_DIR = pathlib.Path(os.environ.get("AHAHOME_MODELOS_DIR", pathlib.Path(__file__).resolve().parent.parent / "modelos"))
# Correos de las cuentas CEO (superadmin con acceso al centro de mando y a la auditoría), separados por coma
CEO_EMAILS = {e.strip().lower() for e in os.environ.get("AHAHOME_CEO_EMAILS", "magp@aha-go.com").split(",") if e.strip()}
# Dominio de los correos corporativos del equipo (nombre.apellido@aha-go.com)
CORREO_DOMINIO = os.environ.get("AHAHOME_CORREO_DOMINIO", "aha-go.com").strip().lower()
# Código de cierre (AHA HOGAR v2): vale 30 minutos y se puede pedir otro cada 60 segundos
CIERRE_MINUTOS = int(os.environ.get("AHAHOME_CIERRE_MINUTOS", "30"))
# Modo equipo: en producción, mientras se prueba, solo entran la caja, el centro de control, el superadmin y el CEO.
# Se activa con AHAHOME_SOLO_EQUIPO=1 o con el archivo backend/.solo-equipo en el servidor.
SOLO_EQUIPO = os.environ.get("AHAHOME_SOLO_EQUIPO", "") == "1" or (BASE_DIR / ".solo-equipo").exists()
ROLES_EQUIPO = ("agente", "supervisor", "tecnico_supervisor", "superadmin", "ventas")
MENSAJE_SOLO_EQUIPO = "AHA HOME está en pruebas solo con el equipo de tienda y control. Muy pronto podrás usarla."
INSPECCION_USD = float(os.environ.get("AHAHOME_INSPECCION_USD", "10"))
