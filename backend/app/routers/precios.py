"""Tabulación de precios (superadmin): traslado, instalación, traslado + instalación e inspección, por artículo."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..deps import require
from ..models import Ajuste, PrecioItem, User

router = APIRouter(tags=["precios"])

# (clave, nombre, categoría, tipo de equipo de la caja)
CATALOGO = [
    ("aire_12000", "Aire acondicionado 12.000 BTU", "Aires acondicionados", "aire_acondicionado"),
    ("aire_18000", "Aire acondicionado 18.000 BTU", "Aires acondicionados", "aire_acondicionado"),
    ("aire_24000", "Aire acondicionado 24.000 BTU", "Aires acondicionados", "aire_acondicionado"),
    ("nevera", "Nevera", "Refrigeración", "nevera"),
    ("nevera_side", "Nevera side by side / dos puertas", "Refrigeración", "nevera"),
    ("congelador", "Congelador (freezer)", "Refrigeración", "nevera"),
    ("lavadora", "Lavadora", "Lavado y secado", "lavadora"),
    ("secadora", "Secadora", "Lavado y secado", "secadora"),
    ("morochas", "Morochas (lavadora + secadora)", "Lavado y secado", "lavadora"),
    ("lavavajillas", "Lavavajillas", "Lavado y secado", "otro"),
    ("tope_cocina", "Tope de cocina", "Cocina", "cocina"),
    ("cocina", "Cocina con horno", "Cocina", "cocina"),
    ("horno_empotrable", "Horno empotrable", "Cocina", "cocina"),
    ("campana", "Campana extractora", "Cocina", "cocina"),
    ("microondas", "Microondas", "Cocina", "otro"),
    ("calentador", "Calentador de agua", "Otros de línea blanca", "otro"),
    ("dispensador", "Dispensador de agua", "Otros de línea blanca", "otro"),
]
_ADMIN = require("superadmin")
_VER = require("supervisor")


def crear_por_defecto(db: Session) -> None:
    existentes = {p.clave for p in db.scalars(select(PrecioItem))}
    for i, (clave, nombre, cat, tipo) in enumerate(CATALOGO):
        if clave not in existentes:
            db.add(PrecioItem(clave=clave, nombre=nombre, categoria=cat, tipo_equipo=tipo, orden=i))
    db.commit()


def precio_inspeccion_centavos(db: Session) -> int:
    a = db.get(Ajuste, "inspeccion_centavos")
    return int(a.valor) if a and a.valor.isdigit() else round(config.INSPECCION_USD * 100)


def _d(c: int) -> str | None:
    return f"{c / 100:.2f}" if c else None


def vista(p: PrecioItem) -> dict:
    combo = p.combo_centavos or (p.traslado_centavos + p.instalacion_centavos if p.traslado_centavos and p.instalacion_centavos else 0)
    return {"id": p.id, "clave": p.clave, "nombre": p.nombre, "categoria": p.categoria, "tipo_equipo": p.tipo_equipo,
            "traslado": _d(p.traslado_centavos), "instalacion": _d(p.instalacion_centavos), "combo": _d(combo),
            "combo_es_suma": not p.combo_centavos and bool(combo), "activo": p.activo}


@router.get("/precios")
def ver_precios(user: User = Depends(_VER), db: Session = Depends(get_db)):
    crear_por_defecto(db)
    items = db.scalars(select(PrecioItem).order_by(PrecioItem.orden, PrecioItem.id)).all()
    return {"inspeccion": _d(precio_inspeccion_centavos(db)), "items": [vista(p) for p in items]}


class PrecioIn(BaseModel):
    traslado: float | None = Field(default=None, ge=0, le=100000)
    instalacion: float | None = Field(default=None, ge=0, le=100000)
    combo: float | None = Field(default=None, ge=0, le=100000)
    activo: bool | None = None
    nombre: str | None = Field(default=None, max_length=80)


@router.put("/admin/precios/{pid}")
def fijar_precio(pid: int, body: PrecioIn, user: User = Depends(_ADMIN), db: Session = Depends(get_db)):
    p = db.get(PrecioItem, pid)
    if not p:
        raise HTTPException(404, "Artículo no encontrado")
    for campo in ("traslado", "instalacion", "combo"):
        v = getattr(body, campo)
        if v is not None:
            setattr(p, f"{campo}_centavos", round(v * 100))
    if body.activo is not None:
        p.activo = body.activo
    if body.nombre:
        p.nombre = body.nombre.strip()
    db.commit()
    return vista(p)


class NuevoItem(BaseModel):
    nombre: str = Field(min_length=3, max_length=80)
    categoria: str = Field(default="Otros de línea blanca", max_length=40)


@router.post("/admin/precios")
def agregar_item(body: NuevoItem, user: User = Depends(_ADMIN), db: Session = Depends(get_db)):
    import re
    clave = re.sub(r"[^a-z0-9]+", "_", body.nombre.lower()).strip("_")[:36] or "item"
    if db.scalar(select(PrecioItem).where(PrecioItem.clave == clave)):
        raise HTTPException(409, "Ese artículo ya está en la tabla")
    p = PrecioItem(clave=clave, nombre=body.nombre.strip(), categoria=body.categoria.strip() or "Otros de línea blanca", orden=999)
    db.add(p)
    db.commit()
    return vista(p)


class InspeccionIn(BaseModel):
    precio: float = Field(gt=0, le=10000)


@router.put("/admin/precios-inspeccion")
def fijar_inspeccion(body: InspeccionIn, user: User = Depends(_ADMIN), db: Session = Depends(get_db)):
    a = db.get(Ajuste, "inspeccion_centavos") or Ajuste(clave="inspeccion_centavos")
    a.valor = str(round(body.precio * 100))
    db.add(a)
    db.commit()
    return {"inspeccion": _d(int(a.valor))}
