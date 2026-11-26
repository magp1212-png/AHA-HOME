"""QR de las tiendas: cada caja tiene su QR con nombre. Se imprime y se pega en la caja; el técnico lo escanea al
llegar y la caja autoriza el retiro con un OK. Los QR se pueden renombrar, enviar a la papelera y recuperar."""
import io
import secrets

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import exigir_permiso, require
from ..models import Tienda, TiendaQR, User

router = APIRouter(tags=["qr"])
PREFIJO = "AHATIENDA:"  # el mismo de retiro_tienda: los QR ya impresos siguen sirviendo


def sembrar(db: Session) -> None:
    """El QR único que tenía cada tienda pasa a ser su QR «principal» (no se reimprime nada)."""
    hechos = False
    for t in db.scalars(select(Tienda).where(Tienda.qr_token != "")):
        if not db.scalar(select(TiendaQR).where(TiendaQR.token == t.qr_token)):
            db.add(TiendaQR(tienda_id=t.id, nombre=f"Principal {t.nombre}", token=t.qr_token, principal=True))
            hechos = True
    if hechos:
        db.commit()


def buscar_token(db: Session, token: str) -> Tienda | None:
    """La tienda de un QR escaneado (cuenta el escaneo). Los QR en la papelera no sirven."""
    q = db.scalar(select(TiendaQR).where(TiendaQR.token == token))
    if q:
        if q.en_papelera:
            return None
        q.escaneos += 1
        return db.get(Tienda, q.tienda_id)
    return db.scalar(select(Tienda).where(Tienda.qr_token == token)) if token else None


def _vista(db: Session, q: TiendaQR) -> dict:
    t, u = db.get(Tienda, q.tienda_id), db.get(User, q.creado_por) if q.creado_por else None
    return {"id": q.id, "codigo": f"QR-{q.id:04d}", "nombre": q.nombre, "principal": q.principal, "tienda_id": q.tienda_id,
            "tienda": t.nombre if t else "—", "zona": t.zona if t else "", "escaneos": q.escaneos, "en_papelera": q.en_papelera,
            "creado_por": u.nombre if u else "—", "creado": q.creado.isoformat() + "Z", "contenido": f"{PREFIJO}{q.token}"}


def _ver(user: User = Depends(require("superadmin"))) -> User:
    exigir_permiso(user, "qr_tiendas")
    return user


@router.get("/admin/qrs")
def listar(user: User = Depends(_ver), db: Session = Depends(get_db)):
    sembrar(db)
    qs = db.scalars(select(TiendaQR).order_by(TiendaQR.principal.desc(), TiendaQR.id.desc())).all()
    return {"activos": [_vista(db, q) for q in qs if not q.en_papelera], "papelera": [_vista(db, q) for q in qs if q.en_papelera],
            "tiendas": [{"id": t.id, "nombre": t.nombre} for t in db.scalars(select(Tienda).order_by(Tienda.id))]}


class NuevoQR(BaseModel):
    tienda_id: int
    nombre: str = Field(min_length=2, max_length=80)


@router.post("/admin/qrs")
def crear(body: NuevoQR, user: User = Depends(_ver), db: Session = Depends(get_db)):
    t = db.get(Tienda, body.tienda_id)
    if not t:
        raise HTTPException(404, "Tienda no encontrada")
    nombre = body.nombre.strip()
    if db.scalar(select(TiendaQR).where(TiendaQR.tienda_id == t.id, TiendaQR.nombre == nombre, TiendaQR.en_papelera.is_(False))):
        raise HTTPException(409, "Ya hay un QR con ese nombre en esta tienda")
    principal = not db.scalar(select(TiendaQR).where(TiendaQR.tienda_id == t.id, TiendaQR.en_papelera.is_(False)))
    q = TiendaQR(tienda_id=t.id, nombre=nombre, token=secrets.token_urlsafe(12), principal=principal, creado_por=user.id)
    db.add(q)
    if principal or not t.qr_token:
        t.qr_token = q.token
    db.commit()
    return _vista(db, q)


class Renombrar(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)


@router.put("/admin/qrs/{qid}")
def renombrar(qid: int, body: Renombrar, user: User = Depends(_ver), db: Session = Depends(get_db)):
    q = db.get(TiendaQR, qid)
    if not q:
        raise HTTPException(404, "QR no encontrado")
    q.nombre = body.nombre.strip()
    db.commit()
    return _vista(db, q)


@router.post("/admin/qrs/{qid}/papelera")
def a_papelera(qid: int, user: User = Depends(_ver), db: Session = Depends(get_db)):
    q = db.get(TiendaQR, qid)
    if not q:
        raise HTTPException(404, "QR no encontrado")
    q.en_papelera = True
    db.commit()
    return _vista(db, q)


@router.post("/admin/qrs/{qid}/recuperar")
def recuperar(qid: int, user: User = Depends(_ver), db: Session = Depends(get_db)):
    q = db.get(TiendaQR, qid)
    if not q:
        raise HTTPException(404, "QR no encontrado")
    q.en_papelera = False
    db.commit()
    return _vista(db, q)


@router.get("/admin/qrs/{qid}.png")
def imagen(qid: int, user: User = Depends(_ver), db: Session = Depends(get_db)):
    q = db.get(TiendaQR, qid)
    if not q:
        raise HTTPException(404, "QR no encontrado")
    buf = io.BytesIO()
    qrcode.make(f"{PREFIJO}{q.token}", box_size=12, border=2).save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")
