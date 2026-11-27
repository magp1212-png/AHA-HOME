"""Perfil completo de cada profesional (conduce, instala o ambas) y de cada ayudante, editable desde el panel.

Lo ven quienes tienen «Técnicos y verificaciones»; lo editan quienes tienen «Editar perfiles de técnicos, transportistas y
ayudantes» (CEO, superadministradores, centro de control/soporte y a quien el CEO se lo habilite). Cada cambio queda en el historial.
"""
import datetime as dt
import secrets
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import codigos, formacion
from ..db import get_db
from ..deps import exigir_permiso, permisos_de, require
from ..models import (OBLIGATORIOS_CONDUCTOR, documentos_pendientes, obligatorios_de, DOCS_CONDUCIR, ESPECIALIDADES, GRUPOS, TIPOS_DOCUMENTO, TIPOS_VEHICULO, Orden, PerfilCambio, Tecnico, Tienda, User, ahora,
                      dia_caracas)
from ..notificar import notificar
from ..security import hash_password
from .presupuestos import cuenta_tecnico

router = APIRouter(prefix="/profesionales", tags=["profesionales"])
_EQUIPO = require("tecnico_supervisor", "supervisor", "sistemas")  # además, cada acción pide su permiso


def _ver(user: User = Depends(_EQUIPO)) -> User:
    exigir_permiso(user, "ver_tecnicos")
    return user


def _iso(x):
    return x.isoformat() + "Z" if x else None


def _tec(db: Session, user: User, tid: int) -> Tecnico:
    t = db.get(Tecnico, tid)
    if not t or (user.rol == "tecnico_supervisor" and t.tienda_id != user.tienda_id):
        raise HTTPException(404, "Profesional no encontrado")
    return t


def estado_documento(vence: str) -> tuple[str, str]:
    """(nivel, texto) según la fecha de vencimiento."""
    if not vence:
        return "ok", "Vigente"
    try:
        d = (dt.date.fromisoformat(vence) - dt.date.fromisoformat(dia_caracas())).days
    except ValueError:
        return "ok", "Vigente"
    if d < 0:
        return "mal", "Vencido"
    if d <= 30:
        return "pend", f"Vence en {d} día(s)"
    return "ok", "Vigente"


def estado_licencia(t: Tecnico) -> dict:
    lic = [d for d in t.documentos if d.tipo == "licencia"]
    if not t.conduce or t.es_ayudante:
        return {"nivel": "neutro", "texto": "—"}
    if not lic:
        return {"nivel": "mal", "texto": "Falta"}
    n, tx = estado_documento(sorted(lic, key=lambda d: d.id)[-1].vence)
    return {"nivel": n, "texto": tx}


def _doc(d) -> dict:
    n, tx = estado_documento(d.vence)
    return {"id": d.id, "codigo": codigos.documento(d), "tipo": d.tipo, "tipo_texto": TIPOS_DOCUMENTO.get(d.tipo, d.tipo), "url": d.url, "descripcion": d.descripcion,
            "vence": d.vence, "subido": _iso(d.creado), "nivel": n, "estado": tx, "para": "conducir" if d.tipo in DOCS_CONDUCIR else "comun"}


def _obligatorios(t: Tecnico) -> list[dict]:
    pend = dict(documentos_pendientes(t))
    out = [{"tipo": k, "texto": TIPOS_DOCUMENTO[k], "para": "conducir" if k in OBLIGATORIOS_CONDUCTOR else "comun",
            "estado": pend.get(k, "ok")} for k in obligatorios_de(t)]
    if not t.es_ayudante:  # todo profesional: foto con la cédula y verificación facial (biometría) desde la app
        out[2:2] = [{"tipo": "selfie_cedula", "texto": "Foto con la cédula", "para": "comun", "estado": "ok" if t.selfie_cedula else "falta"},
                    {"tipo": "verificacion_facial", "texto": "Verificación facial", "para": "comun",
                     "estado": "ok" if t.foto_rostro and t.rostro_resultado in ("coincide", "revision_manual") else "vencido" if t.rostro_resultado == "no_coincide" else "falta"}]
    return out


def vista(db: Session, t: Tecnico, user: User) -> dict:
    u = t.user
    ords = db.scalars(select(Orden).where(or_(Orden.tecnico_id == t.id, Orden.ayudantes.any(Tecnico.id == t.id)))).all()
    califs = [o.calificacion for o in ords if o.calificacion and o.tecnico_id == t.id]
    servicios = Counter(o.tipo_servicio for o in ords if o.estado == "completado")
    alta_por = db.get(User, t.alta_por) if t.alta_por else None
    jefe = t.jefe if t.es_ayudante else None
    cambios = db.scalars(select(PerfilCambio).where(PerfilCambio.tecnico_id == t.id).order_by(PerfilCambio.id.desc()).limit(40)).all()
    quien = {x.id: x.nombre for x in db.scalars(select(User).where(User.id.in_({c.user_id for c in cambios if c.user_id})))} if cambios else {}
    return {
        "id": t.id, "user_id": u.id, "codigo": codigos.profesional(t), "verificacion_codigo": codigos.verificacion(t), "es_ayudante": t.es_ayudante,
        "actividad": codigos.actividad_texto(t), "conduce": t.conduce, "instala": t.instala,
        "nombre": u.nombre, "cedula": u.cedula or "", "telefono": (t.contacto_telefono or u.telefono or "") if t.es_ayudante else u.telefono or "",
        "email": (t.contacto_email or u.email or "") if t.es_ayudante else u.email or "", "retirado_en": _iso(t.retirado_en), "fecha_nacimiento": t.fecha_nacimiento,
        "direccion": t.direccion, "lat": t.lat, "lng": t.lng, "registrado": _iso(u.creado), "activo": u.activo, "verificado": t.verificado,
        "estado": "Validado" if t.verificado else ("Suspendido" if t.alta_en else "Pendiente") if u.activo else "Inactivo",
        "tienda_id": t.tienda_id, "tienda": t.tienda.nombre if t.tienda else "", "grupo": t.grupo or "", "disponible": t.disponible,
        "foto_perfil": t.foto_perfil, "vehiculo": {"tipo": t.vehiculo_tipo, "placa": t.vehiculo_placa, "marca": t.vehiculo_marca, "modelo": t.vehiculo_modelo,
                                                   "anio": t.vehiculo_anio, "color": t.vehiculo_color, "capacidad": t.vehiculo_capacidad, "licencia_grado": t.licencia_grado},
        "especialidades": t.especialidades or [], "herramientas": t.herramientas, "certificaciones": t.certificaciones,
        "cuenta": cuenta_tecnico(t),
        "identidad": {"foto_rostro": t.foto_rostro, "selfie_cedula": t.selfie_cedula, "resultado": t.rostro_resultado or "", "similitud": round((t.rostro_similitud_cedula or t.rostro_similitud or 0) * 100),
                      "intentos": t.rostro_intentos, "huella": t.huella_registrada, "alta_en": _iso(t.alta_en), "alta_por": alta_por.nombre if alta_por else None},
        "documentos": [_doc(d) for d in sorted(t.documentos, key=lambda d: d.id)], "licencia": estado_licencia(t),
        "obligatorios": _obligatorios(t),
        "jefe": {"id": jefe.id, "nombre": jefe.user.nombre, "codigo": codigos.profesional(jefe)} if jefe else None,
        "clausula_aceptada_en": _iso(t.clausula_aceptada_en),
        "ayudantes": [{"id": a.id, "nombre": a.user.nombre, "codigo": codigos.profesional(a), "cedula": a.user.cedula or "", "verificado": a.verificado}
                      for a in (t.ayudantes if not t.es_ayudante else []) if not a.retirado_en],
        "servicios": {"traslados": servicios.get("traslado", 0) + servicios.get("traslado_instalacion", 0),
                      "instalaciones": servicios.get("instalacion", 0) + servicios.get("traslado_instalacion", 0),
                      "calificacion": round(sum(califs) / len(califs), 2) if califs else None, "resenas": len(califs),
                      "fallidas": sum(1 for o in ords if o.estado == "entrega_fallida"),
                      "ultimos": [{"codigo": o.codigo, "fecha": o.fecha, "cliente": o.cliente_nombre, "servicio": o.tipo_servicio, "estrellas": o.calificacion}
                                  for o in sorted(ords, key=lambda o: o.id, reverse=True)[:6]]},
        "formacion": formacion.lista(db, t),
        "cambios": [{"en": _iso(c.creado), "quien": quien.get(c.user_id, "La app"), "texto": c.texto, "antes": c.antes, "despues": c.despues} for c in cambios],
        "catalogo": {"especialidades": list(ESPECIALIDADES), "vehiculos": list(TIPOS_VEHICULO), "grupos": list(GRUPOS),
                     "tiendas": [{"id": x.id, "nombre": x.nombre} for x in db.scalars(select(Tienda).order_by(Tienda.id))],
                     "tipos_documento": TIPOS_DOCUMENTO, "formacion_tipos": formacion.TIPOS, "formacion_areas": formacion.AREAS,
                     "jefes": [{"id": x.id, "nombre": x.user.nombre, "codigo": codigos.profesional(x)} for x in db.scalars(select(Tecnico).where(Tecnico.es_ayudante.is_(False), Tecnico.tienda_id == t.tienda_id))]},
        "puede_editar": "editar_profesionales" in permisos_de(user),
    }


@router.get("/{tid}")
def ver(tid: int, user: User = Depends(_ver), db: Session = Depends(get_db)):
    return vista(db, _tec(db, user, tid), user)


class Edicion(BaseModel):
    nombre: str | None = Field(default=None, max_length=120)
    cedula: str | None = Field(default=None, max_length=20)
    telefono: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=160)
    fecha_nacimiento: str | None = Field(default=None, max_length=10)
    direccion: str | None = Field(default=None, max_length=250)
    conduce: bool | None = None
    instala: bool | None = None
    tienda_id: int | None = None
    grupo: str | None = None
    disponible: bool | None = None
    jefe_id: int | None = None
    vehiculo: dict[str, str] | None = None
    especialidades: list[str] | None = None
    herramientas: str | None = Field(default=None, max_length=250)
    certificaciones: str | None = Field(default=None, max_length=250)
    cuenta: dict[str, str] | None = None


ETIQUETAS = {"nombre": "el nombre", "cedula": "la cédula", "telefono": "el teléfono", "email": "el correo", "fecha_nacimiento": "la fecha de nacimiento",
             "direccion": "la dirección", "tienda_id": "la tienda", "grupo": "el grupo", "disponible": "la disponibilidad", "jefe_id": "el profesional al que acompaña",
             "herramientas": "las herramientas", "certificaciones": "las certificaciones", "especialidades": "las especialidades",
             "tipo": "el tipo de vehículo", "placa": "la placa", "marca": "la marca del vehículo", "modelo": "el modelo del vehículo", "anio": "el año del vehículo",
             "color": "el color del vehículo", "capacidad": "la capacidad de carga", "licencia_grado": "el grado de licencia",
             "banco": "el banco", "numero": "el número de cuenta", "titular": "el titular de la cuenta", "pago_movil_telefono": "el pago móvil",
             "pago_movil_banco": "el banco del pago móvil"}


@router.put("/{tid}")
def editar(tid: int, body: Edicion, user: User = Depends(_EQUIPO), db: Session = Depends(get_db)):
    exigir_permiso(user, "editar_profesionales")
    t = _tec(db, user, tid)
    u = t.user
    cambios: list[tuple[str, str, str]] = []

    def anota(clave, antes, despues, ocultar=False):
        if str(antes or "") != str(despues or ""):
            cambios.append((f"cambió {ETIQUETAS.get(clave, clave)}", "" if ocultar else str(antes or "—")[:160], "" if ocultar else str(despues or "—")[:160]))

    from .auth import limpiar_tel
    from .tecnico import normalizar_cedula
    if body.nombre is not None:
        if len(body.nombre.strip()) < 3:
            raise HTTPException(422, "Escribe el nombre completo")
        anota("nombre", u.nombre, body.nombre.strip())
        u.nombre = body.nombre.strip()
    if body.cedula is not None and body.cedula.strip():
        c = normalizar_cedula(body.cedula)
        if c != u.cedula and db.scalar(select(User).where(User.cedula == c, User.id != u.id)):
            raise HTTPException(409, "Esa cédula ya está registrada")
        anota("cedula", u.cedula, c)
        u.cedula = c
    if t.es_ayudante and (body.telefono is not None or body.email is not None):  # ayudante: solo datos de contacto
        if body.telefono is not None:
            tel = limpiar_tel(body.telefono) if body.telefono.strip() else ""
            anota("telefono", t.contacto_telefono, tel)
            t.contacto_telefono = tel or ""
        if body.email is not None:
            anota("email", t.contacto_email, body.email.strip().lower())
            t.contacto_email = body.email.strip().lower()
        body.telefono = body.email = None
    if body.telefono is not None:
        tel = limpiar_tel(body.telefono) if body.telefono.strip() else None
        if tel and db.scalar(select(User).where(User.telefono == tel, User.id != u.id)):
            raise HTTPException(409, "Ese teléfono ya está registrado")
        anota("telefono", u.telefono, tel)
        u.telefono = tel
    if body.email is not None:
        e = body.email.strip().lower() or None
        if e and ("@" not in e or db.scalar(select(User).where(User.email == e, User.id != u.id))):
            raise HTTPException(409, "Ese correo ya está registrado o no es válido")
        anota("email", u.email, e)
        u.email = e
    for campo in ("fecha_nacimiento", "direccion", "herramientas", "certificaciones"):
        v = getattr(body, campo)
        if v is not None:
            anota(campo, getattr(t, campo), v.strip())
            setattr(t, campo, v.strip())
    if not t.es_ayudante and (body.conduce is not None or body.instala is not None):
        con = t.conduce if body.conduce is None else body.conduce
        ins = t.instala if body.instala is None else body.instala
        if not (con or ins):
            raise HTTPException(422, "Elige el tipo de perfil: conductor, técnico instalador o mixto")
        antes = codigos.actividad_texto(t)
        t.conduce, t.instala = con, ins
        if antes != codigos.actividad_texto(t):
            cambios.append(("cambió el tipo de perfil", antes, codigos.actividad_texto(t)))
    if body.tienda_id is not None and body.tienda_id != t.tienda_id:
        tienda = db.get(Tienda, body.tienda_id)
        if not tienda:
            raise HTTPException(422, "Tienda no válida")
        anota("tienda_id", t.tienda.nombre if t.tienda else "", tienda.nombre)
        t.tienda_id = u.tienda_id = tienda.id
    if body.grupo is not None and not t.es_ayudante and body.grupo != (t.grupo or ""):
        if body.grupo not in GRUPOS:
            raise HTTPException(422, "Grupo no válido")
        anota("grupo", t.grupo, body.grupo)
        t.grupo = body.grupo
        for a in t.ayudantes:
            a.grupo = body.grupo
    if body.disponible is not None and body.disponible != t.disponible:
        anota("disponible", "Sí" if t.disponible else "No", "Sí" if body.disponible else "No")
        t.disponible = body.disponible
    if body.jefe_id is not None and t.es_ayudante and body.jefe_id != t.jefe_id:
        jefe = db.get(Tecnico, body.jefe_id)
        if not jefe or jefe.es_ayudante:
            raise HTTPException(422, "Elige un profesional")
        anota("jefe_id", t.jefe.user.nombre if t.jefe else "", jefe.user.nombre)
        t.jefe_id, t.grupo = jefe.id, jefe.grupo
    if body.vehiculo is not None:
        mapa = {"tipo": "vehiculo_tipo", "placa": "vehiculo_placa", "marca": "vehiculo_marca", "modelo": "vehiculo_modelo", "anio": "vehiculo_anio",
                "color": "vehiculo_color", "capacidad": "vehiculo_capacidad", "licencia_grado": "licencia_grado"}
        for k, col in mapa.items():
            if k in body.vehiculo:
                v = str(body.vehiculo[k]).strip()[:40]
                if k == "placa":
                    v = v.upper().replace(" ", "").replace("-", "")
                anota(k, getattr(t, col), v)
                setattr(t, col, v)
    if body.especialidades is not None:
        esp = [e for e in body.especialidades if e in ESPECIALIDADES]
        anota("especialidades", ", ".join(t.especialidades or []), ", ".join(esp))
        t.especialidades = esp
    if body.cuenta is not None:
        from .presupuestos import Cuenta, guardar_cuenta_de
        antes = cuenta_tecnico(t)
        guardar_cuenta_de(t, Cuenta(**{k: body.cuenta.get(k, antes.get(k, "")) or "" for k in ("banco", "tipo", "numero", "titular", "cedula", "pago_movil_telefono", "pago_movil_banco")}))
        for k in ("banco", "numero", "titular", "pago_movil_telefono", "pago_movil_banco"):
            anota(k, antes.get(k), cuenta_tecnico(t).get(k), ocultar=k in ("numero",))
    for texto, antes, despues in cambios:
        db.add(PerfilCambio(tecnico_id=t.id, user_id=user.id, texto=texto, antes=antes, despues=despues))
    if cambios:
        notificar(db, u.id, "Tu perfil fue actualizado", f"La oficina {', '.join(x[0] for x in cambios[:3])}{'…' if len(cambios) > 3 else ''}.")
    db.commit()
    return vista(db, t, user)


@router.post("/{tid}/formacion")
def agregar_formacion(tid: int, body: formacion.NuevaFormacion, user: User = Depends(_EQUIPO), db: Session = Depends(get_db)):
    exigir_permiso(user, "editar_profesionales")
    t = _tec(db, user, tid)
    formacion.agregar(db, t, body, user)
    db.commit()
    return vista(db, t, user)


@router.delete("/{tid}/formacion/{fid}")
def quitar_formacion(tid: int, fid: int, user: User = Depends(_EQUIPO), db: Session = Depends(get_db)):
    exigir_permiso(user, "editar_profesionales")
    t = _tec(db, user, tid)
    formacion.quitar(db, t, fid, user)
    db.commit()
    return vista(db, t, user)


class AyudanteOficina(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    telefono: str = Field(min_length=7, max_length=30)
    email: str = Field(min_length=5, max_length=160)
    cedula: str | None = Field(default=None, max_length=20)
    foto: str | None = Field(default=None, max_length=200)


@router.post("/{tid}/ayudantes")
def agregar_ayudante(tid: int, body: AyudanteOficina, user: User = Depends(_EQUIPO), db: Session = Depends(get_db)):
    """Soporte, sistemas o quien tenga «Editar perfiles» agrega un ayudante al equipo del profesional."""
    from .tecnico import crear_ayudante
    exigir_permiso(user, "editar_profesionales")
    t = _tec(db, user, tid)
    crear_ayudante(db, t, body.nombre, body.telefono, body.email, body.foto, body.cedula, user, "")
    db.commit()
    return vista(db, t, user)


@router.delete("/{tid}/ayudantes/{aid}")
def quitar_ayudante(tid: int, aid: int, user: User = Depends(_EQUIPO), db: Session = Depends(get_db)):
    from .tecnico import retirar_ayudante
    exigir_permiso(user, "editar_profesionales")
    t = _tec(db, user, tid)
    retirar_ayudante(db, t, aid, user)
    db.commit()
    return vista(db, t, user)


@router.post("/{tid}/pin")
def nuevo_pin(tid: int, user: User = Depends(_EQUIPO), db: Session = Depends(get_db)):
    """Genera un PIN nuevo (se muestra una sola vez para entregárselo en persona)."""
    exigir_permiso(user, "editar_profesionales")
    t = _tec(db, user, tid)
    pin = f"{secrets.randbelow(10000):04d}"
    t.pin_hash = hash_password(pin)
    db.add(PerfilCambio(tecnico_id=t.id, user_id=user.id, texto="restableció el PIN"))
    notificar(db, t.user_id, "PIN restablecido", "La oficina te dio un PIN nuevo. Pídelo en persona.")
    db.commit()
    return {"pin": pin}


@router.post("/{tid}/reescaneo")
def pedir_reescaneo(tid: int, user: User = Depends(_EQUIPO), db: Session = Depends(get_db)):
    """Pide un nuevo escaneo facial y foto con la cédula desde la app."""
    exigir_permiso(user, "editar_profesionales")
    t = _tec(db, user, tid)
    t.rostro_resultado, t.rostro_intentos = "", 0
    db.add(PerfilCambio(tecnico_id=t.id, user_id=user.id, texto="pidió un nuevo escaneo facial"))
    notificar(db, t.user_id, "Repite tu verificación", "Abre la app y vuelve a hacer el escaneo facial y la foto con tu cédula.")
    db.commit()
    return vista(db, t, user)


# ---------- Avisos de documentos por vencer (al profesional y al soporte) ----------
def avisar_vencimientos(db: Session) -> int:
    from ..models import Documento
    enviados = 0
    soporte = [u for u in db.scalars(select(User).where(User.activo.is_(True), User.rol.in_(("supervisor", "superadmin")))) if "editar_profesionales" in permisos_de(u)]
    for d in db.scalars(select(Documento).where(Documento.vence != "")):
        nivel, texto = estado_documento(d.vence)
        marca = "vencido" if nivel == "mal" else "30d" if nivel == "pend" else ""
        if not marca or d.aviso_vence == marca or (marca == "30d" and d.aviso_vence == "vencido"):
            continue
        t = d.tecnico
        tipo = TIPOS_DOCUMENTO.get(d.tipo, d.tipo)
        titulo = f"{tipo}: {texto.lower()}"
        if t.es_ayudante:  # el ayudante no usa la app: el aviso le llega a su profesional
            if t.jefe and not t.retirado_en:
                notificar(db, t.jefe.user_id, f"Tu ayudante {t.user.nombre}: {titulo[0].lower()}{titulo[1:]}", f"Que lo renueve y lo entregue en la oficina ({codigos.documento(d)}). Vence el {d.vence}.")
        else:
            notificar(db, t.user_id, titulo, f"Renuévalo y entrégalo en la oficina ({codigos.documento(d)}). Vence el {d.vence}.")
        for s in soporte:
            notificar(db, s.id, f"Documento {'vencido' if marca == 'vencido' else 'por vencer'}", f"{t.user.nombre} ({codigos.profesional(t)}): {tipo} · {texto.lower()} ({d.vence}).")
        d.aviso_vence = marca
        enviados += 1
    db.commit()
    return enviados
