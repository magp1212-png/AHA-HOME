"""Reglas de la orden de servicio: estados, asignación de la cuadrilla, avisos y lo que ve cada rol."""
import datetime as dt

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import asignacion, config
from .models import (ESTADO_CANCELADO, ESTADO_TEXTO, ESTADOS, TIPO_EQUIPO_TEXTO, TIPO_SERVICIO_TEXTO, Articulo, Evento, Orden,
                     Tecnico, User, ahora, checklist_de, con_retiro, fotos_de)
from .notificar import notificar

ROLES_SEGUIMIENTO = ("supervisor", "superadmin")


def nuevo_codigo(db: Session) -> str:
    n = (db.scalar(select(func.max(Orden.id))) or 0) + 4921  # numeración legible: WO-4921, WO-4922…
    return f"WO-{n}"


def registrar(db: Session, orden: Orden, estado: str, actor: User | None, nota: str = "") -> None:
    orden.estado = estado
    db.add(Evento(orden_id=orden.id, estado=estado, nota=nota, actor_id=actor.id if actor else None))


def nombre_articulo(a: Articulo) -> str:
    return a.descripcion or " ".join(x for x in (TIPO_EQUIPO_TEXTO.get(a.tipo, a.tipo), a.marca) if x)


def descripcion(orden: Orden) -> str:
    """Ej.: «Traslado e instalación · Nevera Samsung (instalar), Cocina Mabe»"""
    arts = ", ".join(nombre_articulo(a) + (" (instalar)" if a.instalar and orden.tipo_servicio != "instalacion" else "")
                     for a in orden.articulos)
    return f"{TIPO_SERVICIO_TEXTO.get(orden.tipo_servicio, orden.tipo_servicio)} · {arts}"


def hay_sin_instalar(orden: Orden) -> bool:
    return any(not a.instalar for a in orden.articulos)


def requeridos(orden: Orden) -> tuple[tuple[str, ...], tuple[str, ...]]:
    sin = hay_sin_instalar(orden)
    return checklist_de(orden.tipo_servicio, sin), fotos_de(orden.tipo_servicio, sin)


def dinero(centavos: int) -> str:
    return f"{centavos / 100:.2f}"


def estado_articulo(orden: Orden, a: Articulo) -> str:
    e = orden.estado
    if e == "cancelado":
        return "Cancelado"
    if e == "completado":
        return "Instalado" if a.instalar else "Entregado"
    if e == "en_progreso":
        return "Instalando" if a.instalar else "Entregado"
    if e == "en_ruta":
        return "En camino"
    return "En tu casa, por instalar" if orden.tipo_servicio == "instalacion" else "Por retirar en tienda"


def articulos_vista(orden: Orden) -> list[dict]:
    return [{"id": a.id, "tipo": a.tipo, "tipo_texto": TIPO_EQUIPO_TEXTO.get(a.tipo, a.tipo), "nombre": nombre_articulo(a),
             "descripcion": a.descripcion, "marca": a.marca, "modelo": a.modelo, "serial": a.serial, "garantia": a.garantia,
             "instalar": a.instalar, "precio_instalacion": dinero(a.precio_instalacion_centavos),
             "estado": estado_articulo(orden, a)} for a in orden.articulos]


def nombres_cuadrilla(orden: Orden) -> str:
    if not orden.tecnico:
        return "sin técnico asignado"
    txt = orden.tecnico.user.nombre
    if orden.ayudantes:
        txt += " + ayudantes " + ", ".join(a.user.nombre for a in orden.ayudantes)
    return txt


def ayudantes_disponibles(tec: Tecnico) -> list[Tecnico]:
    return [a for a in tec.ayudantes if a.verificado and a.disponible and a.user.activo]


def supervisores_de(db: Session, orden: Orden) -> list[User]:
    """Técnico supervisor de la tienda + equipo supervisor + superadmin: todos siguen cada orden."""
    return db.scalars(select(User).where(User.activo.is_(True), or_(
        User.rol.in_(ROLES_SEGUIMIENTO),
        (User.rol == "tecnico_supervisor") & (User.tienda_id == orden.tienda_id)))).all()


def avisar_seguimiento(db: Session, orden: Orden, titulo: str, texto: str) -> None:
    for u in supervisores_de(db, orden):
        notificar(db, u.id, titulo, texto, orden.id)


def poner_cuadrilla(db: Session, orden: Orden, tec: Tecnico | None, ayudantes: list[Tecnico] | None = None) -> None:
    orden.tecnico_id, orden.tecnico = (tec.id, tec) if tec else (None, None)
    orden.ayudantes = list(ayudantes if ayudantes is not None else (ayudantes_disponibles(tec) if tec else []))


def avisar_cuadrilla(db: Session, orden: Orden) -> None:
    texto = f"{descripcion(orden)} · {orden.fecha} {orden.franja} · {orden.direccion}"
    notificar(db, orden.tecnico.user_id, f"Nueva orden {orden.codigo}", texto, orden.id)
    for a in orden.ayudantes:
        notificar(db, a.user_id, f"Nueva orden {orden.codigo}", f"Sales con {orden.tecnico.user.nombre} · {texto}", orden.id)


def asignar(db: Session, orden: Orden, actor: User | None, nota: str = "Asignación automática") -> Tecnico | None:
    tec = asignacion.elegir_tecnico(db, orden)
    if not tec:
        poner_cuadrilla(db, orden, None)
        return None
    poner_cuadrilla(db, orden, tec)
    registrar(db, orden, "tecnico_asignado", actor,
              f"{nota}: {nombres_cuadrilla(orden)} (Grupo {tec.grupo}, {tec.tienda.nombre})")
    avisar_cuadrilla(db, orden)
    notificar(db, orden.cliente_id, "Técnico asignado", f"Tu servicio {orden.codigo} ya tiene técnico asignado.", orden.id)
    return tec


def avisar_nueva_orden(db: Session, orden: Orden) -> None:
    if orden.tecnico:
        texto = f"{descripcion(orden)} · {orden.fecha} {orden.franja} · Asignada a {nombres_cuadrilla(orden)}"
    else:
        texto = f"{descripcion(orden)} · {orden.fecha} {orden.franja} · SIN TÉCNICO DISPONIBLE: activa la Guardia Retén o reasigna"
    avisar_seguimiento(db, orden, f"Nueva orden {orden.codigo} · {orden.tienda.nombre}", texto)


def exigir_estado(orden: Orden, *permitidos: str) -> None:
    if orden.estado not in permitidos:
        raise HTTPException(409, f"La orden está en «{ESTADO_TEXTO.get(orden.estado, orden.estado)}»; este paso no aplica ahora")


def faltantes_cierre(orden: Orden) -> list[str]:
    hechos = orden.checklist or {}
    fotos = orden.fotos or {}
    chk, fts = requeridos(orden)
    falta = [k for k in chk if not hechos.get(k)]
    falta += [f"foto_{k}" for k in fts if not fotos.get(k)]
    return falta


def ficha(tec: Tecnico | None) -> dict | None:
    if not tec:
        return None
    return {"id": tec.id, "nombre": tec.user.nombre, "cedula": tec.user.cedula, "telefono": tec.user.telefono,
            "foto": tec.foto_perfil or tec.foto_rostro, "grupo": tec.grupo, "tienda": tec.tienda.nombre, "verificado": tec.verificado,
            "rol": "ayudante" if tec.es_ayudante else "tecnico"}


def ficha_cliente(tec: Tecnico | None) -> dict | None:
    """El cliente solo ve la foto (y el nombre) del técnico y del ayudante asignados: nada de cédula ni teléfono."""
    if not tec:
        return None
    d = {"nombre": tec.user.nombre, "foto": tec.foto_perfil or tec.foto_rostro,
         "rol": "ayudante" if tec.es_ayudante else "tecnico"}
    if not tec.es_ayudante:
        from sqlalchemy.orm import object_session
        prom, n = object_session(tec).execute(select(func.avg(Orden.calificacion), func.count(Orden.calificacion))
                                              .where(Orden.tecnico_id == tec.id, Orden.calificacion.is_not(None))).one()
        d["calificacion"] = round(float(prom), 1) if prom is not None else None
        d["calificaciones"] = n
    return d


def _iso(x: dt.datetime | None) -> str | None:
    return x.isoformat() + "Z" if x else None


def linea_de_tiempo(orden: Orden) -> list[dict]:
    cuando = {}
    for e in orden.eventos:
        cuando[e.estado] = e.creado
    actual = ESTADOS.index(orden.estado) if orden.estado in ESTADOS else -1
    return [{"estado": s, "texto": ESTADO_TEXTO[s], "hecho": i <= actual, "actual": i == actual,
             "fecha": _iso(cuando.get(s)) if i <= actual else None} for i, s in enumerate(ESTADOS)]


def vista(orden: Orden, rol: str) -> dict:
    """Lo que ve cada rol. El cliente recibe la ficha de seguridad de la cuadrilla cuando ya va en camino."""
    from .routers.tasa import info_pago
    d = {
        "id": orden.id, "codigo": orden.codigo, "estado": orden.estado, "estado_texto": ESTADO_TEXTO.get(orden.estado),
        "tipo_servicio": orden.tipo_servicio, "tipo_servicio_texto": TIPO_SERVICIO_TEXTO.get(orden.tipo_servicio),
        "con_retiro_en_tienda": con_retiro(orden.tipo_servicio),
        "cliente": {"nombre": orden.cliente_nombre, "telefono": orden.cliente_telefono, "direccion": orden.direccion,
                    "referencia": orden.referencia, "lat": orden.lat, "lng": orden.lng, "zona": orden.zona},
        "articulos": articulos_vista(orden),
        "compra": {"factura": orden.factura, "numero_factura": orden.numero_factura, "fecha_compra": orden.fecha_compra},
        "pago_instalacion": {**info_pago(orden.pago_metodo, orden.monto_instalacion_centavos + orden.inspeccion_centavos, orden.pago_moneda, orden.pago_tasa),
                             "monto": dinero(orden.monto_instalacion_centavos), "inspeccion": dinero(orden.inspeccion_centavos),
                             "precio_por_definir": any(a.instalar and not a.precio_instalacion_centavos for a in orden.articulos),
                             "referencia": orden.pago_referencia, "pagado": orden.pagado_en is not None,
                             "pagado_en": _iso(orden.pagado_en)},
        "fecha": orden.fecha, "franja": orden.franja,
        "tienda": {"id": orden.tienda.id, "nombre": orden.tienda.nombre, "direccion": orden.tienda.direccion,
                   "lat": orden.tienda.lat, "lng": orden.tienda.lng},
        "linea_de_tiempo": linea_de_tiempo(orden),
        "checklist_requerido": list(requeridos(orden)[0]), "fotos_requeridas": list(requeridos(orden)[1]),
        "retirado_en": _iso(orden.retirado_en), "completado_en": _iso(orden.completado_en),
        "checklist": orden.checklist or {}, "fotos": orden.fotos or {},
        "calificacion": orden.calificacion, "comentario": orden.comentario,
        "inspeccion": {"requerida": orden.requiere_inspeccion, "fecha": orden.inspeccion_fecha, "franja": orden.inspeccion_franja,
                       "costo": dinero(round(config.INSPECCION_USD * 100)), "pagada_en_tienda": orden.inspeccion_centavos > 0},
        "propina": {"monto": dinero(orden.propina_centavos), "metodo": orden.propina_metodo, "dada": orden.propina_en is not None,
                    "entregada_al_tecnico": orden.propina_entregada_en is not None},
        "creado": _iso(orden.creado),
    }
    from .routers.presupuestos import info_pausa, listo_para_instalar, vigente, vista_presupuesto
    p = vigente(orden)
    d["presupuesto"] = vista_presupuesto(p, rol) if p else None
    d["listo_para_instalar"] = listo_para_instalar(orden)
    d["pausa"] = info_pausa(orden)
    from .routers.penalidad import info_penalidad, info_reprogramar
    d["reprogramar"] = info_reprogramar(orden)
    d["penalidad"] = info_penalidad(orden)
    en_camino = orden.estado in ("en_ruta", "en_progreso", "completado")
    if rol == "cliente":
        t = orden.tecnico
        # GPS de la cuadrilla solo mientras va en camino o está en su casa
        d["tecnico_gps"] = ({"lat": t.lat_actual, "lng": t.lng_actual, "en": _iso(t.ubicacion_en)}
                            if t and orden.estado in ("en_ruta", "en_progreso") and t.lat_actual else None)
        d["tecnico"] = ficha_cliente(orden.tecnico) if en_camino else None
        d["ayudantes"] = [ficha_cliente(a) for a in orden.ayudantes] if en_camino else []
        d["tecnico_asignado"] = orden.tecnico is not None
    else:
        d["tecnico"] = ficha(orden.tecnico)
        d["ayudantes"] = [ficha(a) for a in orden.ayudantes]
        d["faltantes_cierre"] = faltantes_cierre(orden)
    if rol in ("tecnico", "ayudante"):
        # Privacidad: la cuadrilla no ve el teléfono del cliente; se comunica por el chat supervisado
        d["cliente"].pop("telefono", None)
    if rol in ("agente", "tecnico_supervisor", "supervisor", "superadmin"):
        if con_retiro(orden.tipo_servicio):
            d["qr"] = f"AHAHOME:{orden.qr_token}"
        d["eventos"] = [{"estado": e.estado, "texto": ESTADO_TEXTO.get(e.estado), "nota": e.nota, "fecha": _iso(e.creado)}
                        for e in orden.eventos]
    return d


def cancelar(db: Session, orden: Orden, actor: User, motivo: str) -> None:
    exigir_estado(orden, "solicitud_enviada", "tecnico_asignado", "cita_confirmada")
    nota = motivo or "Cancelada"
    if orden.pagado_en:
        nota += f" · REEMBOLSO PENDIENTE de la instalación: USD {dinero(orden.monto_instalacion_centavos)}"
    registrar(db, orden, ESTADO_CANCELADO, actor, nota)
    for t in ([orden.tecnico] if orden.tecnico else []) + list(orden.ayudantes):
        notificar(db, t.user_id, f"{orden.codigo} cancelada", motivo or "La orden fue cancelada", orden.id)
    avisar_seguimiento(db, orden, f"{orden.codigo} cancelada", f"{actor.nombre}: {nota}")


def marcar_completada(db: Session, orden: Orden, actor: User) -> None:
    falta = faltantes_cierre(orden)
    if falta:
        raise HTTPException(422, {"mensaje": "Completa el checklist y las fotos antes de cerrar", "faltan": falta})
    orden.completado_en = ahora()
    nota = "Entrega en empaque original completada" if orden.tipo_servicio == "traslado" else "Instalación y retiro de embalaje completados"
    registrar(db, orden, "completado", actor, nota)
    notificar(db, orden.cliente_id, "¡Servicio completado!", f"{orden.codigo}: cuéntanos cómo te fue y califica el servicio.", orden.id)
    avisar_seguimiento(db, orden, f"{orden.codigo} completada", f"{descripcion(orden)} · {nombres_cuadrilla(orden)}")
