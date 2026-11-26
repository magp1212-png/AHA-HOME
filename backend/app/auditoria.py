"""Auditoría del equipo: quién entró, desde dónde y qué hizo. Solo la ve el CEO (centro de mando).

Se registran los ingresos y cada acción que cambia algo (crear, aprobar, pagar, editar…) de la caja, los técnicos
supervisores, los supervisores y los superadmin. No se guarda el contenido de lo que escribieron (contraseñas,
datos bancarios): solo qué acción fue, sobre qué y cuándo.
"""
import datetime as dt
import re

from sqlalchemy.orm import Session

from .models import Auditoria, User, ahora

EQUIPO = ("agente", "tecnico_supervisor", "supervisor", "superadmin", "ventas")
ROL_TEXTO = {"agente": "Caja", "tecnico_supervisor": "Técnico supervisor", "supervisor": "Centro de control", "superadmin": "Superadmin", "ventas": "Ventas"}

# (método, patrón de ruta) → descripción en español
ACCIONES = [
    ("POST", r"^/auth/login$", "Inició sesión"),
    ("POST", r"^/ordenes$", "Creó una orden de servicio"),
    ("POST", r"^/ordenes/(\d+)/cancelar$", "Canceló la orden #{0}"),
    ("POST", r"^/ordenes/(\d+)/reprogramar$", "Reprogramó la orden #{0}"),
    ("POST", r"^/ordenes/(\d+)/residuos$", "Cambió el retiro de residuos de la orden #{0}"),
    ("POST", r"^/ordenes/(\d+)/inspeccion$", "Pidió inspección en la orden #{0}"),
    ("PUT", r"^/admin/tasa$", "Cargó la tasa oficial BCV"),
    ("POST", r"^/admin/tiendas/(\d+)/qr$", "Generó el QR de la tienda #{0}"),
    ("POST", r"^/admin/banners$", "Creó un banner"),
    ("PUT", r"^/admin/banners/(\d+)$", "Editó el banner #{0}"),
    ("DELETE", r"^/admin/banners/(\d+)$", "Borró el banner #{0}"),
    ("PUT", r"^/admin/tarifas/(\w+)$", "Cambió la tarifa de {0}"),
    ("POST", r"^/supervisor/presupuestos/(\d+)/aprobar$", "Respondió el presupuesto #{0}"),
    ("POST", r"^/supervisor/presupuestos/(\d+)/confirmar-pago$", "Confirmó el pago del presupuesto #{0}"),
    ("POST", r"^/supervisor/presupuestos/(\d+)/pagar-materiales$", "Pagó materiales al técnico (presupuesto #{0})"),
    ("POST", r"^/supervisor/ordenes/(\d+)/reasignar$", "Reasignó la orden #{0}"),
    ("POST", r"^/supervisor/ordenes/(\d+)/pausa$", "Cambió la pausa por inspección de la orden #{0}"),
    ("POST", r"^/supervisor/ordenes/(\d+)/propina-entregada$", "Marcó la propina entregada (orden #{0})"),
    ("POST", r"^/supervisor/ordenes/(\d+)/penalidad/monto$", "Fijó o exoneró la penalidad de la orden #{0}"),
    ("POST", r"^/supervisor/ordenes/(\d+)/penalidad/confirmar$", "Confirmó el pago de la penalidad de la orden #{0}"),
    ("POST", r"^/supervisor/tecnicos/(\d+)/alta$", "Dio de alta al técnico #{0}"),
    ("POST", r"^/supervisor/tecnicos/(\d+)/documentos$", "Cargó un documento al expediente del técnico #{0}"),
    ("PUT", r"^/supervisor/tecnicos/(\d+)/cuenta-bancaria$", "Registró la cuenta de pago del técnico #{0}"),
    ("POST", r"^/supervisor/soporte/(\d+)$", "Respondió en soporte al usuario #{0}"),
    ("POST", r"^/caja/visitas/(\d+)/autorizar$", "Autorizó un retiro en tienda (visita #{0})"),
    ("POST", r"^/caja/visitas/(\d+)/rechazar$", "No autorizó un retiro en tienda (visita #{0})"),
    ("POST", r"^/ordenes/(\d+)/chat$", "Escribió en el chat de la orden #{0}"),
    ("POST", r"^/ceo/usuarios$", "Creó una cuenta del personal"),
    ("PUT", r"^/ceo/usuarios/(\d+)$", "Cambió los datos, el rol, los permisos o el estado del usuario #{0}"),
    ("POST", r"^/ceo/usuarios/(\d+)/clave$", "Restableció la clave del usuario #{0}"),
    ("POST", r"^/ceo/correos$", "Agregó un correo corporativo"),
    ("PUT", r"^/ceo/correos/(\d+)$", "Cambió el correo corporativo #{0}"),
    ("PUT", r"^/admin/precios/(\d+)$", "Editó un precio de la tabulación (#{0})"),
    ("PUT", r"^/admin/precios-inspeccion$", "Cambió el precio de la inspección"),
    ("POST", r"^/finanzas/movimientos$", "Registró un movimiento en finanzas"),
    ("PUT", r"^/finanzas/movimientos/(\d+)$", "Cambió el movimiento #{0} en finanzas"),
    ("POST", r"^/finanzas/conciliar$", "Cambió la conciliación de un movimiento"),
    ("POST", r"^/finanzas/pendientes/pagar$", "Registró un pago pendiente"),
    ("POST", r"^/finanzas/reclamos$", "Registró un reclamo de dinero"),
    ("PUT", r"^/finanzas/reclamos/(\d+)$", "Atendió el reclamo RF-{0}"),
    ("POST", r"^/finanzas/cuentas$", "Agregó un banco o cuenta"),
    ("PUT", r"^/finanzas/cuentas/(\d+)$", "Editó la cuenta #{0}"),
    ("POST", r"^/finanzas/medios$", "Agregó un tipo de pago"),
    ("PUT", r"^/finanzas/medios/(\d+)$", "Editó el tipo de pago #{0}"),
    ("POST", r"^/finanzas/cierres$", "Cerró la caja de una tienda"),
    ("POST", r"^/finanzas/cierres/(\d+)/reabrir$", "Reabrió el cierre de caja #{0}"),
    ("PUT", r"^/admin/interfaz/borrador$", "Guardó un borrador del diseño de la app"),
    ("POST", r"^/admin/interfaz/publicar$", "Publicó el diseño de la app"),
    ("POST", r"^/admin/interfaz/descartar$", "Descartó el borrador del diseño de la app"),
    ("POST", r"^/admin/interfaz/restaurar/(\d+)$", "Volvió a la versión #{0} del diseño"),
    ("POST", r"^/admin/qrs$", "Creó un QR de tienda"),
    ("PUT", r"^/admin/qrs/(\d+)$", "Renombró el QR #{0}"),
    ("POST", r"^/admin/qrs/(\d+)/papelera$", "Envió a la papelera el QR #{0}"),
    ("POST", r"^/admin/qrs/(\d+)/recuperar$", "Recuperó de la papelera el QR #{0}"),
    ("POST", r"^/yo/contrasena$", "Cambió su clave"),
    ("POST", r"^/admin/usuarios/(\d+)/activo$", "Activó o pausó al usuario #{0}"),
    ("POST", r"^/supervisor/incidencias/(\d+)/resolver$", "Resolvió el reporte #{0}"),
    ("PUT", r"^/admin/precios$", "Cambió la tabulación de precios"),
    ("POST", r"^/admin/precios$", "Agregó un artículo a la tabulación de precios"),
]
SIN_AUDITAR = (r"^/panel-api/actividad$", r"^/notificaciones", r"^/auth/", r"^/archivos")
SECCIONES = {"finanzas": "finanzas", "admin": "la administración", "supervisor": "la operación", "ceo": "el centro de mando", "ordenes": "las órdenes",
             "caja": "la caja", "tecnico": "los técnicos"}


def describir(metodo: str, ruta: str) -> str | None:
    for m, patron, texto in ACCIONES:
        if m == metodo:
            r = re.match(patron, ruta)
            if r:
                return texto.format(*r.groups())
    if metodo in ("POST", "PUT", "PATCH", "DELETE") and not any(re.match(p, ruta) for p in SIN_AUDITAR):
        seccion = SECCIONES.get(ruta.strip("/").split("/")[0], "el sistema")
        return f"Hizo un cambio en {seccion}"
    return None


def registrar(db: Session, user: User, metodo: str, ruta: str, estado: int, ip: str, accion: str | None = None) -> None:
    accion = accion or describir(metodo, ruta)
    if not accion or user.rol not in EQUIPO:
        return
    if estado >= 400:
        accion += " · rechazado"
    db.add(Auditoria(user_id=user.id, rol=user.rol, accion=accion[:160], metodo=metodo, ruta=ruta[:200], estado=estado, ip=ip[:64]))


def marcar_acceso(db: Session, user: User, ip: str) -> None:
    """Último acceso, como máximo una vez por minuto (para saber quién está dentro)."""
    t = ahora()
    if not user.ultimo_acceso_en or (t - user.ultimo_acceso_en).total_seconds() > 60 or user.ultimo_ip != ip:
        user.ultimo_acceso_en, user.ultimo_ip = t, ip[:64]


def en_linea(user: User) -> bool:
    return bool(user.ultimo_acceso_en and ahora() - user.ultimo_acceso_en < dt.timedelta(minutes=5))
