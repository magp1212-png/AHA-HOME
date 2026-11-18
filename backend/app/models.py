"""Tablas de AHA HOME."""
import datetime as dt

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def ahora() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


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
}

# Checklist digital obligatorio (spec, pasos 6 y 7), según el tipo de servicio.
# Traslado: se entrega tal cual sale de la tienda, en su caja; no se desembala ni se retiran residuos.
CHECKLIST_TRASLADO = ("entrega_en_empaque_original", "ubicado_en_sitio")
CHECKLIST_INSTALACION = ("conexion_electrica", "conexion_hidraulica", "nivelacion", "prueba_encendido")
CHECKLIST_RESIDUOS = ("cajas", "anime", "plasticos", "flejes", "precintos")
FOTOS_CIERRE = ("instalacion", "espacio_limpio", "entrega")


def checklist_de(tipo_servicio: str, hay_sin_instalar: bool = False) -> tuple[str, ...]:
    """Traslado: solo entrega. Con instalación: instalación + residuos, y la entrega de lo que va sin instalar."""
    if tipo_servicio == "traslado":
        return CHECKLIST_TRASLADO
    extra = CHECKLIST_TRASLADO if tipo_servicio == "traslado_instalacion" and hay_sin_instalar else ()
    return extra + CHECKLIST_INSTALACION + CHECKLIST_RESIDUOS


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
    email_verificado: Mapped[bool] = mapped_column(Boolean, default=True)  # los clientes empiezan sin verificar
    verificacion_token: Mapped[str | None] = mapped_column(String(60), index=True)
    verificacion_vence: Mapped[dt.datetime | None] = mapped_column(DateTime)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
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
    huella_registrada: Mapped[bool] = mapped_column(Boolean, default=False)  # huella del teléfono activada para la app
    foto_perfil: Mapped[str | None] = mapped_column(String(200))  # tomada en la oficina; es la que ve el cliente
    verificado: Mapped[bool] = mapped_column(Boolean, default=False)  # alta dada en la oficina
    alta_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
    alta_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    reten_activo: Mapped[bool] = mapped_column(Boolean, default=False)  # retén activado hoy
    disponible: Mapped[bool] = mapped_column(Boolean, default=True)  # ausencias
    # GPS en vivo (lo envía la app del técnico mientras trabaja)
    lat_actual: Mapped[float | None] = mapped_column(Float)
    lng_actual: Mapped[float | None] = mapped_column(Float)
    ubicacion_en: Mapped[dt.datetime | None] = mapped_column(DateTime)
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
    pago_metodo: Mapped[str | None] = mapped_column(String(20))
    pago_referencia: Mapped[str] = mapped_column(String(60), default="")
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
    calificacion: Mapped[int | None] = mapped_column(Integer)
    comentario: Mapped[str] = mapped_column(Text, default="")
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    tienda: Mapped[Tienda] = relationship()
    tecnico: Mapped[Tecnico | None] = relationship()
    ayudantes: Mapped[list[Tecnico]] = relationship(secondary=orden_ayudantes)
    articulos: Mapped[list["Articulo"]] = relationship(back_populates="orden", order_by="Articulo.id", cascade="all, delete-orphan")
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
    "vehiculo_seguro": "Seguro del vehículo",
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
    precio_instalacion_centavos: Mapped[int] = mapped_column(Integer, default=0)

    orden: Mapped[Orden] = relationship(back_populates="articulos")


class Tarifa(Base):
    """Precio de instalación por tipo de artículo (lo fija el superadmin). Sin tarifa activa, ese tipo no se instala."""
    __tablename__ = "tarifas"
    tipo: Mapped[str] = mapped_column(String(30), primary_key=True)
    precio_centavos: Mapped[int] = mapped_column(Integer)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
