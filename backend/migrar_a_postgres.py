"""Pasa todos los datos de AHA HOME de SQLite (un solo servidor) a PostgreSQL (servidores trabajando juntos).

Uso (en el servidor principal, con la API detenida):
    .venv\\Scripts\\python.exe migrar_a_postgres.py ahahome.db "postgresql+psycopg://ahahome:CLAVE@127.0.0.1:5432/ahahome"

Copia cada tabla tal cual (mismos números de orden, usuarios y claves), sube las fotos de la carpeta uploads a la
base de datos y ajusta los contadores. No borra el archivo SQLite: queda como respaldo.
Si la base de PostgreSQL ya tiene datos, se detiene para no mezclar.
"""
import pathlib
import sys

from sqlalchemy import MetaData, create_engine, func, select, text


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    origen, destino = pathlib.Path(sys.argv[1]), sys.argv[2]
    if not origen.exists():
        sys.exit(f"No existe {origen}")
    import os
    os.environ["AHAHOME_DATABASE_URL"] = destino  # para que los modelos creen las tablas en PostgreSQL
    from app.db import Base, agregar_columnas_nuevas
    from app import models  # noqa: F401  (registra todas las tablas)

    src = create_engine(f"sqlite:///{origen}")
    dst = create_engine(destino, pool_pre_ping=True)
    Base.metadata.create_all(dst)
    agregar_columnas_nuevas(dst)
    with dst.connect() as c:
        if c.execute(select(func.count()).select_from(Base.metadata.tables["usuarios"])).scalar():
            sys.exit("PostgreSQL ya tiene usuarios: no se migra para no mezclar datos.")

    origen_md = MetaData()
    origen_md.reflect(src)
    total = 0
    with src.connect() as s, dst.begin() as d:
        for tabla in Base.metadata.sorted_tables:  # en orden: primero las tablas de las que dependen otras
            if tabla.name not in origen_md.tables:
                continue
            cols_origen = set(origen_md.tables[tabla.name].c.keys())
            cols = [c for c in tabla.c if c.name in cols_origen]
            filas = [dict(r._mapping) for r in s.execute(select(*[origen_md.tables[tabla.name].c[c.name] for c in cols]))]
            if filas:
                d.execute(tabla.insert(), filas)
                total += len(filas)
                print(f"  {tabla.name}: {len(filas)}")
        # los contadores de cada tabla siguen después del último número usado
        for tabla in Base.metadata.sorted_tables:
            pk = list(tabla.primary_key.columns)
            if len(pk) == 1 and pk[0].type.python_type is int and pk[0].autoincrement in (True, "auto"):
                d.execute(text(f"SELECT setval(pg_get_serial_sequence('{tabla.name}', '{pk[0].name}'), "
                               f"COALESCE((SELECT MAX({pk[0].name}) FROM {tabla.name}), 0) + 1, false)"))
    # fotos de la carpeta uploads → base de datos
    carpeta = origen.parent / "uploads"
    fotos = 0
    if carpeta.is_dir():
        tabla = Base.metadata.tables["archivos_fotos"]
        with dst.begin() as d:
            for f in carpeta.iterdir():
                if f.is_file() and not f.name.startswith("."):
                    d.execute(tabla.insert(), {"nombre": f.name, "datos": f.read_bytes()})
                    fotos += 1
    print(f"Listo: {total} registros y {fotos} fotos pasaron a PostgreSQL. El archivo {origen.name} queda como respaldo.")


if __name__ == "__main__":
    main()
