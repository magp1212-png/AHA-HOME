"""Estadísticas del panel del superadmin: demanda por tienda, día y hora; artículos; cumplimiento;
tiempos por fase; ranking de técnicos (índice de excelencia) y reseñas."""
import datetime as dt
from collections import Counter, defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .models import TIPO_EQUIPO_TEXTO, TIPO_SERVICIO_TEXTO, Incidencia, Orden, Tecnico, Tienda

DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
HORAS = list(range(8, 19))


def _local(x: dt.datetime) -> dt.datetime:
    return x + dt.timedelta(hours=config.UTC_OFFSET_HOURS)


def _primero(o: Orden) -> dict:
    p = {}
    for e in o.eventos:
        p.setdefault(e.estado, e.creado)
    return p


def _minutos(a, b):
    return (b - a).total_seconds() / 60 if a and b else None


def puntual(o: Orden, llegada: dt.datetime | None) -> bool | None:
    """¿La cuadrilla llegó antes del final de la franja acordada? (hora de Caracas)"""
    if not llegada:
        return None
    try:
        fin = o.franja.split("-")[1]
        h, m = (int(x) for x in fin.split(":"))
        limite = dt.datetime.fromisoformat(o.fecha).replace(hour=h, minute=m)
    except (ValueError, IndexError):
        return None
    return _local(llegada) <= limite


def indice(cal: float | None, pct_puntual: float, pct_sin_inc: float) -> int:
    """0-100: 40 % calificación, 30 % puntualidad, 30 % servicios sin incidencias."""
    c = (cal or 0) / 5 * 40
    return round(c + pct_puntual * 0.3 + pct_sin_inc * 0.3)


def calcular(db: Session, desde: dt.date, hasta: dt.date, tienda_id: int | None = None) -> dict:
    q = select(Orden).where(Orden.fecha >= desde.isoformat(), Orden.fecha <= hasta.isoformat())
    if tienda_id:
        q = q.where(Orden.tienda_id == tienda_id)
    ords = db.scalars(q).all()
    activas = [o for o in ords if o.estado != "cancelado"]
    hechas = [o for o in ords if o.estado == "completado"]
    incs = db.scalars(select(Incidencia)).all()
    inc_por_orden = Counter(i.orden_id for i in incs if i.orden_id)

    # Demanda por tienda, día y tipo de servicio, y mapa de calor (día de la semana × hora de la solicitud)
    tiendas = {t.id: t.nombre for t in db.scalars(select(Tienda))}
    por_tienda = Counter(o.tienda_id for o in activas)
    por_dia: dict[str, Counter] = defaultdict(Counter)
    calor = [[0] * len(HORAS) for _ in DIAS]
    for o in activas:
        por_dia[o.fecha][o.tipo_servicio] += 1
        h = _local(o.creado)
        if h.hour in HORAS:
            calor[h.weekday()][HORAS.index(h.hour)] += 1

    # Artículos más solicitados
    arts_total, arts_inst = Counter(), Counter()
    for o in activas:
        for a in o.articulos:
            arts_total[a.tipo] += 1
            arts_inst[a.tipo] += a.instalar

    # Tiempos por fase y cumplimiento
    fases = defaultdict(list)
    llegadas_ok, llegadas = 0, 0
    for o in hechas:
        p = _primero(o)
        for k, a, b in (("caja_a_asignado", "solicitud_enviada", "tecnico_asignado"), ("asignado_a_ruta", "tecnico_asignado", "en_ruta"),
                        ("traslado", "en_ruta", "en_progreso"), ("servicio", "en_progreso", "completado"),
                        ("total", "solicitud_enviada", "completado")):
            m = _minutos(p.get(a), p.get(b))
            if m is not None:
                fases[k].append(m)
        ok = puntual(o, p.get("en_progreso"))
        if ok is not None:
            llegadas += 1
            llegadas_ok += ok
    pct = lambda a, b: round(a / b * 100) if b else None
    calificadas = [o for o in hechas if o.calificacion]

    # Ranking de técnicos
    ranking = []
    for t in db.scalars(select(Tecnico).where(Tecnico.es_ayudante.is_(False))):
        suyas = [o for o in hechas if o.tecnico_id == t.id]
        if not suyas:
            continue
        cals = [o.calificacion for o in suyas if o.calificacion]
        lleg = [puntual(o, _primero(o).get("en_progreso")) for o in suyas]
        lleg = [x for x in lleg if x is not None]
        n_inc = sum(1 for o in suyas if inc_por_orden.get(o.id))
        p_punt = pct(sum(lleg), len(lleg)) or 0
        p_sin = pct(len(suyas) - n_inc, len(suyas)) or 0
        cal = round(sum(cals) / len(cals), 2) if cals else None
        ranking.append({
            "id": t.id, "nombre": t.user.nombre, "foto": t.foto_perfil or t.foto_rostro, "grupo": t.grupo, "tienda": t.tienda.nombre,
            "ayudantes": [a.user.nombre for a in t.ayudantes], "servicios": len(suyas), "calificacion": cal, "resenas": len(cals),
            "puntualidad": p_punt, "sin_incidencias": p_sin, "incidencias": n_inc, "indice": indice(cal, p_punt, p_sin),
            "impecable": bool(cal and cal >= 4.9 and p_punt >= 98 and n_inc == 0),
        })
    ranking.sort(key=lambda r: (-r["indice"], -(r["calificacion"] or 0), -r["servicios"]))

    resenas = [{"orden": o.codigo, "cliente": o.cliente_nombre.split()[0], "estrellas": o.calificacion, "comentario": o.comentario,
                "tecnico": o.tecnico.user.nombre if o.tecnico else None, "tecnico_id": o.tecnico_id,
                "servicio": TIPO_SERVICIO_TEXTO.get(o.tipo_servicio), "fecha": o.fecha}
               for o in sorted(calificadas, key=lambda o: o.completado_en or o.creado, reverse=True)][:30]

    return {
        "desde": desde.isoformat(), "hasta": hasta.isoformat(),
        "indicadores": {
            "ordenes": len(activas), "completadas": len(hechas), "canceladas": len(ords) - len(activas),
            "articulos": sum(arts_total.values()), "instalaciones": sum(arts_inst.values()),
            "calificacion_promedio": round(sum(o.calificacion for o in calificadas) / len(calificadas), 2) if calificadas else None,
            "tiempo_total_promedio_min": round(sum(fases["total"]) / len(fases["total"])) if fases["total"] else None,
            "incidencias": sum(1 for i in incs if i.orden_id in {o.id for o in ords}),
        },
        "por_tienda": sorted([{"tienda": tiendas.get(k, "?"), "ordenes": v} for k, v in por_tienda.items()], key=lambda x: -x["ordenes"]),
        "por_dia": [{"fecha": f, **{k: por_dia[f].get(k, 0) for k in TIPO_SERVICIO_TEXTO}} for f in sorted(por_dia)],
        "calor": {"dias": DIAS, "horas": HORAS, "valores": calor},
        "articulos": sorted([{"tipo": k, "texto": TIPO_EQUIPO_TEXTO.get(k, k), "total": v, "instalados": arts_inst[k]} for k, v in arts_total.items()],
                            key=lambda x: -x["total"]),
        "tiempos_promedio_min": {k: round(sum(v) / len(v)) for k, v in fases.items()},
        "cumplimiento": {
            "llegada_en_franja": pct(llegadas_ok, llegadas),
            "cierre_con_evidencia": 100 if hechas else None,  # el servidor no deja cerrar sin fotos
            "retiro_de_residuos": 100 if any(o.tipo_servicio != "traslado" for o in hechas) else None,
            "sin_incidencias": pct(sum(1 for o in hechas if not inc_por_orden.get(o.id)), len(hechas)),
            "clientes_que_califican": pct(len(calificadas), len(hechas)),
        },
        "estrellas": {str(n): sum(1 for o in calificadas if o.calificacion == n) for n in range(5, 0, -1)},
        "ranking": ranking,
        "resenas": resenas,
    }
