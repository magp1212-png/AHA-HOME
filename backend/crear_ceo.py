"""Crea (o actualiza) la cuenta del CEO en el servidor. Se ejecuta una sola vez, en el servidor:

    python crear_ceo.py magp@aha-go.com

Pide la clave sin mostrarla en pantalla. Si se deja vacía, genera una clave temporal, la muestra una sola vez
en esta pantalla y obliga a cambiarla al primer ingreso. La clave nunca se escribe en archivos ni en GitHub."""
import getpass
import re
import sys
import os
import pathlib

# Servidores en conjunto: usar la base compartida (ops/conjunto.cmd), no el SQLite propio de esta estación
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "ops"))
try:
    import conjunto
    if conjunto.url():
        os.environ["AHAHOME_DATABASE_URL"] = conjunto.url()
except ImportError:
    pass

from sqlalchemy import select

from app.db import Base, SessionLocal, agregar_columnas_nuevas, engine
from app.models import User
from app.security import hash_password


def main() -> None:
    email = (sys.argv[1] if len(sys.argv) > 1 else input("Correo del CEO: ")).strip().lower()
    nombre = input("Nombre y apellido [CEO]: ").strip() or "CEO"
    clave = getpass.getpass("Clave (mínimo 8, con letra y número; Enter = generar una temporal): ")
    temporal = not clave
    if temporal:
        from app.routers.ceo import _clave_generada
        clave = _clave_generada()
    else:
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
        u.password_hash, u.clave_temporal = hash_password(clave), temporal
        db.commit()
        from app.routers.ceo import sembrar_correos
        sembrar_correos(db)
        # La tienda del piloto, para que el CEO pueda crear las cuentas de caja y del técnico supervisor
        from app.models import Tienda
        if not db.scalar(select(Tienda)):
            from seed import TIENDA
            nombre, zona, dirc, lat, lng = TIENDA
            db.add(Tienda(nombre=nombre, zona=zona, direccion=dirc, lat=lat, lng=lng))
            db.commit()
            print(f"Tienda creada: {nombre}")
    print(f"Listo: {email} es la cuenta CEO.")
    print("Base de datos usada: " + ("PostgreSQL compartida" if engine.dialect.name == "postgresql" else "la propia de esta estacion (SQLite)"))
    if temporal:
        print(f"\n  Clave temporal: {clave}\n  Anótala ahora: no se vuelve a mostrar. Al entrar por primera vez, el sistema te pedirá cambiarla.\n")


if __name__ == "__main__":
    main()
