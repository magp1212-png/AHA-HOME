"""Piloto Damasco Santa Mónica: caja → asignación de cuadrilla → avisos de seguimiento → retiro o salida →
servicio según tipo (traslado, instalación, traslado e instalación) → cierre → calificación → bitácora del superadmin."""
import datetime as dt

from sqlalchemy import select

from app.asignacion import grupo_de_guardia
from app.db import SessionLocal
from app.models import Tecnico
from conftest import login, login_pin

LUNES = "2026-11-23"  # guardia del Grupo A

ORDEN = {
    "cliente_nombre": "María González", "cliente_telefono": "0414-123-4567",
    "direccion": "Calle Santa Mónica, Res. Los Pinos, piso 4", "lat": 10.481, "lng": -66.885, "zona": "Central",
    "tipo_servicio": "traslado_instalacion", "tipo_equipo": "nevera", "marca": "Samsung", "modelo": "RT38K5932SL",
    "fecha": LUNES, "franja": "10:00 - 12:00", "acepta_terminos": True,
}
INSTALACION = {k: True for k in ("conexion_electrica", "conexion_hidraulica", "nivelacion", "prueba_encendido",
                                 "cajas", "anime", "plasticos", "flejes", "precintos")}


def nueva(client, h, **cambios):
    r = client.post("/ordenes", json=ORDEN | cambios, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def tel_de(tecnico_id):
    with SessionLocal() as db:
        return db.get(Tecnico, tecnico_id).user.telefono


def titulos(client, h):
    return [n["titulo"] for n in client.get("/notificaciones", headers=h).json()]


def test_rotacion_de_guardia():
    assert [grupo_de_guardia(dt.date(2026, 11, d)) for d in (23, 24, 25, 26)] == ["A", "B", "C", "A"]


def test_traslado_e_instalacion_completo(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente)
    assert o["estado"] == "tecnico_asignado" and o["tipo_servicio_texto"] == "Traslado e instalación"
    assert o["tecnico"]["grupo"] == "A" and o["tecnico"]["tienda"] == "Damasco Santa Mónica"
    assert len(o["ayudantes"]) == 1 and o["ayudantes"][0]["rol"] == "ayudante"

    # Cada orden nueva llega al técnico supervisor, al equipo supervisor y al superadmin con la cuadrilla
    for quien in ("tecsup@ahahome.test", "supervisor@ahahome.test", "superadmin@ahahome.test"):
        n = client.get("/notificaciones", headers=login(client, quien)).json()[0]
        assert n["titulo"].startswith(f"Nueva orden {o['codigo']}")
        assert o["tecnico"]["nombre"] in n["texto"] and o["ayudantes"][0]["nombre"] in n["texto"]
    # El técnico y su ayudante también reciben el aviso
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    ayudante = login_pin(client, tel_de(o["ayudantes"][0]["id"]))
    assert f"Nueva orden {o['codigo']}" in titulos(client, tecnico)
    assert f"Nueva orden {o['codigo']}" in titulos(client, ayudante)
    assert [x["id"] for x in client.get("/ordenes", headers=ayudante).json()] == [o["id"]]

    # La clienta no ve la cuadrilla hasta que sale en ruta
    cliente = login(client, "maria@ahahome.test")
    v = client.get(f"/ordenes/{o['id']}", headers=cliente).json()
    assert v["tecnico"] is None and v["ayudantes"] == [] and "qr" not in v

    client.post(f"/tecnico/ordenes/{o['id']}/confirmar", headers=tecnico)
    # el ayudante no puede retirar ni cerrar
    assert client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=ayudante).status_code == 403
    r = client.post("/tecnico/retiro", json={"qr": o["qr"], "serial": "0B5R4AAN300125"}, headers=tecnico)
    assert r.json()["estado"] == "en_ruta"
    v = client.get(f"/ordenes/{o['id']}", headers=cliente).json()
    assert v["tecnico"]["cedula"].startswith("V-") and v["ayudantes"][0]["cedula"].startswith("V-")

    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico)
    assert r.status_code == 422 and "anime" in r.json()["detail"]["faltan"]
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": INSTALACION}, headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"instalacion": "/archivos/a.jpg", "espacio_limpio": "/archivos/b.jpg"}},
               headers=tecnico)
    assert client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico).json()["estado"] == "completado"
    client.post(f"/ordenes/{o['id']}/calificar", json={"estrellas": 5}, headers=cliente)

    # Seguimiento completo del superadmin: bitácora con quién y cuándo, y tiempos por fase
    seg = client.get("/admin/seguimiento", headers=login(client, "superadmin@ahahome.test")).json()
    fila = seg["ordenes"][0]
    estados = [e["estado"] for e in fila["eventos"]]
    assert estados == ["solicitud_enviada", "tecnico_asignado", "cita_confirmada", "en_ruta", "en_progreso", "completado"]
    assert "Retiro en almacén" in fila["eventos"][3]["nota"]
    assert fila["tiempos_min"]["total"] is not None and seg["calificacion_promedio"] == 5


def test_solo_traslado(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente, tipo_servicio="traslado")
    assert o["checklist_requerido"] == ["entrega_sin_danos", "ubicado_en_sitio"] and o["fotos_requeridas"] == ["entrega"]
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico)
    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    assert client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {"anime": True}}, headers=tecnico).status_code == 422
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {"entrega_sin_danos": True, "ubicado_en_sitio": True}}, headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"entrega": "/archivos/e.jpg"}}, headers=tecnico)
    assert client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico).json()["estado"] == "completado"


def test_solo_instalacion_sin_almacen(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente, tipo_servicio="instalacion")
    assert "qr" not in o and o["con_retiro_en_tienda"] is False
    assert client.get(f"/ordenes/{o['id']}/qr.png", headers=agente).status_code == 404
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    r = client.post(f"/tecnico/ordenes/{o['id']}/salir", headers=tecnico)
    assert r.json()["estado"] == "en_ruta" and r.json()["retirado_en"] is None
    # y una orden con traslado no puede saltarse el almacén
    o2 = nueva(client, agente)
    t2 = login_pin(client, tel_de(o2["tecnico"]["id"]))
    assert client.post(f"/tecnico/ordenes/{o2['id']}/salir", headers=t2).status_code == 409


def test_sin_guardia_disponible_activa_reten(client):
    with SessionLocal() as db:
        for t in db.scalars(select(Tecnico).where(Tecnico.grupo == "A", Tecnico.es_ayudante.is_(False))):
            t.disponible = False
        db.commit()
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente)
    assert o["tecnico"] is None
    tecsup = login(client, "tecsup@ahahome.test")
    n = client.get("/notificaciones", headers=tecsup).json()[0]
    assert "SIN TÉCNICO" in n["texto"]
    res = client.get("/supervisor/resumen", params={"fecha": LUNES}, headers=tecsup).json()
    assert res["indicadores"]["sin_tecnico"] == 1
    client.post(f"/supervisor/tecnicos/{res['reten'][0]['id']}/reten", json={"activo": True}, headers=tecsup)
    o = client.get(f"/ordenes/{o['id']}", headers=agente).json()
    assert o["tecnico"]["grupo"] == "RETEN" and len(o["ayudantes"]) == 1


def test_registro_en_app_y_alta_en_oficina(client):
    tienda_id = client.get("/tiendas").json()[0]["id"]
    datos = {"nombre": "Kevin Suárez", "cedula": "v 25.123.456", "telefono": "0412-999-0000", "email": "kevin@correo.com",
             "password": "clave123", "pin": "4321", "tienda_id": tienda_id}
    r = client.post("/tecnico/registro", json=datos)
    assert r.status_code == 200 and r.json()["usuario"]["cedula"] == "V-25.123.456"
    h = {"Authorization": "Bearer " + r.json()["token"]}
    assert client.post("/tecnico/registro", json=datos).status_code == 409
    tec_id = r.json()["usuario"]["tecnico"]["id"]

    fotos = {"foto_rostro": "/archivos/r.jpg", "selfie_cedula": "/archivos/c.jpg"}
    assert client.post("/tecnico/onboarding", json=fotos | {"huella_registrada": False}, headers=h).status_code == 422
    assert client.post("/tecnico/onboarding", json=fotos | {"huella_registrada": True}, headers=h).json()["ok"]

    oficina = login(client, "tecsup@ahahome.test")
    assert "Técnico por dar de alta" in titulos(client, oficina)
    r = client.post(f"/supervisor/tecnicos/{tec_id}/alta", json={"grupo": "B"}, headers=oficina)
    assert r.status_code == 422 and "Foto de perfil" in r.json()["detail"]["faltan"]
    for tipo in ("foto_perfil", "cedula", "licencia", "vehiculo_titulo", "vehiculo_seguro"):
        client.post(f"/supervisor/tecnicos/{tec_id}/documentos", json={"tipo": tipo, "url": f"/archivos/{tipo}.jpg"}, headers=oficina)
    exp = client.get(f"/supervisor/tecnicos/{tec_id}/expediente", headers=oficina).json()
    assert len(exp["documentos"]) == 5 and exp["documentos_faltantes"] == []
    assert client.post(f"/supervisor/tecnicos/{tec_id}/alta", json={"grupo": "X"}, headers=oficina).status_code == 422
    r = client.post(f"/supervisor/tecnicos/{tec_id}/alta", json={"grupo": "B"}, headers=oficina).json()
    assert r["verificado"] and r["grupo"] == "B" and r["foto_perfil"] == "/archivos/foto_perfil.jpg"
    assert "¡Bienvenido a AHA HOME!" in titulos(client, h)
    assert client.post("/auth/login-pin", json={"telefono": "04129990000", "pin": "4321"}).status_code == 200

    # Ayudante: mismo registro, y en la oficina se le asigna el técnico con el que sale
    r = client.post("/tecnico/registro", json=datos | {"nombre": "Luis Ayudante", "cedula": "V-26000000", "telefono": "04129990001",
                                                        "email": "luis@correo.com", "rol": "ayudante"})
    ha = {"Authorization": "Bearer " + r.json()["token"]}
    ay_id = r.json()["usuario"]["tecnico"]["id"]
    client.post("/tecnico/onboarding", json=fotos | {"huella_registrada": True}, headers=ha)
    for tipo in ("foto_perfil", "cedula"):
        client.post(f"/supervisor/tecnicos/{ay_id}/documentos", json={"tipo": tipo, "url": "/archivos/x.jpg"}, headers=oficina)
    r = client.post(f"/supervisor/tecnicos/{ay_id}/alta", json={"jefe_id": tec_id}, headers=oficina).json()
    assert r["grupo"] == "B" and r["jefe"] == "Kevin Suárez"


def test_permisos(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente)
    superadmin = login(client, "superadmin@ahahome.test")
    supervisor = login(client, "supervisor@ahahome.test")

    # Replicar en otra tienda: solo el superadmin crea tiendas
    t2 = {"nombre": "Damasco Catia", "zona": "Oeste", "direccion": "Catia", "lat": 10.51, "lng": -66.94}
    assert client.post("/admin/tiendas", json=t2, headers=supervisor).status_code == 403
    t2 = client.post("/admin/tiendas", json=t2, headers=superadmin).json()
    client.post("/supervisor/usuarios", json={"nombre": "Agente Catia", "telefono": "04145550000", "password": "clave123",
                                              "rol": "agente", "tienda_id": t2["id"]}, headers=supervisor)
    agente2 = login(client, "04145550000", "clave123")
    # Cada tienda ve solo lo suyo; el técnico supervisor de Santa Mónica no ve otras tiendas
    assert client.get(f"/ordenes/{o['id']}", headers=agente2).status_code == 404
    tecsup = login(client, "tecsup@ahahome.test")
    assert client.get("/supervisor/resumen", params={"tienda_id": t2["id"]}, headers=tecsup).status_code == 403
    # El técnico supervisor no puede crear agentes; el supervisor no puede crear superadmins
    assert client.post("/supervisor/usuarios", json={"nombre": "X Y", "telefono": "04145550001", "password": "clave123",
                                                     "rol": "agente"}, headers=tecsup).status_code == 403
    assert client.post("/supervisor/usuarios", json={"nombre": "X Y", "telefono": "04145550001", "password": "clave123",
                                                     "rol": "superadmin"}, headers=supervisor).status_code == 403
    # El cliente no entra a los paneles
    cliente = login(client, "maria@ahahome.test")
    assert client.get("/supervisor/resumen", headers=cliente).status_code == 403
    assert client.get("/admin/seguimiento", headers=cliente).status_code == 403


def test_cancelar_y_reprogramar(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente)
    cliente = login(client, "maria@ahahome.test")
    r = client.post(f"/ordenes/{o['id']}/reprogramar", json={"fecha": "2026-11-24", "franja": "13:00-15:00"}, headers=cliente).json()
    assert r["fecha"] == "2026-11-24" and r["estado"] == "tecnico_asignado"
    assert client.get(f"/ordenes/{o['id']}", headers=agente).json()["tecnico"]["grupo"] == "B"
    assert client.post(f"/ordenes/{o['id']}/cancelar", json={"motivo": "Me mudé"}, headers=cliente).json()["estado"] == "cancelado"
    assert client.post(f"/ordenes/{o['id']}/cancelar", json={}, headers=cliente).status_code == 409


def test_subir_foto_y_salud(client):
    h = login(client, "maria@ahahome.test")
    r = client.post("/archivos", files={"archivo": ("f.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")}, headers=h)
    assert client.get(r.json()["url"]).status_code == 200
    assert client.post("/archivos", files={"archivo": ("x.txt", b"hola", "text/plain")}, headers=h).status_code == 415
    assert client.get("/salud").json()["ok"] is True
