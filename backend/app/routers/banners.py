"""Banners del inicio del cliente: mensajes de AHA HOME y publicidad de aliados, administrados por el superadmin."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import asignacion
from ..db import get_db
from ..deps import current_user, require
from ..models import Banner, User

router = APIRouter(tags=["banners"])
COLORES = ("lima", "azul", "marino", "naranja", "verde")
POR_DEFECTO = [
    ("aha", "", "Instalación + retiro de cajas", "Todo incluido desde la caja de tu tienda", "", "marino"),
    ("aha", "", "Inspección antes de instalar", "Por USD 10 el técnico revisa y te da el presupuesto", "", "marino"),
    ("aha", "", "Califica a tu técnico", "Tu opinión premia a los mejores", "", "marino"),
    ("aliado", "ALIADO · PRÓXIMAMENTE", "Tu marca aquí", "", "VER BENEFICIO", "lima"),
    ("aliado", "ALIADO · PRÓXIMAMENTE", "Promoción de la tienda", "", "VER MÁS", "azul"),
]


def crear_por_defecto(db: Session) -> None:
    if db.scalar(select(Banner.id)):
        return
    for i, (tipo, etq, tit, txt, bot, col) in enumerate(POR_DEFECTO):
        db.add(Banner(tipo=tipo, etiqueta=etq, titulo=tit, texto=txt, boton=bot, color=col, orden=i))
    db.commit()


def vista(b: Banner, admin: bool = False) -> dict:
    d = {"id": b.id, "tipo": b.tipo, "etiqueta": b.etiqueta, "titulo": b.titulo, "texto": b.texto, "boton": b.boton,
         "enlace": b.enlace, "imagen": b.imagen or None, "color": b.color}
    if admin:
        d |= {"activo": b.activo, "orden": b.orden, "desde": b.desde, "hasta": b.hasta, "clics": b.clics}
    return d


@router.get("/banners")
def banners(user: User = Depends(current_user), db: Session = Depends(get_db)):
    crear_por_defecto(db)
    hoy = asignacion.hoy().isoformat()
    bs = db.scalars(select(Banner).where(Banner.activo.is_(True)).order_by(Banner.tipo, Banner.orden, Banner.id)).all()
    bs = [b for b in bs if (not b.desde or b.desde <= hoy) and (not b.hasta or b.hasta >= hoy)]
    return {"aha": [vista(b) for b in bs if b.tipo == "aha"], "aliados": [vista(b) for b in bs if b.tipo == "aliado"]}


@router.post("/banners/{banner_id}/clic")
def clic(banner_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.get(Banner, banner_id)
    if b:
        b.clics += 1
        db.commit()
    return {"ok": True}


class BannerIn(BaseModel):
    tipo: str = "aliado"
    etiqueta: str = Field(default="", max_length=40)
    titulo: str = Field(min_length=2, max_length=80)
    texto: str = Field(default="", max_length=160)
    boton: str = Field(default="", max_length=30)
    enlace: str = Field(default="", max_length=300)
    imagen: str | None = Field(default="", max_length=200)
    color: str = "lima"
    activo: bool = True
    orden: int = 0
    desde: str = Field(default="", max_length=10)
    hasta: str = Field(default="", max_length=10)

    @field_validator("tipo")
    @classmethod
    def _t(cls, v):
        if v not in ("aha", "aliado"):
            raise ValueError("tipo debe ser aha o aliado")
        return v

    @field_validator("color")
    @classmethod
    def _c(cls, v):
        if v not in COLORES:
            raise ValueError("color inválido")
        return v

    @field_validator("enlace")
    @classmethod
    def _e(cls, v):
        if v and not v.startswith(("https://", "http://")):
            raise ValueError("el enlace debe empezar por https://")
        return v


solo_superadmin = require("superadmin")


@router.get("/admin/banners")
def listar(user: User = Depends(solo_superadmin), db: Session = Depends(get_db)):
    crear_por_defecto(db)
    return [vista(b, True) for b in db.scalars(select(Banner).order_by(Banner.tipo, Banner.orden, Banner.id))]


@router.post("/admin/banners")
def crear(body: BannerIn, user: User = Depends(solo_superadmin), db: Session = Depends(get_db)):
    crear_por_defecto(db)  # los mensajes de fábrica de AHA HOME existen antes del primer banner propio
    b = Banner(**(body.model_dump() | {"imagen": body.imagen or ""}))
    db.add(b)
    db.commit()
    return vista(b, True)


@router.put("/admin/banners/{banner_id}")
def editar(banner_id: int, body: BannerIn, user: User = Depends(solo_superadmin), db: Session = Depends(get_db)):
    b = db.get(Banner, banner_id)
    if not b:
        raise HTTPException(404, "Banner no encontrado")
    for k, v in (body.model_dump() | {"imagen": body.imagen or ""}).items():
        setattr(b, k, v)
    db.commit()
    return vista(b, True)


@router.delete("/admin/banners/{banner_id}")
def borrar(banner_id: int, user: User = Depends(solo_superadmin), db: Session = Depends(get_db)):
    b = db.get(Banner, banner_id)
    if not b:
        raise HTTPException(404, "Banner no encontrado")
    db.delete(b)
    db.commit()
    return {"ok": True}
