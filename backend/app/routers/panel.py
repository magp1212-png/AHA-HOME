"""Panel del superadministrador (web, /panel): indicadores con período y tablas de usuarios, órdenes y soporte.

Modelo tomado del panel de AHA VOY: tarjetas con selector de días (total, % contra el período anterior y serie
diaria), donas por servicio, y tablas con buscador, orden por columna y filtro por estado.
"""
import datetime as dt
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import codigos
from .. import ordenes as svc
from ..db import get_db
from ..deps import exigir_permiso, permisos_de, require
from ..models import (ESTADO_TEXTO, METODO_PAGO_TEXTO, TIPO_EQUIPO_TEXTO, TIPO_SERVICIO_TEXTO, Articulo, Incidencia, Orden, Presupuesto,
                      SoporteMensaje, Tecnico, Tienda, User, ahora, documentos_pendientes)

router = APIRouter(prefix="/panel-api", tags=["panel"])
panel = require("supervisor")  # supervisor y superadmin (el superadmin pasa siempre)
ROL_TEXTO = {"cliente": "Cliente", "tecnico": "Técnico", "ayudante": "Ayudante", "agente": "Caja", "tecnico_supervisor": "Técnico supervisor",
             "supervisor": "Centro de control", "superadmin": "Superadmin"}


def _iso(x):
    return x.isoformat() + "Z" if x else None


def _fecha(x):
    return x.date().isoformat() if x else None


def _serie(fechas: list[dt.datetime], desde: dt.datetime, dias: int) -> list[int]:
    c = Counter(f.date() for f in fechas if f and f >= desde)
    return [c.get((desde + dt.timedelta(days=i)).date(), 0) for i in range(dias)]


def _pct(actual: int, previo: int) -> float | None:
    if not previo:
        return None if not actual else 100.0
    return round((actual - previo) * 100 / previo, 2)


@router.get("/resumen")
def resumen(dias: int = 30, user: User = Depends(panel), db: Session = Depends(get_db)):
    """Indicadores del panel principal para un período (7, 30, 90… días)."""
    exigir_permiso(user, "ver_tablero")
    dias = max(1, min(dias, 365))
    hoy = ahora().replace(hour=0, minute=0, second=0, microsecond=0) + dt.timedelta(days=1)
    desde, previo = hoy - dt.timedelta(days=dias), hoy - dt.timedelta(days=2 * dias)
    us = db.scalars(select(User)).all()
    tecs = db.scalars(select(Tecnico)).all()
    ords = db.scalars(select(Orden)).all()
    pres = db.scalars(select(Presupuesto)).all()

    def bloque(fechas, total):
        act = sum(1 for f in fechas if f and f >= desde)
        ant = sum(1 for f in fechas if f and previo <= f < desde)
        return {"total": total, "nuevos": act, "pct": _pct(act, ant), "serie": _serie(fechas, desde, dias)}

    clientes = [u for u in us if u.rol == "cliente"]
    cobros = [(o.pagado_en, o.monto_instalacion_centavos + o.inspeccion_centavos, o.pago_moneda) for o in ords if o.pagado_en]
    pagos_pres = [(p.pago_confirmado_en, p.a_pagar_centavos, p.pago_moneda) for p in pres if p.pago_confirmado_en]

    def dinero(lista):
        act = [x for x in lista if x[0] >= desde]
        ant = [x for x in lista if previo <= x[0] < desde]
        usd = sum(x[1] for x in act)
        bs = sum(x[1] for x in act if x[2] == "Bs")
        return {"usd": svc.dinero(usd), "pct": _pct(usd, sum(x[1] for x in ant)), "pct_bs": round(bs * 100 / usd) if usd else 0,
                "serie": [sum(x[1] for x in act if x[0].date() == (desde + dt.timedelta(days=i)).date()) / 100 for i in range(dias)]}

    en_periodo = [o for o in ords if o.creado >= desde]
    from .presupuestos import info_pausa
    arts = [a for o in en_periodo for a in o.articulos]
    califs = [o.calificacion for o in ords if o.calificacion]
    return {
        "dias": dias,
        "clientes": bloque([u.creado for u in clientes], len(clientes)),
        "tecnicos": bloque([t.user.creado for t in tecs], len(tecs)),
        "tecnicos_validados": {"total": sum(1 for t in tecs if t.verificado), "pct": _pct(sum(1 for t in tecs if t.alta_en and t.alta_en >= desde),
                                                                                         sum(1 for t in tecs if t.alta_en and previo <= t.alta_en < desde))},
        "empresas": {"total": db.query(Tienda).count()},
        "ordenes": bloque([o.creado for o in ords], len(ords)),
        "ordenes_por_servicio": dict(Counter(TIPO_SERVICIO_TEXTO.get(o.tipo_servicio, o.tipo_servicio) for o in en_periodo)),
        "ordenes_por_estado": dict(Counter(ESTADO_TEXTO.get(o.estado, o.estado) for o in en_periodo)),
        "articulos_por_equipo": dict(Counter(TIPO_EQUIPO_TEXTO.get(a.tipo, a.tipo) for a in arts)),
        "cobrado_en_caja": dinero(cobros),
        "pagos_de_presupuestos": dinero(pagos_pres),
        "calificacion": {"promedio": round(sum(califs) / len(califs), 2) if califs else None, "resenas": len(califs)},
        "dispositivos": {"total": sum(1 for u in us if u.push_token), "por_rol": dict(Counter(ROL_TEXTO.get(u.rol, u.rol) for u in us if u.push_token))},
        # ---- propio del negocio AHA HOME ----
        "ordenes_por_tienda": dict(Counter(o.tienda.nombre for o in en_periodo)),
        "inspecciones": {"pedidas": sum(1 for o in en_periodo if o.requiere_inspeccion),
                         "cobradas_usd": svc.dinero(sum(o.inspeccion_centavos for o in en_periodo) + sum(p.inspeccion_centavos for p in pres if p.pago_confirmado_en and p.pago_confirmado_en >= desde)),
                         "en_pausa": sum(1 for o in ords if info_pausa(o)["activa"])},
        "cumplimiento": _cumplimiento(en_periodo),
        "penalidades": {"cantidad": sum(1 for o in en_periodo if o.penalidad_estado), "cobradas_usd": svc.dinero(sum(o.penalidad_centavos or 0 for o in en_periodo if o.penalidad_estado == "pagada"))},
        "materiales_por_pagar": {"cantidad": sum(1 for p in pres if p.pago_confirmado_en and not p.compra_cliente and p.materiales_centavos and not p.materiales_pagados_en),
                                 "usd": svc.dinero(sum(p.materiales_centavos for p in pres if p.pago_confirmado_en and not p.compra_cliente and p.materiales_centavos and not p.materiales_pagados_en))},
        "residuos": {"retirados": sum(1 for o in en_periodo if o.tipo_servicio != "traslado" and o.retirar_residuos is not False),
                     "cliente_guarda": sum(1 for o in en_periodo if o.tipo_servicio != "traslado" and o.retirar_residuos is False)},
        "tasa": _tasa(db),
        "verificaciones_pendientes": sum(1 for t in tecs if not t.verificado and t.user.activo),
        "verif_tecnicos": sum(1 for t in tecs if not t.verificado and t.user.activo and _del_modulo(t, "tecnicos")),
        "verif_transportistas": sum(1 for t in tecs if not t.verificado and t.user.activo and _del_modulo(t, "transportistas")),
        "reportes_abiertos": db.query(Incidencia).filter(Incidencia.abierta.is_(True)).count(),
    }


def _cumplimiento(ords: list) -> dict:
    """Servicios cerrados, cancelados, entregas fallidas y % cerrados con acta de conformidad."""
    cerr = [o for o in ords if o.estado == "completado"]
    return {"completados": len(cerr), "cancelados": sum(1 for o in ords if o.estado == "cancelado"),
            "fallidos": sum(1 for o in ords if o.estado == "entrega_fallida" or o.penalidad_estado),
            "con_acta": round(sum(1 for o in cerr if (o.acta or {}).get("en")) * 100 / len(cerr)) if cerr else None,
            "aprobadas_por_cliente": sum(1 for o in ords if o.cliente_aprobo_en)}


def _tasa(db):
    from .tasa import tasa_vigente, vista_tasa
    return vista_tasa(tasa_vigente(db))


# ---------- Tablas ----------

def _tabla_clientes(db):
    cols = [("codigo", "Código"), ("creado", "Registrado el"), ("nombre", "Cliente"), ("telefono", "Teléfono"), ("email", "Correo"), ("ordenes", "Órdenes"), ("estado", "Estado")]
    n = Counter(o.cliente_id for o in db.scalars(select(Orden)))
    filas = [{"id": u.id, "codigo": codigos.cliente(u), "creado": _fecha(u.creado), "nombre": u.nombre, "telefono": u.telefono, "email": u.email, "ordenes": n.get(u.id, 0),
              "estado": "Activo" if u.activo else "Inactivo", "_acciones": ["activo"]}
             for u in db.scalars(select(User).where(User.rol == "cliente"))]
    return cols, filas


def _del_modulo(t: Tecnico, modulo: str) -> bool:
    """El ayudante va donde va su profesional."""
    base = t.jefe if t.es_ayudante and t.jefe else t
    return bool(base.conduce) if modulo == "transportistas" else bool(base.instala)


def _estado_prof(t: Tecnico) -> str:
    if t.retirado_en:
        return "Retirado del equipo"
    return "Validado" if t.verificado else "Pendiente" if t.user.activo else "Suspendido"


def _profesionales(modulo: str):
    def f(db):
        from .profesionales import estado_licencia
        conduce = modulo == "transportistas"
        cols = [("codigo", "Código"), ("creado", "Registrado el"), ("nombre", "Profesional"), ("rol", "Tipo"), ("cedula", "Cédula")]
        cols += [("vehiculo", "Vehículo"), ("grupo", "Grupo"), ("calificacion", "Calificación"), ("licencia", "Licencia"), ("estado", "Estado")] if conduce else \
                [("especialidades", "Especialidades"), ("grupo", "Grupo"), ("calificacion", "Calificación"), ("estado", "Estado")]
        cal: dict[int, list[int]] = {}
        for o in db.scalars(select(Orden).where(Orden.calificacion.is_not(None))):
            cal.setdefault(o.tecnico_id, []).append(o.calificacion)
        filas = []
        for t in db.scalars(select(Tecnico)):
            if not _del_modulo(t, modulo):
                continue
            c = cal.get(t.id)
            if t.es_ayudante:
                tipo = f"Ayudante de {t.jefe.user.nombre.split()[0]}" if t.jefe else "Ayudante"
            else:
                tipo = codigos.actividad_texto(t)
            fila = {"id": t.user.id, "tecnico_id": t.id, "codigo": codigos.profesional(t), "creado": _fecha(t.user.creado), "nombre": t.user.nombre, "rol": tipo,
                    "cedula": t.user.cedula, "tienda": t.tienda.nombre, "grupo": t.grupo or "—", "calificacion": round(sum(c) / len(c), 1) if c else None,
                    "estado": _estado_prof(t), "_acciones": ["perfil", "activo"]}
            if conduce:
                fila["vehiculo"] = " · ".join(x for x in (t.vehiculo_tipo, t.vehiculo_placa) if x) or "—"
                fila["licencia"] = estado_licencia(t)["texto"]
            else:
                fila["especialidades"] = ", ".join(t.especialidades or []) or "—"
            filas.append(fila)
        return cols, filas
    return f


_tabla_tecnicos = _profesionales("tecnicos")
_tabla_transportistas = _profesionales("transportistas")


def _tabla_empresas(db):
    cols = [("id", "N.º"), ("nombre", "Empresa / tienda"), ("zona", "Zona"), ("direccion", "Dirección"), ("ordenes", "Órdenes"), ("tecnicos", "Técnicos"), ("qr", "QR de tienda")]
    no = Counter(o.tienda_id for o in db.scalars(select(Orden)))
    nt = Counter(t.tienda_id for t in db.scalars(select(Tecnico)))
    return cols, [{"id": t.id, "nombre": t.nombre, "zona": t.zona, "direccion": t.direccion, "ordenes": no.get(t.id, 0), "tecnicos": nt.get(t.id, 0),
                   "qr": "Generado" if t.qr_token else "Sin QR"} for t in db.scalars(select(Tienda))]


def _equipo(roles):
    def f(db):
        cols = [("nombre", "Nombre"), ("rol", "Rol"), ("email", "Correo"), ("telefono", "Teléfono"), ("tienda", "Tienda"), ("ultimo_acceso", "Último acceso"), ("estado", "Estado")]
        tiendas = {t.id: t.nombre for t in db.scalars(select(Tienda))}
        return cols, [{"id": u.id, "nombre": u.nombre, "rol": "CEO" if u.es_ceo else ROL_TEXTO.get(u.rol, u.rol), "email": u.email, "telefono": u.telefono,
                       "tienda": tiendas.get(u.tienda_id, "—"), "ultimo_acceso": _iso(u.ultimo_acceso_en), "estado": "Activo" if u.activo else "Inactivo", "_acciones": ["activo"]}
                      for u in db.scalars(select(User).where(User.rol.in_(roles)))]
    return f


# Personal interno de AHA HOME, separado de clientes, empresas y técnicos
_tabla_equipo = _equipo(("agente", "tecnico_supervisor", "supervisor", "superadmin"))
_tabla_administradores = _equipo(("superadmin",))
_tabla_control = _equipo(("supervisor", "tecnico_supervisor"))
_tabla_caja = _equipo(("agente",))


def _tabla_ordenes(db):
    cols = [("creado", "Creada el"), ("codigo", "Orden"), ("cliente", "Cliente"), ("servicio", "Servicio"), ("tienda", "Tienda"), ("tecnico", "Técnico"),
            ("fecha", "Cita"), ("estado", "Estado")]
    return cols, [{"id": o.id, "creado": _fecha(o.creado), "codigo": o.codigo, "cliente": o.cliente_nombre, "servicio": TIPO_SERVICIO_TEXTO.get(o.tipo_servicio),
                   "tienda": o.tienda.nombre, "tecnico": o.tecnico.user.nombre if o.tecnico else "Sin técnico", "fecha": f"{o.fecha} {o.franja}",
                   "estado": ESTADO_TEXTO.get(o.estado, o.estado)} for o in db.scalars(select(Orden))]


def _tabla_transacciones(db):
    cols = [("en", "Fecha"), ("concepto", "Concepto"), ("orden", "Orden"), ("metodo", "Método"), ("moneda", "Moneda"), ("monto_usd", "Monto USD"), ("monto_bs", "Monto Bs"),
            ("referencia", "Referencia"), ("estado", "Estado")]
    filas = []
    for o in db.scalars(select(Orden).where(Orden.pagado_en.is_not(None))):
        usd = o.monto_instalacion_centavos + o.inspeccion_centavos
        filas.append({"id": f"c{o.id}", "en": _iso(o.pagado_en), "concepto": "Cobro en caja (instalación e inspección)", "orden": o.codigo,
                      "metodo": METODO_PAGO_TEXTO.get(o.pago_metodo or "", ""), "moneda": o.pago_moneda or "USD", "monto_usd": svc.dinero(usd),
                      "monto_bs": f"{round(usd * o.pago_tasa) / 100:.2f}" if o.pago_tasa else "—", "referencia": o.pago_referencia or "—", "estado": "Cobrado"})
    for p in db.scalars(select(Presupuesto).where(Presupuesto.pago_registrado_en.is_not(None))):
        filas.append({"id": f"p{p.id}", "en": _iso(p.pago_registrado_en), "concepto": "Pago de presupuesto", "orden": p.orden.codigo,
                      "metodo": METODO_PAGO_TEXTO.get(p.pago_metodo or "", ""), "moneda": p.pago_moneda or "USD", "monto_usd": svc.dinero(p.a_pagar_centavos),
                      "monto_bs": f"{round(p.a_pagar_centavos * p.pago_tasa) / 100:.2f}" if p.pago_tasa else "—", "referencia": p.pago_referencia or "—",
                      "estado": "Confirmado" if p.pago_confirmado_en else "Por confirmar"})
    for o in db.scalars(select(Orden).where(Orden.penalidad_pagada_en.is_not(None))):
        filas.append({"id": f"n{o.id}", "en": _iso(o.penalidad_pagada_en), "concepto": "Penalidad por entrega fallida", "orden": o.codigo,
                      "metodo": METODO_PAGO_TEXTO.get(o.penalidad_metodo or "", ""), "moneda": "", "monto_usd": svc.dinero(o.penalidad_centavos or 0), "monto_bs": "—",
                      "referencia": o.penalidad_referencia or "—", "estado": "Pagada"})
    return cols, filas


def _tabla_liquidaciones(db):
    cols = [("en", "Fecha"), ("tecnico", "Técnico"), ("orden", "Orden"), ("concepto", "Concepto"), ("monto_usd", "Monto USD"), ("referencia", "Referencia"), ("estado", "Estado")]
    filas = []
    for p in db.scalars(select(Presupuesto).where(Presupuesto.pago_confirmado_en.is_not(None))):
        if p.compra_cliente or not p.materiales_centavos:
            continue
        filas.append({"id": p.id, "en": _iso(p.materiales_pagados_en or p.pago_confirmado_en), "tecnico": p.tecnico.user.nombre, "orden": p.orden.codigo,
                      "concepto": "Materiales del presupuesto", "monto_usd": svc.dinero(p.materiales_centavos), "referencia": p.materiales_referencia or "—",
                      "estado": "Pagado" if p.materiales_pagados_en else "Pendiente"})
    return cols, filas


def _verificaciones(modulo: str | None):
    def f(db):
        cols = [("solicitud", "Solicitud"), ("solicitado", "Solicitado el"), ("nombre", "Profesional"), ("codigo", "Código"), ("rol", "Tipo"),
                ("facial", "Verificación facial"), ("documentos", "Documentos"), ("estado", "Estado"), ("aprobado", "Aprobado el")]
        fac = {"coincide": "Coincide", "no_coincide": "No coincide", "revision_manual": "Revisar a mano", "": "Pendiente"}
        filas = []
        for t in db.scalars(select(Tecnico)):
            if modulo and not _del_modulo(t, modulo):
                continue
            tipos = {d.tipo for d in t.documentos}
            filas.append({"id": t.user.id, "tecnico_id": t.id, "solicitud": codigos.verificacion(t), "codigo": codigos.profesional(t), "solicitado": _fecha(t.user.creado),
                          "nombre": t.user.nombre, "rol": codigos.actividad_texto(t), "facial": fac.get(t.rostro_resultado or "", t.rostro_resultado),
                          "documentos": f"Faltan {len(pend)}" if (pend := documentos_pendientes(t)) else "Completos", "estado": "Aprobado" if t.verificado else "Pendiente",
                          "aprobado": _fecha(t.alta_en) or "—", "_acciones": ["perfil"]})
        return cols, filas
    return f


_tabla_verificaciones = _verificaciones(None)


def _tabla_reportes(db):
    cols = [("creado", "Fecha"), ("tipo", "Tipo"), ("orden", "Orden"), ("quien", "Reportado por"), ("texto", "Detalle"), ("estado", "Estado")]
    filas = []
    for i in db.scalars(select(Incidencia)):
        o = db.get(Orden, i.orden_id) if i.orden_id else None
        t = db.get(Tecnico, i.tecnico_id) if i.tecnico_id else None
        filas.append({"id": i.id, "creado": _iso(i.creado), "tipo": "Incidencia", "orden": o.codigo if o else "—", "quien": t.user.nombre if t else "—",
                      "texto": i.texto, "estado": "Abierta" if i.abierta else "Resuelta", "_acciones": ["resolver"] if i.abierta else []})
    for m in db.scalars(select(SoporteMensaje).where(SoporteMensaje.tema.in_(("reclamo", "emergencia")))):
        u = db.get(User, m.hilo_id)
        filas.append({"id": f"s{m.id}", "creado": _iso(m.creado), "tipo": "Emergencia" if m.tema == "emergencia" else "Reclamo", "orden": "—",
                      "quien": u.nombre if u else "—", "texto": m.texto, "estado": "Recibido"})
    return cols, filas


def _tabla_resenas(db):
    cols = [("fecha", "Fecha"), ("orden", "Orden"), ("cliente", "Cliente"), ("tecnico", "Técnico"), ("estrellas", "Calificación"), ("comentario", "Comentario")]
    return cols, [{"id": o.id, "fecha": _fecha(o.completado_en), "orden": o.codigo, "cliente": o.cliente_nombre, "tecnico": o.tecnico.user.nombre if o.tecnico else "—",
                   "estrellas": o.calificacion, "comentario": o.comentario or "—"} for o in db.scalars(select(Orden).where(Orden.calificacion.is_not(None)))]


def _tabla_mensajeria(db):
    cols = [("ultimo", "Último mensaje"), ("quien", "Conversación"), ("rol", "Tipo"), ("tema", "Tema"), ("texto", "Mensaje")]
    filas = {}
    for m in db.scalars(select(SoporteMensaje).order_by(SoporteMensaje.id)):
        u = db.get(User, m.hilo_id)
        filas[m.hilo_id] = {"id": m.hilo_id, "ultimo": _iso(m.creado), "quien": u.nombre if u else "?", "rol": ROL_TEXTO.get(u.rol, "") if u else "",
                            "tema": m.tema or filas.get(m.hilo_id, {}).get("tema", "—"), "texto": m.texto or "📷 foto"}
    return cols, list(filas.values())


TABLAS = {"clientes": _tabla_clientes, "tecnicos": _tabla_tecnicos, "transportistas": _tabla_transportistas,
          "verificaciones_tecnicos": _verificaciones("tecnicos"), "verificaciones_transportistas": _verificaciones("transportistas"), "empresas": _tabla_empresas, "equipo": _tabla_equipo,
          "administradores": _tabla_administradores, "control": _tabla_control, "caja": _tabla_caja, "ordenes": _tabla_ordenes,
          "transacciones": _tabla_transacciones, "liquidaciones": _tabla_liquidaciones, "verificaciones": _tabla_verificaciones,
          "reportes": _tabla_reportes, "resenas": _tabla_resenas, "mensajeria": _tabla_mensajeria}
PERMISO_TABLA = {"clientes": "ver_clientes", "empresas": "ver_empresas", "tecnicos": "ver_tecnicos", "verificaciones": "ver_tecnicos",
                 "transportistas": "ver_tecnicos", "verificaciones_tecnicos": "ver_tecnicos", "verificaciones_transportistas": "ver_tecnicos",
                 "ordenes": "ver_ordenes", "transacciones": "ver_finanzas", "liquidaciones": "ver_finanzas", "mensajeria": "ver_soporte",
                 "reportes": "ver_soporte", "resenas": "ver_soporte", "equipo": "ver_personal", "administradores": "ver_personal",
                 "control": "ver_personal", "caja": "ver_personal"}
ORDEN_INICIAL = {"clientes": "creado", "tecnicos": "creado", "transportistas": "creado",
                 "verificaciones_tecnicos": "solicitado", "verificaciones_transportistas": "solicitado", "ordenes": "creado", "transacciones": "en", "liquidaciones": "en", "verificaciones": "solicitado",
                 "reportes": "creado", "resenas": "fecha", "mensajeria": "ultimo"}


@router.get("/tabla/{nombre}")
def tabla(nombre: str, q: str = "", orden: str | None = None, dir: str = "desc", estado: str | None = None, pagina: int = 1, por_pagina: int = 25,
          user: User = Depends(panel), db: Session = Depends(get_db)):
    if nombre not in TABLAS:
        raise HTTPException(404, "Tabla no encontrada")
    exigir_permiso(user, PERMISO_TABLA.get(nombre, "ver_tablero"))
    cols, filas = TABLAS[nombre](db)
    estados = sorted({str(f.get("estado")) for f in filas if f.get("estado")})
    if estado:
        filas = [f for f in filas if str(f.get("estado")) == estado]
    if q.strip():
        import unicodedata
        norm = lambda t: unicodedata.normalize("NFD", str(t)).encode("ascii", "ignore").decode().lower()
        palabras = norm(q).split()
        filas = [f for f in filas if all(p in norm(" ".join(str(v) for k, v in f.items() if not k.startswith("_"))) for p in palabras)]
    clave = orden or ORDEN_INICIAL.get(nombre) or cols[0][0]
    filas.sort(key=lambda f: (f.get(clave) is None, str(f.get(clave) if not isinstance(f.get(clave), (int, float)) else f"{f.get(clave):012.2f}")), reverse=dir == "desc")
    total = len(filas)
    pagina = max(1, pagina)
    por_pagina = max(5, min(por_pagina, 100))
    return {"columnas": [{"k": k, "t": t} for k, t in cols], "filas": filas[(pagina - 1) * por_pagina: pagina * por_pagina], "total": total,
            "pagina": pagina, "paginas": max(1, -(-total // por_pagina)), "estados": estados, "orden": clave, "dir": dir}


@router.get("/buscar")
def buscar(q: str, user: User = Depends(panel), db: Session = Depends(get_db)):
    """Buscador global de la barra superior: personas, órdenes y tiendas."""
    out = []
    puede = set(permisos_de(user))
    vistos = set()
    for nombre, etiqueta in (("ordenes", "Orden"), ("clientes", "Cliente"), ("tecnicos", "Técnico instalador"), ("transportistas", "Conductor"), ("empresas", "Empresa"),
                             ("equipo", "Personal AHA HOME")):
        if PERMISO_TABLA.get(nombre) not in puede:
            continue
        r = tabla(nombre, q=q, por_pagina=5, user=user, db=db)
        for f in r["filas"]:
            if f.get("tecnico_id") and f["tecnico_id"] in vistos:
                continue
            vistos.add(f.get("tecnico_id"))
            titulo = f.get("codigo") if nombre == "ordenes" else f.get("nombre")
            sub = f.get("cliente") if nombre == "ordenes" else " · ".join(x for x in (f.get("codigo") if nombre != "ordenes" else "", f.get("email") or f.get("tienda") or "") if x)
            out.append({"tabla": nombre, "tipo": etiqueta, "id": f["id"], "tecnico_id": f.get("tecnico_id"), "titulo": titulo, "sub": sub})
    return out[:20]
