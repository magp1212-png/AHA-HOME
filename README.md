# AHA HOME

**Hacemos todo por ti.** Retiramos tu compra en Tiendas Damasco, la llevamos a tu casa, la sacamos de las cajas, la instalamos y nos llevamos los desechos (cajas, anime, plásticos, flejes y precintos).

AHA HOME es la app hermana de AHA VOY. La especificación completa está en `docs/Especificaciones-Tecnicas-y-Flujo-Operativo.pdf` y la maqueta de diseño en `docs/maqueta/`.

- **Colores (AHA VOY):** azul marino `#21244D` y verde lima `#CFD72A`
- **Logo:** la casita de Anunciate

## Plan paso a paso

| Paso | Qué incluye | Estado |
|---|---|---|
| 1 | Servidor: órdenes, roles, asignación automática por zona y guardia, retiro con QR, checklist, cierre, panel del supervisor | ✅ Listo, con pruebas |
| 2 | App móvil base (Expo): inicio de sesión, conexión con el servidor, colores y logo | ✅ |
| 3 | Pantallas del agente en caja: registrar orden y mostrar el QR | ✅ |
| 4 | Pantallas del cliente: mis equipos, seguimiento en vivo, ficha de seguridad, calificación | ✅ |
| 5 | Pantallas del técnico: huella o PIN, alta biométrica, escáner QR, navegación GPS, checklist y fotos | ✅ (falta GPS en vivo) |
| 6 | Panel del supervisor y superadmin: analítica, ranking de técnicos, reseñas y mapa en vivo con GPS | ✅ |
| 7 | Notificaciones push y WhatsApp, pruebas en tienda y publicación en Google Play y App Store | ⏳ |
| 8 | Tabla de precios de instalación (después de entrevistar a los técnicos) | ⏳ |

## App móvil (`mobile/`)

Hecha con Expo y React Native (TypeScript). Es una sola app para iPhone, Android y web, que muestra pantallas distintas según el rol:

- **Cliente:** sus pedidos, el rastreo en 4 fases, la foto del técnico y del ayudante cuando salen, la reprogramación y la calificación.
- **Agente en caja:** nueva orden con varios artículos, casilla «instalar» en cada uno, cobro y QR de retiro.
- **Técnico y ayudante:** acceso con huella y PIN, registro con rostro, cédula en alto y huella, guardia del día, retiro con QR, navegación, checklist con fotos, sus ayudantes e incidencias.
- **Técnico supervisor, supervisor y superadmin:** centro de control, reasignación, Guardia Retén, incidencias y expediente con alta y grupo.

```bash
cd mobile
npm install
npx expo start            # abre en el teléfono con Expo Go o en la web (tecla w)
```

La dirección del servidor sale de `AHAHOME_API_URL` (en `app.config.js`). También se cambia dentro de la app, en la pantalla de inicio → «Servidor», por ejemplo para pasar a tu servidor físico.

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

### Instalar en tu servidor físico (un solo comando)

En tu servidor (Linux o Mac, con Docker):

```bash
git clone https://github.com/magp1212-png/AHA-HOME.git && cd AHA-HOME
./instalar.sh
```

El instalador:
1. Crea la configuración con una clave secreta aleatoria.
2. Te pide el **usuario y la clave SMTP de Brevo** (los guarda solo en `datos/correo.key`).
3. Te pide el **token del túnel de Cloudflare**. Con él, `https://api.ahahome.app` funciona con HTTPS **sin abrir puertos en el router**.
4. Levanta el servidor y comprueba que responda.
5. Te pide crear el **superadministrador** real.

Al final, en Cloudflare → túnel → **Public Hostname**, agrega `api.ahahome.app` → `http://api:8000`.

- **Respaldos:** copia la carpeta `datos/`, que guarda la base de datos, las fotos y la clave de correo.
- **Mudar de máquina:** copia `datos/` y `.env` a la máquina nueva y corre `./instalar.sh` otra vez.

### Reglas que aplica el servidor (según la especificación)

- **Estados de la orden:** Solicitud enviada → Técnico asignado → Cita confirmada → Técnico en ruta → Servicio en progreso → Servicio completado. También puede quedar como cancelada.
- **Guardia:** el Grupo A está de guardia el lunes, el B el martes y el C el miércoles, y luego se repite.
- **Asignación automática:**
  1. Técnico de guardia de la misma zona, con menos órdenes y que viva más cerca.
  2. Si no hay, técnico de guardia de la zona vecina que ya terminó sus órdenes.
  3. Si no hay, la **Guardia Retén** activada por el supervisor.
  4. Si tampoco hay, se avisa al supervisor.
- **Retiro en almacén:** solo el técnico asignado y verificado puede escanear el QR. Queda registrado quién retiró, qué producto y serial, de qué sucursal y a qué hora. En ese momento el cliente recibe la ficha de seguridad del técnico.
- **Pedido con varios artículos:** todos los artículos van en el traslado. En caja, el cliente marca cuáles quiere instalar y paga esa instalación en el momento. El precio sale de la tarifa por tipo de artículo, que fija el superadmin (`PUT /admin/tarifas/{tipo}`). **La tabla de precios se define al final del proyecto**, después de entrevistar a los técnicos. Mientras tanto, la instalación queda como «precio por definir» y no se cobra en caja.
- **Tipo de servicio:** se calcula solo según lo que pide el cliente.
  - **Traslado:** ningún artículo se instala. Se entrega tal cual sale de la tienda, en su caja, sin desembalar ni retirar residuos.
  - **Traslado e instalación:** algún artículo se instala.
  - **Instalación:** el cliente ya tiene los artículos en casa y no hay retiro en almacén.
- **Cierre:** con instalación, se exigen los 4 puntos de instalación, los 5 de residuos (cajas, anime, plásticos, flejes y precintos) y 2 fotos (equipo instalado y espacio limpio). Si además hay artículos sin instalar, se confirma su entrega en empaque original con foto.
- **Cancelación de una orden ya pagada:** queda anotado «REEMBOLSO PENDIENTE» con el monto.
- **Alta del técnico:** sube foto de rostro, selfie con la cédula y su PIN. El supervisor verifica la identidad antes de que pueda recibir órdenes.

### Registro del cliente y verificación del correo

- **Registro rápido:** foto, nombre, cédula, teléfono, correo y contraseña.
- **Verificación:** llega un correo con un enlace que dura **24 horas**. Si no lo verifica a tiempo, la cuenta se **elimina del registro** (el servidor revisa cada hora) y la persona puede registrarse de nuevo.
- **Pedidos de caja:** los pedidos creados en caja con su teléfono aparecen en su cuenta solo **después de verificar** el correo.
- **Para enviar correos de verdad:**
  - Crea `backend/correo.key` en el servidor, con `{"host", "port", "user", "password", "from"}` de una cuenta SMTP (por ejemplo Brevo, como en Anunciate).
  - Define `AHAHOME_PUBLIC_URL` con la dirección pública (por ejemplo `https://api.ahahome.app`) para que el enlace funcione.
  - Sin ese archivo, los correos no se envían. Solo quedan anotados para pruebas.

### Pendientes conocidos

- **Comparación automática de rostro:** hoy la verificación la hace el supervisor viendo las fotos. Se puede conectar un servicio de reconocimiento facial más adelante.
- **WhatsApp:** los avisos van a la bandeja de la app y por push. Para WhatsApp hace falta una cuenta de WhatsApp Business API.
