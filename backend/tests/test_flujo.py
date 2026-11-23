"""Piloto Damasco San Martín: caja → asignación de cuadrilla → avisos de seguimiento → retiro o salida →
servicio según tipo (traslado, instalación, traslado e instalación) → cierre → calificación → bitácora del superadmin."""
import datetime as dt

from sqlalchemy import select

from app.asignacion import grupo_de_guardia
from app.db import SessionLocal
from app.models import Orden, Tecnico
from conftest import login, login_pin

_hoy = dt.date.today()
LUNES = (_hoy + dt.timedelta(days=(7 - _hoy.weekday()) or 7)).isoformat()  # el próximo lunes: guardia del Grupo A
MARTES = (dt.date.fromisoformat(LUNES) + dt.timedelta(days=1)).isoformat()

ORDEN = {
    "cliente_nombre": "María González", "cliente_telefono": "0414-123-4567",
    "direccion": "Av. San Martín, Res. Los Pinos, piso 4", "lat": 10.497, "lng": -66.928, "zona": "Central",
    "articulos": [
        {"tipo": "nevera", "marca": "Samsung", "modelo": "RT38K5932SL", "instalar": True},
        {"tipo": "otro", "descripcion": "Juego de comedor 6 puestos", "marca": "Muebles Caracas"},
    ],
    "pago": {"metodo": "pago_movil", "referencia": "123456"},
    "fecha": LUNES, "franja": "10:00 - 12:00", "acepta_terminos": True,
}
INSTALACION = {k: True for k in ("conexion_electrica", "conexion_hidraulica", "nivelacion", "prueba_encendido",
                                 "cajas", "anime", "plasticos", "flejes", "precintos")}


SOLO_TRASLADO = {"articulos": [{"tipo": "nevera", "marca": "Samsung"}, {"tipo": "otro", "descripcion": "Colchón matrimonial"}],
                 "pago": None}
SOLO_INSTALACION = {"articulos": [{"tipo": "lavadora", "marca": "LG", "instalar": True}], "solo_instalacion": True}


def nueva(client, h, **cambios):
    r = client.post("/ordenes", json=ORDEN | cambios, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def token_de(orden_id):
    with SessionLocal() as db:
        return db.get(Orden, orden_id).token_cierre


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
    assert o["tecnico"]["grupo"] == "A" and o["tecnico"]["tienda"] == "Damasco San Martín"
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
    r = client.post("/tecnico/retiro", json={"qr": o["qr"], "seriales": {str(o["articulos"][0]["id"]): "0B5R4AAN300125"}}, headers=tecnico)
    assert r.json()["estado"] == "en_ruta"
    v = client.get(f"/ordenes/{o['id']}", headers=cliente).json()
    # solo foto, nombre y su calificación pública: nada de cédula ni teléfono
    assert set(v["tecnico"]) == {"nombre", "foto", "rol", "calificacion", "calificaciones"} and set(v["ayudantes"][0]) == {"nombre", "foto", "rol"}
    assert v["tecnico"]["foto"] and v["ayudantes"][0]["foto"]

    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": token_de(o["id"])}, headers=tecnico)
    assert r.status_code == 422 and "anime" in r.json()["detail"]["faltan"]
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": INSTALACION}, headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"instalacion": "/archivos/a.jpg", "espacio_limpio": "/archivos/b.jpg"}},
               headers=tecnico)
    # el juego de comedor va sin instalar: falta confirmar su entrega en empaque original
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": token_de(o["id"])}, headers=tecnico).json()
    assert r["detail"]["faltan"] == ["entrega_en_empaque_original", "ubicado_en_sitio", "foto_entrega"]
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {"entrega_en_empaque_original": True, "ubicado_en_sitio": True}},
               headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"entrega": "/archivos/e.jpg"}}, headers=tecnico)
    assert client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": token_de(o["id"])}, headers=tecnico).json()["estado"] == "completado"
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
    o = nueva(client, agente, **SOLO_TRASLADO)
    assert o["tipo_servicio"] == "traslado" and o["pago_instalacion"]["monto"] == "0.00"
    assert o["checklist_requerido"] == ["entrega_en_empaque_original", "ubicado_en_sitio"] and o["fotos_requeridas"] == ["entrega"]
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico)
    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    assert client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {"anime": True}}, headers=tecnico).status_code == 422
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {"entrega_en_empaque_original": True, "ubicado_en_sitio": True}}, headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"entrega": "/archivos/e.jpg"}}, headers=tecnico)
    assert client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": token_de(o["id"])}, headers=tecnico).json()["estado"] == "completado"


def test_solo_instalacion_sin_almacen(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente, **SOLO_INSTALACION)
    assert o["tipo_servicio"] == "instalacion" and o["articulos"][0]["estado"] == "En tu casa, por instalar"
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
    assert any("bancarios" in f for f in r.json()["detail"]["faltan"])
    client.put(f"/supervisor/tecnicos/{tec_id}/cuenta-bancaria", json={"banco": "Banco de Venezuela", "tipo": "ahorro",
               "numero": "0102-0000-00-0000000000", "titular": "Kevin Suárez", "cedula": "V-25123456"}, headers=oficina)
    for tipo in ("foto_perfil", "cedula", "licencia", "vehiculo_titulo", "vehiculo_rcv", "vehiculo_seguro"):
        client.post(f"/supervisor/tecnicos/{tec_id}/documentos", json={"tipo": tipo, "url": f"/archivos/{tipo}.jpg"}, headers=oficina)
    exp = client.get(f"/supervisor/tecnicos/{tec_id}/expediente", headers=oficina).json()
    assert len(exp["documentos"]) == 6 and "vehiculo_rcv" in exp["tipos_documento"] and exp["documentos_faltantes"] == []
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
    # Cada tienda ve solo lo suyo; el técnico supervisor de San Martín no ve otras tiendas
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
    r = client.post(f"/ordenes/{o['id']}/reprogramar", json={"fecha": MARTES, "franja": "13:00-15:00"}, headers=cliente).json()
    assert r["fecha"] == MARTES and r["estado"] == "tecnico_asignado"
    assert client.get(f"/ordenes/{o['id']}", headers=agente).json()["tecnico"]["grupo"] == "B"
    assert client.post(f"/ordenes/{o['id']}/cancelar", json={"motivo": "Me mudé"}, headers=cliente).json()["estado"] == "cancelado"
    assert client.post(f"/ordenes/{o['id']}/cancelar", json={}, headers=cliente).status_code == 409


def test_subir_foto_y_salud(client):
    h = login(client, "maria@ahahome.test")
    r = client.post("/archivos", files={"archivo": ("f.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")}, headers=h)
    assert client.get(r.json()["url"]).status_code == 200
    assert client.post("/archivos", files={"archivo": ("x.txt", b"hola", "text/plain")}, headers=h).status_code == 415
    assert client.get("/salud").json()["ok"] is True
    import base64
    r = client.post("/archivos/base64", json={"data": base64.b64encode(b"\xff\xd8\xff123").decode()}, headers=h)
    assert client.get(r.json()["url"]).status_code == 200
    assert client.post("/archivos/base64", json={"data": "%%%"}, headers=h).status_code == 422


def test_tecnico_anota_sus_ayudantes(client):
    tecnico = login_pin(client, "04242000000")  # José Hernández, Grupo A
    r = client.post("/tecnico/ayudantes", json={"nombre": "Pedro Ayala", "cedula": "V-27.111.222", "foto": "/archivos/pedro.jpg"},
                    headers=tecnico)
    assert r.status_code == 200 and r.json()["alta"] is False and r.json()["foto"] == "/archivos/pedro.jpg"
    nuevo_id = r.json()["id"]
    assert len(client.get("/tecnico/ayudantes", headers=tecnico).json()) == 2
    # Aún sin registro en oficina: no sale en las órdenes
    o = nueva(client, login(client, "agente@ahahome.test"))
    assert nuevo_id not in [a["id"] for a in o["ayudantes"]]

    oficina = login(client, "tecsup@ahahome.test")
    assert "Ayudante por registrar" in titulos(client, oficina)
    for tipo in ("foto_perfil", "cedula", "antecedentes"):
        client.post(f"/supervisor/tecnicos/{nuevo_id}/documentos", json={"tipo": tipo, "url": f"/archivos/{tipo}.jpg"}, headers=oficina)
    r = client.post(f"/supervisor/tecnicos/{nuevo_id}/alta", json={}, headers=oficina).json()
    assert r["verificado"] and r["jefe"] == "José Hernández" and r["grupo"] == "A"
    assert nuevo_id in [a["id"] for a in client.get("/tecnico/hoy", headers=tecnico).json()["mis_ayudantes"]]

    # Luego el ayudante puede crear su propia cuenta en la app con su cédula
    tienda_id = client.get("/tiendas").json()[0]["id"]
    r = client.post("/tecnico/registro", json={"nombre": "Pedro Ayala", "cedula": "27111222", "telefono": "04125550000",
                                                "email": "pedro@correo.com", "password": "clave123", "pin": "5555",
                                                "rol": "ayudante", "tienda_id": tienda_id})
    assert r.status_code == 200 and r.json()["usuario"]["tecnico"]["id"] == nuevo_id


def test_varios_articulos_instalacion_pagada_en_caja(client):
    agente = login(client, "agente@ahahome.test")
    superadmin = login(client, "superadmin@ahahome.test")
    client.put("/admin/tarifas/nevera", json={"precio": 35}, headers=superadmin)
    client.put("/admin/tarifas/aire_acondicionado", json={"precio": 60}, headers=superadmin)
    assert client.put("/admin/tarifas/nevera", json={"precio": 1}, headers=agente).status_code == 403

    arts = [{"tipo": "nevera", "marca": "Samsung", "instalar": True},
            {"tipo": "aire_acondicionado", "marca": "LG", "instalar": True},
            {"tipo": "televisor", "marca": "Sony"},
            {"tipo": "otro", "descripcion": "Ropero 3 puertas"}]
    # sin pago no se crea si hay instalación
    r = client.post("/ordenes", json=ORDEN | {"articulos": arts, "pago": None}, headers=agente)
    assert r.status_code == 422 and "pago" in r.json()["detail"]
    # un artículo sin tarifa todavía: precio por definir, sin cobro en caja
    r = client.post("/ordenes", json=ORDEN | {"articulos": [{"tipo": "otro", "descripcion": "Ropero", "instalar": True}], "pago": None},
                    headers=agente).json()
    assert r["pago_instalacion"]["monto"] == "0.00" and r["pago_instalacion"]["precio_por_definir"] is True

    o = nueva(client, agente, articulos=arts)
    assert o["tipo_servicio"] == "traslado_instalacion" and len(o["articulos"]) == 4
    assert o["pago_instalacion"] == o["pago_instalacion"] | {"monto": "95.00", "metodo": "pago_movil", "pagado": True}
    assert [a["instalar"] for a in o["articulos"]] == [True, True, False, False]
    # lo que va sin instalar se entrega en su caja; residuos solo por lo instalado
    assert o["checklist_requerido"][:2] == ["entrega_en_empaque_original", "ubicado_en_sitio"] and "anime" in o["checklist_requerido"]
    assert o["fotos_requeridas"] == ["entrega", "instalacion", "espacio_limpio"]
    assert "Ropero 3 puertas" in client.get("/notificaciones", headers=login(client, "tecsup@ahahome.test")).json()[0]["texto"]

    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico)
    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    cliente = login(client, "maria@ahahome.test")
    estados = [a["estado"] for a in client.get(f"/ordenes/{o['id']}", headers=cliente).json()["articulos"]]
    assert estados == ["Instalando", "Instalando", "Entregado", "Entregado"]

    # cancelar una orden pagada deja anotado el reembolso
    o2 = nueva(client, agente, articulos=arts[:1])
    r = client.post(f"/ordenes/{o2['id']}/cancelar", json={"motivo": "Cambio de opinión"}, headers=agente).json()
    assert "REEMBOLSO PENDIENTE" in r["eventos"][-1]["nota"] and "35.00" in r["eventos"][-1]["nota"]


def test_metodos_de_pago(client):
    assert [m["id"] for m in client.get("/metodos-pago").json()] == ["pago_movil", "efectivo_bs", "efectivo_usd", "zelle", "punto_de_venta"]
    agente = login(client, "agente@ahahome.test")
    assert client.post("/ordenes", json=ORDEN | {"pago": {"metodo": "punto_de_venta", "referencia": "lote 0042"}}, headers=agente).status_code == 200
    assert client.post("/ordenes", json=ORDEN | {"pago": {"metodo": "cheque"}}, headers=agente).status_code == 422


def test_registro_rapido_cliente_y_verificacion_24h(client):
    import base64
    import datetime as dt
    import re

    from app import correo
    from app.models import User

    correo.outbox.clear()
    foto = base64.b64encode(b"\xff\xd8\xff" + b"1" * 200).decode()
    datos = {"nombre": "Carla Ruiz", "cedula": "v 20.555.111", "telefono": "0412-777-8888", "email": "Carla@Correo.com",
             "password": "clave123", "foto": foto}
    # faltan datos → no se registra
    assert client.post("/auth/registro", json={k: v for k, v in datos.items() if k != "foto"}).status_code == 422
    # la caja ya le había creado un pedido con su teléfono
    nueva(client, login(client, "agente@ahahome.test"), cliente_nombre="Carla Ruiz", cliente_telefono="04127778888")

    r = client.post("/auth/registro", json=datos)
    assert r.status_code == 200
    u = r.json()["usuario"]
    assert u["cedula"] == "V-20.555.111" and u["email"] == "carla@correo.com" and u["foto"].startswith("/archivos/")
    assert u["email_verificado"] is False and u["verificacion_vence"]
    h = {"Authorization": "Bearer " + r.json()["token"]}
    assert client.get(u["foto"]).status_code == 200
    assert client.post("/auth/registro", json=datos).status_code == 409

    # Llega el correo con el enlace; sin verificar todavía no ve el pedido de caja
    assert correo.outbox[-1]["to"] == "carla@correo.com" and "24 horas" in correo.outbox[-1]["html"]
    assert client.get("/ordenes", headers=h).json() == []
    client.post("/auth/reenviar-verificacion", headers=h)
    enlace = re.search(r"token=([\w-]+)", correo.outbox[-1]["html"]).group(1)
    assert client.get("/auth/verificar", params={"token": "malo"}).status_code == 400
    r = client.get("/auth/verificar", params={"token": enlace})
    assert r.status_code == 200 and "verificado" in r.text
    assert client.get("/yo", headers=h).json()["email_verificado"] is True
    assert len(client.get("/ordenes", headers=h).json()) == 1

    # Otro cliente que no verifica: a las 24 horas su registro se elimina
    datos2 = datos | {"cedula": "V-21000000", "telefono": "04127779999", "email": "sin@correo.com"}
    r = client.post("/auth/registro", json=datos2)
    h2 = {"Authorization": "Bearer " + r.json()["token"]}
    with SessionLocal() as db:
        u2 = db.scalar(select(User).where(User.email == "sin@correo.com"))
        u2.verificacion_vence = dt.datetime.utcnow() - dt.timedelta(minutes=1)
        db.commit()
    assert client.get("/yo", headers=h2).status_code == 401
    r = client.post("/auth/login", json={"usuario": "sin@correo.com", "password": "clave123"})
    assert r.status_code == 401 and "24 horas" in r.json()["detail"]
    with SessionLocal() as db:
        assert db.scalar(select(User).where(User.email == "sin@correo.com")) is None
    # y puede registrarse otra vez con los mismos datos
    assert client.post("/auth/registro", json=datos2).status_code == 200


def test_analitica_ranking_y_mapa(client):
    agente = login(client, "agente@ahahome.test")
    hoy = __import__("app.asignacion", fromlist=["hoy"]).hoy().isoformat()
    o = nueva(client, agente, fecha=hoy, franja="06:00-23:59", **SOLO_TRASLADO)
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico)
    assert client.post("/tecnico/ubicacion", json={"lat": 10.50, "lng": -66.92}, headers=tecnico).json()["ok"]

    sup = login(client, "supervisor@ahahome.test")
    m = client.get("/supervisor/mapa", headers=sup).json()
    assert m["tiendas"][0]["nombre"] == "Damasco San Martín"
    yo = next(t for t in m["tecnicos"] if t["id"] == o["tecnico"]["id"])
    assert yo["estado"] == "en_ruta" and yo["lat"] == 10.50 and yo["orden"]["codigo"] == o["codigo"]

    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {"entrega_en_empaque_original": True, "ubicado_en_sitio": True}}, headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"entrega": "/archivos/e.jpg"}}, headers=tecnico)
    client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": token_de(o["id"])}, headers=tecnico)
    client.post(f"/ordenes/{o['id']}/calificar", json={"estrellas": 5, "comentario": "Rápidos y amables"}, headers=login(client, "maria@ahahome.test"))

    a = client.get("/supervisor/analitica", headers=login(client, "superadmin@ahahome.test")).json()
    assert a["indicadores"]["completadas"] == 1 and a["indicadores"]["calificacion_promedio"] == 5
    assert a["por_tienda"][0] == {"tienda": "Damasco San Martín", "ordenes": 1}
    assert a["articulos"][0]["total"] == 1 and a["cumplimiento"]["llegada_en_franja"] == 100
    r = a["ranking"][0]
    assert r["id"] == o["tecnico"]["id"] and r["calificacion"] == 5 and r["impecable"] and r["indice"] == 100
    assert a["resenas"][0]["comentario"] == "Rápidos y amables" and a["estrellas"]["5"] == 1
    # el técnico supervisor solo ve su tienda; el cliente no entra
    assert client.get("/supervisor/analitica", headers=login(client, "tecsup@ahahome.test")).status_code == 200
    assert client.get("/supervisor/analitica", headers=login(client, "maria@ahahome.test")).status_code == 403


def test_luces_y_respaldo_del_dia(client):
    from app.asignacion import grupo_de_guardia, hoy
    hoy_ = hoy().isoformat()
    guardia = grupo_de_guardia(hoy())
    otro = next(g for g in "ABC" if g != guardia)
    with SessionLocal() as db:
        de_guardia = db.scalars(select(Tecnico).where(Tecnico.grupo == guardia, Tecnico.es_ayudante.is_(False)).order_by(Tecnico.id)).all()
        tels = [t.user.telefono for t in de_guardia]
        tel_resp = db.scalar(select(Tecnico).where(Tecnico.grupo == otro, Tecnico.es_ayudante.is_(False))).user.telefono

    agente = login(client, "agente@ahahome.test")
    sup = login(client, "tecsup@ahahome.test")
    o = nueva(client, agente, fecha=hoy_, **SOLO_TRASLADO)
    t1 = login_pin(client, tel_de(o["tecnico"]["id"]))
    client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=t1)
    eq = client.get("/supervisor/equipo-hoy", headers=sup).json()
    luces = {f["id"]: f["luz"] for f in eq["equipo"]}
    assert luces[o["tecnico"]["id"]] == "roja" and list(luces.values()).count("verde") == 2 and eq["faltan_tecnicos"] is False

    # Los otros dos técnicos de guardia avisan que no pueden: faltan técnicos
    for tel in tels:
        if tel != tel_de(o["tecnico"]["id"]):
            r = client.post("/tecnico/ausencia", json={"disponible": False, "motivo": "Enfermo"}, headers=login_pin(client, tel))
            assert r.json()["ausente"] is True
    assert "Falta un técnico hoy" in titulos(client, sup)
    o2 = nueva(client, agente, fecha=hoy_, **SOLO_TRASLADO)
    assert o2["tecnico"]["id"] == o["tecnico"]["id"]  # solo queda el que está ocupado

    # Un técnico de otro grupo se ofrece como respaldo y el centro de control lo activa
    tr = login_pin(client, tel_resp)
    assert client.post("/tecnico/respaldo", json={"disponible": True}, headers=tr).json()["respaldo"] is True
    eq = client.get("/supervisor/equipo-hoy", headers=sup).json()
    assert eq["faltan_tecnicos"] is True and eq["resumen"]["grises"] == 2
    resp = next(f for f in eq["respaldo"] if f["respaldo_ofrecido"])
    assert client.post(f"/supervisor/tecnicos/{resp['id']}/respaldo", json={"activo": True}, headers=sup).json()["activo"]
    assert client.get("/tecnico/hoy", headers=tr).json()["respaldo_activo"] is True
    o3 = nueva(client, agente, fecha=hoy_, **SOLO_TRASLADO)
    assert o3["tecnico"]["id"] == resp["id"]  # el respaldo activado recibe órdenes
    eq = client.get("/supervisor/equipo-hoy", headers=sup).json()
    assert any(f["id"] == resp["id"] and f["luz"] == "verde" for f in eq["equipo"])


def test_paginas_legales_y_eliminar_cuenta(client):
    assert "Política de privacidad" in client.get("/legal/privacidad").text
    assert "Términos de uso" in client.get("/legal/terminos").text
    assert client.get("/cuenta/eliminar").status_code == 200
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente)
    cliente = login(client, "maria@ahahome.test")
    assert client.post("/yo/eliminar", json={}, headers=cliente).json()["ok"]
    assert client.get("/yo", headers=cliente).status_code == 401
    assert client.get(f"/ordenes/{o['id']}", headers=agente).status_code == 200  # la orden queda para auditoría
    # personal: se desactiva desde la web con su clave
    assert client.post("/cuenta/eliminar", json={"usuario": "agente@ahahome.test", "password": "mala"}).status_code == 401
    assert client.post("/cuenta/eliminar", json={"usuario": "agente@ahahome.test", "password": "aha12345"}).json()["ok"]
    assert client.post("/auth/login", json={"usuario": "agente@ahahome.test", "password": "aha12345"}).status_code == 401


def test_inspeccion_presupuesto_pago_materiales_y_propina(client):
    agente = login(client, "agente@ahahome.test")
    cliente = login(client, "maria@ahahome.test")
    superadmin = login(client, "superadmin@ahahome.test")
    sup = login(client, "supervisor@ahahome.test")
    o = nueva(client, agente, pago=None, articulos=[{"tipo": "aire_acondicionado", "marca": "LG", "instalar": True}])
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))

    # El cliente pide inspección antes del retiro: ya no se puede retirar
    r = client.post(f"/ordenes/{o['id']}/inspeccion", json={}, headers=cliente).json()
    assert r["inspeccion"]["requerida"] and r["listo_para_instalar"] is False
    assert "Inspección solicitada" in titulos(client, tecnico)
    r = client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico)
    assert r.status_code == 409 and "inspección" in r.json()["detail"]

    # El técnico presupuesta; con materiales necesita su cuenta registrada
    pres = {"items": [{"tipo": "material", "descripcion": "Tubería de cobre 3 m", "cantidad": 1, "precio": 25},
                      {"tipo": "material", "descripcion": "Base para condensadora", "cantidad": 1, "precio": 15},
                      {"tipo": "mano_obra", "descripcion": "Instalación split 12.000 BTU", "cantidad": 1, "precio": 40}],
            "notas": "Hay que pasar la tubería por la pared del balcón"}
    # (los técnicos de demostración ya tienen pago móvil; se borra para probar que la oficina la registra)
    with SessionLocal() as db:
        tt = db.get(Tecnico, o["tecnico"]["id"]); tt.pago_movil_telefono = tt.pago_movil_banco = ""; db.commit()
    assert client.post(f"/tecnico/ordenes/{o['id']}/presupuesto", json=pres, headers=tecnico).status_code == 422
    assert client.put("/tecnico/cuenta-bancaria", json={"pago_movil_telefono": "0424"}, headers=tecnico).status_code == 405
    oficina = login(client, "tecsup@ahahome.test")
    url = f"/supervisor/tecnicos/{o['tecnico']['id']}/cuenta-bancaria"
    assert client.put(url, json={"banco": "Banesco", "numero": "123"}, headers=oficina).status_code == 422
    c = client.put(url, json={"pago_movil_telefono": "04242000000", "pago_movil_banco": "Banesco", "cedula": "V-12000000"}, headers=oficina).json()
    assert c["registrada"] and client.get("/tecnico/cuenta-bancaria", headers=tecnico).json()["registrada"]
    p = client.post(f"/tecnico/ordenes/{o['id']}/presupuesto", json=pres, headers=tecnico).json()
    # pidió la inspección desde la app (no se cobró en caja): los USD 10 van en este pago
    assert p["total"] == "90.00" and p["inspeccion"] == "10.00" and p["a_pagar"] == "90.00" and p["materiales"] == "40.00" and p["estado"] == "enviado"
    assert "Presupuesto por aprobar" in titulos(client, superadmin)
    assert "Tu presupuesto está listo" in titulos(client, cliente)

    # Hace falta el sí del cliente Y del superadmin
    client.post(f"/ordenes/{o['id']}/presupuesto/responder", json={"acepta": True}, headers=cliente)
    assert client.get(f"/ordenes/{o['id']}", headers=cliente).json()["presupuesto"]["estado"] == "enviado"
    assert client.post(f"/supervisor/presupuestos/{p['id']}/aprobar", json={"acepta": True}, headers=sup).status_code == 403
    r = client.post(f"/supervisor/presupuestos/{p['id']}/aprobar", json={"acepta": True}, headers=superadmin).json()
    assert r["estado"] == "aprobado" and r["cuenta_tecnico"]["pago_movil_telefono"] == "04242000000"
    assert "cuenta_tecnico" not in client.get(f"/ordenes/{o['id']}", headers=cliente).json()["presupuesto"]

    # El cliente paga, el control confirma y AHA HOME paga los materiales al técnico
    client.post(f"/ordenes/{o['id']}/presupuesto/pago", json={"metodo": "pago_movil", "referencia": "998877"}, headers=cliente)
    assert client.post(f"/supervisor/presupuestos/{p['id']}/confirmar-pago", headers=sup).json()["estado"] == "pagado"
    assert client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico).status_code == 409
    assert "Pagar materiales al técnico" in titulos(client, superadmin)
    r = client.post(f"/supervisor/presupuestos/{p['id']}/pagar-materiales", json={"referencia": "PM-5566"}, headers=superadmin).json()
    assert r["estado"] == "materiales_pagados"
    assert "¡Listo para instalar!" in titulos(client, tecnico)
    assert client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico).json()["estado"] == "en_ruta"

    # Cierre y propina
    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    full = client.get(f"/ordenes/{o['id']}", headers=agente).json()
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {k: True for k in full["checklist_requerido"]}}, headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {k: "/archivos/x.jpg" for k in full["fotos_requeridas"]}}, headers=tecnico)
    assert client.post(f"/ordenes/{o['id']}/propina", json={"monto": 5, "metodo": "zelle", "referencia": "Z1"}, headers=cliente).status_code == 409
    client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": token_de(o["id"])}, headers=tecnico)
    assert client.post(f"/ordenes/{o['id']}/propina", json={"monto": 5, "metodo": "zelle"}, headers=cliente).status_code == 422
    r = client.post(f"/ordenes/{o['id']}/propina", json={"monto": 5, "metodo": "zelle", "referencia": "Z1"}, headers=cliente).json()
    assert r["propina"]["monto"] == "5.00" and r["propina"]["entregada_al_tecnico"] is False
    assert "¡Recibiste una propina!" in titulos(client, tecnico) and "Propina por transferir" in titulos(client, superadmin)
    r = client.post(f"/supervisor/ordenes/{o['id']}/propina-entregada", json={"referencia": "PM-7788"}, headers=superadmin).json()
    assert r["propina"]["entregada_al_tecnico"] is True
    assert client.post(f"/ordenes/{o['id']}/propina", json={"monto": 5, "metodo": "efectivo_usd"}, headers=cliente).status_code == 409


def test_presupuesto_rechazado_permite_uno_nuevo(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente, requiere_inspeccion=True, pago={"metodo": "punto_de_venta", "referencia": "L-1"}, articulos=[{"tipo": "otro", "descripcion": "Closet", "instalar": True}])
    assert o["inspeccion"]["requerida"]
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    solo_mano = {"items": [{"tipo": "mano_obra", "descripcion": "Armado de closet", "cantidad": 1, "precio": 30}]}
    p = client.post(f"/tecnico/ordenes/{o['id']}/presupuesto", json=solo_mano, headers=tecnico).json()
    assert client.post(f"/tecnico/ordenes/{o['id']}/presupuesto", json=solo_mano, headers=tecnico).status_code == 409
    client.post(f"/supervisor/presupuestos/{p['id']}/aprobar", json={"acepta": False, "motivo": "Muy caro"}, headers=login(client, "superadmin@ahahome.test"))
    p2 = client.post(f"/tecnico/ordenes/{o['id']}/presupuesto", json=solo_mano | {"items": [{"tipo": "mano_obra", "descripcion": "Armado", "cantidad": 1, "precio": 20}]},
                     headers=tecnico).json()
    assert p2["total"] == "20.00"
    # sin materiales: al confirmar el pago queda listo directo
    cliente = login(client, "maria@ahahome.test")
    client.post(f"/ordenes/{o['id']}/presupuesto/responder", json={"acepta": True}, headers=cliente)
    client.post(f"/supervisor/presupuestos/{p2['id']}/aprobar", json={"acepta": True}, headers=login(client, "superadmin@ahahome.test"))
    client.post(f"/ordenes/{o['id']}/presupuesto/pago", json={"metodo": "efectivo_usd", "referencia": "en caja"}, headers=agente)
    r = client.post(f"/supervisor/presupuestos/{p2['id']}/confirmar-pago", headers=login(client, "supervisor@ahahome.test")).json()
    assert r["estado"] == "materiales_pagados"
    assert client.get(f"/ordenes/{o['id']}", headers=agente).json()["pausa"]["activa"] is False


def test_pausa_por_inspeccion_vence_y_se_puede_quitar(client):
    from app.models import Orden
    from app.routers.presupuestos import revisar_pausas
    agente = login(client, "agente@ahahome.test")
    sin = nueva(client, agente, pago=None, articulos=[{"tipo": "otro", "descripcion": "Mesa", "instalar": True}])
    assert sin["pausa"]["activa"] is False  # sin inspección: va directo a la confirmación de retiro
    o = nueva(client, agente, requiere_inspeccion=True, pago={"metodo": "punto_de_venta", "referencia": "L-1"}, articulos=[{"tipo": "otro", "descripcion": "Closet", "instalar": True}])
    assert o["pausa"]["activa"] and not o["pausa"]["vencida"]
    # pasa el límite: avisa una sola vez al control y al cliente
    with SessionLocal() as db:
        db.get(Orden, o["id"]).pausa_desde -= dt.timedelta(hours=49)
        db.commit()
        assert revisar_pausas(db) == 1
        assert revisar_pausas(db) == 0
    sup = login(client, "supervisor@ahahome.test")
    assert "Pausa por inspección vencida" in titulos(client, sup)
    assert client.get(f"/ordenes/{o['id']}", headers=sup).json()["pausa"]["vencida"]
    assert client.get("/supervisor/resumen", params={"fecha": LUNES}, headers=sup).json()["indicadores"]["en_pausa_inspeccion"] >= 1
    r = client.post(f"/supervisor/ordenes/{o['id']}/pausa", json={"accion": "extender"}, headers=sup).json()
    assert r["pausa"]["activa"] and not r["pausa"]["vencida"]
    # el control quita la inspección: se salta el paso y sigue a la confirmación de retiro
    r = client.post(f"/supervisor/ordenes/{o['id']}/pausa", json={"accion": "quitar_inspeccion"}, headers=sup).json()
    assert not r["pausa"]["activa"] and not r["inspeccion"]["requerida"] and r["listo_para_instalar"]
    assert client.post(f"/supervisor/ordenes/{o['id']}/pausa", json={"accion": "extender"}, headers=sup).status_code == 409
    # el técnico también puede pausar por inspección al revisar la orden
    tecnico = login_pin(client, tel_de(r["tecnico"]["id"]))
    r = client.post(f"/ordenes/{o['id']}/inspeccion", json={}, headers=tecnico).json()
    assert r["pausa"]["activa"]


def test_analitica_sin_servicios_completados(client):
    """Con órdenes abiertas pero ninguna completada, la analítica no debe fallar."""
    agente = login(client, "agente@ahahome.test")
    nueva(client, agente)
    r = client.get("/supervisor/analitica", headers=login(client, "superadmin@ahahome.test"))
    assert r.status_code == 200, r.text


def test_materiales_los_compra_el_cliente(client):
    """El técnico sugiere quién compra los materiales; el cliente elige al aceptar y solo paga la mano de obra."""
    agente = login(client, "agente@ahahome.test")
    # la inspección se cobra en caja en el momento: sin pago no se registra la orden
    sin = client.post("/ordenes", json=ORDEN | {"requiere_inspeccion": True, "pago": None, "articulos": [{"tipo": "aire_acondicionado", "instalar": True}]}, headers=agente)
    assert sin.status_code == 422 and "caja" in sin.json()["detail"]
    o = nueva(client, agente, requiere_inspeccion=True, pago={"metodo": "punto_de_venta", "referencia": "L-1"}, articulos=[{"tipo": "aire_acondicionado", "instalar": True}])
    assert o["inspeccion"]["pagada_en_tienda"] and o["inspeccion"]["costo"] == "10.00"
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    items = {"items": [{"tipo": "material", "descripcion": "Tubería de cobre 3 m", "cantidad": 1, "precio": 45},
                       {"tipo": "mano_obra", "descripcion": "Instalación split", "cantidad": 1, "precio": 35}]}
    assert client.post(f"/tecnico/ordenes/{o['id']}/presupuesto", json=items | {"materiales_compra": "vecino"}, headers=tecnico).status_code == 422
    p = client.post(f"/tecnico/ordenes/{o['id']}/presupuesto", json=items, headers=tecnico).json()
    assert p["materiales_compra"] == "tecnico" and p["a_pagar"] == "80.00"
    cliente = login(client, "maria@ahahome.test")
    p = client.post(f"/ordenes/{o['id']}/presupuesto/responder", json={"acepta": True, "materiales_compra": "cliente"}, headers=cliente).json()
    assert p["materiales_compra"] == "cliente" and p["a_pagar"] == "35.00" and p["total"] == "80.00"
    sa = login(client, "superadmin@ahahome.test")
    client.post(f"/supervisor/presupuestos/{p['id']}/aprobar", json={"acepta": True}, headers=sa)
    assert any("USD 35.00" in n["texto"] for n in client.get("/notificaciones", headers=cliente).json())
    client.post(f"/ordenes/{o['id']}/presupuesto/pago", json={"metodo": "pago_movil", "referencia": "9988"}, headers=cliente)
    r = client.post(f"/supervisor/presupuestos/{p['id']}/confirmar-pago", headers=login(client, "supervisor@ahahome.test")).json()
    # sin pago de materiales al técnico: queda listo para instalar al confirmar el pago
    assert r["estado"] == "materiales_pagados"
    v = client.get(f"/ordenes/{o['id']}", headers=cliente).json()
    assert v["listo_para_instalar"] and not v["pausa"]["activa"]
    assert any("Tubería de cobre" in n["texto"] for n in client.get("/notificaciones", headers=cliente).json())


def test_reprogramar_con_anticipacion_y_penalidad_por_entrega_fallida(client):
    """Reprogramar sin costo solo antes del retiro y con anticipación; si salieron y no se pudo entregar, penalidad."""
    from app.models import Orden
    agente = login(client, "agente@ahahome.test")
    cliente = login(client, "maria@ahahome.test")
    o = nueva(client, agente)
    assert o["reprogramar"]["puede"]
    # a menos de 3 horas de su franja, el cliente ya no puede reprogramar solo (el control sí)
    with SessionLocal() as db:
        x = db.get(Orden, o["id"])
        ahora_cc = dt.datetime.utcnow() - dt.timedelta(hours=4) + dt.timedelta(hours=1)
        x.fecha, x.franja = ahora_cc.date().isoformat(), f"{ahora_cc.hour:02d}:00-{(ahora_cc.hour + 2) % 24:02d}:00"
        db.commit()
    r = client.post(f"/ordenes/{o['id']}/reprogramar", json={"fecha": LUNES, "franja": "13:00 - 15:00"}, headers=cliente)
    assert r.status_code == 409 and "3 h" in r.json()["detail"]
    assert client.post(f"/ordenes/{o['id']}/reprogramar", json={"fecha": LUNES, "franja": "13:00 - 15:00"},
                       headers=login(client, "supervisor@ahahome.test")).status_code == 200
    o = client.get(f"/ordenes/{o['id']}", headers=agente).json()
    # retiran, salen y no pueden entregar: penalidad por el servicio completo
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    client.post(f"/tecnico/ordenes/{o['id']}/confirmar", headers=tecnico)
    client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico)
    assert client.post(f"/ordenes/{o['id']}/reprogramar", json={"fecha": LUNES, "franja": "15:00 - 17:00"}, headers=cliente).status_code == 409
    r = client.post(f"/tecnico/ordenes/{o['id']}/entrega-fallida", json={"motivo": "El cliente no estaba en casa"}, headers=tecnico).json()
    assert r["estado"] == "entrega_fallida" and r["penalidad"]["estado"] == "pendiente"
    assert "No pudimos entregar tu compra" in titulos(client, cliente)
    # sin pagar la penalidad no se reprograma
    assert client.post(f"/ordenes/{o['id']}/reprogramar", json={"fecha": LUNES, "franja": "15:00 - 17:00"}, headers=cliente).status_code == 409
    sup = login(client, "supervisor@ahahome.test")
    assert any(p["orden_id"] == o["id"] for p in client.get("/supervisor/penalidades", headers=sup).json())
    client.post(f"/supervisor/ordenes/{o['id']}/penalidad/monto", json={"monto": 25}, headers=sup)
    assert client.post(f"/ordenes/{o['id']}/penalidad/pago", json={"metodo": "pago_movil", "referencia": "5544"}, headers=cliente).status_code == 200
    r = client.post(f"/supervisor/ordenes/{o['id']}/penalidad/confirmar", headers=sup).json()
    assert r["penalidad"]["estado"] == "pagada" and r["reprogramar"]["puede"]
    r = client.post(f"/ordenes/{o['id']}/reprogramar", json={"fecha": LUNES, "franja": "15:00 - 17:00"}, headers=cliente)
    assert r.status_code == 200 and r.json()["estado"] in ("tecnico_asignado", "solicitud_enviada")


def test_chat_supervisado(client):
    """Cliente y técnico conversan; el centro de control ve todo y puede escribir; terceros no entran."""
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente)
    cliente = login(client, "maria@ahahome.test")
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    r = client.post(f"/ordenes/{o['id']}/chat", json={"texto": "Buenos días, ¿a qué hora llegan?"}, headers=cliente)
    assert r.status_code == 200 and r.json()["mio"]
    assert client.get(f"/ordenes/{o['id']}/chat?solo_resumen=1", headers=tecnico).json()["no_leidos"] == 1
    assert any(t.startswith("Mensaje de María") for t in titulos(client, tecnico))
    chat = client.get(f"/ordenes/{o['id']}/chat", headers=tecnico).json()
    assert chat["mensajes"][0]["rol"] == "cliente" and chat["abierto"]
    assert client.get(f"/ordenes/{o['id']}/chat?solo_resumen=1", headers=tecnico).json()["no_leidos"] == 0
    client.post(f"/ordenes/{o['id']}/chat", json={"texto": "Llego a las 10:40"}, headers=tecnico)
    # el centro de control supervisa: ve el chat, escribe y queda el aviso de que se unió
    sup = login(client, "supervisor@ahahome.test")
    assert any(c["orden_id"] == o["id"] for c in client.get("/supervisor/chats", headers=sup).json())
    client.post(f"/ordenes/{o['id']}/chat", json={"texto": "Seguimos tu servicio en vivo"}, headers=sup)
    ms = client.get(f"/ordenes/{o['id']}/chat", headers=cliente).json()["mensajes"]
    assert [m["sistema"] for m in ms] == [False, False, True, False] and ms[-1]["control"]
    # otra clienta o la caja no pueden leerlo
    assert client.get(f"/ordenes/{o['id']}/chat", headers=agente).status_code == 404
    assert client.get("/supervisor/chats", headers=cliente).status_code == 403


def test_banners_de_aliados_desde_el_centro_de_control(client):
    cliente = login(client, "maria@ahahome.test")
    sa = login(client, "superadmin@ahahome.test")
    r = client.get("/banners", headers=cliente).json()
    assert len(r["aha"]) == 3 and len(r["aliados"]) == 2  # los de fábrica
    assert client.post("/admin/banners", json={"titulo": "x"}, headers=cliente).status_code == 403
    b = client.post("/admin/banners", json={"tipo": "aliado", "etiqueta": "ALIADO", "titulo": "Pinturas Caracas 10% OFF", "boton": "VER OFERTA",
                                            "enlace": "https://ejemplo.com/oferta", "color": "verde", "orden": -1}, headers=sa).json()
    assert client.post("/admin/banners", json={"titulo": "Mal", "enlace": "javascript:alert(1)"}, headers=sa).status_code == 422
    aliados = client.get("/banners", headers=cliente).json()["aliados"]
    assert aliados[0]["titulo"] == "Pinturas Caracas 10% OFF"
    client.post(f"/banners/{b['id']}/clic", headers=cliente)
    client.put(f"/admin/banners/{b['id']}", json=b | {"activo": False}, headers=sa)
    assert all(x["id"] != b["id"] for x in client.get("/banners", headers=cliente).json()["aliados"])
    assert [x["clics"] for x in client.get("/admin/banners", headers=sa).json() if x["id"] == b["id"]] == [1]


def test_dos_monedas_tasa_oficial_y_telefono_oculto_al_tecnico(client):
    """Se cobra en USD o en Bs a la tasa oficial del día; todos ven cómo se pagó. La cuadrilla no ve el teléfono del cliente."""
    agente = login(client, "agente@ahahome.test")
    sa = login(client, "superadmin@ahahome.test")
    assert client.put("/admin/tasa", json={"bs_por_usd": 300}, headers=agente).status_code == 403
    assert client.put("/admin/tasa", json={"bs_por_usd": 300}, headers=sa).json()["bs_por_usd"] == "300.00"
    assert client.get("/tasa", headers=agente).json()["bs_por_usd"] == "300.00"
    arts = [{"tipo": "aire_acondicionado", "instalar": True}]
    usd = nueva(client, agente, requiere_inspeccion=True, pago={"metodo": "efectivo_usd", "referencia": ""}, articulos=arts)
    assert usd["pago_instalacion"]["moneda"] == "USD" and usd["pago_instalacion"]["cobrado"] == "USD 10.00"
    bs = nueva(client, agente, requiere_inspeccion=True, pago={"metodo": "pago_movil", "referencia": "777"}, articulos=arts)
    pi = bs["pago_instalacion"]
    assert pi["moneda"] == "Bs" and pi["monto_bs"] == "3000.00" and pi["tasa"] == "300.00" and pi["cobrado"] == "Bs 3000.00"
    assert pi["metodo_texto"] == "Pago móvil"
    # la tasa del día cambia, pero el cobro ya hecho conserva la suya
    client.put("/admin/tasa", json={"bs_por_usd": 320}, headers=sa)
    assert client.get(f"/ordenes/{bs['id']}", headers=sa).json()["pago_instalacion"]["cobrado"] == "Bs 3000.00"
    tecnico = login_pin(client, tel_de(bs["tecnico"]["id"]))
    vt = client.get(f"/ordenes/{bs['id']}", headers=tecnico).json()
    assert "telefono" not in vt["cliente"] and vt["pago_instalacion"]["cobrado"] == "Bs 3000.00"
    assert client.get(f"/ordenes/{bs['id']}", headers=sa).json()["cliente"]["telefono"]


def test_llamar_desde_el_chat_sin_compartir_numeros(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente)
    cliente = login(client, "maria@ahahome.test")
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    sup = login(client, "supervisor@ahahome.test")
    lc = client.get(f"/ordenes/{o['id']}/chat", headers=cliente).json()["llamar"]
    lt = client.get(f"/ordenes/{o['id']}/chat", headers=tecnico).json()["llamar"]
    assert [x["texto"] for x in lc] == ["Llamar al centro de control"] == [x["texto"] for x in lt]
    assert lc[0]["telefono"] != o["cliente"]["telefono"] and lt[0]["telefono"] != tel_de(o["tecnico"]["id"])
    ls = client.get(f"/ordenes/{o['id']}/chat", headers=sup).json()["llamar"]
    assert ls[0]["texto"] == "Llamar al cliente" and ls[1]["texto"].startswith("Llamar al técnico")


def test_retiro_de_residuos_opcional_por_garantia(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente, retirar_residuos=False, pago=None, articulos=[{"tipo": "nevera", "instalar": True}])
    assert o["residuos"] == {"retirar": False, "aplica": True, "puede_cambiar": True}
    assert "cajas" not in o["checklist_requerido"] and "empaque_entregado_al_cliente" in o["checklist_requerido"]
    cliente = login(client, "maria@ahahome.test")
    r = client.post(f"/ordenes/{o['id']}/residuos", json={"retirar": True}, headers=cliente).json()
    assert r["residuos"]["retirar"] and "cajas" in r["checklist_requerido"] and "empaque_entregado_al_cliente" not in r["checklist_requerido"]
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    assert "Cambio en el retiro de residuos" in titulos(client, tecnico)
    assert client.post(f"/ordenes/{o['id']}/residuos", json={"retirar": False}, headers=tecnico).status_code == 403
    t = nueva(client, agente, pago=None, articulos=[{"tipo": "nevera", "instalar": False}])  # traslado: no aplica
    assert t["residuos"]["aplica"] is False
    assert client.post(f"/ordenes/{t['id']}/residuos", json={"retirar": False}, headers=agente).status_code == 409


def test_qr_de_tienda_tecnico_escanea_y_caja_autoriza(client):
    agente = login(client, "agente@ahahome.test")
    sa = login(client, "superadmin@ahahome.test")
    tiendas = client.get("/admin/tiendas-qr", headers=sa).json()
    assert client.post(f"/admin/tiendas/{tiendas[0]['id']}/qr", headers=agente).status_code == 403
    qr = client.post(f"/admin/tiendas/{tiendas[0]['id']}/qr", headers=sa).json()["qr"]
    assert qr.startswith("AHATIENDA:") and client.get(f"/admin/tiendas/{tiendas[0]['id']}/qr.png", headers=sa).status_code == 200
    o1 = nueva(client, agente, pago=None, articulos=[{"tipo": "nevera", "instalar": False}])  # solo traslado
    tecnico = login_pin(client, tel_de(o1["tecnico"]["id"]))
    assert client.post("/tecnico/tienda/escanear", json={"qr": "AHATIENDA:falso"}, headers=tecnico).status_code == 404
    v = client.post("/tecnico/tienda/escanear", json={"qr": qr}, headers=tecnico).json()
    assert v["estado"] == "pendiente" and o1["codigo"] in [x["codigo"] for x in v["ordenes"]]
    assert any(x["retiro"] == "Solo traslado" for x in v["ordenes"])
    assert "Técnico en caja para retirar" in titulos(client, agente)
    pend = client.get("/caja/visitas", headers=agente).json()
    assert [x["id"] for x in pend] == [v["id"]] and pend[0]["tecnico"]["cedula"]
    # el técnico espera el OK: todavía no ha salido
    assert client.get(f"/ordenes/{o1['id']}", headers=agente).json()["estado"] != "en_ruta"
    r = client.post(f"/caja/visitas/{v['id']}/autorizar", headers=agente).json()
    assert r["estado"] == "autorizada"
    assert client.get(f"/ordenes/{o1['id']}", headers=agente).json()["estado"] == "en_ruta"
    assert client.get("/tecnico/tienda/visita", headers=tecnico).json()["estado"] == "autorizada"
    assert "Retiro autorizado ✓" in titulos(client, tecnico)
    assert client.post(f"/caja/visitas/{v['id']}/autorizar", headers=agente).status_code == 409
    # ya no le queda nada por retirar en esa tienda
    assert client.post("/tecnico/tienda/escanear", json={"qr": qr}, headers=tecnico).status_code == 404


def test_tipo_de_inmueble_casa_edificio_u_oficina(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente, tipo_inmueble="edificio", pago=None)
    assert o["cliente"]["tipo_inmueble"] == "edificio" and o["cliente"]["tipo_inmueble_texto"] == "Edificio"
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    assert client.get(f"/ordenes/{o['id']}", headers=tecnico).json()["cliente"]["tipo_inmueble_texto"] == "Edificio"
    r = client.post("/ordenes", json=ORDEN | {"tipo_inmueble": "galpon", "pago": None}, headers=agente)
    assert r.status_code == 422 and "casa, edificio u oficina" in r.json()["detail"]


def test_cierre_con_codigo_del_cliente(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente, pago=None, articulos=[{"tipo": "nevera", "instalar": False}])
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    cliente = login(client, "maria@ahahome.test")
    client.post(f"/tecnico/ordenes/{o['id']}/confirmar", headers=tecnico)
    client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico)
    assert client.get(f"/ordenes/{o['id']}", headers=cliente).json()["cierre"] is None  # en ruta: todavía no
    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    vc = client.get(f"/ordenes/{o['id']}", headers=cliente).json()
    token = vc["cierre"]["token"]
    assert len(token) == 6 and token.isdigit()
    vt = client.get(f"/ordenes/{o['id']}", headers=tecnico).json()
    assert "token" not in vt["cierre"] and vt["cierre"]["requiere_token"]
    sup = login(client, "supervisor@ahahome.test")
    assert client.get(f"/ordenes/{o['id']}", headers=sup).json()["cierre"]["token"] == token
    req = vt["checklist_requerido"]
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {k: True for k in req}}, headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {k: "x.jpg" for k in vt["fotos_requeridas"]}}, headers=tecnico)
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": ""}, headers=tecnico)
    assert r.status_code == 422 and "código de cierre" in r.json()["detail"]
    malo = "000000" if token != "000000" else "111111"
    for i in range(4):
        r = client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": malo}, headers=tecnico)
        assert r.status_code == 422 and f"{4 - i} intento" in r.json()["detail"]
    # quinto error: se genera un código nuevo y el viejo deja de servir
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": malo}, headers=tecnico)
    assert "se generó uno nuevo" in r.json()["detail"]
    assert "Nuevo código de cierre" in titulos(client, cliente)
    nuevo = client.get(f"/ordenes/{o['id']}", headers=cliente).json()["cierre"]["token"]
    assert client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": token}, headers=tecnico).status_code == 422 or nuevo == token
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", json={"token": nuevo}, headers=tecnico).json()
    assert r["estado"] == "completado"
    assert client.get(f"/ordenes/{o['id']}", headers=cliente).json()["cierre"] is None


def test_calificar_en_la_pantalla_de_cierre(client):
    agente = login(client, "agente@ahahome.test")
    o = nueva(client, agente, pago=None, articulos=[{"tipo": "nevera", "instalar": False}])
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    cliente = login(client, "maria@ahahome.test")
    assert client.post(f"/ordenes/{o['id']}/calificar", json={"estrellas": 5}, headers=cliente).status_code == 409
    client.post(f"/tecnico/ordenes/{o['id']}/confirmar", headers=tecnico)
    client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico)
    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    r = client.post(f"/ordenes/{o['id']}/calificar", json={"estrellas": 5}, headers=cliente).json()
    assert r["calificacion"] == 5 and r["cierre"]["token"]
