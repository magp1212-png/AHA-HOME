"""Departamento de sistemas: revisa cada 5 minutos el estado de la aplicación, los procesos del servidor y las
funciones principales; guarda los errores agrupados y avisa por la campanita y por correo cuando algo falla.

Lo ven solo el rol «sistemas» y el CEO. No guarda claves ni lo que la gente escribe.
"""
import datetime as dt
import hashlib
import json
import logging
import os
import pathlib
import re
import shutil
import subprocess
import threading
import time
import urllib.request

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from . import config
from .models import (CARACAS, ActividadPanel, ChequeoSistema, ConfigSistema, ErrorSistema, Orden, SesionPanel, User, ahora, dia_caracas)

log = logging.getLogger("ahahome.sistemas")
RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent  # carpeta del proyecto
OPS = RAIZ / "ops"
LOGS = config.BASE_DIR / "logs"
RESPALDOS = config.BASE_DIR / "respaldos"
INICIO_PROCESO = ahora()

AJUSTES_BASE = {
    "correos": ["diego@aha-go.com", "soporte@aha-go.com"],
    "canales": {"campanita": True, "correo": True, "resumen": True},
    "hora_resumen": 7,
    "reglas": {"rojo": True, "error_repetido": True, "publicacion": True, "intentos_fallidos": True, "equipo_nuevo": False, "fuera_horario": True, "tasa": True},
    "retencion": {"errores": 90, "accesos": 180, "actividad": 90},
}
REGLAS_TEXTO = {
    "rojo": "Una pieza del estado pasa a rojo", "error_repetido": "Un error se repite más de 10 veces en una hora",
    "publicacion": "Falla una publicación o un respaldo", "intentos_fallidos": "5 intentos fallidos seguidos en una cuenta",
    "equipo_nuevo": "Entrada desde un equipo nuevo", "fuera_horario": "Entrada fuera de horario (10 p. m. a 6 a. m.)",
    "tasa": "Tasa BCV sin cargar a las 9:00 a. m.",
}
PROCESOS = [("aha home API", "Panel y API"), ("aha home tunel", "Túnel de Cloudflare"), ("aha home publicar", "Publicador (cada 5 min)"), ("aha home respaldo", "Respaldo diario")]


def puede_ver(u: User) -> bool:
    return u.rol == "sistemas" or (u.rol == "superadmin" and bool(u.es_ceo))


# ---------- Ajustes ----------
def _cfg(db: Session, clave: str, base=None):
    c = db.get(ConfigSistema, clave)
    if not c:
        return base
    try:
        return json.loads(c.valor)
    except ValueError:
        return base


def _guardar_cfg(db: Session, clave: str, valor) -> None:
    c = db.get(ConfigSistema, clave) or ConfigSistema(clave=clave)
    c.valor = json.dumps(valor, ensure_ascii=False)
    db.add(c)


def ajustes(db: Session) -> dict:
    a = json.loads(json.dumps(AJUSTES_BASE))
    guardado = _cfg(db, "ajustes", {}) or {}
    for k, v in guardado.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            a[k].update(v)
        else:
            a[k] = v
    return a


# ---------- Errores ----------
def registrar_error(db: Session, origen: str, mensaje: str, donde: str = "", usuario: str = "") -> ErrorSistema:
    """Guarda un error; si ya existe uno igual, suma una vez más."""
    mensaje = (mensaje or "Error sin descripción").strip()[:300]
    limpio = re.sub(r"\d+", "#", mensaje)  # 'orden 12' y 'orden 15' son el mismo error
    huella = hashlib.sha1(f"{origen}|{donde}|{limpio}".encode()).hexdigest()
    hora = ahora().strftime("%Y-%m-%dT%H")
    e = db.scalar(select(ErrorSistema).where(ErrorSistema.huella == huella))
    if e:
        e.veces += 1
        e.veces_hora = e.veces_hora + 1 if e.hora == hora else 1
        e.hora, e.ultima, e.mensaje = hora, ahora(), mensaje
        e.usuario = usuario or e.usuario
        if e.estado == "resuelto":
            e.estado = "nuevo"  # volvió a pasar
    else:
        e = ErrorSistema(huella=huella, origen=origen, mensaje=mensaje, donde=donde[:200], usuario=usuario[:120], hora=hora)
        db.add(e)
    db.commit()
    a = ajustes(db)
    if a["reglas"].get("error_repetido") and e.veces_hora == 11:
        avisar(db, f"Error repetido: {mensaje[:80]}", f"Se repitió más de 10 veces en una hora. Dónde: {donde or origen}.", "error_repetido")
    return e


# ---------- Avisos ----------
def avisar(db: Session, titulo: str, texto: str, regla: str, forzar: bool = False) -> None:
    """Campanita al rol Sistemas y al CEO, y correo a las direcciones configuradas (máximo una vez por hora por aviso)."""
    a = ajustes(db)
    if not forzar and not a["reglas"].get(regla, True):
        return
    marca = "aviso:" + hashlib.sha1(titulo.encode()).hexdigest()[:16]
    ultimo = _cfg(db, marca)
    if ultimo and not forzar and ahora() - dt.datetime.fromisoformat(ultimo) < dt.timedelta(hours=1):
        return
    _guardar_cfg(db, marca, ahora().isoformat())
    if a["canales"].get("campanita", True):
        from .notificar import notificar
        for u in db.scalars(select(User).where(User.activo.is_(True), User.rol.in_(("sistemas", "superadmin")))):
            if puede_ver(u):
                notificar(db, u.id, f"Sistemas · {titulo}"[:120], texto[:300], None)
    db.commit()
    if a["canales"].get("correo", True):
        from . import correo
        html = f"""<div style="font-family:Arial,sans-serif;max-width:560px"><h2 style="color:#21244D">AHA HOME · Departamento de sistemas</h2>
<p style="font-size:16px"><b>{titulo}</b></p><p>{texto}</p><p style="color:#666;font-size:13px">{(ahora() + CARACAS).strftime('%d/%m/%Y %I:%M %p')} (hora de Caracas) ·
Revísalo en superad.aha-go.com › Administración › Departamento de sistemas.</p></div>"""
        for d in a["correos"]:
            correo.enviar(d, f"AHA HOME · {titulo}"[:150], html, f"{titulo}\n\n{texto}")


# ---------- Revisiones ----------
def _ultima_linea(ruta: pathlib.Path, patron: str | None = None) -> str:
    try:
        lineas = [x for x in ruta.read_text(encoding="utf-8", errors="ignore").splitlines() if x.strip()]
    except OSError:
        return ""
    if patron:
        lineas = [x for x in lineas if re.search(patron, x)]
    return lineas[-1] if lineas else ""


def _fecha_linea(linea: str) -> dt.datetime | None:
    m = re.match(r"(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})", linea)
    return dt.datetime.fromisoformat(m.group(1).replace("T", " ")) if m else None  # hora local del servidor


def procesos() -> dict:
    """Estado de los procesos del servidor (tareas programadas de Windows) y de los arranques del panel."""
    filas = []
    disponible = os.name == "nt"
    if disponible:
        nombres = ",".join(f"'{n}'" for n, _ in PROCESOS)
        ps = (f"$r=@(); foreach($n in @({nombres})){{ $t=Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue; "
              "if($t){ $i=$t|Get-ScheduledTaskInfo; $r+=[pscustomobject]@{n=$n;s=[string]$t.State;u=$t.Principal.UserId;"
              "l=$(if($i.LastRunTime){$i.LastRunTime.ToString('s')}else{''});c=$i.LastTaskResult} } else { $r+=[pscustomobject]@{n=$n;s='NoExiste'} } }; $r|ConvertTo-Json -Compress")
        try:
            r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], capture_output=True, text=True, timeout=25)
            datos = json.loads(r.stdout or "[]")
            datos = datos if isinstance(datos, list) else [datos]
        except Exception as e:  # noqa: BLE001
            datos, disponible = [], False
            log.warning("no se pudieron leer las tareas programadas: %s", e)
        nombre_txt = dict(PROCESOS)
        for d in datos:
            estado = d.get("s", "")
            corre = estado == "Running"
            espera = d["n"] in ("aha home publicar", "aha home respaldo")  # corren por horario: «Ready» está bien
            nivel = "ok" if corre or (espera and estado == "Ready") else "mal"
            if d["n"] == "aha home publicar" and estado == "Ready" and d.get("c") not in (0, None, 267009, 267011):
                nivel = "pend"
            filas.append({"clave": d["n"], "nombre": nombre_txt.get(d["n"], d["n"]), "nivel": nivel,
                          "estado": {"Running": "Corriendo", "Ready": "Esperando su hora", "Disabled": "Apagado", "NoExiste": "No instalado"}.get(estado, estado or "—"),
                          "cuenta": d.get("u", ""), "ultima": d.get("l", ""), "resultado": d.get("c")})
    # arranques y caídas del panel (los anota ops/servidor-ahahome.cmd)
    hoy = (ahora() + CARACAS).strftime("%d/%m/%Y")
    caidas, arranques = 0, 0
    try:
        for x in (LOGS / "arranques.log").read_text(encoding="utf-8", errors="ignore").splitlines()[-400:]:
            if hoy in x or (ahora() + CARACAS).strftime("%Y-%m-%d") in x:
                arranques += "arrancando" in x
                caidas += "se detuvo" in x
    except OSError:
        pass
    arranque = getattr(procesos, "ultimo_arranque", None) or {}
    return {"disponible": disponible, "procesos": filas, "caidas_hoy": caidas, "arranques_hoy": arranques,
            "en_marcha_desde": INICIO_PROCESO.isoformat() + "Z", "arranque_ms": arranque.get("ms"), "arranque_lento": (arranque.get("ms") or 0) > 20000}


def _chequeos(db: Session) -> list[dict]:
    """Corre todas las revisiones y devuelve [{clave, grupo, nombre, nivel, valor, detalle, ms}]."""
    res = []

    def medir(clave, grupo, nombre, fn):
        t0 = time.perf_counter()
        try:
            nivel, valor, detalle = fn()
        except Exception as e:  # noqa: BLE001 - una revisión que falla es justamente lo que hay que mostrar
            db.rollback()
            nivel, valor, detalle = "mal", "No responde", str(e)[:240]
        res.append({"clave": clave, "grupo": grupo, "nombre": nombre, "nivel": nivel, "valor": valor, "detalle": detalle, "ms": int((time.perf_counter() - t0) * 1000)})

    def api():
        return "ok", "Responde", f"En marcha desde {(INICIO_PROCESO + CARACAS).strftime('%d/%m %I:%M %p')}"

    def base():
        db.execute(text("SELECT 1"))
        if engine_nombre() == "sqlite":
            ruta = pathlib.Path(config.DATABASE_URL.replace("sqlite:///", ""))
            peso = ruta.stat().st_size if ruta.exists() else 0
        else:
            peso = db.execute(text("SELECT pg_database_size(current_database())")).scalar() or 0
        return "ok", "Responde", f"Pesa {peso / 1048576:.1f} MB"

    def tunel():
        url = config.PUBLIC_URL
        if "127.0.0.1" in url or "localhost" in url:
            return "pend", "Sin dirección pública", "Configura AHAHOME_PUBLIC_URL para revisar la entrada desde internet"
        with urllib.request.urlopen(url + "/salud", timeout=8) as r:
            return ("ok", "Conectado", "La web llega desde internet") if r.status == 200 else ("mal", f"Respondió {r.status}", url)

    def correo_estado():
        from . import correo
        cfg = correo._settings()
        if not cfg:
            return "pend", "Sin configurar", "Falta backend/correo.key: los correos no salen"
        u = getattr(correo, "ultimo", None)
        if u and not u.get("ok"):
            return "mal", "Falló el último envío", f"{u.get('a', '')} · {u.get('en', '')}"
        return "ok", "Configurado", f"Último envío: {u['en']}" if u else "Sin envíos desde que arrancó"

    def push():
        n = db.scalar(select(func.count()).select_from(User).where(User.push_token.is_not(None))) or 0
        return "ok", f"{n} teléfono(s)" if n else "Sin uso", "Se activan cuando salgan las apps" if not n else "Registrados para recibir avisos"

    def tasa():
        from .routers.tasa import tasa_vigente
        t = tasa_vigente(db)
        hoy = dia_caracas()
        if t and t.fecha == hoy:
            return "ok", f"Bs {t.bs_por_usd:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."), f"Cargada hoy ({hoy})"
        tarde = (ahora() + CARACAS).hour >= 9
        return ("mal" if tarde else "pend"), "Sin cargar hoy", f"La caja cobra con la tasa del {t.fecha if t else '—'}"

    def disco():
        u = shutil.disk_usage(config.BASE_DIR)
        libre = u.free / 1e9
        return ("mal" if libre < 5 else "pend" if libre < 20 else "ok"), f"{libre:,.0f} GB libres".replace(",", "."), f"Usado {u.used / 1e9:,.0f} GB ({u.used * 100 // u.total} %)".replace(",", ".")

    def publicador():
        ruta = OPS / "publicar.log"
        if not ruta.exists():
            return "pend", "Sin registro", "No hay ops/publicar.log en este servidor"
        ultima = _ultima_linea(ruta)
        cuando = _fecha_linea(ultima)
        if cuando and dt.datetime.now() - cuando > dt.timedelta(minutes=20):
            return "pend", "No está corriendo", f"Última vez: {cuando:%d/%m %H:%M}"
        if "error" in ultima.lower():
            errores = [x for x in ruta.read_text(encoding="utf-8", errors="ignore").splitlines()[-6:] if "error" in x.lower()]
            return ("mal" if len(errores) >= 3 else "pend"), "Con errores", ultima[20:180]
        pub = _ultima_linea(ruta, r"PUBLICADO")
        return "ok", "Al día", (f"Última publicación: {pub[:16]} · {pub.split()[-1]}" if pub else "Sin publicaciones registradas")

    def respaldo():
        ruta = RESPALDOS / "respaldo.log"
        ok = _ultima_linea(ruta, r"\bOK\b")
        cuando = _fecha_linea(ok)
        if not cuando:
            return "pend", "Sin respaldos", "Todavía no hay un respaldo diario registrado"
        if dt.datetime.now() - cuando > dt.timedelta(hours=26):
            return "mal", "Atrasado", f"Último respaldo: {cuando:%d/%m %H:%M}"
        return "ok", "Al día", f"Último respaldo: {cuando:%d/%m %H:%M}"

    def proc():
        p = procesos()
        if not p["disponible"]:
            return "pend", "Sin datos", "Solo disponible en el servidor Windows"
        caidos = [x["nombre"] for x in p["procesos"] if x["nivel"] == "mal"]
        lento = p["arranque_lento"]
        if caidos:
            return "mal", f"{len(caidos)} caído(s)", ", ".join(caidos)
        if p["caidas_hoy"] or lento:
            return "pend", "Con reinicios" if p["caidas_hoy"] else "Arranque lento", f"Caídas hoy: {p['caidas_hoy']} · arrancó en {(p['arranque_ms'] or 0) / 1000:.0f} s"
        return "ok", f"{len(p['procesos'])} en orden", f"Sin caídas hoy · arrancó en {(p['arranque_ms'] or 0) / 1000:.0f} s"

    # funciones principales (solo leen; no crean datos de prueba)
    def f_entrar():
        from .security import hash_password, make_token, read_token, verify_password
        h = hash_password("prueba-sistemas-1")
        assert verify_password("prueba-sistemas-1", h) and read_token(make_token(1)) == 1
        return "ok", "Operativa", "Claves y sesiones funcionan"

    def _ceo():
        u = db.scalar(select(User).where(User.rol == "superadmin", User.es_ceo.is_(True), User.activo.is_(True)).limit(1))
        if not u:
            raise RuntimeError("No hay una cuenta CEO activa para probar")
        return u

    def f_panel():
        from .routers.panel import resumen
        resumen(dias=7, user=_ceo(), db=db)
        return "ok", "Operativa", "Los indicadores se calculan"

    def f_finanzas():
        from .routers.finanzas_libro import tablero
        tablero(desde=None, hasta=None, user=_ceo(), db=db)
        return "ok", "Operativa", "El resumen de Finanzas se calcula"

    def f_caja():
        from .models import Tienda
        n = db.scalar(select(func.count()).select_from(Tienda)) or 0
        return ("ok", "Operativa", f"{n} tienda(s) listas para registrar y cobrar") if n else ("mal", "Sin tiendas", "No hay tiendas: la caja no puede registrar órdenes")

    def f_qr():
        import io
        import qrcode
        qrcode.make("AHATIENDA:prueba").save(io.BytesIO(), format="PNG")
        return "ok", "Operativa", "Los QR se generan"

    def f_fotos():
        from . import almacen
        nombre = "prueba-sistemas.txt"
        almacen.guardar(nombre, b"ok")
        assert almacen.leer(nombre) == b"ok"
        if almacen.en_bd():
            from .models import ArchivoFoto
            f = db.get(ArchivoFoto, nombre)
            if f:
                db.delete(f)
                db.commit()
        else:
            (config.UPLOADS_DIR / nombre).unlink(missing_ok=True)
        return "ok", "Operativa", "Se guardan y se leen fotos"

    for c in (("api", "estado", "Panel y API", api), ("base", "estado", "Base de datos", base), ("tunel", "estado", "Túnel de Cloudflare", tunel),
              ("procesos", "estado", "Procesos del servidor", proc), ("correo", "estado", "Correo (Brevo)", correo_estado),
              ("push", "estado", "Notificaciones a teléfonos", push), ("tasa", "estado", "Tasa BCV", tasa), ("disco", "estado", "Disco del servidor", disco),
              ("publicador", "estado", "Publicador", publicador), ("respaldo", "estado", "Respaldo diario", respaldo),
              ("f_entrar", "funcion", "Entrar al panel", f_entrar), ("f_panel", "funcion", "Panel principal e indicadores", f_panel),
              ("f_finanzas", "funcion", "Resumen de Finanzas", f_finanzas), ("f_caja", "funcion", "Caja: registrar y cobrar órdenes", f_caja),
              ("f_qr", "funcion", "Generar QR de tienda", f_qr), ("f_fotos", "funcion", "Guardar fotos de evidencia", f_fotos)):
        medir(*c)
    return res


def engine_nombre() -> str:
    return "sqlite" if config.DATABASE_URL.startswith("sqlite") else "postgresql"


def revisar(db: Session) -> list[ChequeoSistema]:
    """Corre las revisiones, guarda el resultado y avisa de lo que pasó a rojo."""
    a = ajustes(db)
    cambios = []
    for r in _chequeos(db):
        c = db.get(ChequeoSistema, r["clave"]) or ChequeoSistema(clave=r["clave"], nivel="ok")
        antes = c.nivel if c.nombre else "ok"
        if c.nivel != r["nivel"] or not c.nombre:
            c.desde = ahora()
        c.grupo, c.nombre, c.nivel, c.valor, c.detalle, c.ms, c.en = r["grupo"], r["nombre"], r["nivel"], r["valor"][:80], r["detalle"][:250], r["ms"], ahora()
        db.add(c)
        if r["nivel"] == "mal" and antes != "mal":
            cambios.append(c)
    db.commit()
    for c in cambios:
        regla = "publicacion" if c.clave in ("publicador", "respaldo") else "tasa" if c.clave == "tasa" else "rojo"
        avisar(db, f"{c.nombre}: {c.valor}", c.detalle or "Revisa el Departamento de sistemas.", regla)
    _avisos_de_acceso(db, a)
    return db.scalars(select(ChequeoSistema)).all()


# ---------- Accesos ----------
def alertas_acceso(db: Session, dias: int = 7) -> list[dict]:
    desde = ahora() - dt.timedelta(days=dias)
    alertas = []
    usuarios = {u.id: u for u in db.scalars(select(User).where(User.rol.in_(config.ROLES_EQUIPO)))}
    acts = db.scalars(select(ActividadPanel).where(ActividadPanel.creado >= desde, ActividadPanel.tipo.in_(("ingreso", "ingreso_fallido"))).order_by(ActividadPanel.id)).all()
    seguidos = {}
    for x in acts:
        if x.tipo == "ingreso_fallido":
            seguidos[x.user_id] = seguidos.get(x.user_id, 0) + 1
            if seguidos[x.user_id] == 5:
                u = usuarios.get(x.user_id)
                alertas.append({"tipo": "intentos_fallidos", "tipo_texto": "Intentos fallidos", "nivel": "mal", "cuenta": u.nombre if u else "—", "user_id": x.user_id,
                                "detalle": f"5 intentos seguidos desde {x.ip or 'IP desconocida'}", "en": x.creado.isoformat() + "Z", "accion": "pausar"})
        else:
            seguidos[x.user_id] = 0
    # equipos nuevos y entradas fuera de horario
    vistos = {}
    for x in db.scalars(select(ActividadPanel).where(ActividadPanel.tipo == "ingreso", ActividadPanel.creado < desde)):
        vistos.setdefault(x.user_id, set()).add(x.dispositivo)
    for x in acts:
        if x.tipo != "ingreso":
            continue
        u = usuarios.get(x.user_id)
        conocidos = vistos.setdefault(x.user_id, set())
        if conocidos and x.dispositivo not in conocidos:
            alertas.append({"tipo": "equipo_nuevo", "tipo_texto": "Equipo nuevo", "nivel": "pend", "cuenta": u.nombre if u else "—", "user_id": x.user_id,
                            "detalle": f"Primera entrada desde {x.dispositivo} · IP {x.ip}", "en": x.creado.isoformat() + "Z", "accion": "revisar"})
        conocidos.add(x.dispositivo)
        h = (x.creado + CARACAS).hour
        if h >= 22 or h < 6:
            alertas.append({"tipo": "fuera_horario", "tipo_texto": "Fuera de horario", "nivel": "pend", "cuenta": u.nombre if u else "—", "user_id": x.user_id,
                            "detalle": f"Entró a las {(x.creado + CARACAS).strftime('%I:%M %p')}", "en": x.creado.isoformat() + "Z", "accion": "revisar"})
    for u in usuarios.values():
        if not u.activo:
            continue
        if u.clave_temporal and u.creado and ahora() - u.creado > dt.timedelta(days=1):
            alertas.append({"tipo": "clave_temporal", "tipo_texto": "Clave temporal", "nivel": "info", "cuenta": u.nombre, "user_id": u.id,
                            "detalle": f"No ha cambiado su clave temporal ({(ahora() - u.creado).days} días)", "en": u.creado.isoformat() + "Z", "accion": "recordar"})
        ref = u.ultimo_acceso_en or u.creado
        if ref and ahora() - ref > dt.timedelta(days=30):
            alertas.append({"tipo": "inactiva", "tipo_texto": "Inactiva", "nivel": "neutro", "cuenta": u.nombre, "user_id": u.id,
                            "detalle": f"No entra hace {(ahora() - ref).days} días", "en": ref.isoformat() + "Z", "accion": "pausar"})
    alertas.sort(key=lambda x: x["en"], reverse=True)
    return alertas


def _avisos_de_acceso(db: Session, a: dict) -> None:
    """Avisa de las alertas de acceso nuevas desde la última revisión."""
    visto = _cfg(db, "accesos_visto")
    _guardar_cfg(db, "accesos_visto", ahora().isoformat())
    db.commit()
    if not visto:
        return
    for x in alertas_acceso(db, dias=1):
        if x["en"][:-1] > visto and x["tipo"] in ("intentos_fallidos", "equipo_nuevo", "fuera_horario"):
            avisar(db, f"{x['tipo_texto']}: {x['cuenta']}", x["detalle"], x["tipo"])


# ---------- Resumen diario y limpieza ----------
def resumen_diario(db: Session, forzar: bool = False) -> bool:
    a = ajustes(db)
    hoy = dia_caracas()
    if not forzar and (not a["canales"].get("resumen") or (ahora() + CARACAS).hour < int(a.get("hora_resumen", 7)) or _cfg(db, "resumen_enviado") == hoy):
        return False
    _guardar_cfg(db, "resumen_enviado", hoy)
    db.commit()
    malos = db.scalars(select(ChequeoSistema).where(ChequeoSistema.nivel != "ok")).all()
    errores = db.scalars(select(ErrorSistema).where(ErrorSistema.ultima >= ahora() - dt.timedelta(days=1))).all()
    alertas = alertas_acceso(db, dias=1)
    if not malos and not errores and not alertas:
        texto = "Ayer todo funcionó bien: sin piezas en rojo, sin errores y sin alertas de acceso."
    else:
        partes = [f"{c.nombre}: {c.valor}" for c in malos] + [f"Error ({e.veces} vez/veces): {e.mensaje[:80]}" for e in errores[:5]] + \
                 [f"{x['tipo_texto']}: {x['cuenta']}" for x in alertas[:5]]
        texto = "Para revisar: " + " · ".join(partes)
    avisar(db, f"Resumen del {hoy}", texto, "resumen", forzar=True)
    return True


def limpiar(db: Session) -> None:
    r = ajustes(db)["retencion"]
    db.query(ErrorSistema).filter(ErrorSistema.ultima < ahora() - dt.timedelta(days=int(r["errores"]))).delete()
    db.query(ActividadPanel).filter(ActividadPanel.creado < ahora() - dt.timedelta(days=int(r["actividad"]))).delete()
    db.query(SesionPanel).filter(SesionPanel.inicio < ahora() - dt.timedelta(days=int(r["accesos"]))).delete()
    db.commit()


def bucle() -> None:
    """Hilo del servidor: revisa cada 5 minutos, manda el resumen diario y limpia lo viejo una vez al día."""
    from .db import SessionLocal
    time.sleep(20)
    while True:
        try:
            with SessionLocal() as db:
                revisar(db)
                resumen_diario(db)
                if _cfg(db, "limpieza") != dia_caracas():
                    limpiar(db)
                    _guardar_cfg(db, "limpieza", dia_caracas())
                    db.commit()
        except Exception:  # noqa: BLE001
            log.exception("la revisión de sistemas falló")
        time.sleep(300)


def arrancar() -> None:
    procesos.ultimo_arranque = {"ms": int((ahora() - INICIO_PROCESO).total_seconds() * 1000)}
    if os.environ.get("AHAHOME_MONITOR", "1") == "1":
        threading.Thread(target=bucle, daemon=True, name="sistemas").start()


def ordenes_hoy(db: Session) -> int:
    d0 = dt.datetime.combine(dt.date.fromisoformat(dia_caracas()), dt.time()) - CARACAS
    return db.scalar(select(func.count()).select_from(Orden).where(Orden.creado >= d0)) or 0
