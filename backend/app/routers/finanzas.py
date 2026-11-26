"""Finanzas del superadmin: resumen contable, pagos recibidos, gastos, reclamos, bancos/cuentas y tipos de pago."""
import datetime as dt
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ordenes as svc
from ..db import get_db
from ..deps import exigir_permiso, require
from ..models import (CATEGORIAS_GASTO, CATEGORIAS_INGRESO, CATEGORIAS_MEDIO, ESTADOS_RECLAMO, METODO_PAGO_TEXTO, CuentaFinanciera,
                      MedioPago, MovimientoFinanciero, Orden, Presupuesto, ReclamoFinanciero, User, ahora, dia_caracas, moneda_de)

router = APIRouter(prefix="/finanzas", tags=["finanzas"])
_EQUIPO = require("supervisor")

# Tipos de pago con los que arranca el sistema (el superadmin agrega los que falten)
MEDIOS_BASE = [
    ("Pago móvil", "banco_nacional", "Bs", "pago_movil"),
    ("Transferencia bancaria nacional", "banco_nacional", "Bs", None),
    ("Punto de venta", "banco_nacional", "Bs", "punto_de_venta"),
    ("Transferencia bancaria internacional", "banco_internacional", "USD", None),
    ("Zelle", "zelle", "USD", "zelle"),
    ("Efectivo en dólares (cash)", "efectivo", "USD", "efectivo_usd"),
    ("Efectivo en bolívares", "efectivo", "Bs", "efectivo_bs"),
]


def ver(user: User = Depends(_EQUIPO)) -> User:
    exigir_permiso(user, "ver_finanzas")
    return user


def editar(user: User = Depends(_EQUIPO)) -> User:
    exigir_permiso(user, "finanzas")
    return user


def sembrar_medios(db: Session) -> None:
    if db.scalar(select(MedioPago.id).limit(1)):
        return
    for nombre, cat, mon, clave in MEDIOS_BASE:
        db.add(MedioPago(nombre=nombre, categoria=cat, moneda=mon, clave_caja=clave))
    db.commit()


def _d(c: int) -> str:
    return f"{(c or 0) / 100:.2f}"


def _tasa(db: Session) -> float | None:
    from .tasa import tasa_vigente
    t = tasa_vigente(db)
    return float(t.bs_por_usd) if t else None


def _vista_medio(m: MedioPago) -> dict:
    return {"id": m.id, "nombre": m.nombre, "categoria": m.categoria, "categoria_texto": CATEGORIAS_MEDIO.get(m.categoria, m.categoria),
            "moneda": m.moneda, "clave_caja": m.clave_caja, "activo": m.activo, "del_sistema": bool(m.clave_caja)}


def _vista_cuenta(c: CuentaFinanciera, saldo_usd: int | None = None) -> dict:
    ident = c.identificador or ""
    oculto = ident if "@" in ident or len(ident) <= 4 else "•••• " + ident[-4:]
    return {"id": c.id, "nombre": c.nombre, "categoria": c.categoria, "categoria_texto": CATEGORIAS_MEDIO.get(c.categoria, c.categoria),
            "banco": c.banco, "moneda": c.moneda, "titular": c.titular, "identificador": oculto,
            "saldo_inicial": _d(c.saldo_inicial_centavos), "activo": c.activo, "saldo": _d(saldo_usd) if saldo_usd is not None else None}


def _vista_mov(m: MovimientoFinanciero, medios: dict, cuentas: dict) -> dict:
    cats = CATEGORIAS_INGRESO if m.tipo == "ingreso" else CATEGORIAS_GASTO
    return {"id": m.id, "fecha": m.fecha, "tipo": m.tipo, "categoria": m.categoria, "categoria_texto": cats.get(m.categoria, m.categoria),
            "descripcion": m.descripcion, "monto": _d(m.monto_centavos), "moneda": m.moneda, "tasa": m.tasa, "monto_usd": _d(m.monto_usd_centavos),
            "medio": medios.get(m.medio_id), "cuenta": cuentas.get(m.cuenta_id), "referencia": m.referencia, "orden": m.orden_codigo,
            "estado": m.estado, "motivo_anulacion": m.motivo_anulacion, "beneficiario": m.beneficiario, "conciliado": m.conciliado, "origen": "manual"}


def _pagos_automaticos(db: Session) -> list[dict]:
    """Lo que ya cobró el sistema: caja (servicio e inspección), presupuestos y penalidades."""
    filas = []
    for o in db.scalars(select(Orden).where(Orden.pagado_en.is_not(None))):
        usd = o.monto_instalacion_centavos + o.inspeccion_centavos
        filas.append({"id": f"c{o.id}", "fecha": dia_caracas(o.pagado_en), "categoria_texto": "Cobro en caja", "descripcion": f"Servicio {o.codigo} · {o.cliente_nombre}",
                      "metodo": o.pago_metodo, "medio": METODO_PAGO_TEXTO.get(o.pago_metodo or "", "—"), "moneda": o.pago_moneda or moneda_de(o.pago_metodo) or "USD",
                      "monto_usd": _d(usd), "monto_bs": _d(round(usd * o.pago_tasa)) if o.pago_tasa else None, "referencia": o.pago_referencia or "",
                      "orden": o.codigo, "estado": "cobrado", "origen": "caja", "_usd": usd, "_cat": "servicio"})
    for p in db.scalars(select(Presupuesto).where(Presupuesto.pago_registrado_en.is_not(None))):
        filas.append({"id": f"p{p.id}", "fecha": dia_caracas(p.pago_registrado_en), "categoria_texto": "Presupuesto", "descripcion": f"Presupuesto de {p.orden.codigo}",
                      "metodo": p.pago_metodo, "medio": METODO_PAGO_TEXTO.get(p.pago_metodo or "", "—"), "moneda": p.pago_moneda or "USD",
                      "monto_usd": _d(p.a_pagar_centavos), "monto_bs": _d(round(p.a_pagar_centavos * p.pago_tasa)) if p.pago_tasa else None,
                      "referencia": p.pago_referencia or "", "orden": p.orden.codigo, "estado": "confirmado" if p.pago_confirmado_en else "por confirmar",
                      "origen": "presupuesto", "_usd": p.a_pagar_centavos, "_cat": "presupuesto"})
    for o in db.scalars(select(Orden).where(Orden.penalidad_pagada_en.is_not(None))):
        filas.append({"id": f"n{o.id}", "fecha": dia_caracas(o.penalidad_pagada_en), "categoria_texto": "Penalidad", "descripcion": f"Entrega fallida {o.codigo}",
                      "metodo": o.penalidad_metodo, "medio": METODO_PAGO_TEXTO.get(o.penalidad_metodo or "", "—"), "moneda": moneda_de(o.penalidad_metodo) or "USD",
                      "monto_usd": _d(o.penalidad_centavos or 0), "monto_bs": None, "referencia": o.penalidad_referencia or "", "orden": o.codigo,
                      "estado": "cobrado", "origen": "penalidad", "_usd": o.penalidad_centavos or 0, "_cat": "penalidad"})
    return filas


def _mapas(db: Session):
    return ({m.id: m.nombre for m in db.scalars(select(MedioPago))}, {c.id: c.nombre for c in db.scalars(select(CuentaFinanciera))})


@router.get("/catalogo")
def catalogo(user: User = Depends(ver), db: Session = Depends(get_db)):
    sembrar_medios(db)
    return {"categorias_medio": CATEGORIAS_MEDIO, "ingresos": CATEGORIAS_INGRESO, "gastos": CATEGORIAS_GASTO, "estados_reclamo": ESTADOS_RECLAMO,
            "medios": [_vista_medio(m) for m in db.scalars(select(MedioPago).order_by(MedioPago.id))],
            "cuentas": [_vista_cuenta(c) for c in db.scalars(select(CuentaFinanciera).order_by(CuentaFinanciera.id))],
            "tasa": _tasa(db), "puede_editar": "finanzas" in __import__("app.deps", fromlist=["permisos_de"]).permisos_de(user)}


@router.get("/resumen")
def resumen(dias: int = 30, user: User = Depends(ver), db: Session = Depends(get_db)):
    sembrar_medios(db)
    dias = max(1, min(dias, 3650))
    desde = dia_caracas(ahora() - dt.timedelta(days=dias - 1))
    medios = {m.id: m for m in db.scalars(select(MedioPago))}
    por_clave = {m.clave_caja: m for m in medios.values() if m.clave_caja}
    auto = [f for f in _pagos_automaticos(db) if f["fecha"] >= desde and f["estado"] in ("cobrado", "confirmado")]
    movs = [m for m in db.scalars(select(MovimientoFinanciero).where(MovimientoFinanciero.estado.not_in(("anulado", "por_pagar")))) if m.fecha >= desde]
    ingresos = sum(f["_usd"] for f in auto) + sum(m.monto_usd_centavos for m in movs if m.tipo == "ingreso")
    gastos = sum(m.monto_usd_centavos for m in movs if m.tipo == "gasto")
    por_medio, por_cat_ing, por_cat_gasto, por_moneda = defaultdict(int), defaultdict(int), defaultdict(int), defaultdict(int)
    for f in auto:
        m = por_clave.get(f["metodo"])
        por_medio[CATEGORIAS_MEDIO.get(m.categoria, "Otro") if m else "Otro"] += f["_usd"]
        por_cat_ing[CATEGORIAS_INGRESO[f["_cat"]]] += f["_usd"]
        por_moneda[f["moneda"]] += f["_usd"]
    for m in movs:
        if m.tipo == "ingreso":
            md = medios.get(m.medio_id)
            por_medio[CATEGORIAS_MEDIO.get(md.categoria, "Otro") if md else "Otro"] += m.monto_usd_centavos
            por_cat_ing[CATEGORIAS_INGRESO.get(m.categoria, m.categoria)] += m.monto_usd_centavos
            por_moneda[m.moneda] += m.monto_usd_centavos
        else:
            por_cat_gasto[CATEGORIAS_GASTO.get(m.categoria, m.categoria)] += m.monto_usd_centavos
    recl = list(db.scalars(select(ReclamoFinanciero)))
    abiertos = [r for r in recl if r.estado in ("abierto", "en_revision")]
    # Saldo por cuenta: saldo inicial + ingresos − gastos registrados en esa cuenta (todo el historial)
    saldos = defaultdict(int)
    for m in db.scalars(select(MovimientoFinanciero).where(MovimientoFinanciero.estado.not_in(("anulado", "por_pagar")), MovimientoFinanciero.cuenta_id.is_not(None))):
        saldos[m.cuenta_id] += m.monto_centavos if m.tipo == "ingreso" else -m.monto_centavos
    cuentas = [_vista_cuenta(c, c.saldo_inicial_centavos + saldos[c.id]) for c in db.scalars(select(CuentaFinanciera).where(CuentaFinanciera.activo.is_(True)))]
    serie_i, serie_g = defaultdict(int), defaultdict(int)
    for f in auto:
        serie_i[f["fecha"]] += f["_usd"]
    for m in movs:
        (serie_i if m.tipo == "ingreso" else serie_g)[m.fecha] += m.monto_usd_centavos
    dias_lista = [dia_caracas(ahora() - dt.timedelta(days=dias - 1 - i)) for i in range(dias)]
    return {"dias": dias, "ingresos_usd": _d(ingresos), "gastos_usd": _d(gastos), "resultado_usd": _d(ingresos - gastos),
            "margen": round((ingresos - gastos) * 100 / ingresos) if ingresos else None,
            "reclamos_abiertos": len(abiertos), "reclamos_monto_usd": _d(sum(r.monto_centavos for r in abiertos)),
            "por_medio": {k: v / 100 for k, v in por_medio.items()}, "ingresos_por_categoria": {k: v / 100 for k, v in por_cat_ing.items()},
            "gastos_por_categoria": {k: v / 100 for k, v in sorted(por_cat_gasto.items(), key=lambda x: -x[1])},
            "por_moneda": {k: v / 100 for k, v in por_moneda.items()}, "cuentas": cuentas, "tasa": _tasa(db),
            "serie_ingresos": [serie_i[d] / 100 for d in dias_lista], "serie_gastos": [serie_g[d] / 100 for d in dias_lista]}


@router.get("/pagos")
def pagos(user: User = Depends(ver), db: Session = Depends(get_db)):
    """Pagos recibidos: los del sistema (caja, presupuestos, penalidades) y los ingresos registrados a mano."""
    sembrar_medios(db)
    medios, cuentas = _mapas(db)
    filas = [{k: v for k, v in f.items() if not k.startswith("_")} for f in _pagos_automaticos(db)]
    for m in db.scalars(select(MovimientoFinanciero).where(MovimientoFinanciero.tipo == "ingreso")):
        v = _vista_mov(m, medios, cuentas)
        filas.append(v | {"medio": v["medio"] or "—", "monto_bs": v["monto"] if m.moneda == "Bs" else None})
    filas.sort(key=lambda f: f["fecha"], reverse=True)
    return filas


@router.get("/movimientos")
def movimientos(tipo: str = "gasto", user: User = Depends(ver), db: Session = Depends(get_db)):
    medios, cuentas = _mapas(db)
    q = select(MovimientoFinanciero).where(MovimientoFinanciero.tipo == tipo).order_by(MovimientoFinanciero.fecha.desc(), MovimientoFinanciero.id.desc())
    return [_vista_mov(m, medios, cuentas) for m in db.scalars(q)]


class NuevoMovimiento(BaseModel):
    tipo: str
    categoria: str
    fecha: dt.date
    descripcion: str = Field(default="", max_length=200)
    monto: float = Field(gt=0, le=10_000_000)
    moneda: str = "USD"
    tasa: float | None = Field(default=None, gt=0)
    medio_id: int | None = None
    cuenta_id: int | None = None
    referencia: str = Field(default="", max_length=80)
    orden: str = Field(default="", max_length=20)
    beneficiario: str = Field(default="", max_length=120)
    por_pagar: bool = False  # gasto que todavía no se pagó: queda en «Por pagar»


@router.post("/movimientos")
def crear_movimiento(body: NuevoMovimiento, user: User = Depends(editar), db: Session = Depends(get_db)):
    cats = {"ingreso": CATEGORIAS_INGRESO, "gasto": CATEGORIAS_GASTO}.get(body.tipo)
    if not cats or body.categoria not in cats:
        raise HTTPException(422, "Tipo o categoría no válidos")
    if body.moneda not in ("USD", "Bs"):
        raise HTTPException(422, "Moneda no válida (USD o Bs)")
    centavos = round(body.monto * 100)
    tasa = None
    if body.moneda == "Bs":
        tasa = body.tasa or _tasa(db)
        if not tasa:
            raise HTTPException(422, "Carga la tasa BCV del día o escribe la tasa para registrar montos en bolívares")
        usd = round(centavos / tasa)
    else:
        usd = centavos
    medio = db.get(MedioPago, body.medio_id) if body.medio_id else None
    if body.por_pagar and body.tipo != "gasto":
        raise HTTPException(422, "Solo un gasto puede quedar por pagar")
    if not body.por_pagar:
        _validar_pago(db, medio, body.cuenta_id, body.moneda, body.referencia)
    orden = body.orden.strip().upper()
    if body.tipo == "ingreso" and body.categoria in ("servicio", "inspeccion"):
        o = db.scalar(select(Orden).where(Orden.codigo == orden)) if orden else None
        if not o:
            raise HTTPException(422, "Los cobros de servicio e inspección llegan solos desde la caja. Para otro ingreso elige otra categoría.")
        if o.pagado_en:
            raise HTTPException(409, f"La orden {o.codigo} ya se cobró en la caja: ese ingreso ya está registrado.")
    m = MovimientoFinanciero(fecha=body.fecha.isoformat(), tipo=body.tipo, categoria=body.categoria, descripcion=body.descripcion.strip(),
                             monto_centavos=centavos, moneda=body.moneda, tasa=tasa, monto_usd_centavos=usd, medio_id=body.medio_id,
                             cuenta_id=body.cuenta_id, referencia=body.referencia.strip(), orden_codigo=body.orden.strip().upper(), creado_por=user.id,
                             beneficiario=body.beneficiario.strip(), estado="por_pagar" if body.por_pagar else "registrado")
    db.add(m)
    db.commit()
    medios, cuentas = _mapas(db)
    return _vista_mov(m, medios, cuentas)


def _validar_pago(db: Session, medio: MedioPago | None, cuenta_id: int | None, moneda: str, referencia: str) -> None:
    """Reglas de todo pago a mano: tipo de pago, referencia si no es efectivo y cuenta de la misma moneda."""
    if not medio:
        raise HTTPException(422, "Elige el tipo de pago")
    if medio.categoria != "efectivo" and not referencia.strip():
        raise HTTPException(422, "Escribe la referencia del pago (obligatoria si no es efectivo)")
    if cuenta_id:
        c = db.get(CuentaFinanciera, cuenta_id)
        if not c:
            raise HTTPException(422, "Cuenta no encontrada")
        if c.moneda != moneda:
            raise HTTPException(422, f"La cuenta {c.nombre} solo recibe pagos en {c.moneda}")


class EstadoMovimiento(BaseModel):
    estado: str
    motivo: str = Field(default="", max_length=200)


@router.put("/movimientos/{mid}")
def cambiar_movimiento(mid: int, body: EstadoMovimiento, user: User = Depends(editar), db: Session = Depends(get_db)):
    m = db.get(MovimientoFinanciero, mid)
    if not m:
        raise HTTPException(404, "Movimiento no encontrado")
    if body.estado not in ("registrado", "conciliado", "anulado"):
        raise HTTPException(422, "Estado no válido")
    if m.estado == "anulado":
        raise HTTPException(409, "Ese movimiento ya está anulado")
    if body.estado == "anulado":
        if len(body.motivo.strip()) < 3:
            raise HTTPException(422, "Escribe el motivo para anular")
        m.motivo_anulacion = body.motivo.strip()
    m.estado = body.estado
    db.commit()
    medios, cuentas = _mapas(db)
    return _vista_mov(m, medios, cuentas)


# ---------- Reclamos ----------
def _vista_reclamo(r: ReclamoFinanciero, medios: dict) -> dict:
    return {"id": r.id, "codigo": f"RF-{r.id:04d}", "cliente": r.cliente, "orden": r.orden_codigo, "motivo": r.motivo, "monto_usd": _d(r.monto_centavos),
            "estado": r.estado, "estado_texto": ESTADOS_RECLAMO.get(r.estado, r.estado), "resolucion": r.resolucion, "medio": medios.get(r.medio_id),
            "creado": r.creado.isoformat() + "Z", "resuelto_en": r.resuelto_en.isoformat() + "Z" if r.resuelto_en else None}


@router.get("/reclamos")
def reclamos(user: User = Depends(ver), db: Session = Depends(get_db)):
    medios, _ = _mapas(db)
    return [_vista_reclamo(r, medios) for r in db.scalars(select(ReclamoFinanciero).order_by(ReclamoFinanciero.id.desc()))]


class NuevoReclamo(BaseModel):
    cliente: str = Field(min_length=2, max_length=120)
    orden: str = Field(default="", max_length=20)
    motivo: str = Field(min_length=3, max_length=300)
    monto: float = Field(default=0, ge=0, le=1_000_000)


def _tope_reclamo(db: Session, codigo: str, centavos: int) -> None:
    o = db.scalar(select(Orden).where(Orden.codigo == codigo)) if codigo else None
    if o and o.pagado_en:
        pagado = o.monto_instalacion_centavos + o.inspeccion_centavos
        if centavos > pagado:
            raise HTTPException(422, f"El reclamo no puede superar lo pagado en la orden {o.codigo} (${pagado / 100:.2f})")


@router.post("/reclamos")
def crear_reclamo(body: NuevoReclamo, user: User = Depends(editar), db: Session = Depends(get_db)):
    _tope_reclamo(db, body.orden.strip().upper(), round(body.monto * 100))
    r = ReclamoFinanciero(cliente=body.cliente.strip(), orden_codigo=body.orden.strip().upper(), motivo=body.motivo.strip(),
                          monto_centavos=round(body.monto * 100), creado_por=user.id)
    db.add(r)
    db.commit()
    return _vista_reclamo(r, _mapas(db)[0])


class ResolverReclamo(BaseModel):
    estado: str
    resolucion: str = Field(default="", max_length=300)
    medio_id: int | None = None
    cuenta_id: int | None = None
    referencia: str = Field(default="", max_length=80)


@router.put("/reclamos/{rid}")
def resolver_reclamo(rid: int, body: ResolverReclamo, user: User = Depends(editar), db: Session = Depends(get_db)):
    r = db.get(ReclamoFinanciero, rid)
    if not r:
        raise HTTPException(404, "Reclamo no encontrado")
    if body.estado not in ESTADOS_RECLAMO:
        raise HTTPException(422, "Estado no válido")
    if r.estado == "reembolsado":
        raise HTTPException(409, "Este reclamo ya se reembolsó: no se reabre ni se paga de nuevo")
    if body.estado == "reembolsado" and r.monto_centavos:
        _tope_reclamo(db, r.orden_codigo, r.monto_centavos)
        _validar_pago(db, db.get(MedioPago, body.medio_id) if body.medio_id else None, body.cuenta_id, "USD", body.referencia)
        # El reembolso queda como gasto en la contabilidad
        db.add(MovimientoFinanciero(fecha=dia_caracas(), tipo="gasto", categoria="reembolsos", descripcion=f"Reembolso RF-{r.id:04d} · {r.cliente}",
                                    monto_centavos=r.monto_centavos, moneda="USD", monto_usd_centavos=r.monto_centavos, medio_id=body.medio_id,
                                    cuenta_id=body.cuenta_id, referencia=body.referencia.strip(), orden_codigo=r.orden_codigo, creado_por=user.id))
    r.estado, r.resolucion, r.medio_id = body.estado, body.resolucion.strip(), body.medio_id or r.medio_id
    r.resuelto_en = ahora() if body.estado in ("reembolsado", "rechazado") else None
    db.commit()
    return _vista_reclamo(r, _mapas(db)[0])


# ---------- Bancos y cuentas ----------
class DatosCuenta(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    categoria: str
    banco: str = Field(default="", max_length=80)
    moneda: str = "Bs"
    titular: str = Field(default="", max_length=120)
    identificador: str = Field(default="", max_length=80)
    saldo_inicial: float = Field(default=0, ge=-10_000_000, le=10_000_000)
    activo: bool = True


def _validar_cuenta(body: DatosCuenta) -> None:
    if body.categoria not in CATEGORIAS_MEDIO:
        raise HTTPException(422, "Tipo de cuenta no válido")
    if body.moneda not in ("USD", "Bs"):
        raise HTTPException(422, "Moneda no válida (USD o Bs)")


@router.get("/cuentas")
def cuentas(user: User = Depends(ver), db: Session = Depends(get_db)):
    return resumen(dias=3650, user=user, db=db)["cuentas"] + [_vista_cuenta(c) for c in db.scalars(select(CuentaFinanciera).where(CuentaFinanciera.activo.is_(False)))]


@router.post("/cuentas")
def crear_cuenta(body: DatosCuenta, user: User = Depends(editar), db: Session = Depends(get_db)):
    _validar_cuenta(body)
    c = CuentaFinanciera(nombre=body.nombre.strip(), categoria=body.categoria, banco=body.banco.strip(), moneda=body.moneda, titular=body.titular.strip(),
                         identificador=body.identificador.strip(), saldo_inicial_centavos=round(body.saldo_inicial * 100), activo=body.activo)
    db.add(c)
    db.commit()
    return _vista_cuenta(c, c.saldo_inicial_centavos)


@router.put("/cuentas/{cid}")
def editar_cuenta(cid: int, body: DatosCuenta, user: User = Depends(editar), db: Session = Depends(get_db)):
    _validar_cuenta(body)
    c = db.get(CuentaFinanciera, cid)
    if not c:
        raise HTTPException(404, "Cuenta no encontrada")
    c.nombre, c.categoria, c.banco, c.moneda, c.titular = body.nombre.strip(), body.categoria, body.banco.strip(), body.moneda, body.titular.strip()
    if body.identificador and not body.identificador.startswith("••••"):
        c.identificador = body.identificador.strip()
    c.saldo_inicial_centavos, c.activo = round(body.saldo_inicial * 100), body.activo
    db.commit()
    return _vista_cuenta(c)


# ---------- Tipos de pago ----------
class DatosMedio(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    categoria: str = "otro"
    moneda: str = "USD"
    activo: bool = True


@router.get("/medios")
def medios(user: User = Depends(ver), db: Session = Depends(get_db)):
    sembrar_medios(db)
    return [_vista_medio(m) for m in db.scalars(select(MedioPago).order_by(MedioPago.id))]


@router.post("/medios")
def crear_medio(body: DatosMedio, user: User = Depends(editar), db: Session = Depends(get_db)):
    if body.categoria not in CATEGORIAS_MEDIO or body.moneda not in ("USD", "Bs"):
        raise HTTPException(422, "Categoría o moneda no válidas")
    if db.scalar(select(MedioPago).where(MedioPago.nombre == body.nombre.strip())):
        raise HTTPException(409, "Ese tipo de pago ya existe")
    m = MedioPago(nombre=body.nombre.strip(), categoria=body.categoria, moneda=body.moneda, activo=body.activo)
    db.add(m)
    db.commit()
    return _vista_medio(m)


@router.put("/medios/{mid}")
def editar_medio(mid: int, body: DatosMedio, user: User = Depends(editar), db: Session = Depends(get_db)):
    m = db.get(MedioPago, mid)
    if not m:
        raise HTTPException(404, "Tipo de pago no encontrado")
    if body.categoria not in CATEGORIAS_MEDIO or body.moneda not in ("USD", "Bs"):
        raise HTTPException(422, "Categoría o moneda no válidas")
    if m.clave_caja:  # los de la caja conservan su categoría y moneda; solo se pueden renombrar o pausar
        m.nombre, m.activo = body.nombre.strip(), body.activo
    else:
        m.nombre, m.categoria, m.moneda, m.activo = body.nombre.strip(), body.categoria, body.moneda, body.activo
    db.commit()
    return _vista_medio(m)
