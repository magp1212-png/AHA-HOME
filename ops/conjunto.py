"""Servidores trabajando juntos: lee la conexión a PostgreSQL de ops/conjunto.cmd y hace respaldos con pg_dump.

ops/conjunto.cmd lo crea ops/conjunto-windows.ps1 y nunca va a GitHub (tiene la clave de la base de datos).
"""
import datetime as dt
import glob
import os
import pathlib
import re
import subprocess
from urllib.parse import unquote, urlparse

OPS = pathlib.Path(__file__).resolve().parent
ARCHIVO = OPS / "conjunto.cmd"


def url() -> str | None:
    """La AHAHOME_DATABASE_URL de este servidor si comparte PostgreSQL; None si usa su SQLite propio."""
    if os.environ.get("AHAHOME_DATABASE_URL", "").startswith("postgresql"):
        return os.environ["AHAHOME_DATABASE_URL"]
    if not ARCHIVO.exists():
        return None
    m = re.search(r"set\s+\"?AHAHOME_DATABASE_URL=([^\"\r\n]+)", ARCHIVO.read_text(encoding="utf-8", errors="ignore"))
    return m.group(1).strip() if m else None


def pg_dump_exe() -> str:
    hallados = sorted(glob.glob(r"C:\Program Files\PostgreSQL\*\bin\pg_dump.exe"))
    return hallados[-1] if hallados else "pg_dump"


def respaldar(destino_dir: pathlib.Path, sufijo: str = "") -> pathlib.Path:
    """Copia completa de la base compartida (formato personalizado de pg_dump, se restaura con pg_restore)."""
    u = urlparse(url().replace("postgresql+psycopg", "postgresql"))
    destino_dir.mkdir(parents=True, exist_ok=True)
    destino = destino_dir / f"ahahome-{dt.datetime.now():%Y%m%d-%H%M}{sufijo}.dump"
    env = {**os.environ, "PGPASSWORD": unquote(u.password or "")}
    r = subprocess.run([pg_dump_exe(), "-h", u.hostname or "127.0.0.1", "-p", str(u.port or 5432), "-U", unquote(u.username or ""),
                        "-d", u.path.lstrip("/"), "-F", "c", "-f", str(destino)], env=env, capture_output=True, text=True, timeout=1800)
    if r.returncode or not destino.exists() or destino.stat().st_size < 1024:
        raise RuntimeError(f"pg_dump falló: {(r.stderr or r.stdout).strip()[-300:]}")
    return destino
