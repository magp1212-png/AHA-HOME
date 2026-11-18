# AHA HOME

**Hacemos todo por ti.** Retiramos tu compra en Tiendas Damasco, la llevamos a tu casa, la sacamos de las cajas, la instalamos y nos llevamos los desechos (cajas, anime, plásticos, flejes y precintos).

AHA HOME es la app hermana de AHA VOY. La especificación completa está en `docs/Especificaciones-Tecnicas-y-Flujo-Operativo.pdf` y la maqueta de diseño en `docs/maqueta/`.

- **Colores (AHA VOY):** azul marino `#21244D` y verde lima `#CFD72A`
- **Logo:** la casita de Anunciate

## Plan paso a paso

| Paso | Qué incluye | Estado |
|---|---|---|
| 1 | Servidor: órdenes, roles, asignación automática por zona y guardia, retiro con QR, checklist, cierre, panel del supervisor | ✅ Listo, con pruebas |
| 2 | App móvil base (Expo): inicio de sesión, conexión con el servidor, colores y logo | ⏳ |
| 3 | Pantallas del agente en caja: registrar orden y mostrar el QR | ⏳ |
| 4 | Pantallas del cliente: mis equipos, seguimiento en vivo, ficha de seguridad, calificación | ⏳ |
| 5 | Pantallas del técnico: huella o PIN, alta biométrica, escáner QR, navegación GPS, checklist y fotos | ⏳ |
| 6 | Panel web del supervisor | ⏳ |
| 7 | Notificaciones push y WhatsApp, pruebas en tienda y publicación en Google Play y App Store | ⏳ |

## Servidor (`backend/`)

Está hecho con Python, FastAPI y SQLAlchemy. Usa SQLite para empezar y puede pasar a PostgreSQL cambiando una sola variable.

### Probar en tu computadora

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python seed.py                       # datos de demostración
uvicorn app.main:app --reload        # http://localhost:8000/docs
pytest -q                            # pruebas
```

### Usuarios de demostración (los crea `seed.py`)

Todos usan la contraseña `aha12345`. Los técnicos entran con su teléfono y el PIN `1234`.

| Rol | Usuario |
|---|---|
| Supervisor | `supervisor@ahahome.test` |
| Agente Damasco Oeste / Central / Este | `04141000001` / `04141000002` / `04141000003` |
| Clienta | `maria@ahahome.test` |
| Técnicos | `04242000000` … `04242000026` (grupos A, B y C) y `04243000000` … `04243000002` (Guardia Retén) |

### Instalar en tu servidor físico (o en cualquier nube)

Necesitas Docker instalado.

```bash
git clone https://github.com/magp1212-png/AHA-HOME.git && cd AHA-HOME
cp .env.ejemplo .env                 # edita AHAHOME_JWT_SECRET
docker compose up -d --build
docker compose exec api python seed.py   # opcional: datos de demostración
```

- El servidor queda en el puerto **8000**.
- La base de datos y las fotos se guardan en la carpeta `datos/`. **Respáldala.**
- Para que la app funcione desde internet hace falta HTTPS. Pon delante un proxy, por ejemplo Caddy o Nginx con un dominio, como `api.ahahome.com`.
- Para mudar el servidor: copia la carpeta `datos/` y el archivo `.env` a la máquina nueva y cambia la dirección del servidor (`apiUrl`) en la app.
- `GET /salud` confirma que el servidor responde.

### Reglas que aplica el servidor (según la especificación)

- **Estados de la orden:** Solicitud enviada → Técnico asignado → Cita confirmada → Técnico en ruta → Servicio en progreso → Servicio completado. También puede quedar como cancelada.
- **Guardia:** el Grupo A está de guardia el lunes, el B el martes y el C el miércoles, y luego se repite.
- **Asignación automática:**
  1. Técnico de guardia de la misma zona, con menos órdenes y que viva más cerca.
  2. Si no hay, técnico de guardia de la zona vecina que ya terminó sus órdenes.
  3. Si no hay, la **Guardia Retén** activada por el supervisor.
  4. Si tampoco hay, se avisa al supervisor.
- **Retiro en almacén:** solo el técnico asignado y verificado puede escanear el QR. Queda registrado quién retiró, qué producto y serial, de qué sucursal y a qué hora. En ese momento el cliente recibe la ficha de seguridad del técnico.
- **Cierre:** no se puede completar la orden sin los 4 puntos de instalación, los 5 de residuos (cajas, anime, plásticos, flejes y precintos) y las 2 fotos (equipo instalado y espacio limpio).
- **Alta del técnico:** sube foto de rostro, selfie con la cédula y su PIN. El supervisor verifica la identidad antes de que pueda recibir órdenes.

### Pendientes conocidos

- **Comparación automática de rostro:** hoy la verificación la hace el supervisor viendo las fotos. Se puede conectar un servicio de reconocimiento facial más adelante.
- **WhatsApp:** los avisos van a la bandeja de la app y por push. Para WhatsApp hace falta una cuenta de WhatsApp Business API.
