"""AHA HOME: publishes to this server what was pushed to the `produccion` branch on GitHub.

Runs every 5 minutes (scheduled task "aha home publicar"). When there is a new commit:
  1. checks it out apart (a git worktree) and runs ALL the backend tests there; if one fails, nothing changes
     here and the owner is told (that commit is not tried again until a newer one arrives);
  2. backs up the database;
  3. moves the live code to the new commit, installs new requirements, builds the web, restarts the API;
  4. if the API does not answer /health, goes back to the previous commit and restarts again.
The database, keys, photos and backups never come from GitHub: they live only here (see .gitignore).
Usage: python ops/publicar.py            (what the task runs)
       python ops/publicar.py --forzar   (publish even if the commit was rejected before)
"""
import datetime as dt
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKEND, MOBILE = ROOT / "backend", ROOT / "mobile"
PY = BACKEND / ".venv" / "Scripts" / "python.exe"
STATE = ROOT / "ops" / "publicar.estado"
LOG = ROOT / "ops" / "publicar.log"
BRANCH = "produccion"
ENV = {**os.environ, "PATH": r"C:\Program Files\nodejs;C:\Program Files\Git\cmd;" + os.environ.get("PATH", "")}


def log(msg: str) -> None:
    line = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def run(cmd: list[str], cwd: pathlib.Path, timeout: int = 900) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          timeout=timeout, shell=(os.name == "nt" and cmd[0] in ("npm", "npx")))


def git(*args: str) -> str:
    r = run(["git", *args], ROOT, timeout=300)
    if r.returncode:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.strip()[:400]}")
    return r.stdout.strip()


def tell_owner(title: str, body: str) -> None:
    """Aviso a los superadministradores de AHA HOME (bandeja y push)."""
    code = ("from app.db import SessionLocal\nfrom app.models import User\nfrom app.notificar import notificar\nfrom sqlalchemy import select\n"
            "with SessionLocal() as db:\n"
            "    for u in db.scalars(select(User).where(User.rol == 'superadmin', User.activo.is_(True))):\n"
            f"        notificar(db, u.id, {title!r}, {body[:300]!r})\n"
            "    db.commit()\n")
    run([str(PY), "-c", code], BACKEND, timeout=120)


def healthy(tries: int = 20) -> bool:
    for _ in range(tries):
        try:
            if urllib.request.urlopen("http://127.0.0.1:8096/salud", timeout=5).status == 200:
                return True
        except Exception:
            pass
        time.sleep(3)
    return False


def restart_api() -> None:
    """The scheduled task "aha home API" runs uvicorn in a loop: ending the process starts the new code."""
    out = run(["netstat", "-ano"], ROOT).stdout
    pids = {ln.split()[-1] for ln in out.splitlines() if "127.0.0.1:8096" in ln and "LISTENING" in ln}
    for pid in pids:
        run(["taskkill", "/PID", pid, "/F"], ROOT)


def backup_db() -> pathlib.Path:
    dest = BACKEND / "respaldos" / f"ahahome-{dt.datetime.now():%Y%m%d-%H%M}-antes-de-publicar.db"
    dest.parent.mkdir(exist_ok=True)
    s, d = sqlite3.connect(BACKEND / "ahahome.db"), sqlite3.connect(dest)
    s.backup(d)
    ok = d.execute("pragma integrity_check").fetchone()[0] == "ok"
    d.close(); s.close()
    if not ok:
        raise RuntimeError("el respaldo no pasó la verificación")
    return dest


def main(force: bool = False) -> None:
    git("fetch", "-q", "origin", BRANCH)
    new, cur = git("rev-parse", f"origin/{BRANCH}"), git("rev-parse", "HEAD")
    if new == cur:
        return
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    if state.get("rechazado") == new and not force:
        return
    subject = git("log", "-1", "--format=%s", new)
    log(f"nuevo: {new[:8]} «{subject}»")

    # 1) tests on the candidate, apart from the live code
    work = pathlib.Path(tempfile.mkdtemp(prefix="ahahome-candidato-"))
    try:
        git("worktree", "add", "--detach", str(work), new)
        changed = git("diff", "--name-only", cur, new).splitlines()
        if "backend/requirements.txt" in changed:
            run([str(PY), "-m", "pip", "install", "-q", "-r", str(work / "backend" / "requirements.txt")], BACKEND)
        t = run([str(PY), "-m", "pytest", "-q", "-x"], work / "backend", timeout=1200)
        tail = (t.stdout or t.stderr).strip().splitlines()[-1:] or ["sin salida"]
        if t.returncode:
            log(f"PRUEBAS FALLARON, no se publica: {tail[0]}")
            STATE.write_text(json.dumps({"rechazado": new, "motivo": tail[0]}), encoding="utf-8")
            tell_owner("No se publicó", f"«{subject}»: falló una prueba ({tail[0]}). La web sigue como estaba.")
            return
        log(f"pruebas ok: {tail[0]}")
    finally:
        run(["git", "worktree", "remove", "--force", str(work)], ROOT)
        shutil.rmtree(work, ignore_errors=True)

    # 2) backup, 3) go live
    copy = backup_db()
    log(f"respaldo: {copy.name}")
    git("reset", "-q", "--hard", new)
    if "mobile/package-lock.json" in changed or "mobile/package.json" in changed:
        run(["npm", "ci", "--no-audit", "--no-fund"], MOBILE, timeout=1800)
    if any(c.startswith("mobile/") for c in changed):
        w = run(["npx", "--no-install", "expo", "export", "--platform", "web", "--output-dir", "dist-web"], MOBILE, timeout=1800)
        if w.returncode:
            log("la web no se pudo armar: " + (w.stderr or w.stdout).strip()[-300:])
    restart_api()
    if healthy():
        STATE.write_text(json.dumps({"publicado": new}), encoding="utf-8")
        log(f"PUBLICADO {new[:8]}")
        tell_owner("Publicado en AHA HOME", f"«{subject}» ya está en el servidor.")
        return

    # 4) the new code does not start: back to what worked
    log("la API no responde con el código nuevo: vuelvo a la versión anterior")
    git("reset", "-q", "--hard", cur)
    restart_api()
    STATE.write_text(json.dumps({"rechazado": new, "motivo": "la API no arrancó"}), encoding="utf-8")
    tell_owner("No se publicó", f"«{subject}»: la API no arrancó y se volvió a la versión anterior.")


if __name__ == "__main__":
    try:
        main(force="--forzar" in sys.argv)
    except Exception as e:  # never leave the task crashing every 5 minutes without a trace
        log(f"error: {e}")
