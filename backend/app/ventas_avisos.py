"""Avisos al departamento de ventas: cada servicio nuevo de la caja, cada cancelación, reprogramación,
entrega fallida y servicio completado llega a su campana (y por push si tiene la app)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ESTADO_CANCELADO, ESTADO_FALLIDA, Orden, User

TIPOS = {"nuevo": "Nuevo servicio", "cancelado": "Servicio cancelado", "reprogramado": "Servicio reprogramado",
         "fallido": "Entrega fallida", "completado": "Servicio completado"}


def tipo_de(estado: str, nota: str) -> str | None:
    """Qué significa un evento de la orden para ventas (None = no le interesa)."""
    nota = nota or ""
    if estado == "solicitud_enviada" and nota.startswith("Registrada en"):
        return "nuevo"
    if nota.startswith("Reprogramada"):
        return "reprogramado"
    if estado == ESTADO_CANCELADO:
        return "cancelado"
    if estado == ESTADO_FALLIDA:
        return "fallido"
    if estado == "completado":
        return "completado"
    return None


def destinatarios(db: Session) -> list[User]:
    """El departamento de ventas y quien tenga el permiso «ver_ventas» asignado a mano."""
    out = []
    for u in db.scalars(select(User).where(User.activo.is_(True), User.rol.in_(("ventas", "superadmin", "supervisor")))):
        if u.rol == "ventas" or (u.permisos is not None and "ver_ventas" in u.permisos):
            out.append(u)
    return out


def avisar(db: Session, orden: Orden, estado: str, nota: str) -> None:
    tipo = tipo_de(estado, nota)
    if not tipo:
        return
    from .notificar import notificar
    tienda = orden.tienda.nombre if orden.tienda else ""
    titulo = f"{TIPOS[tipo]} · {orden.codigo}"
    texto = f"{orden.cliente_nombre} · {tienda}" + (f" · {nota[:160]}" if tipo != "nuevo" else f" · {orden.fecha} {orden.franja}")
    for u in destinatarios(db):
        notificar(db, u.id, titulo, texto, orden.id)
