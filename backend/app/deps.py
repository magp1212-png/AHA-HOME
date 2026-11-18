from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import read_token


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    token = authorization.removeprefix("Bearer ").strip()
    uid = read_token(token) if token else None
    user = db.get(User, uid) if uid else None
    if not user or not user.activo:
        raise HTTPException(401, "Inicia sesión de nuevo")
    return user


def require(*roles: str):
    """Dependencia que deja pasar solo a ciertos roles (el superadmin pasa siempre)."""
    def dep(user: User = Depends(current_user)) -> User:
        if user.rol not in roles and user.rol != "superadmin":
            raise HTTPException(403, "No tienes permiso para esto")
        return user
    return dep
