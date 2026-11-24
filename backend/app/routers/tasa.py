"""Dos monedas: dólares y bolívares a la tasa oficial del BCV del día (la carga el superadmin)."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, exigir_permiso, require
from ..models import METODO_PAGO_TEXTO, TasaCambio, User, moneda_de

router = APIRouter(tags=["tasa"])


def tasa_vigente(db: Session) -> TasaCambio | None:
    return db.scalar(select(TasaCambio).order_by(TasaCambio.id.desc()).limit(1))


def vista_tasa(t: TasaCambio | None) -> dict:
    if not t:
        return {"bs_por_usd": None, "fecha": None, "fuente": "BCV"}
    return {"bs_por_usd": f"{t.bs_por_usd:.2f}", "fecha": t.fecha, "fuente": t.fuente}


def bs(usd_centavos: int, tasa: float) -> str:
    return f"{round(usd_centavos * tasa) / 100:.2f}"


def cobro(db: Session, metodo: str) -> tuple[str, float]:
    """Moneda y tasa que se guardan al registrar un pago. En bolívares hace falta la tasa del día."""
    moneda = moneda_de(metodo)
    t = tasa_vigente(db)
    if moneda == "Bs" and not t:
        raise HTTPException(422, "Falta la tasa oficial del día: el superadmin debe cargarla para cobrar en bolívares")
    return moneda, (t.bs_por_usd if t else 0.0)


def info_pago(metodo: str | None, usd_centavos: int, moneda: str, tasa: float) -> dict:
    """Cómo se pagó: método, moneda, monto en la moneda cobrada y su equivalente."""
    moneda = moneda or moneda_de(metodo)
    usd = f"{usd_centavos / 100:.2f}"
    return {"metodo": metodo, "metodo_texto": METODO_PAGO_TEXTO.get(metodo or "", ""), "moneda": moneda,
            "monto_usd": usd, "monto_bs": bs(usd_centavos, tasa) if tasa else None, "tasa": f"{tasa:.2f}" if tasa else None,
            "cobrado": (f"Bs {bs(usd_centavos, tasa)}" if moneda == "Bs" and tasa else f"USD {usd}") if metodo else None}


class TasaIn(BaseModel):
    bs_por_usd: float = Field(gt=0, lt=10_000_000)
    fecha: dt.date | None = None


@router.get("/tasa")
def ver_tasa(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return vista_tasa(tasa_vigente(db))


@router.put("/admin/tasa")
def cargar_tasa(body: TasaIn, user: User = Depends(require("superadmin")), db: Session = Depends(get_db)):
    exigir_permiso(user, "tasa")
    t = TasaCambio(bs_por_usd=round(body.bs_por_usd, 4), fecha=(body.fecha or dt.date.today()).isoformat(), creado_por=user.id)
    db.add(t)
    db.commit()
    return vista_tasa(t)


@router.get("/admin/tasas")
def historial(user: User = Depends(require("superadmin")), db: Session = Depends(get_db)):
    return [vista_tasa(t) | {"creado": t.creado.isoformat() + "Z"} for t in db.scalars(select(TasaCambio).order_by(TasaCambio.id.desc()).limit(30))]
