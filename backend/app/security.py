"""Contraseñas, PIN del técnico, tokens de sesión y códigos QR de retiro."""
import datetime as dt
import hashlib
import hmac
import os
import secrets

import jwt

from . import config

_ITER = int(os.environ.get("AHAHOME_PBKDF2_ITER", "200000"))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITER)
    return f"pbkdf2${_ITER}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    try:
        _, iters, salt, digest = stored.split("$")
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(test.hex(), digest)
    except (ValueError, AttributeError):
        return False


def make_token(user_id: int) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=config.JWT_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": exp, "iat": dt.datetime.now(dt.timezone.utc), "t": dt.datetime.now(dt.timezone.utc).timestamp()}, config.JWT_SECRET, algorithm="HS256")


def emitido_en(token: str) -> dt.datetime | None:
    """Cuándo se emitió el token (UTC, sin zona), para cerrar sesiones a distancia."""
    try:
        datos = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
        iat = datos.get("t") or datos.get("iat")  # «t» lleva fracciones de segundo
        return dt.datetime.fromtimestamp(iat, dt.timezone.utc).replace(tzinfo=None) if iat else None
    except (jwt.PyJWTError, ValueError, TypeError, OSError):
        return None


def read_token(token: str) -> int | None:
    try:
        data = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
        return int(data["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def new_qr_token() -> str:
    """Código secreto que va dentro del QR de retiro en almacén (no se puede adivinar)."""
    return secrets.token_urlsafe(16)
