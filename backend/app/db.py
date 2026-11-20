from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    if not url.startswith("sqlite"):
        # Producción: AHAHOME_DATABASE_URL=postgresql+psycopg://usuario:clave@host/ahahome
        return create_engine(url, future=True, pool_pre_ping=True)
    eng = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15}, future=True)

    @event.listens_for(eng, "connect")
    def _pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA busy_timeout=15000")
        cur.close()
    return eng


engine = make_engine(config.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def agregar_columnas_nuevas(eng) -> list[str]:
    """Migración sencilla: agrega a las tablas existentes las columnas nuevas del modelo (con su valor por defecto)."""
    from sqlalchemy import inspect, text
    insp = inspect(eng)
    hechas = []
    with eng.begin() as c:
        for tabla in Base.metadata.sorted_tables:
            if not insp.has_table(tabla.name):
                continue
            existentes = {col["name"] for col in insp.get_columns(tabla.name)}
            for col in tabla.columns:
                if col.name in existentes:
                    continue
                tipo = col.type.compile(dialect=eng.dialect)
                defecto = ""
                d = col.default.arg if col.default is not None and not callable(col.default.arg) else None
                if isinstance(d, bool):
                    defecto = f" DEFAULT {'TRUE' if d else 'FALSE'}" if eng.dialect.name != "sqlite" else f" DEFAULT {int(d)}"
                elif isinstance(d, (int, float)):
                    defecto = f" DEFAULT {d}"
                elif isinstance(d, str):
                    defecto = " DEFAULT '" + d.replace("'", "''") + "'"
                c.execute(text(f'ALTER TABLE {tabla.name} ADD COLUMN {col.name} {tipo}{defecto}'))
                hechas.append(f"{tabla.name}.{col.name}")
    return hechas
