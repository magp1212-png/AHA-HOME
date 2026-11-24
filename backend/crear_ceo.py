"""Crea (o actualiza) la cuenta del CEO en el servidor. Se ejecuta una sola vez, en el servidor:

    python crear_ceo.py magp@aha-go.com

Pide la clave sin mostrarla en pantalla; la clave nunca se escribe en archivos ni en GitHub."""
import getpass
import re
import sys

from sqlalchemy import select

from app.db import Base, SessionLocal, agregar_columnas_nuevas, engine
from app.models import User
from app.security import hash_password


def main() -> None:
    email = (sys.argv[1] if len(sys.argv) > 1 else input("Correo del CEO: ")).strip().lower()
    nombre = input("Nombre y apellido [CEO]: ").strip() or "CEO"
    clave = getpass.getpass("Clave (mínimo 8, con letra y número): ")
    if len(clave) < 8 or not re.search(r"[A-Za-z]", clave) or not re.search(r"\d", clave):
        sys.exit("La clave debe tener al menos 8 caracteres, una letra y un número.")
    if getpass.getpass("Repite la clave: ") != clave:
        sys.exit("Las claves no coinciden.")
    Base.metadata.create_all(engine)
    agregar_columnas_nuevas(engine)
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == email))
        if not u:
            u = User(email=email, nombre=nombre, rol="superadmin")
            db.add(u)
        u.nombre, u.rol, u.es_ceo, u.activo, u.email_verificado = nombre, "superadmin", True, True, True
        u.password_hash, u.clave_temporal = hash_password(clave), False
        db.commit()
        from app.routers.ceo import sembrar_correos
        sembrar_correos(db)
    print(f"Listo: {email} es la cuenta CEO.")


if __name__ == "__main__":
    main()
