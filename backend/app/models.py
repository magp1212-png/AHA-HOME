"""Tablas de AHA HOME."""
import datetime as dt

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def ahora() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


# Roles: cliente, agente (caja Damasco), tecnico, supervisor, admin
ROLES = ("cliente", "agente", "tecnico", "supervisor", "admin")
ZONAS = ("Oeste", "Central", "Este")
GRUPOS = ("A", "B", "C", "RETEN")
TIPOS_EQUIPO = ("nevera", "lavadora", "secadora", "aire_acondicionado")

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

# Checklist digital obligatorio (spec, pasos 6 y 7)
CHECKLIST_INSTALACION = ("conexion_electrica", "conexion_hidraulica", "nivelacion", "prueba_encendido")
CHECKLIST_RESIDUOS = ("cajas", "anime", "plasticos", "flejes", "precintos")
FOTOS_CIERRE = ("instalacion", "espacio_limpio")


class User(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    telefono: Mapped[str | None] = mapped_column(String(30), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(200))
    rol: Mapped[str] = mapped_column(String(20), default="cliente")
    cedula: Mapped[str | None] = mapped_column(String(20))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    push_token: Mapped[str | None] = mapped_column(String(200))
    tienda_id: Mapped[int | None] = mapped_column(ForeignKey("tiendas.id"))  # agentes y supervisores
    creado: Mapped[dt.datetime] = mapped_column(DateTime, default=ahora)

    tecnico: Mapped["Tecnico | None"] = relationship(back_populates="user", uselist=False)


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
    grupo: Mapped[str] = mapped_column(String(10))  # A, B, C o RETEN
    lat: Mapped[float | None] = mapped_column(Float)  # residencia
    lng: Mapped[float | None] = mapped_column(Float)
    pin_hash: Mapped[str | None] = mapped_column(String(200))
    foto_rostro: Mapped[str | None] = mapped_column(String(200))   # captura facial del alta
    selfie_cedula: Mapped[str | None] = mapped_column(String(200))  # cédula a la altura del pecho
    verificado: Mapped[bool] = mapped_column(Boolean, default=False)  # lo aprueba el supervisor
    reten_activo: Mapped[bool] = mapped_column(Boolean, default=False)  # retén activado hoy
    disponible: Mapped[bool] = mapped_column(Boolean, default=True)  # ausencias

    user: Mapped[User] = relationship(back_populates="tecnico")
    tienda: Mapped[Tienda] = relationship()


class Orden(Base):
    __tablename__ = "ordenes"
    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # WO-4921
    estado: Mapped[str] = mapped_column(String(30), default="solicitud_enviada")

    # cliente (puede no tener la app todavía: se guardan sus datos aquí)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    cliente_nombre: Mapped[str] = mapped_column(String(120))
    cliente_telefono: Mapped[str] = mapped_column(String(30))
    direccion: Mapped[str] = mapped_column(String(250))
    referencia: Mapped[str] = mapped_column(String(250), default="")
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    zona: Mapped[str] = mapped_column(String(20))

    # equipo
    tipo_equipo: Mapped[str] = mapped_column(String(30))
    marca: Mapped[str] = mapped_column(String(60))
    modelo: Mapped[str] = mapped_column(String(80))
    serial: Mapped[str] = mapped_column(String(80), default="")
    fecha_compra: Mapped[str] = mapped_column(String(10), default="")
    garantia: Mapped[str] = mapped_column(String(60), default="")
    factura: Mapped[str | None] = mapped_column(String(200))

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
