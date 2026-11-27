"""Módulo de campo: técnico instalador y sus ayudantes.

Alta con biometría, guardia del día, retiro con QR en almacén (traslado), salida directa (solo instalación),
checklist según el tipo de servicio, fotos y cierre.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import asignacion
from .. import ordenes as svc
from ..db import get_db
from ..deps import require
from ..models import Incidencia, Orden, Tecnico, Tienda, User, ahora, con_retiro, orden_ayudantes
from ..notificar import notificar
from ..security import hash_password, make_token
from .auth import limpiar_tel, perfil
from .ordenes import obtener

from ..formacion import NuevaFormacion as NuevaFormacionApp  # noqa: E402

router = APIRouter(prefix="/tecnico", tags=["tecnico"])
solo_tecnico = require("tecnico")
campo = require("tecnico", "ayudante")


def mi_tecnico(user: User) -> Tecnico:
    if not user.tecnico:
        raise HTTPException(403, "Tu usuario no está registrado como técnico o ayudante")
    return user.tecnico


def verificado(user: User) -> Tecnico:
    t = mi_tecnico(user)
    if not t.verificado:
        raise HTTPException(403, "Tu identidad aún no ha sido verificada por el supervisor")
    return t


class RegistroCampo(BaseModel):
    """Paso 1 en la app: datos escritos. Luego se suben las fotos y la huella con /tecnico/onboarding."""
    nombre: str = Field(min_length=3, max_length=120)
    cedula: str = Field(min_length=5, max_length=20)
    telefono: str = Field(min_length=7, max_length=30)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=6, max_length=100)
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")
    rol: str = "tecnico"  # tecnico o ayudante
    tienda_id: int
    conduce: bool = False  # al registrarse elige: conductor, instalador o ambas
    instala: bool = True


def normalizar_cedula(c: str) -> str:
    c = c.upper().replace(".", "").replace(" ", "").replace("-", "")
    letra = c[0] if c[:1] in ("V", "E") else "V"
    num = "".join(ch for ch in c if ch.isdigit())
    if not 5 <= len(num) <= 9:
        raise HTTPException(422, "Número de cédula inválido")
    return f"{letra}-{int(num):,}".replace(",", ".")


@router.post("/registro")
def registro_campo(body: RegistroCampo, db: Session = Depends(get_db)):
    from .. import config
    if config.SOLO_EQUIPO:
        raise HTTPException(403, config.MENSAJE_SOLO_EQUIPO)
    if body.rol not in ("tecnico", "ayudante"):
        raise HTTPException(422, "Rol inválido")
    if body.rol == "tecnico" and not (body.conduce or body.instala):
        raise HTTPException(422, "Elige tu perfil: conductor, técnico instalador o mixto")
    if not db.get(Tienda, body.tienda_id):
        raise HTTPException(422, "Tienda no válida")
    tel = limpiar_tel(body.telefono)
    email = body.email.strip().lower()
    cedula = normalizar_cedula(body.cedula)
    previo = db.scalar(select(User).where(User.cedula == cedula))
    if not previo and body.rol == "ayudante":  # su profesional ya lo registró con teléfono y correo (sin cédula)
        previo = db.scalar(select(User).where(User.rol == "ayudante", User.password_hash.is_(None),
                                              or_(User.telefono == limpiar_tel(body.telefono), User.email == body.email.strip().lower())))
    # Ayudante que su técnico ya anotó desde su perfil: al registrarse completa su propia cuenta
    reclamar = previo if previo and previo.rol == "ayudante" and body.rol == "ayudante" and not previo.password_hash else None
    otro_tel = db.scalar(select(User).where(User.telefono == tel))
    if otro_tel and otro_tel is not reclamar:
        raise HTTPException(409, "Ese teléfono ya está registrado")
    otro_mail = db.scalar(select(User).where(User.email == email))
    if otro_mail and otro_mail is not reclamar:
        raise HTTPException(409, "Ese correo ya está registrado")
    if body.rol == "ayudante" and not reclamar:
        raise HTTPException(403, "Los ayudantes no se registran solos: tu profesional te registra desde su app como parte de su equipo")
    if previo and not reclamar:
        raise HTTPException(409, "Esa cédula ya está registrada")
    if reclamar:
        reclamar.nombre, reclamar.telefono, reclamar.email, reclamar.cedula = body.nombre.strip(), tel, email, cedula
        reclamar.password_hash = hash_password(body.password)
        reclamar.tecnico.pin_hash = hash_password(body.pin)
        db.commit()
        db.refresh(reclamar)
        return {"token": make_token(reclamar.id), "usuario": perfil(reclamar)}
    u = User(nombre=body.nombre.strip(), cedula=cedula, telefono=tel, email=email, password_hash=hash_password(body.password),
             rol=body.rol, tienda_id=body.tienda_id)
    db.add(u)
    db.flush()
    db.add(Tecnico(user_id=u.id, tienda_id=body.tienda_id, grupo=None, es_ayudante=body.rol == "ayudante",
                   pin_hash=hash_password(body.pin), conduce=body.conduce and body.rol == "tecnico", instala=body.instala or body.rol == "ayudante"))
    db.commit()
    db.refresh(u)
    return {"token": make_token(u.id), "usuario": perfil(u)}


CLAUSULA_AYUDANTE = ("Declaro que esta persona es parte de mi equipo de trabajo y que queda bajo mi responsabilidad mientras me acompaña "
                     "en los servicios de AHA HOME: su conducta, el trato con los clientes y el cuidado de los artículos.")


class NuevoAyudante(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)          # nombre completo
    telefono: str = Field(min_length=7, max_length=30)
    email: str = Field(min_length=5, max_length=160)
    foto: str = Field(min_length=5, max_length=200)            # foto de perfil, subida antes con POST /archivos
    cedula: str | None = Field(default=None, max_length=20)    # opcional: se completa en la oficina
    acepta_clausula: bool = False                             # «queda bajo mi responsabilidad»


@router.get("/formacion")
def mi_formacion(user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    """Mis títulos y cursos."""
    from .. import formacion
    return formacion.lista(db, mi_tecnico(user))


@router.post("/formacion")
def subir_formacion(body: NuevaFormacionApp, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    from .. import formacion
    f = formacion.agregar(db, mi_tecnico(user), body, user)
    db.commit()
    return formacion.ficha(f)


@router.delete("/formacion/{fid}")
def quitar_formacion(fid: int, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    from .. import formacion
    formacion.quitar(db, mi_tecnico(user), fid, user)
    db.commit()
    return {"ok": True}


@router.get("/ayudantes")
def mis_ayudantes(user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    t = mi_tecnico(user)
    return [svc.ficha(a) | {"alta": a.alta_en is not None} for a in t.ayudantes]


@router.post("/ayudantes")
def anotar_ayudante(body: NuevoAyudante, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    """El técnico anota a su ayudante con foto y nombre. Sale en órdenes solo después del registro completo en la oficina."""
    t = mi_tecnico(user)
    if t.es_ayudante:
        raise HTTPException(403, "Solo el profesional registra a sus ayudantes")
    if not body.acepta_clausula:
        raise HTTPException(422, "Para registrar a un ayudante debes aceptar que queda bajo tu responsabilidad")
    cedula = normalizar_cedula(body.cedula) if body.cedula and body.cedula.strip() else None
    if cedula and db.scalar(select(User).where(User.cedula == cedula)):
        raise HTTPException(409, "Esa cédula ya está registrada")
    tel = limpiar_tel(body.telefono)
    if db.scalar(select(User).where(User.telefono == tel)):
        raise HTTPException(409, "Ese teléfono ya está registrado")
    email = body.email.strip().lower()
    if "@" not in email or db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Ese correo ya está registrado o no es válido")
    u = User(nombre=body.nombre.strip(), cedula=cedula, telefono=tel, email=email, rol="ayudante", tienda_id=t.tienda_id)
    db.add(u)
    db.flush()
    a = Tecnico(user_id=u.id, tienda_id=t.tienda_id, grupo=t.grupo, es_ayudante=True, jefe_id=t.id, foto_perfil=body.foto,
                conduce=False, instala=True, clausula_aceptada_en=ahora())
    db.add(a)
    for s in db.scalars(select(User).where(User.activo.is_(True), or_(
            User.rol.in_(("supervisor", "superadmin")),
            (User.rol == "tecnico_supervisor") & (User.tienda_id == t.tienda_id)))):
        notificar(db, s.id, "Ayudante por registrar", f"{user.nombre} registró a {u.nombre} como su ayudante (bajo su responsabilidad). Completa su verificación en la oficina.")
    db.commit()
    return svc.ficha(a) | {"alta": False}


class Onboarding(BaseModel):
    foto_rostro: str = Field(min_length=5, max_length=200)    # escaneo facial
    selfie_cedula: str = Field(min_length=5, max_length=200)  # su cara con la cédula en alto, visible
    huella_registrada: bool                                   # la app confirmó la huella del teléfono
    pin: str | None = Field(default=None, min_length=4, max_length=8, pattern=r"^\d+$")


class VerificarRostro(BaseModel):
    selfie_cedula: str = Field(max_length=200)
    foto_rostro: str = Field(max_length=200)


def _archivo(url: str):
    from .. import almacen
    nombre = url.rsplit("/", 1)[-1]
    ruta = almacen.a_archivo_temporal(nombre) if url.startswith("/archivos/") else None
    if ruta is None:
        raise HTTPException(422, "Foto no encontrada: vuelve a tomarla")
    return ruta


@router.post("/verificar-rostro")
def verificar_rostro(body: VerificarRostro, user: User = Depends(campo), db: Session = Depends(get_db)):
    """Compara la foto con la cédula en el pecho con el escaneo de la cara. Tienen que ser la misma persona."""
    from .. import rostro
    t = mi_tecnico(user)
    t.rostro_intentos += 1
    if t.rostro_intentos > 10:
        raise HTTPException(429, "Demasiados intentos. Pasa por la oficina de AHA HOME para tu alta.")
    r = rostro.comparar(_archivo(body.selfie_cedula), _archivo(body.foto_rostro))
    t.selfie_cedula, t.foto_rostro = body.selfie_cedula, body.foto_rostro
    t.rostro_resultado = "revision_manual" if not r["disponible"] else "coincide" if r["coincide"] else "no_coincide"
    t.rostro_similitud = r.get("similitud") or 0.0
    t.rostro_similitud_cedula = r.get("similitud_cedula") or 0.0
    db.commit()
    return r


@router.post("/onboarding")
def onboarding(body: Onboarding, user: User = Depends(campo), db: Session = Depends(get_db)):
    t = mi_tecnico(user)
    if not body.huella_registrada:
        raise HTTPException(422, "Registra tu huella en el teléfono para continuar")
    if t.rostro_resultado not in ("coincide", "revision_manual") or t.foto_rostro != body.foto_rostro or t.selfie_cedula != body.selfie_cedula:
        raise HTTPException(422, "Primero verifica tu cara: la foto con la cédula y el escaneo tienen que coincidir")
    t.foto_rostro, t.selfie_cedula, t.huella_registrada = body.foto_rostro, body.selfie_cedula, True
    if body.pin:
        t.pin_hash = hash_password(body.pin)
    t.verificado = False  # el alta se da en la oficina, con el expediente completo
    quien = "Ayudante" if t.es_ayudante else "Técnico"
    for s in db.scalars(select(User).where(User.activo.is_(True), or_(
            User.rol.in_(("supervisor", "superadmin")),
            (User.rol == "tecnico_supervisor") & (User.tienda_id == t.tienda_id)))):
        notificar(db, s.id, f"{quien} por dar de alta", f"{user.nombre} ({user.cedula}) completó su registro en la app.")
    db.commit()
    return {"ok": True, "verificado": False}


@router.get("/hoy")
def hoy(user: User = Depends(campo), db: Session = Depends(get_db)):
    t = mi_tecnico(user)
    fecha = asignacion.hoy()
    guardia = asignacion.grupo_de_guardia(fecha)
    q = select(Orden).where(Orden.fecha == fecha.isoformat(), Orden.estado != "cancelado").order_by(Orden.franja, Orden.id)
    if t.es_ayudante:
        q = q.join(orden_ayudantes, orden_ayudantes.c.orden_id == Orden.id).where(orden_ayudantes.c.tecnico_id == t.id)
    else:
        q = q.where(Orden.tecnico_id == t.id)
    ords = db.scalars(q).all()
    abiertas = [o for o in ords if o.estado != "completado"]
    activa = next((o for o in abiertas if o.estado in ("en_ruta", "en_progreso")), abiertas[0] if abiertas else None)
    jefe_tienda = db.scalar(select(User).where(User.rol == "tecnico_supervisor", User.tienda_id == t.tienda_id,
                                               User.activo.is_(True)).order_by(User.id))
    sup = jefe_tienda or db.scalar(select(User).where(User.rol == "supervisor", User.activo.is_(True)).order_by(User.id))
    grupo = t.jefe.grupo if t.es_ayudante and t.jefe else t.grupo
    return {
        "fecha": fecha.isoformat(), "rol": "ayudante" if t.es_ayudante else "tecnico",
        "grupo": grupo, "grupo_de_guardia_hoy": guardia,
        "de_guardia": grupo == guardia or (grupo == "RETEN" and (t.jefe.reten_activo if t.es_ayudante and t.jefe else t.reten_activo)),
        "verificado": t.verificado, "tienda": t.tienda.nombre, "zona": t.tienda.zona,
        "respaldo": t.respaldo_fecha == fecha.isoformat(), "respaldo_activo": t.respaldo_activo_fecha == fecha.isoformat(),
        "ausente": t.ausente_fecha == fecha.isoformat(),
        "jefe": svc.ficha(t.jefe) if t.es_ayudante else None,
        "mis_ayudantes": [svc.ficha(a) for a in t.ayudantes] if not t.es_ayudante else [],
        "supervisor": {"nombre": sup.nombre, "telefono": sup.telefono, "rol": sup.rol} if sup else None,
        "orden_activa": svc.vista(activa, user.rol) if activa else None,
        "pendientes": [svc.vista(o, user.rol) for o in abiertas if not activa or o.id != activa.id],
        "completadas": sum(1 for o in ords if o.estado == "completado"),
    }


@router.post("/ordenes/{orden_id}/confirmar")
def confirmar_cita(orden_id: int, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    verificado(user)
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "tecnico_asignado")
    svc.registrar(db, o, "cita_confirmada", user, f"Cita confirmada para {o.fecha} {o.franja}")
    notificar(db, o.cliente_id, "Cita confirmada", f"{o.codigo}: te visitamos el {o.fecha} entre {o.franja}.", o.id)
    db.commit()
    return svc.vista(o, "tecnico")


class CambiarAyudantes(BaseModel):
    ayudantes: list[int]


@router.put("/ordenes/{orden_id}/ayudantes")
def elegir_ayudantes(orden_id: int, body: CambiarAyudantes, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    """El técnico indica qué ayudantes salen con él (solo de su propia cuadrilla)."""
    t = verificado(user)
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "tecnico_asignado", "cita_confirmada")
    mios = {a.id: a for a in svc.ayudantes_disponibles(t)}
    if any(i not in mios for i in body.ayudantes):
        raise HTTPException(422, "Solo puedes elegir ayudantes verificados de tu cuadrilla")
    o.ayudantes = [mios[i] for i in body.ayudantes]
    svc.registrar(db, o, o.estado, user, f"Cuadrilla: {svc.nombres_cuadrilla(o)}")
    db.commit()
    return svc.vista(o, "tecnico")


def _salida(db: Session, o: Orden, user: User, nota: str) -> None:
    svc.registrar(db, o, "en_ruta", user, nota)
    equipo = svc.nombres_cuadrilla(o)
    notificar(db, o.cliente_id, "Tu servicio va en camino",
              f"{equipo} va hacia tu casa. Abre la app para ver su foto.", o.id)
    svc.avisar_seguimiento(db, o, f"{o.codigo} en ruta", nota)


class Retiro(BaseModel):
    qr: str = Field(max_length=200)
    seriales: dict[int, str] = {}  # id del artículo → serial, si en caja no se escaneó


@router.post("/retiro")
def retiro_en_almacen(body: Retiro, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    """Fase B: el técnico (ya validado con huella/rostro en su teléfono) escanea el QR en despacho."""
    t = verificado(user)
    token = body.qr.strip().removeprefix("AHAHOME:")
    o = db.scalar(select(Orden).where(Orden.qr_token == token))
    if not o or not con_retiro(o.tipo_servicio):
        raise HTTPException(404, "Código QR no válido")
    if o.tecnico_id != t.id:
        raise HTTPException(403, "Esta orden está asignada a otro técnico. Contacta a tu supervisor.")
    svc.exigir_estado(o, "tecnico_asignado", "cita_confirmada")
    from .presupuestos import exigir_listo
    exigir_listo(o)
    for a in o.articulos:
        if body.seriales.get(a.id) and not a.serial:
            a.serial = body.seriales[a.id].strip()[:80]
    o.retirado_en = ahora()
    lista = "; ".join(f"{svc.nombre_articulo(a)} {a.modelo} serial {a.serial or 's/n'}".strip() for a in o.articulos)
    _salida(db, o, user, f"Retiro en almacén: {svc.nombres_cuadrilla(o)} · {len(o.articulos)} artículo(s): {lista} · {o.tienda.nombre}")
    db.commit()
    return svc.vista(o, "tecnico")


@router.post("/ordenes/{orden_id}/salir")
def salir_a_instalar(orden_id: int, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    """Solo instalación: el equipo ya está en casa del cliente, la cuadrilla sale directo sin pasar por el almacén."""
    verificado(user)
    o = obtener(db, orden_id, user)
    if con_retiro(o.tipo_servicio):
        raise HTTPException(409, "Esta orden requiere retirar el equipo en el almacén con el código QR")
    svc.exigir_estado(o, "tecnico_asignado", "cita_confirmada")
    from .presupuestos import exigir_listo
    exigir_listo(o)
    _salida(db, o, user, f"Salida directa al domicilio: {svc.nombres_cuadrilla(o)}")
    db.commit()
    return svc.vista(o, "tecnico")


@router.post("/ordenes/{orden_id}/llegada")
def llegada(orden_id: int, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_ruta")
    svc.registrar(db, o, "en_progreso", user, "Cuadrilla en el domicilio")
    notificar(db, o.cliente_id, "Llegamos", f"{o.codigo}: comenzó el servicio.", o.id)
    svc.avisar_seguimiento(db, o, f"{o.codigo} en progreso", "La cuadrilla llegó al domicilio")
    db.commit()
    return svc.vista(o, "tecnico")


class Checklist(BaseModel):
    items: dict[str, bool]


@router.put("/ordenes/{orden_id}/checklist")
def checklist(orden_id: int, body: Checklist, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_progreso")
    validos = set(svc.requeridos(o)[0])
    malos = [k for k in body.items if k not in validos]
    if malos:
        raise HTTPException(422, f"Puntos que no aplican a este servicio: {', '.join(malos)}")
    o.checklist = {**(o.checklist or {}), **body.items}
    db.commit()
    return svc.vista(o, "tecnico")


class Fotos(BaseModel):
    fotos: dict[str, str]


@router.put("/ordenes/{orden_id}/fotos")
def fotos(orden_id: int, body: Fotos, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_progreso")
    malos = [k for k in body.fotos if k not in svc.requeridos(o)[1]]
    if malos:
        raise HTTPException(422, f"Fotos que no aplican a este servicio: {', '.join(malos)}")
    o.fotos = {**(o.fotos or {}), **body.fotos}
    db.commit()
    return svc.vista(o, "tecnico")


class Cierre(BaseModel):
    token: str = Field(default="", max_length=12)


INTENTOS_TOKEN = 5


@router.post("/ordenes/{orden_id}/completar")
def completar(orden_id: int, body: Cierre | None = None, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    """Cerrar el servicio: fotos y checklist completos + el código que dicta el cliente (o que envía por el chat)."""
    o = obtener(db, orden_id, user)
    svc.exigir_estado(o, "en_progreso")
    falta = svc.faltantes_cierre(o)
    if falta:
        raise HTTPException(422, {"mensaje": "Completa el checklist y las fotos antes de cerrar", "faltan": falta})
    if not (o.acta or {}).get("en"):
        raise HTTPException(409, "Falta que el cliente confirme el acta de conformidad en su app")
    dado = "".join(ch for ch in (body.token if body else "") if ch.isdigit())
    if not dado:
        raise HTTPException(422, "Escribe el código de cierre que te da el cliente")
    if not svc.codigo_vigente(o):
        raise HTTPException(422, "El código venció: pídele al cliente que toque «Pedir otro código» en su app")
    if dado != o.token_cierre:
        o.token_intentos += 1
        if o.token_intentos >= INTENTOS_TOKEN:
            svc.emitir_codigo_cierre(db, o)
            svc.avisar_seguimiento(db, o, f"{o.codigo}: código de cierre bloqueado", f"{user.nombre} falló {INTENTOS_TOKEN} veces; se generó uno nuevo")
            db.commit()
            raise HTTPException(422, "Código incorrecto. Por seguridad se generó uno nuevo: pídeselo al cliente")
        db.commit()
        quedan = INTENTOS_TOKEN - o.token_intentos
        raise HTTPException(422, f"Código de cierre incorrecto. Te quedan {quedan} intento(s)")
    svc.marcar_completada(db, o, user)
    db.commit()
    return svc.vista(o, "tecnico")


class Disponible(BaseModel):
    disponible: bool
    motivo: str = Field(default="", max_length=200)


def _avisar_control(db: Session, t: Tecnico, titulo: str, texto: str) -> None:
    for s in db.scalars(select(User).where(User.activo.is_(True), or_(
            User.rol.in_(("supervisor", "superadmin")),
            (User.rol == "tecnico_supervisor") & (User.tienda_id == t.tienda_id)))):
        notificar(db, s.id, titulo, texto)


@router.post("/respaldo")
def ofrecer_respaldo(body: Disponible, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    """El técnico que no está de guardia se ofrece (o se retira) como respaldo para hoy."""
    t = verificado(user)
    hoy_ = asignacion.hoy().isoformat()
    t.respaldo_fecha = hoy_ if body.disponible else None
    if not body.disponible and t.respaldo_activo_fecha == hoy_:
        t.respaldo_activo_fecha = None
    if body.disponible:
        _avisar_control(db, t, "Técnico de respaldo disponible", f"{user.nombre} (Grupo {t.grupo}) está disponible hoy como respaldo.")
    db.commit()
    return {"respaldo": t.respaldo_fecha == hoy_}


@router.post("/ausencia")
def avisar_ausencia(body: Disponible, user: User = Depends(solo_tecnico), db: Session = Depends(get_db)):
    """«No puedo trabajar hoy» (disponible=false) o «ya puedo» (disponible=true). Avisa al centro de control."""
    t = verificado(user)
    hoy_ = asignacion.hoy().isoformat()
    t.ausente_fecha = None if body.disponible else hoy_
    t.ausente_motivo = "" if body.disponible else body.motivo.strip()
    pendientes = 0
    if not body.disponible:
        pendientes = db.scalar(select(func.count(Orden.id)).where(Orden.tecnico_id == t.id, Orden.fecha == hoy_,
                                                               Orden.estado.in_(("tecnico_asignado", "cita_confirmada")))) or 0
        _avisar_control(db, t, "Falta un técnico hoy",
                        f"{user.nombre} no puede trabajar hoy ({t.ausente_motivo or 'sin motivo'}). Órdenes por reasignar: {pendientes}. Revisa el respaldo del día.")
    db.commit()
    return {"ausente": t.ausente_fecha == hoy_, "ordenes_por_reasignar": pendientes}


class Ubicacion(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


@router.post("/ubicacion")
def ubicacion(body: Ubicacion, user: User = Depends(campo), db: Session = Depends(get_db)):
    """La app del técnico envía su posición mientras va en ruta o está en servicio (mapa en vivo)."""
    t = mi_tecnico(user)
    if t.es_ayudante and t.jefe:  # el ayudante va con su técnico: se actualiza la cuadrilla
        t = t.jefe
    t.lat_actual, t.lng_actual, t.ubicacion_en = body.lat, body.lng, ahora()
    db.commit()
    return {"ok": True}


class NuevaIncidencia(BaseModel):
    orden_id: int | None = None
    texto: str = Field(min_length=3, max_length=500)


@router.post("/incidencias")
def incidencia(body: NuevaIncidencia, user: User = Depends(campo), db: Session = Depends(get_db)):
    t = mi_tecnico(user)
    o = obtener(db, body.orden_id, user) if body.orden_id else None
    inc = Incidencia(orden_id=o.id if o else None, tecnico_id=t.id, texto=body.texto.strip())
    db.add(inc)
    titulo = "Incidencia" + (f" en {o.codigo}" if o else "")
    for s in db.scalars(select(User).where(User.activo.is_(True), or_(
            User.rol.in_(("supervisor", "superadmin")),
            (User.rol == "tecnico_supervisor") & (User.tienda_id == t.tienda_id)))):
        notificar(db, s.id, titulo, f"{user.nombre}: {inc.texto}", o.id if o else None)
    db.commit()
    return {"id": inc.id}
