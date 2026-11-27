"""Tablas de AHA HOME."""
import datetime as dt

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def ahora() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


CARACAS = dt.timedelta(hours=-4)  # Venezuela: UTC-4 todo el año


def dia_caracas(t: dt.datetime | None = None) -> str:
    """Fecha (AAAA-MM-DD) en Caracas de un momento guardado en UTC; sin argumento, la de hoy."""
    return ((t or ahora()) + CARACAS).date().isoformat()


# Roles:
#   cliente            compra en Damasco y sigue su servicio
#   agente             Agente AHA HOME en la caja de la tienda
#   tecnico            técnico instalador (encabeza la cuadrilla)
#   ayudante           ayudante del técnico (también registrado y verificado)
#   tecnico_supervisor jefe técnico de la tienda: recibe aviso de cada orden nueva
#   supervisor         equipo supervisor: seguimiento de las tiendas
#   superadmin         seguimiento completo de todo el proceso, crea tiendas y supervisores
ROLES = ("cliente", "agente", "tecnico", "ayudante", "tecnico_supervisor", "supervisor", "superadmin")
ROLES_CAMPO = ("tecnico", "ayudante")

# Tipo de servicio (3 fases)
TIPOS_SERVICIO = ("traslado", "instalacion", "traslado_instalacion")
TIPO_SERVICIO_TEXTO = {"traslado": "Traslado", "instalacion": "Instalación", "traslado_instalacion": "Traslado e instalación"}
ZONAS = ("Oeste", "Central", "Este")
GRUPOS = ("A", "B", "C", "RETEN")
# Categorías de artículo. Todos se pueden trasladar; se instala solo lo que tiene tarifa de instalación activa.
TIPOS_EQUIPO = ("nevera", "lavadora", "secadora", "aire_acondicionado", "cocina", "televisor", "otro")
TIPO_EQUIPO_TEXTO = {"nevera": "Nevera", "lavadora": "Lavadora", "secadora": "Secadora", "aire_acondicionado": "Aire acondicionado",
                     "cocina": "Cocina", "televisor": "Televisor", "otro": "Otro artículo"}
METODOS_PAGO = ("pago_movil", "efectivo_bs", "efectivo_usd", "zelle", "punto_de_venta")
# Métodos que se cobran en bolívares (a la tasa oficial del BCV del día); el resto, en dólares.
TIPOS_INMUEBLE = ("casa", "edificio", "oficina")
TIPO_INMUEBLE_TEXTO = {"casa": "Casa", "edificio": "Edificio", "oficina": "Oficina"}

METODOS_BS = ("pago_movil", "efectivo_bs", "punto_de_venta")


def moneda_de(metodo: str | None) -> str:
    return "" if not metodo else ("Bs" if metodo in METODOS_BS else "USD")


METODO_PAGO_TEXTO = {"pago_movil": "Pago móvil", "efectivo_bs": "Efectivo en bolívares", "efectivo_usd": "Efectivo en dólares",
                     "zelle": "Zelle", "punto_de_venta": "Punto de venta"}

# Línea de tiempo que ve el cliente (spec, pantalla 4)
ESTADOS = ("solicitud_enviada", "tecnico_asignado", "cita_confirmada", "en_ruta", "en_progreso", "completado")
ESTADO_CANCELADO = "cancelado"
ESTADO_TEXTO = {
    "solicitud_enviada": "Solicitud enviada",
    "tecnico_asignado": "Técnico asignado",
    "cita_confirmada": "Cita confirmada",
    "en_ruta": "Técnico en ruta",
    "en_progreso": "Servicio en progreso",
    "completado": "Servicio completado",
    "cancelado": "Cancelado",
    "entrega_fallida": "No se pudo entregar · penalidad",
}
ESTADO_FALLIDA = "entrega_fallida"

# Checklist digital obligatorio (spec, pasos 6 y 7), según el tipo de servicio.
# Traslado: se entrega tal cual sale de la tienda, en su caja; no se desembala ni se retiran residuos.
CHECKLIST_TRASLADO = ("entrega_en_empaque_original", "ubicado_en_sitio")
CHECKLIST_INSTALACION = ("conexion_electrica", "conexion_hidraulica", "nivelacion", "prueba_encendido")
CHECKLIST_RESIDUOS = ("cajas", "anime", "plasticos", "flejes", "precintos")
# Si el cliente se queda con el empaque (p. ej. lo pide la garantía del fabricante), no se retiran residuos.
CHECKLIST_EMPAQUE_CLIENTE = ("empaque_entregado_al_cliente",)
FOTOS_CIERRE = ("instalacion", "espacio_limpio", "entrega")


def checklist_de(tipo_servicio: str, hay_sin_instalar: bool = False, retirar_residuos: bool = True) -> tuple[str, ...]:
    """Traslado: solo entrega. Con instalación: instalación + residuos (opcional), y la entrega de lo que va sin instalar."""
    if tipo_servicio == "traslado":
        return CHECKLIST_TRASLADO
    extra = CHECKLIST_TRASLADO if tipo_servicio == "traslado_instalacion" and hay_sin_instalar else ()
    return extra + CHECKLIST_INSTALACION + (CHECKLIST_RESIDUOS if retirar_residuos else CHECKLIST_EMPAQUE_CLIENTE)


def fotos_de(tipo_servicio: str, hay_sin_instalar: bool = False) -> tuple[str, ...]:
    if tipo_servicio == "traslado":
        return ("entrega",)
    extra = ("entrega",) if tipo_servicio == "traslado_instalacion" and hay_sin_instalar else ()
    return extra + ("instalacion", "espacio_limpio")


def con_retiro(tipo_servicio: str) -> bool:
    """Traslado y traslado+instalación pasan por el almacén Damasco (QR); solo instalación va directo al cliente."""
    return tipo_servicio != "instalacion"


orden_ayudantes = Table(
    "orden_ayudantes", Base.metadata,
    Column("orden_id", ForeignKey("ordenes.id"), primary_key=True),
    Column("tecnico_id", ForeignKey("tecnicos.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    telefono: Mapped[str | None] = mapped_column(String(30), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(200))
    rol: Mapped[str] = mapped_column(String(20), default="cliente")
    cedula: Mapped[str | None] = mapped_column(String(20))
    foto: Mapped[str | None] = mapped_column(String(200))  # foto del cliente al registrarse
    email_verificado: Mapped[bool] = mapped_column(Boolean, default=True)
    sesiones_desde: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)  # sesiones abiertas antes de esto quedan cerradas  # los clientes empiezan sin verificar
    verificacion_token: Mapped[str | None] = mapped_column(String(60), index=True)
    verificacion_vence: Mapped[dt.datetime | None] = mapped_column(DateTime)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    es_ceo: Mapped[bool] = mapped_column(Boolean, default=False)
    permisos: Mapped[list | None] = mapped_column(JSON)  # limitaciones que fija el CEO (None = las de su rol)
    clave_temporal: Mapped[bool] = mapped_column(Boolean, default=False)
    # Recuperar la clave por correo: se guarda solo el hash del enlace (vale 30 minutos y sirve una vez)
    reset_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reset_vence: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)  # la creó el CEO: debe cambiarla al entrar
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))  # superadmin que además ve el centro de mando y la auditoría
    ultimo_acceso_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    ultimo_ip: Mapped[str] = mapped_column(String(64), default="")
    push_token: Mapped[str | None] = mapped_column(String(200))
    tienda_id: Mapped[int | None] = mapped_column(ForeignKey("tiendas.id"))  # agentes y supervisores
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    tecnico: Mapped["Tecnico | None"] = relationship(back_populates="user", uselist=False, foreign_keys="Tecnico.user_id")


class Tienda(Base):
    __tablename__ = "tiendas"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))  # ej. "Damasco Oeste"
    zona: Mapped[str] = mapped_column(String(20))
    direccion: Mapped[str] = mapped_column(String(250), default="")
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    qr_token: Mapped[str] = mapped_column(String(40), default="")  # QR fijo de la tienda (lo genera el superadmin)


class VisitaRetiro(Base):
    """El técnico escanea el QR de la tienda; la caja ve lo que va a retirar y autoriza con un OK."""
    __tablename__ = "visitas_retiro"
    id: Mapped[int] = mapped_column(primary_key=True)
    tienda_id: Mapped[int] = mapped_column(ForeignKey("tiendas.id"), index=True)
    tecnico_id: Mapped[int] = mapped_column(ForeignKey("tecnicos.id"), index=True)
    ordenes: Mapped[list] = mapped_column(JSON, default=list)  # ids de las órdenes a retirar
    estado: Mapped[str] = mapped_column(String(15), default="pendiente")  # pendiente | autorizada | rechazada | cancelada
    motivo: Mapped[str] = mapped_column(String(300), default="")
    resuelto_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    resuelto_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    tienda: Mapped[Tienda] = relationship()
    tecnico: Mapped["Tecnico"] = relationship()


class Tecnico(Base):
    """Datos del técnico instalador. Vive cerca de su tienda (sectorización)."""
    __tablename__ = "tecnicos"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), unique=True)
    tienda_id: Mapped[int] = mapped_column(ForeignKey("tiendas.id"))
    grupo: Mapped[str | None] = mapped_column(String(10))  # A, B, C o RETEN; vacío hasta el alta en oficina
    lat: Mapped[float | None] = mapped_column(Float)  # residencia
    lng: Mapped[float | None] = mapped_column(Float)
    pin_hash: Mapped[str | None] = mapped_column(String(200))
    foto_rostro: Mapped[str | None] = mapped_column(String(200))   # captura facial del alta
    selfie_cedula: Mapped[str | None] = mapped_column(String(200))  # cédula a la altura del pecho
    # verificación facial automática: la foto con la cédula contra el escaneo de la cara
    rostro_resultado: Mapped[str] = mapped_column(String(20), default="")  # coincide | no_coincide | revision_manual
    rostro_similitud: Mapped[float] = mapped_column(Float, default=0.0)
    rostro_similitud_cedula: Mapped[float] = mapped_column(Float, default=0.0)
    rostro_intentos: Mapped[int] = mapped_column(Integer, default=0)
    huella_registrada: Mapped[bool] = mapped_column(Boolean, default=False)  # huella del teléfono activada para la app
    foto_perfil: Mapped[str | None] = mapped_column(String(200))  # tomada en la oficina; es la que ve el cliente
    verificado: Mapped[bool] = mapped_column(Boolean, default=False)  # alta dada en la oficina
    alta_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    alta_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    reten_activo: Mapped[bool] = mapped_column(Boolean, default=False)  # retén activado hoy
    # Respaldo del día: el técnico que no está de guardia se ofrece para ese día; el centro de control lo activa
    respaldo_fecha: Mapped[str | None] = mapped_column(String(10))
    respaldo_activo_fecha: Mapped[str | None] = mapped_column(String(10))
    ausente_fecha: Mapped[str | None] = mapped_column(String(10))  # avisó que no puede trabajar ese día
    # Cuenta donde AHA HOME le paga los materiales de los presupuestos aprobados
    cuenta_banco: Mapped[str] = mapped_column(String(60), default="")
    cuenta_tipo: Mapped[str] = mapped_column(String(20), default="")  # corriente | ahorro
    cuenta_numero: Mapped[str] = mapped_column(String(30), default="")
    cuenta_titular: Mapped[str] = mapped_column(String(120), default="")
    cuenta_cedula: Mapped[str] = mapped_column(String(20), default="")
    pago_movil_telefono: Mapped[str] = mapped_column(String(20), default="")
    pago_movil_banco: Mapped[str] = mapped_column(String(60), default="")
    ausente_motivo: Mapped[str] = mapped_column(String(200), default="")
    disponible: Mapped[bool] = mapped_column(Boolean, default=True)  # ausencias
    # GPS en vivo (lo envía la app del técnico mientras trabaja)
    lat_actual: Mapped[float | None] = mapped_column(Float)
    lng_actual: Mapped[float | None] = mapped_column(Float)
    ubicacion_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    # Actividades: lo elige al registrarse en la app (conductor, instalador o ambas). Un solo perfil.
    conduce: Mapped[bool] = mapped_column(Boolean, default=False)
    instala: Mapped[bool] = mapped_column(Boolean, default=True)
    fecha_nacimiento: Mapped[str] = mapped_column(String(10), default="")
    direccion: Mapped[str] = mapped_column(String(250), default="")
    vehiculo_tipo: Mapped[str] = mapped_column(String(40), default="")
    vehiculo_placa: Mapped[str] = mapped_column(String(12), default="")
    vehiculo_marca: Mapped[str] = mapped_column(String(40), default="")
    vehiculo_modelo: Mapped[str] = mapped_column(String(40), default="")
    vehiculo_anio: Mapped[str] = mapped_column(String(4), default="")
    vehiculo_color: Mapped[str] = mapped_column(String(30), default="")
    vehiculo_capacidad: Mapped[str] = mapped_column(String(30), default="")
    licencia_grado: Mapped[str] = mapped_column(String(10), default="")
    especialidades: Mapped[list] = mapped_column(JSON, default=list)
    herramientas: Mapped[str] = mapped_column(String(250), default="")
    certificaciones: Mapped[str] = mapped_column(String(250), default="")
    clausula_aceptada_en: Mapped[dt.datetime | None] = mapped_column(DateTime)  # ayudante: su profesional aceptó responder por él
    es_ayudante: Mapped[bool] = mapped_column(Boolean, default=False)
    jefe_id: Mapped[int | None] = mapped_column(ForeignKey("tecnicos.id"))  # técnico con el que sale el ayudante

    user: Mapped[User] = relationship(back_populates="tecnico", foreign_keys=[user_id])
    tienda: Mapped[Tienda] = relationship()
    documentos: Mapped[list["Documento"]] = relationship(back_populates="tecnico", order_by="Documento.id")
    jefe: Mapped["Tecnico | None"] = relationship(remote_side="Tecnico.id", back_populates="ayudantes")
    ayudantes: Mapped[list["Tecnico"]] = relationship(back_populates="jefe")


class Orden(Base):
    __tablename__ = "ordenes"
    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # WO-4921
    estado: Mapped[str] = mapped_column(String(30), default="solicitud_enviada")
    tipo_servicio: Mapped[str] = mapped_column(String(30), default="traslado_instalacion")

    # cliente (puede no tener la app todavía: se guardan sus datos aquí)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    cliente_nombre: Mapped[str] = mapped_column(String(120))
    cliente_telefono: Mapped[str] = mapped_column(String(30))
    direccion: Mapped[str] = mapped_column(String(250))
    referencia: Mapped[str] = mapped_column(String(250), default="")
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    zona: Mapped[str] = mapped_column(String(20))

    # compra
    factura: Mapped[str | None] = mapped_column(String(200))
    numero_factura: Mapped[str] = mapped_column(String(40), default="")
    fecha_compra: Mapped[str] = mapped_column(String(10), default="")

    # pago de la instalación (se cobra en caja al solicitarla)
    monto_instalacion_centavos: Mapped[int] = mapped_column(Integer, default=0)
    # Fusión AHA HOGAR: el cliente aprueba la orden (3 puntos) y firma el acta de conformidad antes del código
    cliente_aprobo_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    acta: Mapped[dict] = mapped_column(JSON, default=dict)  # {puntos, recibe_nombre, recibe_cedula, mayor_edad, en}
    token_cierre: Mapped[str] = mapped_column(String(8), default="")   # código que el cliente dicta al técnico para cerrar
    token_intentos: Mapped[int] = mapped_column(Integer, default=0)
    token_emitido_en: Mapped[dt.datetime | None] = mapped_column(DateTime)  # el código de cierre vale 30 minutos (AHA HOGAR v2)
    tipo_inmueble: Mapped[str] = mapped_column(String(10), default="")  # casa | edificio | oficina (dónde se instala)
    retirar_residuos: Mapped[bool] = mapped_column(Boolean, default=True)  # opcional: el cliente puede quedarse el empaque (garantía)
    inspeccion_centavos: Mapped[int] = mapped_column(Integer, default=0)  # inspección cobrada en caja junto con la instalación
    pago_metodo: Mapped[str | None] = mapped_column(String(20))
    pago_referencia: Mapped[str] = mapped_column(String(60), default="")
    pago_moneda: Mapped[str] = mapped_column(String(3), default="")     # USD | Bs
    pago_tasa: Mapped[float] = mapped_column(Float, default=0.0)        # Bs por USD (tasa oficial BCV) usada al cobrar
    pagado_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    cobrado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))

    # cita
    fecha: Mapped[str] = mapped_column(String(10))  # AAAA-MM-DD
    franja: Mapped[str] = mapped_column(String(20))  # "10:00-12:00"

    tienda_id: Mapped[int] = mapped_column(ForeignKey("tiendas.id"))
    agente_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    tecnico_id: Mapped[int | None] = mapped_column(ForeignKey("tecnicos.id"))
    qr_token: Mapped[str] = mapped_column(String(40), unique=True, index=True)

    retirado_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    completado_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    checklist: Mapped[dict] = mapped_column(JSON, default=dict)
    fotos: Mapped[dict] = mapped_column(JSON, default=dict)
    # Inspección antes del retiro: el técnico visita, presupuesta y se instala solo con presupuesto aprobado y pagado
    requiere_inspeccion: Mapped[bool] = mapped_column(Boolean, default=False)
    inspeccion_fecha: Mapped[str] = mapped_column(String(10), default="")
    inspeccion_franja: Mapped[str] = mapped_column(String(20), default="")
    # Servicio en pausa ("time out") mientras se hace la inspección y se aprueba/paga el presupuesto
    pausa_desde: Mapped[dt.datetime | None] = mapped_column(DateTime)
    pausa_aviso_en: Mapped[dt.datetime | None] = mapped_column(DateTime)  # aviso de pausa vencida ya enviado
    # Entrega fallida: la cuadrilla retiró y salió, pero no pudo entregar y regresó: se cobra el servicio completo
    penalidad_estado: Mapped[str] = mapped_column(String(20), default="")  # "" | pendiente | pago_registrado | pagada | exonerada
    penalidad_motivo: Mapped[str] = mapped_column(String(300), default="")
    penalidad_centavos: Mapped[int] = mapped_column(Integer, default=0)
    penalidad_metodo: Mapped[str | None] = mapped_column(String(20))
    penalidad_referencia: Mapped[str] = mapped_column(String(60), default="")
    penalidad_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    penalidad_pagada_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    calificacion: Mapped[int | None] = mapped_column(Integer)
    # Propina del cliente al cerrar el servicio (va al técnico y su cuadrilla)
    propina_centavos: Mapped[int] = mapped_column(Integer, default=0)
    propina_metodo: Mapped[str | None] = mapped_column(String(20))
    propina_referencia: Mapped[str] = mapped_column(String(60), default="")
    propina_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    propina_entregada_en: Mapped[dt.datetime | None] = mapped_column(DateTime)  # en efectivo en mano, o transferida por AHA HOME
    comentario: Mapped[str] = mapped_column(Text, default="")
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    tienda: Mapped[Tienda] = relationship()
    tecnico: Mapped[Tecnico | None] = relationship()
    ayudantes: Mapped[list[Tecnico]] = relationship(secondary=orden_ayudantes)
    articulos: Mapped[list["Articulo"]] = relationship(back_populates="orden", order_by="Articulo.id", cascade="all, delete-orphan")
    presupuestos: Mapped[list["Presupuesto"]] = relationship(back_populates="orden", order_by="Presupuesto.id")
    eventos: Mapped[list["Evento"]] = relationship(back_populates="orden", order_by="Evento.id")


class Evento(Base):
    """Auditoría: cada cambio de estado queda registrado con quién y cuándo."""
    __tablename__ = "eventos"
    id: Mapped[int] = mapped_column(primary_key=True)
    orden_id: Mapped[int] = mapped_column(ForeignKey("ordenes.id"), index=True)
    estado: Mapped[str] = mapped_column(String(30))
    nota: Mapped[str] = mapped_column(String(300), default="")
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    orden: Mapped[Orden] = relationship(back_populates="eventos")


class Incidencia(Base):
    __tablename__ = "incidencias"
    id: Mapped[int] = mapped_column(primary_key=True)
    orden_id: Mapped[int | None] = mapped_column(ForeignKey("ordenes.id"))
    tecnico_id: Mapped[int | None] = mapped_column(ForeignKey("tecnicos.id"))
    texto: Mapped[str] = mapped_column(String(500))
    abierta: Mapped[bool] = mapped_column(Boolean, default=True)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)


class Notificacion(Base):
    """Bandeja de notificaciones de cada usuario (también se envían por push)."""
    __tablename__ = "notificaciones"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    titulo: Mapped[str] = mapped_column(String(120))
    texto: Mapped[str] = mapped_column(String(400))
    orden_id: Mapped[int | None] = mapped_column(ForeignKey("ordenes.id"))
    leida: Mapped[bool] = mapped_column(Boolean, default=False)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)


# Expediente que se arma en la oficina al registrar al técnico o ayudante
TIPOS_DOCUMENTO = {
    "foto_perfil": "Foto de perfil",
    "cedula": "Cédula de identidad",
    "licencia": "Licencia de conducir",
    "certificado_medico": "Certificado médico",
    "vehiculo_titulo": "Título o carnet de circulación del vehículo",
    "vehiculo_rcv": "RCV · Responsabilidad Civil del vehículo",
    "vehiculo_rotc": "ROTC del INTT (solo NPR, pick-up de batea larga o furgoneta)",
    "vehiculo_seguro": "Seguro del vehículo (otra póliza)",
    "vehiculo_foto": "Foto del vehículo",
    "rif": "RIF",
    "antecedentes": "Constancia de antecedentes",
    "otro": "Otro documento",
}
DOCUMENTOS_OBLIGATORIOS = ("foto_perfil", "cedula")


class Documento(Base):
    __tablename__ = "documentos"
    id: Mapped[int] = mapped_column(primary_key=True)
    tecnico_id: Mapped[int] = mapped_column(ForeignKey("tecnicos.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(30))
    url: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[str] = mapped_column(String(200), default="")
    vence: Mapped[str] = mapped_column(String(10), default="")  # AAAA-MM-DD (licencia, seguro)
    aviso_vence: Mapped[str] = mapped_column(String(10), default="")  # ya avisado: «30d» o «vencido»
    subido_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    tecnico: Mapped[Tecnico] = relationship(back_populates="documentos")


class Articulo(Base):
    """Cada artículo del pedido. Todos van en el traslado; el cliente marca en caja cuáles se instalan."""
    __tablename__ = "articulos"
    id: Mapped[int] = mapped_column(primary_key=True)
    orden_id: Mapped[int] = mapped_column(ForeignKey("ordenes.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(30))
    descripcion: Mapped[str] = mapped_column(String(120), default="")
    marca: Mapped[str] = mapped_column(String(60), default="")
    modelo: Mapped[str] = mapped_column(String(80), default="")
    serial: Mapped[str] = mapped_column(String(80), default="")
    garantia: Mapped[str] = mapped_column(String(60), default="")
    instalar: Mapped[bool] = mapped_column(Boolean, default=False)
    precio_instalacion_centavos: Mapped[int] = mapped_column(Integer, default=0)  # lo cobrado en caja por este artículo
    # Tabulación del superadmin: artículo exacto y servicio cobrado (traslado | instalacion | combo)
    precio_item_id: Mapped[int | None] = mapped_column(ForeignKey("precios.id"), nullable=True)
    servicio: Mapped[str] = mapped_column(String(20), default="")

    orden: Mapped[Orden] = relationship(back_populates="articulos")


class Tarifa(Base):
    """Precio de instalación por tipo de artículo (lo fija el superadmin). Sin tarifa activa, ese tipo no se instala."""
    __tablename__ = "tarifas"
    tipo: Mapped[str] = mapped_column(String(30), primary_key=True)
    precio_centavos: Mapped[int] = mapped_column(Integer)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)


# Presupuesto de la inspección. Estados:
#   enviado → (cliente acepta + superadmin aprueba) aprobado → pago_registrado → pagado → materiales_pagados (= listo para instalar)
#   rechazado (por el cliente o el superadmin: el técnico puede enviar otro)
ESTADO_PRESUPUESTO_TEXTO = {
    "enviado": "Esperando aprobación", "aprobado": "Aprobado · esperando el pago del cliente",
    "pago_registrado": "Pago registrado · por confirmar", "pagado": "Pagado · materiales por pagar al técnico",
    "materiales_pagados": "Listo para instalar", "rechazado": "Rechazado",
}


class Presupuesto(Base):
    __tablename__ = "presupuestos"
    id: Mapped[int] = mapped_column(primary_key=True)
    orden_id: Mapped[int] = mapped_column(ForeignKey("ordenes.id"), index=True)
    tecnico_id: Mapped[int] = mapped_column(ForeignKey("tecnicos.id"))
    items: Mapped[list] = mapped_column(JSON, default=list)  # [{tipo: material|mano_obra, descripcion, cantidad, precio_centavos}]
    notas: Mapped[str] = mapped_column(Text, default="")
    fotos: Mapped[list] = mapped_column(JSON, default=list)
    materiales_centavos: Mapped[int] = mapped_column(Integer, default=0)
    mano_obra_centavos: Mapped[int] = mapped_column(Integer, default=0)
    inspeccion_centavos: Mapped[int] = mapped_column(Integer, default=0)  # inspección pedida después (no se cobró en caja): va en este pago
    materiales_compra: Mapped[str] = mapped_column(String(10), default="tecnico")  # quién compra los materiales: tecnico | cliente
    estado: Mapped[str] = mapped_column(String(30), default="enviado")
    motivo_rechazo: Mapped[str] = mapped_column(String(300), default="")
    cliente_acepto_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    admin_aprobo_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    pago_metodo: Mapped[str | None] = mapped_column(String(20))
    pago_referencia: Mapped[str] = mapped_column(String(60), default="")
    pago_moneda: Mapped[str] = mapped_column(String(3), default="")
    pago_tasa: Mapped[float] = mapped_column(Float, default=0.0)
    pago_registrado_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    pago_confirmado_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    materiales_referencia: Mapped[str] = mapped_column(String(60), default="")
    materiales_pagados_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    orden: Mapped[Orden] = relationship(back_populates="presupuestos")
    tecnico: Mapped[Tecnico] = relationship()

    @property
    def total_centavos(self) -> int:
        return self.materiales_centavos + self.mano_obra_centavos + self.inspeccion_centavos

    @property
    def compra_cliente(self) -> bool:
        return self.materiales_compra == "cliente" and self.materiales_centavos > 0

    @property
    def a_pagar_centavos(self) -> int:
        """Lo que paga el cliente: inspección + mano de obra, y los materiales si los compra el técnico."""
        return self.mano_obra_centavos + self.inspeccion_centavos if self.compra_cliente else self.total_centavos


class Mensaje(Base):
    """Chat de una orden: cliente ↔ técnico y ayudante, supervisado por el centro de control."""
    __tablename__ = "mensajes"
    id: Mapped[int] = mapped_column(primary_key=True)
    orden_id: Mapped[int] = mapped_column(ForeignKey("ordenes.id"), index=True)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))  # None = mensaje del sistema
    texto: Mapped[str] = mapped_column(String(1000), default="")
    foto: Mapped[str] = mapped_column(String(200), default="")
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)


class ChatLectura(Base):
    """Hasta qué mensaje leyó cada persona el chat de cada orden."""
    __tablename__ = "chat_lecturas"
    orden_id: Mapped[int] = mapped_column(ForeignKey("ordenes.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), primary_key=True)
    ultimo_id: Mapped[int] = mapped_column(Integer, default=0)


class Auditoria(Base):
    """Todo lo que hace el equipo (caja, técnico supervisor, supervisor y superadmin): lo ve el CEO."""
    __tablename__ = "auditoria"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    rol: Mapped[str] = mapped_column(String(30), default="")
    accion: Mapped[str] = mapped_column(String(160), default="")
    metodo: Mapped[str] = mapped_column(String(8), default="")
    ruta: Mapped[str] = mapped_column(String(200), default="")
    estado: Mapped[int] = mapped_column(Integer, default=0)
    ip: Mapped[str] = mapped_column(String(64), default="")
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora, index=True)


class SoporteMensaje(Base):
    """Comunicación directa con AHA HOME (no es de una orden): cada cliente o técnico tiene su conversación
    con el centro de control. hilo_id = el usuario dueño de la conversación."""
    __tablename__ = "soporte_mensajes"
    id: Mapped[int] = mapped_column(primary_key=True)
    hilo_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    tema: Mapped[str] = mapped_column(String(20), default="")
    texto: Mapped[str] = mapped_column(String(1000), default="")
    foto: Mapped[str] = mapped_column(String(200), default="")
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)


class SoporteLectura(Base):
    __tablename__ = "soporte_lecturas"
    hilo_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), primary_key=True)
    ultimo_id: Mapped[int] = mapped_column(Integer, default=0)


class PrecioItem(Base):
    """Tabulación de precios por artículo y por servicio (la carga el superadmin)."""
    __tablename__ = "precios"
    id: Mapped[int] = mapped_column(primary_key=True)
    clave: Mapped[str] = mapped_column(String(40), unique=True)
    nombre: Mapped[str] = mapped_column(String(80))
    categoria: Mapped[str] = mapped_column(String(40), default="Otros")
    tipo_equipo: Mapped[str] = mapped_column(String(30), default="otro")  # para enlazar con los artículos de la caja
    traslado_centavos: Mapped[int] = mapped_column(Integer, default=0)
    instalacion_centavos: Mapped[int] = mapped_column(Integer, default=0)
    combo_centavos: Mapped[int] = mapped_column(Integer, default=0)  # traslado + instalación (0 = suma de los dos)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    orden: Mapped[int] = mapped_column(Integer, default=0)


class CorreoCorporativo(Base):
    """Base de datos de correos corporativos @aha-go.com: los de cada persona del equipo, los de cada área y los del sistema."""
    __tablename__ = "correos_corporativos"
    id: Mapped[int] = mapped_column(primary_key=True)
    direccion: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    tipo: Mapped[str] = mapped_column(String(12), default="area")  # persona | area | sistema
    descripcion: Mapped[str] = mapped_column(String(200), default="")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    reenviar_a: Mapped[str | None] = mapped_column(String(300), nullable=True)  # a qué buzón(es) llega, separados por coma
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())


# Direcciones de área y del sistema con las que arranca la base de datos de correos
CORREOS_BASE = [
    ("contacto", "area", "Contacto público (páginas legales, tiendas de apps)"),
    ("soporte", "area", "Soporte a clientes y técnicos"),
    ("control", "area", "Centro de control: órdenes del día y emergencias"),
    ("tecnicos", "area", "Registro, expedientes y altas de técnicos"),
    ("pagos", "area", "Pagos, liquidaciones y facturación"),
    ("tiendas", "area", "Relación con las tiendas aliadas (Damasco)"),
    ("no-responder", "sistema", "Remitente de los correos automáticos de la app"),
]


class Ajuste(Base):
    """Valores del negocio que cambia el superadmin (p. ej. precio de la inspección)."""
    __tablename__ = "ajustes"
    clave: Mapped[str] = mapped_column(String(40), primary_key=True)
    valor: Mapped[str] = mapped_column(String(200), default="")


class TasaCambio(Base):
    """Tasa oficial del día (Bs por USD, BCV). La carga el superadmin; la última es la vigente."""
    __tablename__ = "tasas"
    id: Mapped[int] = mapped_column(primary_key=True)
    bs_por_usd: Mapped[float] = mapped_column(Float)
    fuente: Mapped[str] = mapped_column(String(30), default="BCV")
    fecha: Mapped[str] = mapped_column(String(10), default="")
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)


class Banner(Base):
    """Mensajes de AHA HOME y publicidad de aliados en el inicio del cliente. Los administra el superadmin."""
    __tablename__ = "banners"
    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(10), default="aliado")  # aha | aliado
    etiqueta: Mapped[str] = mapped_column(String(40), default="")
    titulo: Mapped[str] = mapped_column(String(80))
    texto: Mapped[str] = mapped_column(String(160), default="")
    boton: Mapped[str] = mapped_column(String(30), default="")
    enlace: Mapped[str] = mapped_column(String(300), default="")
    imagen: Mapped[str] = mapped_column(String(200), default="")  # logo del aliado (subido a /archivos)
    color: Mapped[str] = mapped_column(String(10), default="lima")  # lima | azul | marino | naranja | verde
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    desde: Mapped[str] = mapped_column(String(10), default="")  # AAAA-MM-DD, vacío = siempre
    hasta: Mapped[str] = mapped_column(String(10), default="")
    clics: Mapped[int] = mapped_column(Integer, default=0)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)


# ---------- Finanzas (contabilidad del superadmin) ----------
CATEGORIAS_MEDIO = {"banco_nacional": "Banco nacional", "banco_internacional": "Banco internacional", "zelle": "Zelle",
                    "efectivo": "Efectivo (cash)", "otro": "Otro"}
CATEGORIAS_INGRESO = {"servicio": "Traslado e instalación", "inspeccion": "Inspección", "presupuesto": "Presupuestos",
                      "penalidad": "Penalidades", "publicidad": "Publicidad de aliados", "comercio_aliado": "Pago de comercio aliado", "otro_ingreso": "Otro ingreso"}
CATEGORIAS_GASTO = {"pago_tecnicos": "Pago a técnicos", "materiales": "Materiales", "nomina": "Nómina del personal",
                    "plataformas": "Servidor y plataformas", "marketing": "Publicidad y marketing", "transporte": "Transporte y combustible", "servicios": "Servicios y alquiler",
                    "comisiones": "Comisiones bancarias", "impuestos": "Impuestos", "reembolsos": "Reembolsos a clientes", "otro_gasto": "Otro gasto"}
ESTADOS_RECLAMO = {"abierto": "Abierto", "en_revision": "En revisión", "reembolsado": "Reembolsado", "rechazado": "Rechazado"}


class MedioPago(Base):
    """Tipos de pago que acepta y usa AHA HOME (Zelle, cash, bancos…). El superadmin puede agregar otros."""
    __tablename__ = "medios_pago"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80))
    categoria: Mapped[str] = mapped_column(String(24), default="otro")
    moneda: Mapped[str] = mapped_column(String(3), default="USD")
    clave_caja: Mapped[str | None] = mapped_column(String(24), nullable=True)  # método de la caja al que corresponde (pago_movil, zelle…)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class CuentaFinanciera(Base):
    """Bancos y cuentas donde entra o sale el dinero: banco nacional, internacional, Zelle o caja de efectivo."""
    __tablename__ = "cuentas_financieras"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80))
    categoria: Mapped[str] = mapped_column(String(24), default="banco_nacional")
    banco: Mapped[str] = mapped_column(String(80), default="")
    moneda: Mapped[str] = mapped_column(String(3), default="Bs")
    titular: Mapped[str] = mapped_column(String(120), default="")
    identificador: Mapped[str] = mapped_column(String(80), default="")  # número de cuenta, teléfono o correo Zelle
    saldo_inicial_centavos: Mapped[int] = mapped_column(Integer, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())


class MovimientoFinanciero(Base):
    """Asiento manual: un ingreso o un gasto, en Bs o USD (siempre con su equivalente en USD a la tasa del día)."""
    __tablename__ = "movimientos_financieros"
    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[str] = mapped_column(String(10))
    tipo: Mapped[str] = mapped_column(String(8))  # ingreso | gasto
    categoria: Mapped[str] = mapped_column(String(24))
    descripcion: Mapped[str] = mapped_column(String(200), default="")
    monto_centavos: Mapped[int] = mapped_column(Integer)
    moneda: Mapped[str] = mapped_column(String(3), default="USD")
    tasa: Mapped[float | None] = mapped_column(Float, nullable=True)
    monto_usd_centavos: Mapped[int] = mapped_column(Integer)
    medio_id: Mapped[int | None] = mapped_column(ForeignKey("medios_pago.id"), nullable=True)
    cuenta_id: Mapped[int | None] = mapped_column(ForeignKey("cuentas_financieras.id"), nullable=True)
    referencia: Mapped[str] = mapped_column(String(80), default="")
    orden_codigo: Mapped[str] = mapped_column(String(20), default="")
    estado: Mapped[str] = mapped_column(String(12), default="registrado")  # registrado | conciliado | anulado
    motivo_anulacion: Mapped[str] = mapped_column(String(200), default="")
    beneficiario: Mapped[str] = mapped_column(String(120), default="")  # cliente, proveedor o persona que recibe o paga
    conciliado: Mapped[bool] = mapped_column(Boolean, default=False)   # ya se comprobó en el banco o la caja
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())


class ReclamoFinanciero(Base):
    """Reclamo de dinero de un cliente o de una tienda (cobro doble, servicio no prestado…) y su resolución."""
    __tablename__ = "reclamos_financieros"
    id: Mapped[int] = mapped_column(primary_key=True)
    cliente: Mapped[str] = mapped_column(String(120))
    orden_codigo: Mapped[str] = mapped_column(String(20), default="")
    motivo: Mapped[str] = mapped_column(String(300))
    monto_centavos: Mapped[int] = mapped_column(Integer, default=0)  # USD
    estado: Mapped[str] = mapped_column(String(12), default="abierto")
    resolucion: Mapped[str] = mapped_column(String(300), default="")
    medio_id: Mapped[int | None] = mapped_column(ForeignKey("medios_pago.id"), nullable=True)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())
    resuelto_en: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)


class InterfazVersion(Base):
    """Diseño de la app (colores, textos y menús) que controla el panel: un borrador, la publicada y el historial."""
    __tablename__ = "interfaz_versiones"
    id: Mapped[int] = mapped_column(primary_key=True)
    estado: Mapped[str] = mapped_column(String(12), default="borrador")  # borrador | publicada | archivada
    datos: Mapped[dict] = mapped_column(JSON, default=dict)
    nota: Mapped[str] = mapped_column(String(120), default="")
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())


class ArchivoFoto(Base):
    """Fotos guardadas en la base de datos (cuando varios servidores comparten PostgreSQL)."""
    __tablename__ = "archivos_fotos"
    nombre: Mapped[str] = mapped_column(String(80), primary_key=True)
    datos: Mapped[bytes] = mapped_column(LargeBinary)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())



class Conciliacion(Base):
    """Marca de «ya lo vi en el banco o la caja» para los pagos que llegan solos (caja, presupuestos, penalidades…)."""
    __tablename__ = "conciliaciones"
    clave: Mapped[str] = mapped_column(String(30), primary_key=True)  # c12 (caja de la orden 12), p3 (presupuesto 3)…
    conciliado: Mapped[bool] = mapped_column(Boolean, default=True)
    por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    en: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())


class CierreCaja(Base):
    """Cuadre diario de la caja de una tienda: lo que dice el sistema contra lo que se contó."""
    __tablename__ = "cierres_caja"
    id: Mapped[int] = mapped_column(primary_key=True)
    tienda_id: Mapped[int] = mapped_column(ForeignKey("tiendas.id"), index=True)
    dia: Mapped[str] = mapped_column(String(10), index=True)  # AAAA-MM-DD (Caracas)
    detalle: Mapped[list] = mapped_column(JSON, default=list)  # [{metodo, texto, moneda, cobros, sistema, contado, diferencia}]
    cuadra: Mapped[bool] = mapped_column(Boolean, default=True)
    nota: Mapped[str] = mapped_column(String(300), default="")
    abierto: Mapped[bool] = mapped_column(Boolean, default=False)  # reabierto: se puede volver a cerrar
    cerrado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    cerrado_en: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())


class TiendaQR(Base):
    """QR que se pega en cada caja: el técnico lo escanea al llegar y la caja autoriza el retiro."""
    __tablename__ = "tiendas_qr"
    id: Mapped[int] = mapped_column(primary_key=True)
    tienda_id: Mapped[int] = mapped_column(ForeignKey("tiendas.id"), index=True)
    nombre: Mapped[str] = mapped_column(String(80))
    token: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    principal: Mapped[bool] = mapped_column(Boolean, default=False)
    escaneos: Mapped[int] = mapped_column(Integer, default=0)
    en_papelera: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())


class SesionPanel(Base):
    """Una sesión del superadministrador o del centro de control (desde que entra hasta que sale)."""
    __tablename__ = "sesiones_panel"
    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    rol: Mapped[str] = mapped_column(String(30), default="")
    ip: Mapped[str] = mapped_column(String(64), default="")
    dispositivo: Mapped[str] = mapped_column(String(60), default="")
    inicio: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora(), index=True)
    ultima: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())
    actividades: Mapped[int] = mapped_column(Integer, default=0)
    cerrada: Mapped[bool] = mapped_column(Boolean, default=False)


class ActividadPanel(Base):
    """Lo que se hizo en cada sesión: ingresos, intentos fallidos, pantallas consultadas, cambios y descargas."""
    __tablename__ = "actividad_panel"
    id: Mapped[int] = mapped_column(primary_key=True)
    sesion_id: Mapped[str] = mapped_column(String(12), default="", index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True, index=True)
    rol: Mapped[str] = mapped_column(String(30), default="")
    tipo: Mapped[str] = mapped_column(String(16))  # ingreso | ingreso_fallido | consulta | cambio | descarga | cierre_sesion
    texto: Mapped[str] = mapped_column(String(200), default="")
    ip: Mapped[str] = mapped_column(String(64), default="")
    dispositivo: Mapped[str] = mapped_column(String(60), default="")
    duracion_ms: Mapped[int] = mapped_column(Integer, default=0)  # cuánto tardó en abrir la pantalla
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora(), index=True)



class ErrorSistema(Base):
    """Errores de la aplicación (servidor, panel o app), agrupados: los iguales suman «veces»."""
    __tablename__ = "errores_sistema"
    id: Mapped[int] = mapped_column(primary_key=True)
    huella: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    origen: Mapped[str] = mapped_column(String(12), default="servidor")  # servidor | panel | app
    mensaje: Mapped[str] = mapped_column(String(300), default="")
    donde: Mapped[str] = mapped_column(String(200), default="")
    usuario: Mapped[str] = mapped_column(String(120), default="")
    veces: Mapped[int] = mapped_column(Integer, default=1)
    veces_hora: Mapped[int] = mapped_column(Integer, default=1)  # cuántas en la hora en curso (para avisar si se repite mucho)
    hora: Mapped[str] = mapped_column(String(13), default="")
    estado: Mapped[str] = mapped_column(String(12), default="nuevo")  # nuevo | revision | resuelto
    nota: Mapped[str] = mapped_column(String(300), default="")
    atendido_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    primera: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())
    ultima: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora(), index=True)


class ChequeoSistema(Base):
    """Último resultado de cada revisión automática (estado de la app y funciones)."""
    __tablename__ = "chequeos_sistema"
    clave: Mapped[str] = mapped_column(String(30), primary_key=True)
    grupo: Mapped[str] = mapped_column(String(10), default="estado")  # estado | funcion
    nombre: Mapped[str] = mapped_column(String(80), default="")
    nivel: Mapped[str] = mapped_column(String(6), default="ok")  # ok | pend | mal
    valor: Mapped[str] = mapped_column(String(80), default="")
    detalle: Mapped[str] = mapped_column(String(250), default="")
    ms: Mapped[int] = mapped_column(Integer, default=0)
    en: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())
    desde: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora())  # desde cuándo está en este nivel


class ConfigSistema(Base):
    """Ajustes y marcas del departamento de sistemas (texto largo o JSON)."""
    __tablename__ = "config_sistema"
    clave: Mapped[str] = mapped_column(String(60), primary_key=True)
    valor: Mapped[str] = mapped_column(Text, default="")



ESPECIALIDADES = ("Aires acondicionados", "Refrigeración", "Lavado y secado", "Cocinas y hornos", "Calentadores de agua", "Campanas", "Televisores", "Otros de línea blanca")
TIPOS_VEHICULO = ("NPR (camión 3/4)", "Pick-up de batea larga", "Furgoneta", "Camioneta", "Otro")
DOCS_CONDUCIR = ("licencia", "vehiculo_titulo", "vehiculo_rcv", "vehiculo_rotc", "vehiculo_seguro", "vehiculo_foto")


class PerfilCambio(Base):
    """Historial de cambios del perfil de un profesional o ayudante (quién cambió qué)."""
    __tablename__ = "perfil_cambios"
    id: Mapped[int] = mapped_column(primary_key=True)
    tecnico_id: Mapped[int] = mapped_column(ForeignKey("tecnicos.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    texto: Mapped[str] = mapped_column(String(200), default="")
    antes: Mapped[str] = mapped_column(String(160), default="")
    despues: Mapped[str] = mapped_column(String(160), default="")
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=lambda: ahora(), index=True)
