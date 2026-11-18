"""Piloto Damasco San Martín: caja → asignación de cuadrilla → avisos de seguimiento → retiro o salida →
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
    assert set(v["tecnico"]) == {"nombre", "foto", "rol"} and set(v["ayudantes"][0]) == {"nombre", "foto", "rol"}
    assert v["tecnico"]["foto"] and v["ayudantes"][0]["foto"]

    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico)
    assert r.status_code == 422 and "anime" in r.json()["detail"]["faltan"]
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": INSTALACION}, headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"instalacion": "/archivos/a.jpg", "espacio_limpio": "/archivos/b.jpg"}},
               headers=tecnico)
    # el juego de comedor va sin instalar: falta confirmar su entrega en empaque original
    r = client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico).json()
    assert r["detail"]["faltan"] == ["entrega_en_empaque_original", "ubicado_en_sitio", "foto_entrega"]
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {"entrega_en_empaque_original": True, "ubicado_en_sitio": True}},
               headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"entrega": "/archivos/e.jpg"}}, headers=tecnico)
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
    o = nueva(client, agente, **SOLO_TRASLADO)
    assert o["tipo_servicio"] == "traslado" and o["pago_instalacion"]["monto"] == "0.00"
    assert o["checklist_requerido"] == ["entrega_en_empaque_original", "ubicado_en_sitio"] and o["fotos_requeridas"] == ["entrega"]
    tecnico = login_pin(client, tel_de(o["tecnico"]["id"]))
    client.post("/tecnico/retiro", json={"qr": o["qr"]}, headers=tecnico)
    client.post(f"/tecnico/ordenes/{o['id']}/llegada", headers=tecnico)
    assert client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {"anime": True}}, headers=tecnico).status_code == 422
    client.put(f"/tecnico/ordenes/{o['id']}/checklist", json={"items": {"entrega_en_empaque_original": True, "ubicado_en_sitio": True}}, headers=tecnico)
    client.put(f"/tecnico/ordenes/{o['id']}/fotos", json={"fotos": {"entrega": "/archivos/e.jpg"}}, headers=tecnico)
    assert client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico).json()["estado"] == "completado"


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
    client.post(f"/tecnico/ordenes/{o['id']}/completar", headers=tecnico)
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
