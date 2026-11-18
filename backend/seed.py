"""Datos de demostración para el PILOTO: una sola tienda, Damasco Santa Mónica (Caracas).

Crea:
- La tienda Damasco Santa Mónica. Las coordenadas son las del sector Santa Mónica; falta confirmar la dirección exacta.
- 9 técnicos en 3 escuadras (grupos A, B y C) y 1 de Guardia Retén. Cada técnico tiene 1 ayudante.
- 1 agente en caja, 1 técnico supervisor de la tienda, 1 supervisor, 1 superadmin y 1 clienta.

Uso:  python seed.py        (no cambia nada si ya hay datos)
Contraseña de todos los usuarios de prueba: aha12345 · PIN de técnicos y ayudantes: 1234
Para replicar en otra tienda después del piloto: POST /admin/tiendas y crear su personal desde el panel.
"""
from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import Tecnico, Tienda, User, ahora
from app.security import hash_password

TIENDA = ("Damasco Santa Mónica", "Central", "Santa Mónica, Caracas (dirección exacta por confirmar)", 10.4790, -66.8870)
TECNICOS = ["José Hernández", "Luis Rodríguez", "Pedro Silva", "Andrea Medina", "Carlos Rivas", "Ana Torres",
            "Miguel Castillo", "Rosa Díaz", "Jorge Suárez", "Ricardo Pérez"]
AYUDANTES = ["Daniel Pérez", "Carmen Rojas", "Rafael Mendoza", "Luisa Romero", "Andrés Guzmán", "Patricia Vargas",
             "Héctor Blanco", "Gabriela Flores", "Ricardo Herrera", "Valentina Morales"]
CLAVE = "aha12345"
DEMO_FOTOS = {"foto_rostro": "/archivos/demo-rostro.jpg", "selfie_cedula": "/archivos/demo-cedula.jpg",
              "foto_perfil": "/archivos/demo-perfil.jpg", "huella_registrada": True}


def run():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    if db.scalar(select(Tienda)):
        print("Ya hay datos; no se cambió nada.")
        return
    h, pin = hash_password(CLAVE), hash_password("1234")
    nombre, zona, dirc, lat, lng = TIENDA
    t = Tienda(nombre=nombre, zona=zona, direccion=dirc, lat=lat, lng=lng)
    db.add(t)
    db.flush()
    db.add_all([
        User(nombre="Superadministrador AHA HOME", telefono="04140000000", email="superadmin@ahahome.test", password_hash=h, rol="superadmin"),
        User(nombre="Equipo Supervisor", telefono="04140000001", email="supervisor@ahahome.test", password_hash=h, rol="supervisor"),
        User(nombre="Técnico Supervisor Santa Mónica", telefono="04140000002", email="tecsup@ahahome.test", password_hash=h,
             rol="tecnico_supervisor", tienda_id=t.id),
        User(nombre="Agente Caja Santa Mónica", telefono="04141000001", email="agente@ahahome.test", password_hash=h, rol="agente", tienda_id=t.id),
        User(nombre="María González", telefono="04141234567", email="maria@ahahome.test", password_hash=h, rol="cliente"),
    ])
    for i, nom in enumerate(TECNICOS):
        grupo = "ABC"[i // 3] if i < 9 else "RETEN"
        u = User(nombre=nom, telefono=f"04242{i:06d}", cedula=f"V-{12000000 + i * 1371}", password_hash=h, rol="tecnico")
        db.add(u)
        db.flush()
        tec = Tecnico(user_id=u.id, tienda_id=t.id, grupo=grupo, lat=lat + (i - 4) * 0.004, lng=lng + (i % 3 - 1) * 0.004,
                      pin_hash=pin, verificado=True, alta_en=ahora(), **DEMO_FOTOS)
        db.add(tec)
        db.flush()
        a = User(nombre=AYUDANTES[i], telefono=f"04243{i:06d}", cedula=f"V-{20000000 + i * 977}", password_hash=h, rol="ayudante")
        db.add(a)
        db.flush()
        db.add(Tecnico(user_id=a.id, tienda_id=t.id, grupo=grupo, es_ayudante=True, jefe_id=tec.id, pin_hash=pin,
                       verificado=True, alta_en=ahora(), **DEMO_FOTOS))
    db.commit()
    print(f"Listo: piloto {nombre} con 10 técnicos, 10 ayudantes, agente, técnico supervisor, supervisor, superadmin "
          f"y una clienta. Clave: {CLAVE}")


if __name__ == "__main__":
    run()
