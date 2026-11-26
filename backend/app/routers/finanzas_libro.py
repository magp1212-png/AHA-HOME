"""Finanzas (segunda parte): libro único de movimientos con conciliación, tablero del resumen por período,
pendientes por cobrar y por pagar, y cierre de caja por tienda.

El sistema no mueve dinero: deja constancia de lo que ya se pagó o se recibió. Solo cuenta lo confirmado.
Las propinas son de los técnicos: se muestran, pero no son ingreso ni gasto de AHA HOME.
"""
import datetime as dt
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (CATEGORIAS_GASTO, CATEGORIAS_INGRESO, CATEGORIAS_MEDIO, METODO_PAGO_TEXTO, CierreCaja, Conciliacion, CuentaFinanciera,
                      MedioPago, MovimientoFinanciero, Orden, Presupuesto, Tienda, User, ahora, dia_caracas, moneda_de)
from .finanzas import _d, _tasa, _validar_pago, editar, sembrar_medios, ver

router = APIRouter(prefix="/finanzas", tags=["finanzas"])

METODOS_CAJA = [("pago_movil", "Pago móvil", "Bs"), ("efectivo_bs", "Efectivo en bolívares", "Bs"), ("efectivo_usd", "Efectivo en dólares", "USD"),
                ("zelle", "Zelle", "USD"), ("punto_de_venta", "Punto de venta", "Bs")]


def _nombre_tec(o: Orden) -> str:
    return o.tecnico.user.nombre if o.tecnico and o.tecnico.user else "—"


def _fila(**k) -> dict:
    base = {"tienda": "Sin tienda", "orden": "", "cliente": "", "medio": "", "medio_cat": "otro", "referencia": "", "cuenta": "", "monto_bs": None,
            "estado": "confirmado", "conciliado": False, "propina": False, "mov_id": None, "detalle": ""}
    return base | k


def libro(db: Session) -> list[dict]:
    """Todos los ingresos y gastos, de cualquier origen, como filas comparables."""
    medios = {m.id: m for m in db.scalars(select(MedioPago))}
    por_clave = {m.clave_caja: m for m in medios.values() if m.clave_caja}
    cuentas = {c.id: c for c in db.scalars(select(CuentaFinanciera))}
    conc = {c.clave: c.conciliado for c in db.scalars(select(Conciliacion))}
    cat_medio = lambda metodo: (por_clave[metodo].categoria if metodo in por_clave else "otro")  # noqa: E731
    filas = []
    for o in db.scalars(select(Orden).where(Orden.pagado_en.is_not(None))):
        usd = o.monto_instalacion_centavos + o.inspeccion_centavos
        bs = round(usd * o.pago_tasa) if o.pago_tasa and (o.pago_moneda == "Bs" or moneda_de(o.pago_metodo) == "Bs") else None
        filas.append(_fila(clave=f"c{o.id}", origen="caja", fecha=dia_caracas(o.pagado_en), tipo="ingreso", concepto="Cobro en caja (servicio e inspección)",
                           categoria="servicio", detalle=f"Servicio USD {o.monto_instalacion_centavos / 100:.2f} + inspección USD {o.inspeccion_centavos / 100:.2f}",
                           orden=o.codigo, cliente=o.cliente_nombre, medio=METODO_PAGO_TEXTO.get(o.pago_metodo or "", "—"), medio_cat=cat_medio(o.pago_metodo),
                           metodo=o.pago_metodo, referencia=o.pago_referencia, usd=usd, monto_bs=bs, tienda=o.tienda.nombre if o.tienda else "Sin tienda",
                           conciliado=conc.get(f"c{o.id}", False)))
        if o.propina_centavos and o.propina_en:
            filas.append(_fila(clave=f"r{o.id}", origen="propina", fecha=dia_caracas(o.propina_en), tipo="ingreso", concepto="Propina recibida (es del técnico)",
                               categoria="propina", detalle=f"Para {_nombre_tec(o)}", orden=o.codigo, cliente=o.cliente_nombre,
                               medio=METODO_PAGO_TEXTO.get(o.propina_metodo or "", "—"), medio_cat=cat_medio(o.propina_metodo), referencia=o.propina_referencia,
                               usd=o.propina_centavos, propina=True, tienda=o.tienda.nombre if o.tienda else "Sin tienda", conciliado=conc.get(f"r{o.id}", False)))
            if o.propina_entregada_en:
                filas.append(_fila(clave=f"t{o.id}", origen="propina", fecha=dia_caracas(o.propina_entregada_en), tipo="gasto", concepto="Propina transferida al técnico",
                                   categoria="propina", detalle=o.tienda.nombre if o.tienda else "", orden=o.codigo, cliente=_nombre_tec(o), medio="—",
                                   usd=o.propina_centavos, propina=True, tienda=o.tienda.nombre if o.tienda else "Sin tienda", conciliado=conc.get(f"t{o.id}", False)))
        if o.penalidad_estado in ("pago_registrado", "pagada") and o.penalidad_centavos:
            filas.append(_fila(clave=f"n{o.id}", origen="penalidad", fecha=dia_caracas(o.penalidad_pagada_en or o.penalidad_en or o.creado), tipo="ingreso",
                               concepto="Penalidad por entrega fallida", categoria="penalidad", detalle=o.penalidad_motivo, orden=o.codigo, cliente=o.cliente_nombre,
                               medio=METODO_PAGO_TEXTO.get(o.penalidad_metodo or "", "—"), medio_cat=cat_medio(o.penalidad_metodo), referencia=o.penalidad_referencia,
                               usd=o.penalidad_centavos, estado="confirmado" if o.penalidad_estado == "pagada" else "por confirmar",
                               tienda=o.tienda.nombre if o.tienda else "Sin tienda", conciliado=conc.get(f"n{o.id}", False)))
    for p in db.scalars(select(Presupuesto).where(Presupuesto.pago_registrado_en.is_not(None))):
        o = p.orden
        usd = p.a_pagar_centavos
        bs = round(usd * p.pago_tasa) if p.pago_tasa and p.pago_moneda == "Bs" else None
        filas.append(_fila(clave=f"p{p.id}", origen="presupuesto", fecha=dia_caracas(p.pago_confirmado_en or p.pago_registrado_en), tipo="ingreso",
                           concepto="Pago de presupuesto", categoria="presupuesto", detalle=o.tienda.nombre if o.tienda else "", orden=o.codigo, cliente=o.cliente_nombre,
                           medio=METODO_PAGO_TEXTO.get(p.pago_metodo or "", "—"), medio_cat=cat_medio(p.pago_metodo), referencia=p.pago_referencia, usd=usd, monto_bs=bs,
                           estado="confirmado" if p.pago_confirmado_en else "por confirmar", tienda=o.tienda.nombre if o.tienda else "Sin tienda",
                           conciliado=conc.get(f"p{p.id}", False)))
        if p.materiales_pagados_en and not p.compra_cliente and p.materiales_centavos:
            filas.append(_fila(clave=f"m{p.id}", origen="materiales", fecha=dia_caracas(p.materiales_pagados_en), tipo="gasto", concepto="Materiales",
                               categoria="materiales", detalle=o.tienda.nombre if o.tienda else "", orden=o.codigo, cliente=p.tecnico.user.nombre if p.tecnico else "—",
                               medio="—", referencia=p.materiales_referencia, usd=p.materiales_centavos, tienda=o.tienda.nombre if o.tienda else "Sin tienda",
                               conciliado=conc.get(f"m{p.id}", False)))
    for m in db.scalars(select(MovimientoFinanciero)):
        cats = CATEGORIAS_INGRESO if m.tipo == "ingreso" else CATEGORIAS_GASTO
        md, ct = medios.get(m.medio_id), cuentas.get(m.cuenta_id)
        estado = {"anulado": "anulado", "por_pagar": "por pagar"}.get(m.estado, "confirmado")
        filas.append(_fila(clave=f"v{m.id}", origen="manual", mov_id=m.id, fecha=m.fecha, tipo=m.tipo, concepto=cats.get(m.categoria, m.categoria), categoria=m.categoria,
                           detalle=m.descripcion, orden=m.orden_codigo, cliente=m.beneficiario, medio=md.nombre if md else "—", medio_cat=md.categoria if md else "otro",
                           referencia=m.referencia, cuenta=ct.nombre if ct else "", usd=m.monto_usd_centavos, monto_bs=m.monto_centavos if m.moneda == "Bs" else None,
                           estado=estado, conciliado=m.conciliado or m.estado == "conciliado", motivo_anulacion=m.motivo_anulacion))
    filas.sort(key=lambda f: (f["fecha"], f["clave"]), reverse=True)
    return filas


def _vista(f: dict) -> dict:
    return {k: v for k, v in f.items() if k != "usd"} | {"monto_usd": _d(f["usd"]), "monto_bs": _d(f["monto_bs"]) if f["monto_bs"] is not None else None}


def _cuenta(f: dict) -> bool:
    """¿Suma en los totales? Solo lo confirmado, sin propinas ni anulados."""
    return f["estado"] == "confirmado" and not f["propina"]


def _rango(desde: str | None, hasta: str | None, dias: int = 30) -> tuple[str, str]:
    hoy = dia_caracas()
    hasta = hasta or hoy
    desde = desde or (dt.date.fromisoformat(hasta) - dt.timedelta(days=dias - 1)).isoformat()
    if desde > hasta:
        raise HTTPException(422, "La fecha «Desde» no puede ser posterior a «Hasta»")
    return desde, hasta


@router.get("/libro")
def ver_libro(desde: str | None = None, hasta: str | None = None, user: User = Depends(ver), db: Session = Depends(get_db)):
    sembrar_medios(db)
    desde, hasta = _rango(desde, hasta)
    filas = [f for f in libro(db) if desde <= f["fecha"] <= hasta]
    return {"desde": desde, "hasta": hasta, "filas": [_vista(f) for f in filas],
            "conceptos": sorted({f["concepto"] for f in filas}), "medios": sorted({f["medio"] for f in filas}), "tiendas": sorted({f["tienda"] for f in filas})}


class Conciliar(BaseModel):
    clave: str = Field(max_length=30)
    conciliado: bool


@router.post("/conciliar")
def conciliar(body: Conciliar, user: User = Depends(editar), db: Session = Depends(get_db)):
    if body.clave.startswith("v"):
        m = db.get(MovimientoFinanciero, int(body.clave[1:]))
        if not m:
            raise HTTPException(404, "Movimiento no encontrado")
        if m.estado in ("anulado", "por_pagar"):
            raise HTTPException(409, "Solo se concilia lo que ya se pagó")
        m.conciliado = body.conciliado
        if m.estado == "conciliado" and not body.conciliado:
            m.estado = "registrado"
    else:
        c = db.get(Conciliacion, body.clave) or Conciliacion(clave=body.clave)
        c.conciliado, c.por, c.en = body.conciliado, user.id, ahora()
        db.add(c)
    db.commit()
    return {"ok": True}


def _pendientes(db: Session) -> dict:
    hoy = dt.date.fromisoformat(dia_caracas())
    dias = lambda t: (hoy - dt.date.fromisoformat(dia_caracas(t))).days if t else 0  # noqa: E731
    confirmar, cobrar, pagar = [], [], []
    for p in db.scalars(select(Presupuesto).where(Presupuesto.estado.in_(("aprobado", "pago_registrado", "pagado")))):
        o = p.orden
        if p.estado == "pago_registrado":
            confirmar.append({"concepto": "Pago de presupuesto", "orden": o.codigo, "cliente": o.cliente_nombre,
                              "pago": f"{METODO_PAGO_TEXTO.get(p.pago_metodo or '', '—')} · {p.pago_referencia}", "dias": dias(p.pago_registrado_en), "monto_usd": _d(p.a_pagar_centavos)})
        elif p.estado == "aprobado":
            cobrar.append({"concepto": "Presupuesto aprobado sin pagar", "orden": o.codigo, "cliente": o.cliente_nombre, "dias": dias(p.admin_aprobo_en or p.creado),
                           "monto_usd": _d(p.a_pagar_centavos), "_c": p.a_pagar_centavos})
        if p.estado == "pagado" and not p.compra_cliente and p.materiales_centavos:
            pagar.append({"clave": f"m{p.id}", "concepto": "Materiales del presupuesto", "orden": o.codigo, "quien": p.tecnico.user.nombre if p.tecnico else "—",
                          "dias": dias(p.pago_confirmado_en or p.pago_registrado_en), "monto_usd": _d(p.materiales_centavos), "_c": p.materiales_centavos})
    for o in db.scalars(select(Orden).where(Orden.penalidad_estado.in_(("pendiente", "pago_registrado")))):
        if o.penalidad_estado == "pago_registrado":
            confirmar.append({"concepto": "Penalidad por entrega fallida", "orden": o.codigo, "cliente": o.cliente_nombre,
                              "pago": f"{METODO_PAGO_TEXTO.get(o.penalidad_metodo or '', '—')} · {o.penalidad_referencia}", "dias": dias(o.penalidad_en), "monto_usd": _d(o.penalidad_centavos)})
        elif o.penalidad_centavos:
            cobrar.append({"concepto": "Penalidad por entrega fallida", "orden": o.codigo, "cliente": o.cliente_nombre, "dias": dias(o.penalidad_en),
                           "monto_usd": _d(o.penalidad_centavos), "_c": o.penalidad_centavos})
    for o in db.scalars(select(Orden).where(Orden.propina_en.is_not(None), Orden.propina_entregada_en.is_(None), Orden.propina_centavos > 0)):
        pagar.append({"clave": f"t{o.id}", "concepto": "Propina por transferir", "orden": o.codigo, "quien": _nombre_tec(o), "dias": dias(o.propina_en),
                      "monto_usd": _d(o.propina_centavos), "_c": o.propina_centavos, "propina": True})
    reembolsadas = {m.orden_codigo for m in db.scalars(select(MovimientoFinanciero).where(MovimientoFinanciero.categoria == "reembolsos")) if m.orden_codigo}
    for o in db.scalars(select(Orden).where(Orden.estado == "cancelado", Orden.pagado_en.is_not(None))):
        if o.codigo not in reembolsadas:
            pagar.append({"clave": f"c{o.id}", "concepto": "Reembolso por orden cancelada", "orden": o.codigo, "quien": o.cliente_nombre,
                          "dias": dias(o.pagado_en), "monto_usd": _d(o.monto_instalacion_centavos), "_c": o.monto_instalacion_centavos})  # sin la inspección
    for m in db.scalars(select(MovimientoFinanciero).where(MovimientoFinanciero.estado == "por_pagar")):
        pagar.append({"clave": f"v{m.id}", "concepto": CATEGORIAS_GASTO.get(m.categoria, m.categoria), "orden": m.orden_codigo or "—", "quien": m.beneficiario or "—",
                      "dias": (hoy - dt.date.fromisoformat(m.fecha)).days, "monto_usd": _d(m.monto_usd_centavos), "_c": m.monto_usd_centavos})
    for lista in (confirmar, cobrar, pagar):
        lista.sort(key=lambda x: -x["dias"])
    return {"confirmar": confirmar, "cobrar": cobrar, "pagar": pagar}


@router.get("/pendientes")
def pendientes(user: User = Depends(ver), db: Session = Depends(get_db)):
    p = _pendientes(db)
    tot = lambda lista: _d(sum(x.get("_c", round(float(x["monto_usd"]) * 100)) for x in lista))  # noqa: E731
    limpio = lambda lista: [{k: v for k, v in x.items() if not k.startswith("_")} for x in lista]  # noqa: E731
    return {"confirmar": limpio(p["confirmar"]), "confirmar_total": tot(p["confirmar"]), "cobrar": limpio(p["cobrar"]), "cobrar_total": tot(p["cobrar"]),
            "pagar": limpio(p["pagar"]), "pagar_total": tot(p["pagar"])}


class PagarPendiente(BaseModel):
    clave: str = Field(max_length=30)
    medio_id: int | None = None
    cuenta_id: int | None = None
    referencia: str = Field(default="", max_length=80)


@router.post("/pendientes/pagar")
def pagar_pendiente(body: PagarPendiente, user: User = Depends(editar), db: Session = Depends(get_db)):
    """Deja constancia de un pago que ya se hizo: propina, materiales, reembolso o gasto por pagar."""
    medio = db.get(MedioPago, body.medio_id) if body.medio_id else None
    _validar_pago(db, medio, body.cuenta_id, medio.moneda if medio else "USD", body.referencia)
    tipo, num = body.clave[:1], int(body.clave[1:])
    ref = body.referencia.strip()
    if tipo == "t":
        o = db.get(Orden, num)
        if not o or not o.propina_en or o.propina_entregada_en:
            raise HTTPException(409, "No hay una propina por transferir en esta orden")
        o.propina_entregada_en, o.propina_referencia = ahora(), o.propina_referencia or ref
        from .. import ordenes as svc
        svc.registrar(db, o, o.estado, user, f"Propina transferida al técnico (ref. {ref or medio.nombre})")
    elif tipo == "m":
        p = db.get(Presupuesto, num)
        if not p or p.estado != "pagado":
            raise HTTPException(409, "Este presupuesto no está esperando el pago de materiales")
        from .presupuestos import _listo
        p.estado, p.materiales_pagados_en, p.materiales_referencia = "materiales_pagados", ahora(), ref or medio.nombre
        _listo(db, p, user)
    elif tipo == "c":
        o = db.get(Orden, num)
        if not o or o.estado != "cancelado" or not o.pagado_en:
            raise HTTPException(409, "Esta orden no tiene un reembolso pendiente")
        usd = o.monto_instalacion_centavos  # el reembolso es del servicio; la inspección no se devuelve
        db.add(MovimientoFinanciero(fecha=dia_caracas(), tipo="gasto", categoria="reembolsos", descripcion=f"Reembolso por orden cancelada {o.codigo}",
                                    monto_centavos=usd, moneda="USD", monto_usd_centavos=usd, medio_id=medio.id, cuenta_id=body.cuenta_id, referencia=ref,
                                    orden_codigo=o.codigo, beneficiario=o.cliente_nombre, creado_por=user.id))
    elif tipo == "v":
        m = db.get(MovimientoFinanciero, num)
        if not m or m.estado != "por_pagar":
            raise HTTPException(409, "Este gasto no está por pagar")
        if body.cuenta_id and db.get(CuentaFinanciera, body.cuenta_id).moneda != m.moneda:
            raise HTTPException(422, f"Esa cuenta no recibe pagos en {m.moneda}")
        m.estado, m.medio_id, m.cuenta_id, m.referencia, m.fecha = "registrado", medio.id, body.cuenta_id, ref, dia_caracas()
    else:
        raise HTTPException(422, "Pendiente no reconocido")
    db.commit()
    return {"ok": True}


@router.get("/tablero")
def tablero(desde: str | None = None, hasta: str | None = None, user: User = Depends(ver), db: Session = Depends(get_db)):
    """Todo el resumen de Finanzas para un período, comparado con el período anterior del mismo largo."""
    sembrar_medios(db)
    desde, hasta = _rango(desde, hasta)
    d0, d1 = dt.date.fromisoformat(desde), dt.date.fromisoformat(hasta)
    n = (d1 - d0).days + 1
    pdesde, phasta = (d0 - dt.timedelta(days=n)).isoformat(), (d0 - dt.timedelta(days=1)).isoformat()
    todas = libro(db)
    filas = [f for f in todas if desde <= f["fecha"] <= hasta and _cuenta(f)]
    previas = [f for f in todas if pdesde <= f["fecha"] <= phasta and _cuenta(f)]
    suma = lambda fs, t: sum(f["usd"] for f in fs if f["tipo"] == t)  # noqa: E731
    ing, gas, ping, pgas = suma(filas, "ingreso"), suma(filas, "gasto"), suma(previas, "ingreso"), suma(previas, "gasto")
    var = lambda a, b: round((a - b) * 100 / b, 2) if b else None  # noqa: E731
    dias = [(d0 + dt.timedelta(days=i)).isoformat() for i in range(n)]
    si, sg = defaultdict(int), defaultdict(int)
    for f in filas:
        (si if f["tipo"] == "ingreso" else sg)[f["fecha"]] += f["usd"]
    ingresos = [f for f in filas if f["tipo"] == "ingreso"]
    por_cat, por_concepto, por_tienda, por_metodo = defaultdict(int), defaultdict(int), defaultdict(int), {}
    for f in ingresos:
        por_cat[f["medio_cat"]] += f["usd"]
        por_concepto[f["concepto"]] += f["usd"]
        por_tienda[f["tienda"]] += f["usd"]
        m = por_metodo.setdefault(f["medio"], {"metodo": f["medio"], "cobros": 0, "usd": 0, "bs": 0})
        m["cobros"] += 1
        m["usd"] += f["usd"]
        m["bs"] += f["monto_bs"] or 0
    por_gasto = defaultdict(int)
    for f in filas:
        if f["tipo"] == "gasto":
            por_gasto[f["concepto"]] += f["usd"]
    usd_directo = sum(f["usd"] for f in ingresos if f["monto_bs"] is None)
    pen = _pendientes(db)
    propinas_por_pagar = sum(x["_c"] for x in pen["pagar"] if x.get("propina"))
    sin_conciliar = [f for f in todas if f["estado"] == "confirmado" and not f["conciliado"] and not f["propina"] and desde <= f["fecha"] <= hasta]
    cuentas = []
    saldos = defaultdict(int)
    for m in db.scalars(select(MovimientoFinanciero).where(MovimientoFinanciero.estado.in_(("registrado", "conciliado")), MovimientoFinanciero.cuenta_id.is_not(None))):
        saldos[m.cuenta_id] += m.monto_centavos if m.tipo == "ingreso" else -m.monto_centavos
    for c in db.scalars(select(CuentaFinanciera).where(CuentaFinanciera.activo.is_(True))):
        ident = c.identificador or ""
        cuentas.append({"id": c.id, "nombre": c.nombre, "categoria": c.categoria, "categoria_texto": CATEGORIAS_MEDIO.get(c.categoria, c.categoria), "moneda": c.moneda,
                        "identificador": ident if "@" in ident or len(ident) <= 4 else "•••• " + ident[-4:], "saldo": _d(c.saldo_inicial_centavos + saldos[c.id])})
    ordenar = lambda dd: [{"nombre": k, "usd": _d(v)} for k, v in sorted(dd.items(), key=lambda x: -x[1]) if v]  # noqa: E731
    from ..models import ReclamoFinanciero
    abiertos = [r for r in db.scalars(select(ReclamoFinanciero)) if r.estado in ("abierto", "en_revision")]
    return {
        "desde": desde, "hasta": hasta, "dias": n,
        "ingresos_usd": _d(ing), "gastos_usd": _d(gas), "resultado_usd": _d(ing - gas),
        "var_ingresos": var(ing, ping), "var_gastos": var(gas, pgas), "var_resultado": var(ing - gas, ping - pgas),
        "margen": round((ing - gas) * 100 / ing) if ing else None, "tasa": _tasa(db),
        "reclamos_abiertos": len(abiertos), "reclamos_monto_usd": _d(sum(r.monto_centavos for r in abiertos)),
        "por_cobrar_usd": _d(sum(x["_c"] for x in pen["cobrar"])), "por_cobrar_n": len(pen["cobrar"]), "por_confirmar_n": len(pen["confirmar"]),
        "por_confirmar_usd": _d(sum(round(float(x["monto_usd"]) * 100) for x in pen["confirmar"])),
        "por_pagar_usd": _d(sum(x["_c"] for x in pen["pagar"])), "por_pagar_n": len(pen["pagar"]), "propinas_por_pagar_usd": _d(propinas_por_pagar),
        "sin_conciliar": len(sin_conciliar),
        "serie_ingresos": [si[d] / 100 for d in dias], "serie_gastos": [sg[d] / 100 for d in dias],
        "por_tipo_pago": [{"categoria": k, "nombre": CATEGORIAS_MEDIO.get(k, "Otro"), "usd": _d(por_cat.get(k, 0)),
                           "pct": round(por_cat.get(k, 0) * 100 / ing) if ing else 0} for k in ("zelle", "efectivo", "banco_nacional", "banco_internacional", "otro")],
        "por_concepto": ordenar(por_concepto), "por_gasto": ordenar(por_gasto), "por_tienda": ordenar(por_tienda),
        "por_metodo": [{"metodo": m["metodo"], "cobros": m["cobros"], "usd": _d(m["usd"]), "bs": _d(m["bs"]) if m["bs"] else None}
                       for m in sorted(por_metodo.values(), key=lambda x: -x["usd"])],
        "metodo_usd": _d(usd_directo), "metodo_bs": _d(ing - usd_directo), "cuentas": cuentas,
    }


# ---------- Cierre de caja ----------

def _sistema(db: Session, tienda_id: int, dia: str) -> list[dict]:
    filas = {k: {"metodo": k, "texto": t, "moneda": mon, "cobros": 0, "sistema": 0} for k, t, mon in METODOS_CAJA}
    for o in db.scalars(select(Orden).where(Orden.tienda_id == tienda_id, Orden.pagado_en.is_not(None))):
        if dia_caracas(o.pagado_en) != dia or o.pago_metodo not in filas:
            continue
        f = filas[o.pago_metodo]
        usd = o.monto_instalacion_centavos + o.inspeccion_centavos
        f["cobros"] += 1
        f["sistema"] += round(usd * o.pago_tasa) if f["moneda"] == "Bs" and o.pago_tasa else usd
    return list(filas.values())


def _vista_cierre(db: Session, c: CierreCaja) -> dict:
    t, u = db.get(Tienda, c.tienda_id), db.get(User, c.cerrado_por) if c.cerrado_por else None
    difs = [f"{x['texto']}: {'+' if x['diferencia'] > 0 else '−'}{'Bs ' if x['moneda'] == 'Bs' else '$'}{abs(x['diferencia']) / 100:.2f}" for x in c.detalle if x["diferencia"]]
    return {"id": c.id, "dia": c.dia, "tienda": t.nombre if t else "—", "tienda_id": c.tienda_id, "cuadra": c.cuadra, "diferencias": difs, "nota": c.nota,
            "abierto": c.abierto, "cerrado_por": u.nombre if u else "—", "cerrado_en": c.cerrado_en.isoformat() + "Z",
            "detalle": [x | {"sistema": _d(x["sistema"]), "contado": _d(x["contado"]), "diferencia": _d(x["diferencia"])} for x in c.detalle]}


@router.get("/cierre")
def ver_cierre(tienda_id: int, dia: str | None = None, user: User = Depends(ver), db: Session = Depends(get_db)):
    dia = dia or dia_caracas()
    cerrado = db.scalar(select(CierreCaja).where(CierreCaja.tienda_id == tienda_id, CierreCaja.dia == dia, CierreCaja.abierto.is_(False)))
    return {"dia": dia, "tienda_id": tienda_id, "metodos": [x | {"sistema": _d(x["sistema"])} for x in _sistema(db, tienda_id, dia)],
            "cerrado": _vista_cierre(db, cerrado) if cerrado else None,
            "tiendas": [{"id": t.id, "nombre": t.nombre} for t in db.scalars(select(Tienda).order_by(Tienda.id))]}


class Cierre(BaseModel):
    tienda_id: int
    dia: dt.date
    contado: dict[str, float]
    nota: str = Field(default="", max_length=300)


@router.post("/cierres")
def cerrar_caja(body: Cierre, user: User = Depends(editar), db: Session = Depends(get_db)):
    if not db.get(Tienda, body.tienda_id):
        raise HTTPException(404, "Tienda no encontrada")
    dia = body.dia.isoformat()
    if dia > dia_caracas():
        raise HTTPException(422, "No se puede cerrar la caja de un día que todavía no llega")
    if db.scalar(select(CierreCaja).where(CierreCaja.tienda_id == body.tienda_id, CierreCaja.dia == dia, CierreCaja.abierto.is_(False))):
        raise HTTPException(409, "La caja de ese día ya está cerrada. Reábrela para volver a cerrarla.")
    detalle = []
    for x in _sistema(db, body.tienda_id, dia):
        contado = round(float(body.contado.get(x["metodo"], 0) or 0) * 100)
        detalle.append(x | {"contado": contado, "diferencia": contado - x["sistema"]})
    cuadra = all(x["diferencia"] == 0 for x in detalle)
    if not cuadra and len(body.nota.strip()) < 3:
        raise HTTPException(422, "Hay diferencias: escribe una nota que las explique")
    for viejo in db.scalars(select(CierreCaja).where(CierreCaja.tienda_id == body.tienda_id, CierreCaja.dia == dia)):
        db.delete(viejo)
    c = CierreCaja(tienda_id=body.tienda_id, dia=dia, detalle=detalle, cuadra=cuadra, nota=body.nota.strip(), cerrado_por=user.id)
    db.add(c)
    db.commit()
    return _vista_cierre(db, c)


@router.get("/cierres")
def cierres(user: User = Depends(ver), db: Session = Depends(get_db)):
    return [_vista_cierre(db, c) for c in db.scalars(select(CierreCaja).order_by(CierreCaja.dia.desc(), CierreCaja.id.desc()).limit(60))]


@router.post("/cierres/{cid}/reabrir")
def reabrir(cid: int, user: User = Depends(editar), db: Session = Depends(get_db)):
    c = db.get(CierreCaja, cid)
    if not c:
        raise HTTPException(404, "Cierre no encontrado")
    c.abierto = True
    db.commit()
    return _vista_cierre(db, c)
