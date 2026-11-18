"""Notificaciones: se guardan en la bandeja del usuario y se envían por push (Expo)."""
import logging
import threading

import httpx
from sqlalchemy.orm import Session

from . import config
from .models import Notificacion, User

log = logging.getLogger("ahahome.push")
EXPO_URL = "https://exp.host/--/api/v2/push/send"


def _enviar_push(token: str, titulo: str, texto: str, data: dict) -> None:
    try:
        httpx.post(EXPO_URL, json={"to": token, "title": titulo, "body": texto, "data": data, "sound": "default"}, timeout=10)
    except httpx.HTTPError as e:  # nunca debe tumbar la operación principal
        log.warning("push falló: %s", e)


def notificar(db: Session, user_id: int | None, titulo: str, texto: str, orden_id: int | None = None) -> None:
    if not user_id:
        return
    db.add(Notificacion(user_id=user_id, titulo=titulo, texto=texto, orden_id=orden_id))
    user = db.get(User, user_id)
    if config.PUSH_ENABLED and user and user.push_token:
        threading.Thread(target=_enviar_push, args=(user.push_token, titulo, texto, {"orden_id": orden_id}), daemon=True).start()
