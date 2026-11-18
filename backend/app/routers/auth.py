"""Registro, inicio de sesión (contraseña o PIN del técnico) y datos de la cuenta."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Notificacion, User
from ..security import hash_password, make_token, verify_password

router = APIRouter(tags=["cuenta"])


def limpiar_tel(t: str | None) -> str | None:
    if not t:
        return None
    d = "".join(ch for ch in t if ch.isdigit())
    if d.startswith("58"):
        d = "0" + d[2:]
    return d or None


def perfil(u: User) -> dict:
    d = {"id": u.id, "nombre": u.nombre, "telefono": u.telefono, "email": u.email, "rol": u.rol, "cedula": u.cedula,
         "tienda_id": u.tienda_id}
    if u.tecnico:
        t = u.tecnico
        d["tecnico"] = {"id": t.id, "grupo": t.grupo, "tienda": t.tienda.nombre, "zona": t.tienda.zona,
                        "verificado": t.verificado, "tiene_pin": bool(t.pin_hash),
                        "onboarding_completo": bool(t.foto_rostro and t.selfie_cedula)}
    return d


class Registro(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    telefono: str = Field(min_length=7, max_length=30)
    email: str | None = Field(default=None, max_length=160)
    password: str = Field(min_length=6, max_length=100)


@router.post("/auth/registro")
def registro(body: Registro, db: Session = Depends(get_db)):
    tel = limpiar_tel(body.telefono)
    email = body.email.strip().lower() if body.email else None
    if db.scalar(select(User).where(User.telefono == tel)):
        raise HTTPException(409, "Ese teléfono ya está registrado")
    if email and db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Ese correo ya está registrado")
    u = User(nombre=body.nombre.strip(), telefono=tel, email=email, password_hash=hash_password(body.password), rol="cliente")
    db.add(u)
    db.flush()
    # Si en caja ya le crearon órdenes con ese teléfono, quedan en su cuenta
    from ..models import Orden
    for o in db.scalars(select(Orden).where(Orden.cliente_telefono == tel, Orden.cliente_id.is_(None))):
        o.cliente_id = u.id
    db.commit()
    return {"token": make_token(u.id), "usuario": perfil(u)}


class Login(BaseModel):
    usuario: str  # teléfono o correo
    password: str


@router.post("/auth/login")
def login(body: Login, db: Session = Depends(get_db)):
    ident = body.usuario.strip().lower()
    u = db.scalar(select(User).where(or_(User.email == ident, User.telefono == limpiar_tel(ident))))
    if not u or not u.activo or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Teléfono, correo o contraseña incorrectos")
    return {"token": make_token(u.id), "usuario": perfil(u)}


class LoginPin(BaseModel):
    telefono: str
    pin: str = Field(min_length=4, max_length=8)


@router.post("/auth/login-pin")
def login_pin(body: LoginPin, db: Session = Depends(get_db)):
    """Acceso del técnico con su PIN personal (la app pide antes huella o rostro del teléfono)."""
    u = db.scalar(select(User).where(User.telefono == limpiar_tel(body.telefono), User.rol == "tecnico"))
    if not u or not u.activo or not u.tecnico or not verify_password(body.pin, u.tecnico.pin_hash):
        raise HTTPException(401, "Teléfono o PIN incorrectos")
    return {"token": make_token(u.id), "usuario": perfil(u)}


@router.get("/yo")
def yo(user: User = Depends(current_user)):
    return perfil(user)


class PushToken(BaseModel):
    token: str = Field(max_length=200)


@router.post("/yo/push")
def guardar_push(body: PushToken, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.push_token = body.token
    db.commit()
    return {"ok": True}


@router.get("/notificaciones")
def notificaciones(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ns = db.scalars(select(Notificacion).where(Notificacion.user_id == user.id).order_by(Notificacion.id.desc()).limit(50)).all()
    return [{"id": n.id, "titulo": n.titulo, "texto": n.texto, "orden_id": n.orden_id, "leida": n.leida,
             "fecha": n.creado.isoformat() + "Z"} for n in ns]


@router.post("/notificaciones/leer")
def leer_todas(user: User = Depends(current_user), db: Session = Depends(get_db)):
    for n in db.scalars(select(Notificacion).where(Notificacion.user_id == user.id, Notificacion.leida.is_(False))):
        n.leida = True
    db.commit()
    return {"ok": True}
