"""Correo saliente de AHA HOME (SMTP, por ejemplo Brevo, como en Anunciate).

Las credenciales viven solo en el servidor, en backend/correo.key (JSON: host, port, user, password, from); ese
archivo nunca va a GitHub. Sin él (o con AHAHOME_EMAIL=0, como en las pruebas) no se envía nada y el mensaje
queda en `outbox` para poder probar los flujos.
"""
import json
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from . import config

log = logging.getLogger("ahahome.correo")
KEY = __import__("pathlib").Path(os.environ.get("AHAHOME_CORREO_KEY", config.BASE_DIR / "correo.key"))
ENABLED = os.environ.get("AHAHOME_EMAIL", "1") == "1"
outbox: list[dict] = []


def _settings() -> dict | None:
    if not ENABLED or not KEY.exists():
        return None
    try:
        return json.loads(KEY.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log.exception("correo.key no se pudo leer")
        return None


def enviar(destino: str, asunto: str, html: str, texto: str = "") -> bool:
    """Envía un correo; True si salió (o si quedó en la bandeja de pruebas)."""
    cfg = _settings()
    if cfg is None:
        outbox.append({"to": destino, "subject": asunto, "html": html, "text": texto})
        return True
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = asunto, cfg.get("from") or formataddr(("AHA HOME", cfg["user"])), destino
    msg["Message-ID"] = make_msgid(domain=cfg.get("domain", "ahahome.app"))
    msg.set_content(texto or "Abre este correo en un lector que muestre HTML.")
    msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(cfg["host"], int(cfg.get("port", 587)), timeout=20) as s:
            s.starttls(context=ssl.create_default_context())
            s.login(cfg["user"], cfg["password"])
            s.send_message(msg)
        log.info("correo enviado a %s: %s", destino, asunto)
        return True
    except Exception:  # nunca tumba la operación por culpa del servidor de correo
        log.exception("no se pudo enviar el correo a %s", destino)
        return False


def boton(url: str, texto: str) -> str:
    return (f'<a href="{url}" style="display:inline-block;background:#21244D;color:#CFD72A;text-decoration:none;'
            f'font-weight:800;padding:14px 22px;border-radius:24px">{texto}</a>')


def plantilla(titulo: str, cuerpo: str) -> str:
    return (f'<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1A1C3D">'
            f'<div style="background:#21244D;border-radius:16px;padding:18px 20px;margin-bottom:20px">'
            f'<div style="font-weight:900;font-size:22px;color:#FFFFFF;letter-spacing:1px">AHA HOME</div>'
            f'<div style="color:#CFD72A;font-weight:700">Hacemos todo por ti</div></div>'
            f'<h2 style="margin:0 0 12px">{titulo}</h2>{cuerpo}'
            f'<p style="color:#6B7789;font-size:12px;margin-top:28px">Si no creaste esta cuenta, ignora este correo. '
            f'Este buzón no recibe respuestas.</p></div>')
