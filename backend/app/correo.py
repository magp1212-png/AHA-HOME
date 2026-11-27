"""Correo saliente de AHA HOME con Brevo, desde no-responder@aha-go.com.

Las credenciales viven solo en el servidor, en backend/correo.key; ese archivo nunca va a GitHub. Dos formas:
  - API de Brevo (recomendada): {"api_key": "xkeysib-…", "from": "AHA HOME <no-responder@aha-go.com>"}.
    Basta una llave con permiso solo de envío (correos transaccionales).
  - SMTP: {"host", "port", "user", "password", "from"}. Sin él (o con AHAHOME_EMAIL=0, como en las pruebas) no se envía nada y el mensaje
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


def _remitente(cfg: dict) -> tuple[str, str]:
    from email.utils import parseaddr
    nombre, correo = parseaddr(cfg.get("from") or "")
    return nombre or "AHA HOME", correo or "no-responder@aha-go.com"


def _por_api(cfg: dict, destino: str, asunto: str, html: str, texto: str) -> bool:
    """Envío por la API de Brevo (HTTPS); la llave solo necesita permiso para correos transaccionales."""
    import urllib.request
    nombre, correo = _remitente(cfg)
    cuerpo = {"sender": {"name": nombre, "email": correo}, "to": [{"email": destino}], "subject": asunto, "htmlContent": html}
    if texto:
        cuerpo["textContent"] = texto
    req = urllib.request.Request("https://api.brevo.com/v3/smtp/email", data=json.dumps(cuerpo).encode(), method="POST",
                                 headers={"api-key": cfg["api_key"], "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return 200 <= r.status < 300


ultimo: dict | None = None  # último envío: {ok, a, en} (lo muestra el Departamento de sistemas)


def _anotar(ok: bool, destino: str) -> bool:
    global ultimo
    import datetime as _dt
    ultimo = {"ok": ok, "a": destino, "en": _dt.datetime.now().strftime("%d/%m %H:%M")}
    return ok


def enviar(destino: str, asunto: str, html: str, texto: str = "") -> bool:
    """Envía un correo; True si salió (o si quedó en la bandeja de pruebas)."""
    return _anotar(_enviar(destino, asunto, html, texto), destino) if _settings() else _enviar(destino, asunto, html, texto)


def _enviar(destino: str, asunto: str, html: str, texto: str = "") -> bool:
    cfg = _settings()
    if cfg is None:
        outbox.append({"to": destino, "subject": asunto, "html": html, "text": texto})
        return True
    if cfg.get("api_key"):
        try:
            ok = _por_api(cfg, destino, asunto, html, texto)
            log.info("correo enviado a %s: %s", destino, asunto)
            return ok
        except Exception:  # nunca tumba la operación por culpa del servicio de correo
            log.exception("no se pudo enviar el correo a %s", destino)
            return False
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = asunto, cfg.get("from") or formataddr(("AHA HOME", cfg["user"])), destino
    msg["Message-ID"] = make_msgid(domain=cfg.get("domain", "aha-go.com"))
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
