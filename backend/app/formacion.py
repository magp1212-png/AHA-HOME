"""Títulos y cursos del profesional: los usa la app (el profesional) y el panel (la oficina)."""
from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import codigos
from .models import Formacion, PerfilCambio, Tecnico, User

TIPOS = {"titulo": "Título", "curso": "Curso"}
AREAS = {"conductor": "Módulo conductor", "instalador": "Módulo técnico instalador", "general": "General"}


class NuevaFormacion(BaseModel):
    tipo: str = "curso"
    nombre: str = Field(min_length=3, max_length=150)
    institucion: str = Field(default="", max_length=150)
    anio: str = Field(default="", max_length=4)
    area: str = "general"
    url: str = Field(default="", max_length=200)  # subido antes con POST /archivos


def ficha(f: Formacion) -> dict:
    return {"id": f.id, "codigo": codigos.formacion(f), "tipo": f.tipo, "tipo_texto": TIPOS.get(f.tipo, f.tipo), "nombre": f.nombre,
            "institucion": f.institucion, "anio": f.anio, "area": f.area, "area_texto": AREAS.get(f.area, f.area), "url": f.url,
            "creado": f.creado.isoformat() + "Z" if f.creado else None}


def lista(db: Session, t: Tecnico) -> list[dict]:
    return [ficha(f) for f in db.scalars(select(Formacion).where(Formacion.tecnico_id == t.id).order_by(Formacion.anio.desc(), Formacion.id.desc()))]


def agregar(db: Session, t: Tecnico, body: NuevaFormacion, quien: User) -> Formacion:
    if body.tipo not in TIPOS or body.area not in AREAS:
        raise HTTPException(422, "Tipo o área no válidos")
    if body.anio and not (body.anio.isdigit() and len(body.anio) == 4):
        raise HTTPException(422, "El año debe tener 4 números")
    f = Formacion(tecnico_id=t.id, tipo=body.tipo, nombre=body.nombre.strip(), institucion=body.institucion.strip(), anio=body.anio,
                  area=body.area, url=body.url, subido_por=quien.id)
    db.add(f)
    db.add(PerfilCambio(tecnico_id=t.id, user_id=quien.id, texto=f"agregó el {TIPOS[body.tipo].lower()} «{f.nombre[:120]}»"))
    db.flush()
    return f


def quitar(db: Session, t: Tecnico, fid: int, quien: User) -> None:
    f = db.get(Formacion, fid)
    if not f or f.tecnico_id != t.id:
        raise HTTPException(404, "No encontrado")
    db.add(PerfilCambio(tecnico_id=t.id, user_id=quien.id, texto=f"quitó el {TIPOS.get(f.tipo, '').lower()} «{f.nombre[:120]}»"))
    db.delete(f)
