from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models import User, ahora
from .security import read_token


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    token = authorization.removeprefix("Bearer ").strip()
    uid = read_token(token) if token else None
    user = db.get(User, uid) if uid else None
    if not user or not user.activo:
        raise HTTPException(401, "Inicia sesión de nuevo")
    if not user.email_verificado and user.verificacion_vence and user.verificacion_vence < ahora():
        raise HTTPException(401, "No verificaste tu correo en 24 horas y tu registro venció. Regístrate de nuevo.")
    return user


def require(*roles: str):
    """Dependencia que deja pasar solo a ciertos roles (el superadmin pasa siempre)."""
    def dep(user: User = Depends(current_user)) -> User:
        if user.rol not in roles and user.rol != "superadmin":
            raise HTTPException(403, "No tienes permiso para esto")
        return user
    return dep


# ---------- Permisos del personal (los fija el CEO desde el centro de mando) ----------
PERMISOS = [
    ("ver_tablero", "Ver", "Panel principal e indicadores"),
    ("ver_clientes", "Ver", "Clientes"),
    ("ver_empresas", "Ver", "Empresas aliadas"),
    ("ver_tecnicos", "Ver", "Técnicos y verificaciones"),
    ("ver_ordenes", "Ver", "Órdenes"),
    ("ver_finanzas", "Ver", "Finanzas, transacciones y liquidaciones"),
    ("ver_soporte", "Ver", "Mensajería, reportes y reseñas"),
    ("ver_personal", "Ver", "Personal interno"),
    ("tasa", "Editar", "Cargar la tasa BCV"),
    ("precios", "Editar", "Tabulación de precios e inspección"),
    ("qr_tiendas", "Editar", "Generar el QR de las tiendas"),
    ("banners", "Editar", "Banners y aliados"),
    ("aprobar_presupuestos", "Editar", "Aprobar presupuestos"),
    ("pagar_materiales", "Editar", "Pagar materiales a los técnicos"),
    ("altas_tecnicos", "Editar", "Expedientes y altas de técnicos"),
    ("activar_cuentas", "Editar", "Activar o desactivar cuentas"),
    ("finanzas", "Editar", "Finanzas: pagos, gastos, reclamos, bancos y tipos de pago"),
    ("diseno", "Editar", "Diseño de la app: colores, textos, menús y avisos"),
]
CLAVES_PERMISO = [p[0] for p in PERMISOS]
TEXTO_PERMISO = {p[0]: p[2] for p in PERMISOS}
_VER = [p[0] for p in PERMISOS if p[1] == "Ver"]
PERMISOS_POR_ROL = {
    "superadmin": CLAVES_PERMISO,
    "supervisor": _VER + ["altas_tecnicos"],
    "tecnico_supervisor": ["ver_tecnicos", "ver_ordenes", "altas_tecnicos"],
    "agente": [],
}


def permisos_de(u: User) -> list[str]:
    if u.rol == "superadmin" and u.es_ceo:
        return list(CLAVES_PERMISO)
    base = PERMISOS_POR_ROL.get(u.rol, [])
    return [p for p in (u.permisos if u.permisos is not None else base) if p in CLAVES_PERMISO]


def exigir_permiso(u: User, clave: str) -> None:
    if u.rol in ("cliente", "tecnico", "ayudante"):
        return
    if clave not in permisos_de(u):
        raise HTTPException(403, f"No tienes permiso para: {TEXTO_PERMISO.get(clave, clave)}. Pídeselo al CEO.")
