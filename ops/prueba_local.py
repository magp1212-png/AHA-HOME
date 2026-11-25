"""Prepara la copia de PRUEBA de AHA HOME (puerto 8097, base aparte backend/prueba/prueba.db).

La llama ops/prueba-local.cmd. No toca la base real, no envía correos ni notificaciones push.
Usuarios de prueba (clave aha12345): ceo@ahahome.test, superadmin@ahahome.test, supervisor@ahahome.test,
agente@ahahome.test, ventas@ahahome.test.
"""
import pathlib
import secrets
import sys

BACKEND = pathlib.Path(__file__).resolve().parent.parent / "backend"
PRUEBA = BACKEND / "prueba"


def secreto() -> None:
    """Llave de sesiones PROPIA de la prueba: una sesión de prueba nunca sirve en el servidor real."""
    PRUEBA.mkdir(exist_ok=True)
    f = PRUEBA / "secreto.txt"
    if not f.exists():
        f.write_text(secrets.token_urlsafe(48), encoding="ascii")


def datos() -> None:
    sys.path.insert(0, str(BACKEND))
    import seed
    from sqlalchemy import select
    from app.db import SessionLocal, agregar_columnas_nuevas, engine
    from app.models import User
    from app.security import hash_password
    seed.run()
    agregar_columnas_nuevas(engine)
    with SessionLocal() as db:
        if not db.scalar(select(User).where(User.email == "ventas@ahahome.test")):
            db.add(User(nombre="Ventas AHA HOME", email="ventas@ahahome.test", telefono="04140000098",
                        password_hash=hash_password(seed.CLAVE), rol="ventas"))
        for u in db.scalars(select(User).where(User.email.like("%@ahahome.test"))):
            u.email_verificado, u.activo = True, True
        db.commit()


if __name__ == "__main__":
    secreto() if sys.argv[1:] == ["secreto"] else datos()
