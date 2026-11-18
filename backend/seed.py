"""Datos de demostración: 3 tiendas Damasco en Caracas, 9 técnicos por tienda (grupos A, B y C),
Guardia Retén, un agente por tienda, un supervisor y una clienta.

Uso:  python seed.py        (no borra nada si ya hay datos)
Las coordenadas son aproximadas; reemplázalas con las direcciones reales de cada sucursal.
Contraseña de todos los usuarios de prueba: aha12345 · PIN de los técnicos: 1234
"""
from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import Tecnico, Tienda, User
from app.security import hash_password

TIENDAS = [
    ("Damasco Oeste", "Oeste", "Catia, Caracas", 10.5125, -66.9450),
    ("Damasco Central", "Central", "El Recreo, Caracas", 10.4930, -66.8800),
    ("Damasco Este", "Este", "Petare, Caracas", 10.4770, -66.8080),
]
NOMBRES = ["José Hernández", "Luis Rodríguez", "Pedro Silva", "Andrea Medina", "Carlos Rivas", "Ana Torres",
           "Miguel Castillo", "Rosa Díaz", "Jorge Suárez", "Daniel Pérez", "Carmen Rojas", "Rafael Mendoza",
           "Luisa Romero", "Andrés Guzmán", "Patricia Vargas", "Héctor Blanco", "Gabriela Flores", "Ricardo Herrera",
           "Valentina Morales", "Francisco Ramírez", "Mariana Castro", "Alejandro Ortiz", "Daniela Navarro",
           "Eduardo Molina", "Isabel Delgado", "Fernando Peña", "Sofía Ríos", "Ricardo Pérez", "Daniela Rojas", "Miguel Torres"]

CLAVE = "aha12345"


def run():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    if db.scalar(select(Tienda)):
        print("Ya hay datos; no se cambió nada.")
        return
    h = hash_password(CLAVE)
    pin = hash_password("1234")
    tiendas = []
    for nombre, zona, dirc, lat, lng in TIENDAS:
        t = Tienda(nombre=nombre, zona=zona, direccion=dirc, lat=lat, lng=lng)
        db.add(t)
        tiendas.append(t)
    db.flush()
    db.add(User(nombre="Supervisor Caracas", telefono="04140000001", email="supervisor@ahahome.test", password_hash=h, rol="supervisor"))
    db.add(User(nombre="Administrador", telefono="04140000000", email="admin@ahahome.test", password_hash=h, rol="admin"))
    db.add(User(nombre="María González", telefono="04141234567", email="maria@ahahome.test", password_hash=h, rol="cliente"))
    n = 0
    for i, t in enumerate(tiendas):
        db.add(User(nombre=f"Agente {t.nombre}", telefono=f"0414100000{i + 1}", email=f"agente{i + 1}@ahahome.test",
                    password_hash=h, rol="agente", tienda_id=t.id))
        for j in range(9):
            grupo = "ABC"[j // 3]
            u = User(nombre=NOMBRES[n], telefono=f"04242{n:06d}", cedula=f"V-{12000000 + n * 1371}", password_hash=h, rol="tecnico")
            db.add(u)
            db.flush()
            db.add(Tecnico(user_id=u.id, tienda_id=t.id, grupo=grupo, lat=t.lat + (j - 4) * 0.004, lng=t.lng + (j % 3 - 1) * 0.004,
                           pin_hash=pin, foto_rostro="/archivos/demo-rostro.jpg", selfie_cedula="/archivos/demo-cedula.jpg",
                           verificado=True))
            n += 1
        u = User(nombre=NOMBRES[27 + i], telefono=f"04243{i:06d}", cedula=f"V-{15000000 + i * 977}", password_hash=h, rol="tecnico")
        db.add(u)
        db.flush()
        db.add(Tecnico(user_id=u.id, tienda_id=t.id, grupo="RETEN", lat=t.lat, lng=t.lng, pin_hash=pin,
                       foto_rostro="/archivos/demo-rostro.jpg", selfie_cedula="/archivos/demo-cedula.jpg", verificado=True))
    db.commit()
    print("Listo: 3 tiendas, 30 técnicos, 3 agentes, supervisor, admin y una clienta. Clave:", CLAVE)


if __name__ == "__main__":
    run()
