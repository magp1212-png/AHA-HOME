"""Flujo completo de la spec: caja Damasco → asignación → retiro con QR → instalación → cierre → calificación."""
import datetime as dt

from sqlalchemy import select

from app.asignacion import grupo_de_guardia
from app.db import SessionLocal
from app.models import Tecnico, User
from conftest import login, login_pin

LUNES = "2026-11-23"  # guardia del Grupo A

ORDEN = {
    "cliente_nombre": "María González", "cliente_telefono": "0414-123-4567",
    "direccion": "Av. Sucre, Res. Los Andes, piso 4, Catia", "lat": 10.515, "lng": -66.940, "zona": "Oeste",
    "tipo_equipo": "nevera", "marca": "Samsung", "modelo": "RT38K5932SL", "serial": "",
    "fecha": LUNES, "franja": "10:00 - 12:00", "acepta_terminos": True,
}
CHECK = {k: True for k in ("conexion_electrica", "conexion_hidraulica", "nivelacion", "prueba_encendido",
                           "cajas", "anime", "plasticos", "flejes", "precintos")}


def test_rotacion_de_guardia():
    assert grupo_de_guardia(dt.date(2026, 11, 23)) == "A"  # lunes
    assert grupo_de_guardia(dt.date(2026, 11, 24)) == "B"  # martes
    assert grupo_de_guardia(dt.date(2026, 11, 25)) == "C"  # miércoles
    assert grupo_de_guardia(dt.date(2026, 11, 26)) == "A"  # jueves


def test_flujo_completo(client):
    agente = login(client, "04141000001")  # Damasco Oeste
    r = client.post("/ordenes", json=ORDEN, headers=agente)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["codigo"].startswith("WO-")
    assert o["estado"] == "tecnico_asignado"
    assert o["tecnico"]["grupo"] == "A" and o["tecnico"]["tienda"] == "Damasco Oeste"
    assert o["qr"].startswith("AHAHOME:")
    assert client.get(f"/ordenes/{o['id']}/qr.png", headers=agente).headers["content-type"] == "image/png"

    # La clienta ya registrada ve su orden, pero aún no la ficha del técnico
    cliente = login(client, "maria@ahahome.test")
    mias = client.get("/ordenes", headers=cliente).json()
    assert [x["id"] for x in mias] == [o["id"]]
    assert mias[0]["tecnico"] is None and mias[0]["tecnico_asignado"] is True
    assert "qr" not in mias[0]

    with SessionLocal() as db:
        tec = db.get(Tecnico, o["tecnico"]["id"])
        tel_ok = tec.user.telefono
        otro = db.scalar(select(Tecnico).where(Tecnico.id != tec.id, Tecnico.grupo == "A")).user.telefono
    tecnico = login_pin(client, tel_ok)

    hoy = client.get("/tecnico/hoy", headers=tecnico).json()
    assert hoy["verificado"] is True and hoy["supervisor"]["nombre"]

    assert client.post(f"/tecnico/ordenes/{o['id']}/confirmar", headers=tecnico).json()["estado"] == "cita_confirmada"

    # Otro técnico no puede retirar este equipo
    r = client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=login_pin(client, otro))
    assert r.status_code == 403
    r = client.post("/tecnico/retiro", json={"qr": o["qr"], "serial": "0B5R4AAN300125"}, headers=tecnico)
    assert r.status_code == 200 and r.json()["estado"] == "en_ruta"

    # Ahora la clienta recibe la ficha de seguridad
    vista = client.get(f"/ordenes/{o['id']}", headers=cliente).json()
    assert vista["tecnico"]["cedula"].startswith("V-") and vista["equipo"]["serial"] == "0B5R4AAN300125"
    assert any("Tu equipo va en camino" == n["titulo"] for n in client.get("/notificaciones", headers=cliente).json())

    assert client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico).json()["estado"] == "en_progreso"

    # No se puede cerrar sin retirar residuos ni fotos
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico)
    assert r.status_code == 422 and "anime" in r.json()["detail"]["faltan"]
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": CHECK}, headers=tecnico)
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico)
    assert r.json()["detail"]["faltan"] == ["foto_instalacion", "foto_espacio_limpio"]
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"instalacion": "/archivos/a.jpg", "espacio_limpio": "/archivos/b.jpg"}}, headers=tecnico)
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico)
    assert r.status_code == 200 and r.json()["estado"] == "completado"

    r = client.post(f"/ordenes/{o['id']}/calificar", json={"estrellas": 5, "comentario": "Excelente"}, headers=cliente)
    assert r.json()["calificacion"] == 5
    linea = r.json()["linea_de_tiempo"]
    assert all(p["hecho"] for p in linea) and linea[-1]["actual"]


def _desactivar(grupo, zona=None):
    with SessionLocal() as db:
        for t in db.scalars(select(Tecnico).where(Tecnico.grupo == grupo)):
            if zona is None or t.tienda.zona == zona:
                t.disponible = False
        db.commit()


def test_asignacion_inter_zonal_y_reten(client):
    agente = login(client, "04141000001")
    _desactivar("A", "Oeste")
    o = client.post("/ordenes", json=ORDEN, headers=agente).json()
    assert o["tecnico"]["tienda"] == "Damasco Central"  # zona vecina, técnico sin órdenes

    _desactivar("A")
    o2 = client.post("/ordenes", json=ORDEN, headers=agente).json()
    assert o2["estado"] == "solicitud_enviada" and o2["tecnico"] is None

    sup = login(client, "supervisor@ahahome.test")
    res = client.get("/supervisor/resumen", params={"fecha": LUNES}, headers=sup).json()
    assert res["indicadores"]["sin_tecnico"] == 1 and res["grupo_de_guardia"] == "A"
    reten_oeste = next(t for t in res["reten"] if t["zona"] == "Oeste")
    client.post(f"/supervisor/tecnicos/{reten_oeste['id']}/reten", json={"activo": True}, headers=sup)
    o2 = client.get(f"/ordenes/{o2['id']}", headers=agente).json()
    assert o2["tecnico"]["grupo"] == "RETEN" and o2["estado"] == "tecnico_asignado"


def test_permisos_y_verificacion(client):
    agente = login(client, "04141000001")
    o = client.post("/ordenes", json=ORDEN, headers=agente).json()

    # Otra tienda y otro cliente no ven la orden
    assert client.get(f"/ordenes/{o['id']}", headers=login(client, "04141000002")).status_code == 404
    otro = client.post("/auth/registro", json={"nombre": "Pedro", "telefono": "04165550000", "password": "secreta1"}).json()
    assert client.get(f"/ordenes/{o['id']}", headers={"Authorization": "Bearer " + otro["token"]}).status_code == 404
    # El cliente no puede usar el panel del supervisor
    assert client.get("/supervisor/resumen", headers=login(client, "maria@ahahome.test")).status_code == 403

    # Un técnico nuevo sin verificar no recibe órdenes ni puede retirar
    sup = login(client, "supervisor@ahahome.test")
    with SessionLocal() as db:
        tienda_id = db.scalar(select(User).where(User.telefono == "04141000001")).tienda_id
    nuevo = client.post("/supervisor/usuarios", json={"nombre": "Nuevo Técnico", "telefono": "04129990000", "cedula": "V-20000000",
                                                       "password": "clave123", "rol": "tecnico", "tienda_id": tienda_id, "grupo": "A"},
                        headers=sup).json()
    h = login(client, "04129990000", "clave123")
    assert client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=h).status_code == 403
    assert client.post(f"/supervisor/tecnicos/{nuevo['tecnico']['id']}/verificar", json={"activo": True}, headers=sup).status_code == 422
    r = client.post("/tecnico/onboarding", json={"foto_rostro": "/archivos/r.jpg", "selfie_cedula": "/archivos/c.jpg", "pin": "4321"}, headers=h)
    assert r.json() == {"ok": True, "verificado": False}
    assert client.post(f"/supervisor/tecnicos/{nuevo['tecnico']['id']}/verificar", json={"activo": True}, headers=sup).json()["verificado"]
    assert client.post("/auth/login-pin", json={"telefono": "04129990000", "pin": "4321"}).status_code == 200


def test_cancelar_y_reprogramar(client):
    agente = login(client, "04141000001")
    o = client.post("/ordenes", json=ORDEN, headers=agente).json()
    cliente = login(client, "maria@ahahome.test")
    r = client.post(f"/ordenes/{o['id']}/reprogramar", json={"fecha": "2026-11-24", "franja": "13:00-15:00"}, headers=cliente)
    assert r.status_code == 200
    assert r.json()["fecha"] == "2026-11-24" and r.json()["estado"] == "tecnico_asignado"
    r = client.post(f"/ordenes/{o['id']}/cancelar", json={"motivo": "Me mudé"}, headers=cliente)
    assert r.json()["estado"] == "cancelado"
    assert client.post(f"/ordenes/{o['id']}/cancelar", json={}, headers=cliente).status_code == 409


def test_subir_foto(client):
    h = login(client, "maria@ahahome.test")
    r = client.post("/archivos", files={"archivo": ("f.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")}, headers=h)
    assert r.status_code == 200
    assert client.get(r.json()["url"]).status_code == 200
    assert client.post("/archivos", files={"archivo": ("x.txt", b"hola", "text/plain")}, headers=h).status_code == 415
    assert client.get("/salud").json()["ok"] is True
