"""Inspección y presupuesto antes del retiro.

1. El cliente (o la caja / el control) pide inspección. 2. El técnico asignado inspecciona y envía el presupuesto
(materiales + mano de obra). 3. El cliente lo acepta y el superadmin lo aprueba. 4. El cliente paga y el control
confirma el pago. 5. AHA HOME paga los materiales a la cuenta registrada del técnico. 6. Recién ahí puede retirar e instalar.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import ordenes as svc
from .. import config
from ..db import get_db
from ..deps import require
from ..models import ESTADO_PRESUPUESTO_TEXTO, METODOS_PAGO, Orden, Presupuesto, Tecnico, User, ahora
from ..notificar import notificar
from .ordenes import normalizar_franja, obtener

router = APIRouter(tags=["presupuestos"])
ANTES_DE_SALIR = ("solicitud_enviada", "tecnico_asignado", "cita_confirmada")


def dinero(c: int) -> str:
    return f"{c / 100:.2f}"


def vigente(o: Orden) -> Presupuesto | None:
    """El último presupuesto que no fue rechazado."""
    for p in reversed(o.presupuestos):
        if p.estado != "rechazado":
            return p
    return None


def listo_para_instalar(o: Orden) -> bool:
    if not o.requiere_inspeccion:
        return True
    p = vigente(o)
    return bool(p and p.estado == "materiales_pagados")


def info_pausa(o: Orden) -> dict:
    """Pausa ("time out") del servicio mientras la inspección y el presupuesto no estén listos."""
    activa = bool(o.requiere_inspeccion and o.estado in ANTES_DE_SALIR and not listo_para_instalar(o))
    desde = o.pausa_desde or o.creado
    horas = round((ahora() - desde).total_seconds() / 3600, 1) if activa and desde else 0
    return {"activa": activa, "desde": _iso(desde) if activa else None, "horas": horas,
            "limite_horas": config.PAUSA_INSPECCION_HORAS, "vencida": activa and horas >= config.PAUSA_INSPECCION_HORAS}


def revisar_pausas(db: Session) -> int:
    """Avisa una vez al control y al cliente cuando una pausa por inspección pasa del límite."""
    n = 0
    for o in db.scalars(select(Orden).where(Orden.requiere_inspeccion.is_(True), Orden.pausa_aviso_en.is_(None),
                                            Orden.estado.in_(ANTES_DE_SALIR))):
        if not info_pausa(o)["vencida"]:
            continue
        o.pausa_aviso_en = ahora()
        texto = f"{o.codigo}: lleva más de {config.PAUSA_INSPECCION_HORAS} h en pausa por inspección. Revisa el presupuesto o quita la pausa."
        _avisar(db, _control(db, o), "Pausa por inspección vencida", texto, o.id)
        if o.cliente_id:
            notificar(db, o.cliente_id, "Tu servicio sigue en pausa", f"{o.codigo}: falta completar la inspección y el presupuesto para retirar tu compra.", o.id)
        n += 1
    db.commit()
    return n


class AccionPausa(BaseModel):
    accion: str  # extender | quitar_inspeccion
    motivo: str = Field(default="", max_length=200)


@router.post("/supervisor/ordenes/{orden_id}/pausa")
def manejar_pausa(orden_id: int, body: AccionPausa, user: User = Depends(require("tecnico_supervisor", "supervisor")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, *ANTES_DE_SALIR)
    if not info_pausa(o)["activa"]:
        raise HTTPException(409, "Esta orden no está en pausa por inspección")
    if body.accion == "extender":
        o.pausa_desde, o.pausa_aviso_en = ahora(), None
        svc.registrar(db, o, o.estado, user, f"Pausa por inspección extendida {config.PAUSA_INSPECCION_HORAS} h {body.motivo}".strip())
    elif body.accion == "quitar_inspeccion":
        if vigente(o) and vigente(o).estado in ("pago_registrado", "pagado"):
            raise HTTPException(409, "El cliente ya pagó el presupuesto: termina el pago de materiales en vez de quitar la inspección")
        o.requiere_inspeccion, o.pausa_desde, o.pausa_aviso_en = False, None, None
        svc.registrar(db, o, o.estado, user, f"Inspección quitada: sigue a confirmación de retiro {body.motivo}".strip())
        if o.tecnico:
            notificar(db, o.tecnico.user_id, "Orden sin inspección", f"{o.codigo}: ya no requiere inspección, sigue con el retiro.", o.id)
        if o.cliente_id:
            notificar(db, o.cliente_id, "Servicio reanudado", f"{o.codigo}: seguimos con la confirmación del retiro de tu compra.", o.id)
    else:
        raise HTTPException(422, "accion debe ser extender o quitar_inspeccion")
    db.commit()
    return svc.vista(o, user.rol)


def exigir_listo(o: Orden) -> None:
    if not listo_para_instalar(o):
        p = vigente(o)
        estado = ESTADO_PRESUPUESTO_TEXTO.get(p.estado, p.estado) if p else "falta la inspección y el presupuesto"
        raise HTTPException(409, f"Esta orden requiere inspección: no se puede retirar ni instalar todavía ({estado}).")


def cuenta_tecnico(t: Tecnico) -> dict:
    return {"banco": t.cuenta_banco, "tipo": t.cuenta_tipo, "numero": t.cuenta_numero, "titular": t.cuenta_titular,
            "cedula": t.cuenta_cedula, "pago_movil_telefono": t.pago_movil_telefono, "pago_movil_banco": t.pago_movil_banco,
            "registrada": bool((t.cuenta_banco and t.cuenta_numero) or (t.pago_movil_telefono and t.pago_movil_banco))}


def _iso(x):
    return x.isoformat() + "Z" if x else None


def vista_presupuesto(p: Presupuesto, rol: str) -> dict:
    d = {"id": p.id, "orden_id": p.orden_id, "codigo": p.orden.codigo, "estado": p.estado, "estado_texto": ESTADO_PRESUPUESTO_TEXTO.get(p.estado),
         "items": [{**i, "precio": dinero(i["precio_centavos"]), "subtotal": dinero(i["precio_centavos"] * i["cantidad"])} for i in p.items],
         "materiales": dinero(p.materiales_centavos), "mano_obra": dinero(p.mano_obra_centavos), "inspeccion": dinero(p.inspeccion_centavos), "total": dinero(p.total_centavos),
         "materiales_compra": p.materiales_compra, "a_pagar": dinero(p.a_pagar_centavos),
         "notas": p.notas, "fotos": p.fotos, "motivo_rechazo": p.motivo_rechazo, "tecnico": p.tecnico.user.nombre,
         "cliente_acepto": p.cliente_acepto_en is not None, "admin_aprobo": p.admin_aprobo_en is not None,
         "pago": {"metodo": p.pago_metodo, "referencia": p.pago_referencia, "registrado_en": _iso(p.pago_registrado_en),
                  "confirmado_en": _iso(p.pago_confirmado_en)},
         "materiales_pagados_en": _iso(p.materiales_pagados_en), "creado": _iso(p.creado)}
    if rol in ("superadmin", "supervisor", "tecnico_supervisor"):
        d["cuenta_tecnico"] = cuenta_tecnico(p.tecnico)
        d["materiales_referencia"] = p.materiales_referencia
        d["cliente"] = p.orden.cliente_nombre
    return d


def _control(db: Session, o: Orden, solo_superadmin: bool = False) -> list[User]:
    cond = User.rol == "superadmin" if solo_superadmin else or_(User.rol.in_(("superadmin", "supervisor")),
                                                                 (User.rol == "tecnico_supervisor") & (User.tienda_id == o.tienda_id))
    return db.scalars(select(User).where(User.activo.is_(True), cond)).all()


def _avisar(db: Session, usuarios, titulo: str, texto: str, orden_id: int) -> None:
    for u in usuarios:
        notificar(db, u.id, titulo, texto, orden_id)


# ---------- 1. Pedir la inspección ----------

class PedirInspeccion(BaseModel):
    fecha: str = Field(default="", max_length=10)
    franja: str = Field(default="", max_length=20)


@router.post("/ordenes/{orden_id}/inspeccion")
def pedir_inspeccion(orden_id: int, body: PedirInspeccion, user: User = Depends(require("cliente", "agente", "tecnico", "tecnico_supervisor", "supervisor")),
                     db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, *ANTES_DE_SALIR)
    o.requiere_inspeccion = True
    o.inspeccion_fecha = body.fecha or o.fecha
    o.inspeccion_franja = normalizar_franja(body.franja) if body.franja else o.franja
    o.pausa_desde, o.pausa_aviso_en = ahora(), None
    svc.registrar(db, o, o.estado, user, f"Servicio en pausa por inspección ({o.inspeccion_fecha} {o.inspeccion_franja})")
    quien = {"cliente": "el cliente", "tecnico": "el técnico"}.get(user.rol, "AHA HOME")
    texto = f"{o.codigo}: {quien} pidió inspección antes del retiro · {o.inspeccion_fecha} {o.inspeccion_franja} · {o.direccion}"
    if o.cliente_id and user.rol != "cliente":
        notificar(db, o.cliente_id, "Servicio en pausa por inspección",
                  f"{o.codigo}: antes de retirar tu compra, el técnico te visitará para revisar y darte un presupuesto.", o.id)
    if o.tecnico and user.rol != "tecnico":
        notificar(db, o.tecnico.user_id, "Inspección solicitada", texto, o.id)
    _avisar(db, _control(db, o), "Inspección solicitada", texto, o.id)
    db.commit()
    return svc.vista(o, user.rol)


# ---------- 2. El técnico envía el presupuesto ----------

class Item(BaseModel):
    tipo: str  # material | mano_obra
    descripcion: str = Field(min_length=2, max_length=160)
    cantidad: float = Field(gt=0, le=1000)
    precio: float = Field(ge=0, le=100000)  # USD por unidad

    @field_validator("tipo")
    @classmethod
    def _tipo(cls, v):
        if v not in ("material", "mano_obra"):
            raise ValueError("tipo debe ser material o mano_obra")
        return v


COMPRA = ("tecnico", "cliente")


class NuevoPresupuesto(BaseModel):
    items: list[Item] = Field(min_length=1, max_length=60)
    materiales_compra: str = "tecnico"  # sugerencia del técnico; el cliente decide al aceptar
    notas: str = Field(default="", max_length=2000)
    fotos: list[str] = Field(default_factory=list, max_length=10)


@router.post("/tecnico/ordenes/{orden_id}/presupuesto")
def enviar_presupuesto(orden_id: int, body: NuevoPresupuesto, user: User = Depends(require("tecnico")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    if not o.requiere_inspeccion:
        raise HTTPException(409, "Esta orden no tiene inspección solicitada")
    svc.exigir_estado(o, *ANTES_DE_SALIR)
    if vigente(o):
        raise HTTPException(409, "Ya hay un presupuesto en curso para esta orden")
    if body.materiales_compra not in COMPRA:
        raise HTTPException(422, "materiales_compra debe ser tecnico o cliente")
    t = user.tecnico
    items = [{"tipo": i.tipo, "descripcion": i.descripcion.strip(), "cantidad": i.cantidad, "precio_centavos": round(i.precio * 100)} for i in body.items]
    mat = round(sum(i["precio_centavos"] * i["cantidad"] for i in items if i["tipo"] == "material"))
    mo = round(sum(i["precio_centavos"] * i["cantidad"] for i in items if i["tipo"] == "mano_obra"))
    if mat and body.materiales_compra == "tecnico" and not cuenta_tecnico(t)["registrada"]:
        raise HTTPException(422, "Tu cuenta de pago no está registrada: pásala por la oficina de AHA HOME para poder presupuestar materiales")
    p = Presupuesto(orden_id=o.id, tecnico_id=t.id, items=items, notas=body.notas.strip(), fotos=body.fotos,
                    materiales_centavos=mat, mano_obra_centavos=mo, materiales_compra=body.materiales_compra,
                    inspeccion_centavos=round(config.INSPECCION_USD * 100) if o.requiere_inspeccion and not o.inspeccion_centavos else 0)
    db.add(p)
    db.flush()
    svc.registrar(db, o, o.estado, user, f"Presupuesto enviado: USD {dinero(p.total_centavos)} (materiales {dinero(mat)}, mano de obra {dinero(mo)}, inspección {dinero(p.inspeccion_centavos)})")
    notificar(db, o.cliente_id, "Tu presupuesto está listo", f"{o.codigo}: total USD {dinero(p.total_centavos)}. Ábrelo en la app para aceptarlo.", o.id)
    _avisar(db, _control(db, o), "Presupuesto por aprobar", f"{o.codigo} · {user.nombre} · USD {dinero(p.total_centavos)}", o.id)
    db.commit()
    db.refresh(p)
    return vista_presupuesto(p, "tecnico")


# ---------- 3. Cliente acepta y superadmin aprueba (los dos) ----------

class Respuesta(BaseModel):
    acepta: bool
    motivo: str = Field(default="", max_length=300)
    materiales_compra: str | None = None  # el cliente elige al aceptar quién compra los materiales


def _rechazar(db: Session, p: Presupuesto, quien: str, motivo: str, actor: User) -> None:
    p.estado, p.motivo_rechazo = "rechazado", f"{quien}: {motivo or 'sin motivo'}"
    svc.registrar(db, p.orden, p.orden.estado, actor, f"Presupuesto rechazado por {quien}")
    notificar(db, p.tecnico.user_id, "Presupuesto rechazado", f"{p.orden.codigo}: {p.motivo_rechazo}. Puedes enviar uno nuevo.", p.orden_id)
    _avisar(db, _control(db, p.orden), "Presupuesto rechazado", f"{p.orden.codigo}: {p.motivo_rechazo}", p.orden_id)


def _quizas_aprobado(db: Session, p: Presupuesto, actor: User) -> None:
    if p.cliente_acepto_en and p.admin_aprobo_en and p.estado == "enviado":
        p.estado = "aprobado"
        svc.registrar(db, p.orden, p.orden.estado, actor, "Presupuesto aprobado por el cliente y el superadmin")
        notificar(db, p.orden.cliente_id, "Presupuesto aprobado", f"{p.orden.codigo}: registra el pago de USD {dinero(p.a_pagar_centavos)} en la app.", p.orden_id)
        notificar(db, p.tecnico.user_id, "Presupuesto aprobado", f"{p.orden.codigo}: espera la confirmación del pago para instalar.", p.orden_id)


@router.post("/ordenes/{orden_id}/presupuesto/responder")
def cliente_responde(orden_id: int, body: Respuesta, user: User = Depends(require("cliente")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    p = vigente(o)
    if not p or p.estado != "enviado":
        raise HTTPException(409, "No hay un presupuesto esperando tu respuesta")
    if body.acepta:
        if body.materiales_compra:
            if body.materiales_compra not in COMPRA:
                raise HTTPException(422, "materiales_compra debe ser tecnico o cliente")
            if body.materiales_compra == "tecnico" and p.materiales_centavos and not cuenta_tecnico(p.tecnico)["registrada"]:
                raise HTTPException(422, "El técnico no tiene cuenta de pago registrada: elige comprar tú los materiales")
            p.materiales_compra = body.materiales_compra
        p.cliente_acepto_en = ahora()
        quien = "el cliente" if p.compra_cliente else "el técnico"
        svc.registrar(db, o, o.estado, user, f"El cliente aceptó el presupuesto (materiales los compra {quien}; a pagar USD {dinero(p.a_pagar_centavos)})")
        _avisar(db, _control(db, o, solo_superadmin=True), "Cliente aceptó el presupuesto", f"{o.codigo}: falta tu aprobación.", o.id)
        _quizas_aprobado(db, p, user)
    else:
        _rechazar(db, p, "el cliente", body.motivo, user)
    db.commit()
    return vista_presupuesto(p, "cliente")


@router.post("/supervisor/presupuestos/{pres_id}/aprobar")
def superadmin_aprueba(pres_id: int, body: Respuesta, user: User = Depends(require("superadmin")), db: Session = Depends(get_db)):
    p = db.get(Presupuesto, pres_id)
    if not p:
        raise HTTPException(404)
    if p.estado != "enviado":
        raise HTTPException(409, "Este presupuesto ya no está esperando aprobación")
    if body.acepta:
        p.admin_aprobo_en, p.admin_id = ahora(), user.id
        svc.registrar(db, p.orden, p.orden.estado, user, "El superadmin aprobó el presupuesto")
        _quizas_aprobado(db, p, user)
    else:
        _rechazar(db, p, "el superadmin", body.motivo, user)
    db.commit()
    return vista_presupuesto(p, user.rol)


# ---------- 4. Pago del cliente y confirmación ----------

class Pago(BaseModel):
    metodo: str
    referencia: str = Field(min_length=2, max_length=60)

    @field_validator("metodo")
    @classmethod
    def _m(cls, v):
        if v not in METODOS_PAGO:
            raise ValueError("Método de pago inválido")
        return v


@router.post("/ordenes/{orden_id}/presupuesto/pago")
def registrar_pago(orden_id: int, body: Pago, user: User = Depends(require("cliente", "agente", "supervisor")), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    p = vigente(o)
    if not p or p.estado != "aprobado":
        raise HTTPException(409, "El presupuesto todavía no está aprobado por ambas partes")
    p.pago_metodo, p.pago_referencia, p.pago_registrado_en, p.estado = body.metodo, body.referencia.strip(), ahora(), "pago_registrado"
    svc.registrar(db, o, o.estado, user, f"Pago del presupuesto registrado: {body.metodo} ref. {p.pago_referencia}")
    _avisar(db, _control(db, o), "Pago por confirmar", f"{o.codigo}: USD {dinero(p.a_pagar_centavos)} por {body.metodo}, ref. {p.pago_referencia}", o.id)
    db.commit()
    return vista_presupuesto(p, user.rol)


@router.post("/supervisor/presupuestos/{pres_id}/confirmar-pago")
def confirmar_pago(pres_id: int, user: User = Depends(require("supervisor")), db: Session = Depends(get_db)):
    p = db.get(Presupuesto, pres_id)
    if not p or p.estado != "pago_registrado":
        raise HTTPException(409, "No hay un pago por confirmar en este presupuesto")
    p.pago_confirmado_en = ahora()
    if p.materiales_centavos == 0 or p.compra_cliente:  # sin materiales que pagarle al técnico: listo de una vez
        ref = "los compra el cliente" if p.compra_cliente else "sin materiales"
        p.estado, p.materiales_pagados_en, p.materiales_referencia = "materiales_pagados", ahora(), ref
        _listo(db, p, user)
    else:
        p.estado = "pagado"
        svc.registrar(db, p.orden, p.orden.estado, user, "Pago del cliente confirmado")
        c = cuenta_tecnico(p.tecnico)
        destino = f"{c['banco']} {c['numero']}" if c["numero"] else f"pago móvil {c['pago_movil_banco']} {c['pago_movil_telefono']}"
        _avisar(db, _control(db, p.orden, solo_superadmin=True), "Pagar materiales al técnico",
                f"{p.orden.codigo}: USD {dinero(p.materiales_centavos)} a {p.tecnico.user.nombre} ({destino})", p.orden_id)
    db.commit()
    return vista_presupuesto(p, user.rol)


# ---------- 5. AHA HOME paga los materiales al técnico ----------

class PagoMateriales(BaseModel):
    referencia: str = Field(min_length=2, max_length=60)


def _listo(db: Session, p: Presupuesto, actor: User) -> None:
    p.orden.pausa_desde = None  # termina la pausa por inspección: pasa a confirmación de retiro
    nota = "materiales a cargo del cliente" if p.compra_cliente else f"materiales pagados al técnico ({p.materiales_referencia})"
    svc.registrar(db, p.orden, p.orden.estado, actor, f"Pago confirmado, {nota}: listo para instalar")
    notificar(db, p.tecnico.user_id, "¡Listo para instalar!", f"{p.orden.codigo}: ya puedes retirar e instalar.", p.orden_id)
    for a in p.orden.ayudantes:
        notificar(db, a.user_id, "¡Listo para instalar!", f"{p.orden.codigo}: sales con {p.tecnico.user.nombre}.", p.orden_id)
    lista = ", ".join(i["descripcion"] for i in p.items if i["tipo"] == "material")
    extra = f" Recuerda tener los materiales listos: {lista}." if p.compra_cliente else ""
    notificar(db, p.orden.cliente_id, "Pago confirmado", f"{p.orden.codigo}: tu instalación está confirmada.{extra}", p.orden_id)


@router.post("/supervisor/presupuestos/{pres_id}/pagar-materiales")
def pagar_materiales(pres_id: int, body: PagoMateriales, user: User = Depends(require("superadmin")), db: Session = Depends(get_db)):
    p = db.get(Presupuesto, pres_id)
    if not p or p.estado != "pagado":
        raise HTTPException(409, "Este presupuesto no está esperando el pago de materiales")
    p.estado, p.materiales_pagados_en, p.materiales_referencia = "materiales_pagados", ahora(), body.referencia.strip()
    _listo(db, p, user)
    db.commit()
    return vista_presupuesto(p, user.rol)


@router.get("/supervisor/presupuestos")
def listar(estado: str | None = None, user: User = Depends(require("tecnico_supervisor", "supervisor")), db: Session = Depends(get_db)):
    q = select(Presupuesto).order_by(Presupuesto.id.desc())
    if estado:
        q = q.where(Presupuesto.estado == estado)
    ps = [p for p in db.scalars(q.limit(200)) if user.rol != "tecnico_supervisor" or p.orden.tienda_id == user.tienda_id]
    return [vista_presupuesto(p, user.rol) for p in ps]


# ---------- Cuenta bancaria del técnico ----------

class Cuenta(BaseModel):
    banco: str = Field(default="", max_length=60)
    tipo: str = Field(default="", max_length=20)
    numero: str = Field(default="", max_length=30)
    titular: str = Field(default="", max_length=120)
    cedula: str = Field(default="", max_length=20)
    pago_movil_telefono: str = Field(default="", max_length=20)
    pago_movil_banco: str = Field(default="", max_length=60)


@router.get("/tecnico/cuenta-bancaria")  # el técnico solo la ve; la registra la oficina
def ver_cuenta(user: User = Depends(require("tecnico")), db: Session = Depends(get_db)):
    return cuenta_tecnico(user.tecnico)


def guardar_cuenta_de(t: Tecnico, body: Cuenta) -> None:
    numero = "".join(ch for ch in body.numero if ch.isdigit())
    if numero and len(numero) != 20:
        raise HTTPException(422, "El número de cuenta venezolano tiene 20 dígitos")
    t.cuenta_banco, t.cuenta_tipo, t.cuenta_numero = body.banco.strip(), body.tipo.strip(), numero
    t.cuenta_titular, t.cuenta_cedula = body.titular.strip(), body.cedula.strip()
    t.pago_movil_telefono, t.pago_movil_banco = body.pago_movil_telefono.strip(), body.pago_movil_banco.strip()


@router.put("/supervisor/tecnicos/{tec_id}/cuenta-bancaria")
def guardar_cuenta(tec_id: int, body: Cuenta, user: User = Depends(require("tecnico_supervisor", "supervisor")), db: Session = Depends(get_db)):
    """En la oficina: datos bancarios para pagarle al técnico sus servicios y los materiales."""
    from .supervisor import tecnico_controlado
    t = tecnico_controlado(db, user, tec_id)
    guardar_cuenta_de(t, body)
    svc_txt = f"{t.user.nombre}: cuenta de pago actualizada por {user.nombre}"
    notificar(db, t.user_id, "Cuenta de pago registrada", "La oficina registró la cuenta donde te pagamos tus servicios y materiales.")
    db.commit()
    return cuenta_tecnico(t) | {"nota": svc_txt}


# ---------- Propina al cerrar el servicio ----------

class Propina(BaseModel):
    monto: float = Field(gt=0, le=1000)  # USD
    metodo: str
    referencia: str = Field(default="", max_length=60)

    @field_validator("metodo")
    @classmethod
    def _m(cls, v):
        if v not in METODOS_PAGO:
            raise ValueError("Método de pago inválido")
        return v


@router.post("/ordenes/{orden_id}/propina")
def dar_propina(orden_id: int, body: Propina, user: User = Depends(require("cliente")), db: Session = Depends(get_db)):
    """En efectivo se entrega en mano a la cuadrilla; por transferencia la recibe AHA HOME y se la pasa al técnico."""
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "completado")
    if o.propina_en:
        raise HTTPException(409, "Ya diste una propina en este servicio. ¡Gracias!")
    efectivo = body.metodo.startswith("efectivo")
    if not efectivo and len(body.referencia.strip()) < 2:
        raise HTTPException(422, "Indica la referencia del pago")
    o.propina_centavos, o.propina_metodo, o.propina_referencia, o.propina_en = round(body.monto * 100), body.metodo, body.referencia.strip(), ahora()
    if efectivo:
        o.propina_entregada_en = ahora()
    svc.registrar(db, o, o.estado, user, f"Propina USD {dinero(o.propina_centavos)} ({body.metodo})")
    if o.tecnico:
        txt = f"{o.codigo}: {o.cliente_nombre.split()[0]} te dejó USD {dinero(o.propina_centavos)}" + ("" if efectivo else ". AHA HOME te la transfiere a tu cuenta.")
        notificar(db, o.tecnico.user_id, "¡Recibiste una propina!", txt, o.id)
        for a in o.ayudantes:
            notificar(db, a.user_id, "¡Propina para la cuadrilla!", txt, o.id)
    if not efectivo:
        _avisar(db, _control(db, o, solo_superadmin=True), "Propina por transferir",
                f"{o.codigo}: USD {dinero(o.propina_centavos)} para {o.tecnico.user.nombre if o.tecnico else '—'} (ref. {o.propina_referencia})", o.id)
    db.commit()
    return svc.vista(o, user.rol)


@router.post("/supervisor/ordenes/{orden_id}/propina-entregada")
def propina_entregada(orden_id: int, body: PagoMateriales, user: User = Depends(require("superadmin")), db: Session = Depends(get_db)):
    o = db.get(Orden, orden_id)
    if not o or not o.propina_en or o.propina_entregada_en:
        raise HTTPException(409, "No hay una propina por transferir en esta orden")
    o.propina_entregada_en = ahora()
    svc.registrar(db, o, o.estado, user, f"Propina transferida al técnico (ref. {body.referencia.strip()})")
    if o.tecnico:
        notificar(db, o.tecnico.user_id, "Propina transferida", f"{o.codigo}: USD {dinero(o.propina_centavos)} ya está en tu cuenta.", o.id)
    db.commit()
    return svc.vista(o, user.rol)


@router.get("/supervisor/propinas-pendientes")
def propinas_pendientes(user: User = Depends(require("supervisor")), db: Session = Depends(get_db)):
    """Propinas pagadas por transferencia que AHA HOME debe pasar al técnico."""
    os_ = db.scalars(select(Orden).where(Orden.propina_en.is_not(None), Orden.propina_entregada_en.is_(None)).order_by(Orden.id.desc())).all()
    return [{"orden_id": o.id, "codigo": o.codigo, "monto": dinero(o.propina_centavos), "metodo": o.propina_metodo, "referencia": o.propina_referencia,
             "tecnico": o.tecnico.user.nombre if o.tecnico else None, "cuenta_tecnico": cuenta_tecnico(o.tecnico) if o.tecnico else None} for o in os_]
