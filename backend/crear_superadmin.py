"""Crea (o actualiza) el superadministrador real. Uso: python crear_superadmin.py"""
import getpass

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import User
from app.security import hash_password


def main():
    Base.metadata.create_all(engine)
    nombre = input("Nombre del superadministrador: ").strip()
    email = input("Correo: ").strip().lower()
    tel = "".join(c for c in input("Teléfono: ") if c.isdigit())
    clave = getpass.getpass("Contraseña (mínimo 8): ")
    if len(clave) < 8 or getpass.getpass("Repite la contraseña: ") != clave:
        raise SystemExit("La contraseña es muy corta o no coincide.")
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == email)) or User(email=email, rol="superadmin")
        u.nombre, u.telefono, u.password_hash, u.rol, u.activo, u.email_verificado = nombre, tel, hash_password(clave), "superadmin", True, True
        db.add(u)
        db.commit()
    print(f"Listo: {email} es superadministrador.")


if __name__ == "__main__":
    main()
