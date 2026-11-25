"""Respaldo diario de ahahome.db: online copy (safe while the API is running), verified, 30 days kept.

Run by the tarea programada "aha home respaldo".  Manual:  backend\\.venv\\Scripts\\python.exe ops\\respaldo.py
"""
import datetime as dt
import pathlib
import sqlite3
import sys

BASE = pathlib.Path(__file__).resolve().parent.parent / "backend"
DB = BASE / "ahahome.db"
DEST = BASE / "respaldos"
KEEP_DAYS = 30
LOG = DEST / "respaldo.log"


def log(msg: str) -> None:
    DEST.mkdir(exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n")
    print(msg)


def main() -> int:
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import conjunto
    if conjunto.url():  # servidores trabajando juntos: la base está en PostgreSQL
        try:
            target = conjunto.respaldar(DEST)
        except Exception as e:
            log(f"ERROR respaldo de PostgreSQL: {e}")
            return 2
        log(f"OK {target.name} ({target.stat().st_size // 1024} KB, PostgreSQL compartido)")
        try:
            from subir_respaldo import upload
            log(upload(target, f"ahahome/diario/{target.name}"))
        except Exception as e:
            log(f"ERROR subiendo a R2: {e}")
        for f in sorted(DEST.glob("ahahome-*.dump"))[:-KEEP_DAYS]:
            f.unlink(missing_ok=True)
        return 0
    if not DB.exists():
        log(f"ERROR no existe {DB}")
        return 1
    DEST.mkdir(exist_ok=True)
    target = DEST / f"ahahome-{dt.datetime.now():%Y%m%d-%H%M}.db"
    src = sqlite3.connect(DB, timeout=30)
    dst = sqlite3.connect(target)
    with dst:
        src.backup(dst)  # consistent snapshot even with WAL and live writes
    src.close()
    dst.close()
    # verify the copy really reopens and is intact
    chk = sqlite3.connect(target)
    ok = chk.execute("PRAGMA integrity_check").fetchone()[0]
    users = chk.execute("SELECT count(*) FROM usuarios").fetchone()[0]
    chk.close()
    if ok != "ok":
        log(f"ERROR respaldo corrupto {target.name}: {ok}")
        return 2
    log(f"OK {target.name} ({target.stat().st_size // 1024} KB, {users} usuarios)")
    try:  # second copy outside this server (Cloudflare R2), when configured
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
        from subir_respaldo import upload
        log(upload(target, f"ahahome/diario/{target.name}"))
    except Exception as e:  # never lose the local backup because the upload failed
        log(f"ERROR subiendo a R2: {e}")
    # fotos (evidencias, cédulas, expedientes) de los últimos 2 días: también a R2
    fotos = BASE / "uploads"
    if fotos.is_dir():
        desde = dt.datetime.now() - dt.timedelta(days=2)
        for f in fotos.glob("*.*"):
            if dt.datetime.fromtimestamp(f.stat().st_mtime) < desde:
                continue
            try:
                from subir_respaldo import upload
                log(upload(f, f"ahahome/fotos/{f.name}"))
            except Exception as e:
                log(f"ERROR subiendo foto {f.name}: {e}")
    cutoff = dt.datetime.now() - dt.timedelta(days=KEEP_DAYS)
    for old in DEST.glob("ahahome-*.db"):
        if dt.datetime.fromtimestamp(old.stat().st_mtime) < cutoff:
            old.unlink()
            log(f"borrado por antiguedad {old.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
