# AHA HOME · Documento de traspaso entre estaciones de trabajo

> **Fecha de corte:** 27/11/2026, noche (hora de Caracas).
> **Versión en producción:** 1.0.1 · confirmación `5195d630` en la rama `produccion`.
> **Para quién es:** una estación de trabajo nueva que va a colaborar en AHA HOME.
> **Seguridad:** este documento **no** contiene claves, tokens, llaves de API, contraseñas ni datos de clientes reales. Cuando algo depende de una credencial, solo se indica su nombre y dónde se guarda. **Nunca** pegues una credencial en un chat, un commit, un PR o un documento.

---

## Índice

1. [Contexto](#1-contexto)
2. [Regla de trabajo entre estaciones](#2-regla-de-trabajo-entre-estaciones)
3. [Repositorio](#3-repositorio)
4. [Historial de cambios](#4-historial-de-cambios)
5. [Estado actual en producción](#5-estado-actual-en-producción)
6. [Arquitectura y decisiones técnicas](#6-arquitectura-y-decisiones-técnicas)
7. [Servidor AHASERVER](#7-servidor-ahaserver)
8. [Pendientes y trabajo en curso](#8-pendientes-y-trabajo-en-curso)
9. [Reglas del negocio ya definidas](#9-reglas-del-negocio-ya-definidas)
10. [Cómo correr el proyecto en local](#10-cómo-correr-el-proyecto-en-local)
11. [Convenciones](#11-convenciones)
12. [Documentos de referencia](#12-documentos-de-referencia)

---

## 1. Contexto

### Qué es AHA HOME

**AHA HOME — «Hacemos todo por ti».** Es un servicio y una app de Onyxa LLC, hermana de AHA VOY.

Cuando un cliente compra un equipo de línea blanca en **Tiendas Damasco**, AHA HOME:
1. retira la compra en el almacén de la tienda;
2. la lleva a la casa del cliente;
3. la desembala y la instala;
4. se lleva los desechos (cajas, anime, plásticos, flejes y precintos).

Hay tres tipos de servicio: **Traslado**, **Instalación**, y **Traslado e instalación**.

El sistema tiene tres partes:

| Parte | Qué es | Dónde está |
|---|---|---|
| **Servidor (API)** | Python · FastAPI · SQLAlchemy | `backend/` |
| **Panel superadministrador** | Web en JavaScript sin framework, servida por la misma API en `/panel/` | `backend/app/panel_web/` |
| **App** | Expo / React Native para iPhone, Android y web. Una sola base de código, con pantallas según el rol: cliente, caja, profesional y control | `mobile/` |

El CEO indicó que hay **dos apps en construcción**: una para profesionales y transportistas, y otra para clientes. Hoy las dos salen de la misma base `mobile/`.

**Dominios en producción:**
- **`www.aha-go.com`:** app web. Hoy en *modo equipo*: solo entra el personal.
- **`superad.aha-go.com`:** panel superadministrador.
- **`api-home.aha-go.com`:** API.

**Piloto:** tienda **Damasco San Martín** (Caracas).

### Quiénes participan

| Participante | Rol en el proyecto |
|---|---|
| **CEO de Onyxa LLC (MAGP)** · cuenta `magp@aha-go.com` | Dueño del producto. **Decide y aprueba todo**: diseño, reglas del negocio y qué se publica. No es técnico: hay que explicarle en español sencillo y mostrarle vistas previas. |
| **Estación de desarrollo en la nube** (sesión de Claude Code) | Desarrolla en la rama `claude/beautiful-mendel-gu0z47`, prepara vistas previas y enlaces de prueba, abre y fusiona los PR **solo** cuando el CEO dice «súbelo». |
| **Especialista de Sistemas** · departamento de sistemas (avisos a `diego@aha-go.com`) | Revisa el código y el servidor, y entrega **fichas SIS-xxx** con cambios propuestos (con PDF del antes y el después). Trabajó versiones locales en su propia estación. |
| **AHASERVER** | Servidor físico Windows en la oficina (dominio de red `AHAGROUP`). Es **producción**: túnel, API y base de datos. No es una estación de desarrollo. |
| **Tiendas Damasco** | Aliado comercial: el cliente compra allí y pide AHA HOME en la caja. Valida lo que afecta su operación en tienda, como el uso de la caja y la validez legal del código de cierre. |
| **Estación nueva (tú)** | Colaborador. Sigue la regla de trabajo de la sección 2. |

### Quién decide y quién aprueba qué

| Tema | Quién decide o aprueba |
|---|---|
| Diseño, pantallas, textos, reglas del negocio y precios | **CEO** |
| Publicar en producción | **Solo el CEO**, con la palabra «súbelo» (o equivalente explícito) **después** de ver la vista previa o el enlace de prueba |
| Fichas SIS-xxx (cambios del Especialista) | El Especialista propone; el **CEO** aprueba; la estación de desarrollo las implementa o fusiona |
| Permisos del personal | **CEO**, en Panel › Administración AHA HOME › Usuarios y permisos |
| Cambios en AHASERVER (tareas, red, cuentas) | El **CEO** ejecuta los comandos en el servidor; las estaciones solo le pasan los comandos |
| Operación en tienda y validez legal del acta | **Damasco** junto con el **CEO** (pendiente: ver sección 8) |

---

## 2. Regla de trabajo entre estaciones

### Quién trabaja en qué

| Estación | Trabaja en | Rama |
|---|---|---|
| Estación de desarrollo en la nube | Todo el código (API, panel, app, ops, pruebas, documentos) | `claude/beautiful-mendel-gu0z47` |
| Especialista de Sistemas | Revisión, servidor y fichas SIS; mejoras propias del superadmin | Si sube código: `sistemas/<tema>`. Por ejemplo, sus ramas locales `sistemas/mejoras-superadmin` y `sistemas/fusion-ceo`, que **nunca se subieron a GitHub**. |
| Estación nueva | Lo que el CEO le asigne | **Su propia rama**, por ejemplo `estacion2/<tema>`. **Nunca** trabajar directo en `main` ni en `produccion`. |
| AHASERVER | No se desarrolla allí. Solo **recibe** lo que llega a `produccion` | — |

### Reglas

1. **Una rama por estación y por tema.** Antes de empezar, actualiza tu rama con `main` (`git fetch origin && git merge origin/main`).
2. **Nada pasa directo a `produccion`.** El camino es siempre: rama de la estación → **PR a `main`** → **PR de `main` a `produccion`**.
3. **Antes de pedir aprobación:**
   - corre todas las pruebas: deben pasar **todas**;
   - muestra el cambio al CEO con una **vista previa** (capturas, maqueta o el enlace de prueba local en el puerto 8097);
   - explícale el antes y el después.
4. **Aprobación:**
   - el CEO responde «súbelo»;
   - sin esa palabra no se fusiona a `produccion`;
   - una aprobación vale solo para lo que se mostró: si cambias algo después, vuelve a mostrarlo.
5. **Si dos estaciones tocan el mismo módulo, se coordinan antes.** Pasó con SIS-010: Finanzas, campanita y Diseño se rehicieron aquí a partir del PDF porque el código del Especialista nunca llegó a GitHub. Avisa en qué módulo vas a trabajar.
6. **Nadie ejecuta el túnel de Cloudflare fuera de AHASERVER** (ver el incidente del 25/11 en la sección 7).
7. **Las credenciales no viajan.** Se escriben solo en la máquina que las usa, en la ventana de Windows o del instalador.

### Numeración de las fichas

| Prefijo | Quién la emite | Estado |
|---|---|---|
| `SIS-###` | Especialista de Sistemas | En uso. Se emitieron SIS-001 a SIS-008 y SIS-010. **SIS-009 no se recibió** (hay que confirmar si existe). La siguiente libre es **SIS-011**. |
| `AHA-###` | Solicitudes del CEO o de otras estaciones | **Propuesta: el CEO debe confirmarla.** Hasta hoy, las solicitudes del CEO no se numeraron; se identifican por su PR (ver sección 4). |

**Formato de una ficha** (así llegaron las SIS):
- código y título;
- problema: qué se ve o qué falla;
- corrección propuesta;
- qué más revisar;
- «Detectado por: <quién>, <fecha>, revisando <commit>»;
- PDF con el antes y el después.

### Cómo se publica a producción

1. El PR de la rama de la estación a `main` se fusiona.
2. Se abre y se fusiona un PR de `main` a `produccion` («Publicar versión X.Y.Z en producción»).
3. AHASERVER, con su tarea `aha home publicar` (cada 5 minutos):
   1. ve la nueva confirmación en `produccion`;
   2. corre **todas** las pruebas en una copia aparte del código. Se detiene en la primera que falle (`pytest -q -x`) y **no publica**;
   3. hace un **respaldo** de la base de datos;
   4. pasa el código, instala dependencias nuevas, arma la web con `expo export` y reinicia la API;
   5. si la API no responde en `/salud`, **vuelve sola a la versión anterior**.
4. Para comprobar, en AHASERVER (PowerShell):
   ```powershell
   Get-Content "C:\Users\Administrator\APP AHA HOME\ops\publicar.log" -Tail 3 -Encoding UTF8
   ```
   Debe decir `PUBLICADO <confirmación> v<versión>`. Al pie del Panel principal se ve «Versión X.Y.Z».
5. **Antes de cada publicación, sube el número** en el archivo `VERSION` y agrega la línea en `docs/VERSIONES.md`.

---

## 3. Repositorio

**URL:** <https://github.com/magp1212-png/AHA-HOME>

El nombre anterior en minúsculas (`aha-home`) redirige solo a esta dirección.

### Ramas

| Rama | Para qué sirve | Último estado conocido |
|---|---|---|
| `produccion` | **Lo que está en línea.** Cada confirmación que llega aquí la publica AHASERVER automáticamente. Solo recibe PR desde `main`. | `5195d630` · versión 1.0.1 (PR #44) |
| `main` | Integración: todo lo aprobado y probado. Desde aquí se abre el PR a `produccion`. | `d539e78f` (PR #43) |
| `claude/beautiful-mendel-gu0z47` | Trabajo de la estación de desarrollo en la nube | `4fb921c` · versión 1.0.2 lista **sin publicar**, más el informe en PDF |
| `sistemas/mejoras-superadmin`, `sistemas/fusion-ceo` | Ramas del Especialista de Sistemas | **Solo existen en su estación; no están en GitHub** |

### Qué dispara la publicación automática

**Solo** una confirmación nueva en `produccion`. Un push a `main` o a cualquier otra rama no publica nada.

Si las pruebas fallan, el servidor anota en `ops\publicar.estado` que esa confirmación fue rechazada y no la reintenta hasta que llegue una más nueva. Para forzar un reintento: `python ops/publicar.py --forzar` en AHASERVER.

### PR recientes (todos cerrados y fusionados; hoy no hay PR abiertos)

| PR | Fecha | De → a | Qué llevó |
|---|---|---|---|
| #44 | 27/11 12:49 | `main` → `produccion` | **Publicación de la 1.0.1** (con la prueba corregida) |
| #43 | 27/11 12:49 | rama → `main` | Corrige la prueba del Departamento de sistemas en Windows |
| #42 | 27/11 12:32 | `main` → `produccion` | Primer intento de la 1.0.1: **AHASERVER no la publicó** porque falló una prueba |
| #41 | 27/11 12:32 | rama → `main` | Versión 1.0.1 completa |
| #40 | 26/11 14:14 | `main` → `produccion` | «Superadmin igual al catálogo de pantallas»: publicó `ae6ead0` |
| #39 | 26/11 14:14 | rama → `main` | Finanzas de 9 pestañas, QR con nombre, Historial de actividad, edición de cuentas; incluye las fichas SIS-001 a SIS-008 y SIS-010 |
| #37 y #38 | 25/11 | rama → `main` → `produccion` | Ventas cuenta los servicios completados |
| #35 y #36 | 25/11 | rama → `main` → `produccion` | `crear_ceo` con base compartida |
| #33 y #34 | 25/11 | rama → `main` → `produccion` | Modo prueba del panel (`127.0.0.1:8097`) |
| #1 a #32 | 23 al 25/11 | — | Construcción inicial, instalador de Windows, túnel, correo, superadmin, finanzas, diseño y ventas |

---

## 4. Historial de cambios

**Estados:** `propuesta` · `en desarrollo` · `probada en local` · `publicada`.

### Fichas del Especialista de Sistemas

| Código | Descripción | Estado | Publicada en |
|---|---|---|---|
| SIS-001 | **Campanita:** panel sin salir de la pantalla, Nuevas/Leídas, «Marcar todas como leídas», pendientes por atender | publicada (ya existía; se verificó) | `ae6ead0` (PR #39/#40, 26/11) |
| SIS-002 | **Menú del usuario:** iniciales, nombre y flecha en una línea; nombre largo recortado con el completo al pasar el cursor; se cierra al tocar fuera | publicada | `ae6ead0` |
| SIS-003 | **Módulos cerrados:** grupos del menú cerrados con su número de pendientes; lo abierto se recuerda al recargar | publicada | `ae6ead0` |
| SIS-004 | **QR:** el nombre de un QR eliminado queda reservado y no se repite | publicada | `ae6ead0` |
| SIS-005 | **Finanzas:** el reembolso de una orden cancelada se calcula solo sobre el servicio, sin la inspección | publicada | `ae6ead0` |
| SIS-006 | **Historial de actividad:** ingresos, salidas, intentos fallidos, pantallas, cambios y descargas, con sesiones, filtros y Excel; solo lo ve el CEO | publicada (ya existía; se verificó) | `ae6ead0` |
| SIS-007 | **Dimensiones:** todo cabe al 100 % en 1366 × 768; más filas en las tablas | publicada | `ae6ead0` |
| SIS-008 | **Listas desplegables** con el estilo del panel, en tema claro y oscuro, con ✓ en la opción elegida | publicada | `ae6ead0` |
| SIS-009 | — | **no recibida** | — |
| SIS-010 | **Fusión Diseño, Finanzas y Ventas** con reglas de dinero y campanita | publicada (**reconstruida aquí a partir del PDF**; el código original del Especialista no está en GitHub) | `ae6ead0` |
| (sin código) | Revisión de `ops/conjunto-windows.ps1`, «Detectado por: Especialista de Sistemas, 25/11/2026, revisando 6f70334»: variable `$Conf`/`$conf`, migración repetida, comprobación final, misma red, guía | corregida y publicada, **pero sin uso**: el 26/11 el CEO descartó unir las estaciones | PR #29 a #38 (25/11) |

### Solicitudes del CEO (sin código; se identifican por PR y versión)

| Mejora | Estado | Publicada en |
|---|---|---|
| Flechas del menú alineadas (SVG en lugar del carácter «⌄») | publicada | 1.0.1 (`5195d630`) |
| Sección **Administración AHA HOME** unificada (antes había dos secciones) | publicada | 1.0.1 |
| Tarjeta «Quién está dentro» (Auditoría) sin animación | publicada | 1.0.1 |
| **Departamento de sistemas:** estado de la app y del servidor, procesos de AHASERVER, errores agrupados, accesos y cierre de sesión a distancia, publicaciones, actividad y avisos por correo | publicada | 1.0.1 |
| **Conductores** y **Técnicos instaladores**: perfil único **Conductor / Técnico instalador / Mixto**, módulos separados, perfil editable con historial, PIN nuevo y reescaneo | publicada | 1.0.1 |
| **Códigos únicos de 6 dígitos:** PRO, TRA, TEC, AYU, CLI, VER, DOC, FOR | publicada | 1.0.1 |
| **Documentos obligatorios** por tipo de perfil y **avisos de vencimiento** (30 días antes y el día que vence) | publicada | 1.0.1 |
| **Títulos y cursos** del profesional (app y panel) | publicada | 1.0.1 |
| **Ayudantes sin acceso a la app**: los agrega y quita su profesional o la oficina, con cláusula de responsabilidad; pueden registrarse aparte como profesionales | publicada | 1.0.1 |
| **Perfil del cliente** en el panel, con historial de cambios | publicada | 1.0.1 |
| **Mensajería en vivo** cliente ↔ profesional: soporte monitorea (con aviso en el chat y en la app) e interviene | publicada | 1.0.1 |
| Permisos nuevos «Editar perfiles…» y «Editar datos de clientes» | publicada | 1.0.1 |
| **Control de versiones:** archivo `VERSION`, versión al pie del Panel principal, versión anotada en cada publicación | publicada | 1.0.1 |
| Instalador del servidor: tareas con la cuenta de administrador, no como SYSTEM | publicada (en el código; en AHASERVER ya se aplicó a mano el 26/11) | 1.0.1 |
| Tarjeta de dispositivos: «Todavía no hay teléfonos registrados para recibir avisos» | publicada | 1.0.1 |
| Pestaña «Mensajes directos con soporte» que no respondía al clic | **probada en local, sin publicar** | 1.0.2 (`3e4df51`, rama `claude/…`) |

### Versiones

| Versión | Fecha | Confirmación en `produccion` |
|---|---|---|
| (sin número; internamente 0.1.0) | 26/11/2026 | `ae6ead0` |
| **1.0.1** | 27/11/2026 | `5195d630` |
| 1.0.2 | pendiente de aprobación | — |

El detalle de cada versión está en `docs/VERSIONES.md`. El informe del antes y el después de la 1.0.1, con capturas, está en `docs/AHA-HOME-Version-1.0.1-Informe.pdf`.

---

## 5. Estado actual en producción

**Versión 1.0.1** · confirmación `5195d630` · publicada el 27/11/2026, alrededor de las 12:55. Pasó 64 de 64 pruebas y se hizo un respaldo antes de publicar.

### Qué incluye

- Todo lo de la sección 4 marcado como publicado.
- Panel completo:
  - Panel principal y Clientes (con perfil);
  - Empresas aliadas;
  - **Conductores** y **Técnicos instaladores**, cada uno con sus verificaciones;
  - Órdenes;
  - Centro de soporte: Mensajería en vivo, Reportes y Reseñas;
  - Banners y aliados;
  - Departamento de ventas;
  - Finanzas: 9 pestañas, Transacciones y Liquidaciones;
  - Tasa BCV, Tabulación de precios, QR de las tiendas y Diseño de la app;
  - Administración AHA HOME: Personal interno, Departamento de sistemas, Usuarios y permisos, Correos corporativos, Auditoría e Historial de actividad.
- App web en `www.aha-go.com`, armada por el publicador.
- **Modo equipo activo** (`solo_equipo: true`): solo entran caja, centro de control, superadmin, CEO, ventas y sistemas. Clientes y profesionales todavía no pueden entrar.

### Qué no incluye

- **1.0.2**: la corrección de la pestaña «Mensajes directos con soporte» está lista pero sin publicar.
- **Apps en las tiendas** (Google Play y App Store): todavía no se compilan ni se publican con la 1.0.1.
- **Base compartida PostgreSQL / dos servidores:** el código existe, pero **no se usa** (decisión del 26/11).
- **Respaldo fuera del servidor (Cloudflare R2):** sin configurar. Falta el archivo `ops\r2.json`; el respaldo diario solo queda en AHASERVER.
- **Apertura a clientes y profesionales:** el modo equipo sigue activo.

---

## 6. Arquitectura y decisiones técnicas

| Decisión | Motivo |
|---|---|
| **Python + FastAPI + SQLAlchemy 2**, una sola API que también sirve el panel (`/panel/`) y la web (`mobile/dist-web`) | Un solo proceso que mantener en el servidor Windows. Es la misma forma de trabajo que la app hermana **anunciate**, que corre en el mismo equipo. |
| **SQLite** (modo WAL) en AHASERVER, y **no** PostgreSQL | Hay un solo servidor. El 26/11 el CEO descartó unir las dos estaciones con una base compartida. El modo PostgreSQL (`ops/conjunto-windows.ps1`, `ops/conjunto.py`, `migrar_a_postgres.py`, `ops/conjunto.cmd`) quedó en el código, probado en Linux, **sin activar**. Cambiar de base es solo una variable: `AHAHOME_DATABASE_URL`. |
| **Fotos en disco** (`backend/uploads`) con SQLite; en la base de datos solo si se usa PostgreSQL (`AHAHOME_FOTOS_EN_BD`) | Con un servidor, el disco basta y pesa menos. Con varios servidores, todos tendrían que ver las mismas fotos. |
| **Modo equipo** (`backend/.solo-equipo` o `AHAHOME_SOLO_EQUIPO=1`) | Probar con el personal antes de abrir a clientes y profesionales. **Para abrir:** borrar `backend\.solo-equipo` y reiniciar la tarea `aha home API`. Lo decide el CEO. |
| **Túnel de Cloudflare** con nombre («aha-home») hacia `127.0.0.1:8096` | HTTPS sin abrir puertos del router. **Solo un equipo puede tener el túnel encendido** (ver el incidente del 25/11). |
| **Publicación automática con pruebas, respaldo y vuelta atrás** (`ops/publicar.py`) | El CEO no es técnico: publicar debe ser seguro y no requerir manos en el servidor. |
| **Tareas con la cuenta de administrador, no como SYSTEM** | Como SYSTEM, Windows bloqueó el puerto de la API (WinError 10013, la web daba 502) y git no podía actualizar (26/11). |
| **Fusión con AHA HOGAR** (v1 y v2) | Se tomaron de AHA HOGAR: aprobar la orden (3 puntos), acta de conformidad, fichas de producto, historial con buscador y **código de cierre** (vale 30 minutos y se puede pedir otro cada 60 segundos). Se mantuvo la regla de AHA HOME de reprogramar **hasta 3 horas antes**; AHA HOGAR usa 24 horas. |
| **Un solo perfil por profesional** con actividades `conduce`/`instala` | El CEO pidió no crear un tercer tipo de perfil: el mixto es quien tiene las dos actividades. |
| **Ayudantes sin cuenta de app**: sus teléfono y correo son solo de contacto | Son parte del equipo del profesional, bajo su responsabilidad. Si quieren trabajar solos, se registran aparte como profesionales. |
| **Códigos únicos de 6 dígitos** derivados del número interno | No cambian ni se reutilizan, alcanzan para muchos registros y se pueden buscar. |
| **Sesiones con JWT** (30 días) y cierre a distancia (`sesiones_desde`) | El Departamento de sistemas puede cerrar la sesión de alguien sin cambiarle la clave. |
| **Precios guardados en USD**; los bolívares se calculan con la tasa BCV del día, y **cada cobro guarda su tasa** | Los cobros anteriores no cambian cuando cambia la tasa. |
| **Versión en el archivo `VERSION`** | Un solo lugar para saber qué versión se está trabajando y cuál está en línea (`/salud` y el pie del panel). |

---

## 7. Servidor AHASERVER

### Datos generales

| Dato | Valor |
|---|---|
| Sistema | Windows, dominio de red `AHAGROUP` |
| Carpeta de AHA HOME | `C:\Users\Administrator\APP AHA HOME` |
| Python | `backend\.venv\Scripts\python.exe` |
| Git | `C:\Program Files\Git\cmd\git.exe` (no siempre está en el PATH) |
| Puerto de la API | **8096**, solo local (`127.0.0.1`); se entra por el túnel |
| Puerto de la copia de prueba | **8097** (`ops\prueba-local.cmd`, base aparte en `backend\prueba\`) |
| Otro servicio en el equipo | **anunciate** (app hermana), en `C:\Users\Administrator\APP ANUNCIATE`, puerto **8095**, con sus propias tareas. **No tocarlo.** |

### Tareas programadas

| Tarea | Cuándo | Qué hace | Cuenta |
|---|---|---|---|
| `aha home API` | Al iniciar Windows | `ops\servidor-ahahome.cmd`: levanta uvicorn en 8096 y lo reinicia a los 5 s si se cae | Administrador (`AHAGROUP\Administrador`) |
| `aha home tunel` | Al iniciar Windows | `ops\tunel-ahahome.cmd`: túnel de Cloudflare | SYSTEM |
| `aha home publicar` | Cada 5 minutos | `ops\publicar.py` (ver sección 2) | Administrador |
| `aha home respaldo` | Diario, 3:15 | `ops\respaldo.py`: copia verificada de la base y 30 días de historial. Copia en R2 **solo si existe** `ops\r2.json` | Administrador |

Los comentarios dentro de `servidor-ahahome.cmd` y `tunel-ahahome.cmd` todavía dicen «SYSTEM» para la API. Eso es texto viejo; la cuenta real es la de la tabla.

### Registros (logs)

- `backend\logs\api.log`: la API.
- `backend\logs\arranques.log`: cada arranque de la API.
- `ops\publicar.log`: publicaciones.
- `ops\tunel.log`: el túnel.
- `backend\respaldos\respaldo.log`: respaldos.

### Credenciales: solo su nombre y dónde viven

Ninguna está en Git (ver `.gitignore`). **No copiarlas nunca.**

| Credencial | Archivo en AHASERVER |
|---|---|
| Llave para firmar sesiones | `backend\.secreto-jwt.txt` |
| Llave de Brevo (envío de correos desde `no-responder@aha-go.com`) | `backend\correo.key` |
| Token del túnel de Cloudflare | `ops\cloudflared\token.txt` |
| Configuración del túnel con nombre | `ops\cloudflared\config.yml` |
| Respaldo en Cloudflare R2 | `ops\r2.json` (**no existe todavía**) |
| Base compartida (si algún día se usa) | `ops\conjunto.cmd` |
| Base de datos de producción | `backend\ahahome.db` |
| Clave de la cuenta de administrador de Windows | No se guarda en archivos: se escribe en la ventana de Windows al crear las tareas |

### Comprobación rápida (PowerShell en AHASERVER)

```powershell
Get-ScheduledTask -TaskName "aha home*" | Select-Object TaskName, State, @{n="Cuenta";e={$_.Principal.UserId}}
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8096/salud | Select-Object -ExpandProperty Content
Get-Content "C:\Users\Administrator\APP AHA HOME\ops\publicar.log" -Tail 3 -Encoding UTF8
```

### Incidentes recientes

| Fecha | Qué pasó | Causa | Cómo se resolvió |
|---|---|---|---|
| **25/11** | El CEO no podía entrar con su cuenta y los datos «aparecían y desaparecían» | **Dos equipos tenían encendido el mismo túnel** («aha-home», mismo token). Cloudflare repartía a la gente entre los dos, y cada uno tenía su propia base de datos. | Se preparó la unión con PostgreSQL (`conjunto-windows.ps1`, revisado por el Especialista), pero el 26/11 el CEO **descartó unir las estaciones**. Decisión vigente: **túnel, API y base solo en AHASERVER**. ⚠️ Pendiente confirmar que la otra estación tenga la tarea del túnel **deshabilitada**: en Cloudflare › Networks › Tunnels › aha-home debe aparecer **un solo conector**. |
| **26/11** (desde 12:12) | `superad.aha-go.com` daba **502** y el publicador no llegaba a GitHub | Las tareas corrían como **SYSTEM**: Windows bloqueó el puerto de la API (`WinError 10013`) y la conexión de git | Se levantó la API a mano y se pasaron las tareas de API, publicación y respaldo a la cuenta de administrador. A las 14:29 se publicó `ae6ead0` (55 de 55 pruebas). El instalador ya crea las tareas así (1.0.1). |
| **27/11** 11:12 | El publicador registró «Could not connect to github.com» | Corte de red momentáneo del servidor | Se recuperó solo en la vuelta siguiente; no hizo falta hacer nada. |
| **27/11** 12:32 | La 1.0.1 **no se publicó** («1 failed, 55 passed») | La prueba `test_departamento_de_sistemas` suponía un equipo **sin** Windows (sin tareas programadas) | Se corrigió la prueba (PR #43 y #44). A las 12:52 el servidor tomó `5195d630` y publicó la 1.0.1. La web nunca dejó de funcionar. |
| **27/11** | En una captura del servidor quedaron visibles claves de **dos cuentas de ahavoy.com / Odoo** (otro sistema), pegadas por error en PowerShell | Error al pegar | Se recomendó al CEO **cambiar esas claves** y borrar el historial de PowerShell. **Pendiente de confirmar.** |

---

## 8. Pendientes y trabajo en curso

| # | Pendiente | Rama o lugar | Qué falta | Responsable |
|---|---|---|---|---|
| 1 | **Versión 1.0.2:** la pestaña «Mensajes directos con soporte» no responde al clic | `claude/beautiful-mendel-gu0z47` (`3e4df51`) | «súbelo» del CEO, luego PR a `main` y a `produccion` | CEO aprueba · estación de desarrollo publica |
| 2 | Crear la cuenta de **Diego** con el rol **Sistemas** | Panel › Usuarios y permisos | Crearla | CEO |
| 3 | Revisar el **tipo de perfil** de los profesionales existentes: la migración los dejó como **Mixto** | Panel › Conductores / Técnicos instaladores | Corregir los que solo conducen o solo instalan | Soporte / CEO |
| 4 | Completar los **expedientes** con los documentos obligatorios | Perfil de cada profesional | Cargar los documentos y sus vencimientos | Oficina / soporte |
| 5 | Confirmar que **solo AHASERVER** tiene el túnel | Cloudflare y la otra estación | Ver un solo conector y deshabilitar la tarea `aha home tunel` en la otra estación | Especialista de Sistemas |
| 6 | **Respaldo fuera del servidor** (R2) | AHASERVER, `ops\r2.json` | Crear las credenciales de R2 y el archivo (no en Git) | Especialista / CEO |
| 7 | **Código original de SIS-010** del Especialista (ramas `sistemas/…` locales) | Estación del Especialista | Decidir si se descarta o se compara con lo publicado. **No subirlo encima sin revisarlo**, porque toca los mismos módulos | CEO decide · Especialista |
| 8 | Cambiar las claves de las **dos cuentas de ahavoy.com / Odoo** expuestas y borrar el historial de PowerShell | Odoo / AHASERVER | Hacerlo y confirmarlo | CEO |
| 9 | **Teléfono del centro de control** (variable `AHAHOME_TELEFONO_CONTROL`) | Configuración de AHASERVER | El CEO define el número | CEO |
| 10 | Decidir si la **caja cobra el traslado** | Reglas del negocio | Decisión | CEO |
| 11 | **Tabla de precios definitiva** (traslado, instalación, combo por artículo) | Panel › Tabulación de precios | Definirla con los técnicos | CEO / operaciones |
| 12 | **Compilar las apps** con los cambios de la 1.0.1 y publicarlas en las cuentas de Onyxa en Apple y Google (Fase 4). Separar la app de clientes y la de profesionales | `mobile/`, cuentas de expo.dev y de las tiendas | Cuentas, compilación y revisión de las tiendas | CEO (cuentas) · estación de desarrollo |
| 13 | **Validación legal** del código de cierre como conformidad | — | Consultar con el abogado y con Damasco | CEO y Damasco |
| 14 | **Piloto en Damasco San Martín** (Fase 5) y **apertura del modo equipo** | AHASERVER | Fecha y entrenamiento de la caja | CEO |
| 15 | Volver a grabar los **videos** de demostración | — | — | Estación de desarrollo, cuando el CEO lo pida |
| 16 | Actualizar los comentarios viejos («SYSTEM») de `ops\servidor-ahahome.cmd` y `ops\tunel-ahahome.cmd` | Código | Cambio menor, en la próxima versión | Estación de desarrollo |

**Ramas a medias:** fuera de la 1.0.2, ninguna. No hay PR abiertos.

---

## 9. Reglas del negocio ya definidas

### Servicio y órdenes

- **Estados de la orden:**
  - normales: Solicitud enviada → Técnico asignado → Cita confirmada → Técnico en ruta → Servicio en progreso → Servicio completado;
  - también puede quedar *cancelada* o *entrega fallida*.
- **Una orden puede llevar varios artículos.** Todos van en el traslado. En la caja, el cliente marca cuáles se instalan.
- **Tipo de servicio:** se calcula solo según lo que pida el cliente (Traslado, Instalación, o Traslado e instalación).
- **Guardias:**
  - Grupo **A** el lunes, **B** el martes, **C** el miércoles, y se repite (jueves A…);
  - más la **Guardia Retén**, que activa el centro de control.
- **Asignación automática:**
  1. técnico de guardia de la misma zona, con menos órdenes y más cerca;
  2. si no hay, de la zona vecina;
  3. si no hay, la Guardia Retén;
  4. si tampoco hay, se avisa al supervisor.
- **Retiro en almacén:** solo el profesional asignado y verificado puede escanear el QR. Queda registro de quién retiró, qué producto y serial, de qué tienda y a qué hora.
- **Cierre:**
  - el cliente aprueba la orden (3 puntos) y firma el acta de conformidad;
  - el **código de cierre** vale **30 minutos** y se puede pedir otro cada 60 segundos.
- **Conservar la caja 30 días:** el retiro de residuos es opcional. Si el cliente prefiere quedarse con la caja y el empaque (por ejemplo, por la garantía del fabricante), el acta dice «acepto conservar la caja 30 días», no se retiran residuos y la app le recuerda conservarla 30 días.
- **Reprogramar:** sin costo hasta **3 horas antes** del inicio de la franja y antes del retiro (`AHAHOME_REPROGRAMAR_HORAS`).
- **Pausa por inspección:** si dura más de **48 horas** (`AHAHOME_PAUSA_INSPECCION_HORAS`), se avisa al control.
- **Verificación de correo del cliente:** **24 horas**. Si no verifica, el registro vence.

### Precios y dinero

- **Tabulación de precios por artículo** (la fija el superadmin con el permiso «precios»), en tres valores:
  - traslado;
  - instalación;
  - **traslado + instalación**: si se deja vacío, es la suma de los dos.
- Lo que no tiene precio queda **«por definir»** y no se cobra. La caja ve los cambios en unos 30 segundos.
- **Inspección del técnico:** precio único, por defecto **USD 10** (`AHAHOME_INSPECCION_USD`); se cambia en la tabulación.
- **Moneda:** precios en **USD**; los bolívares salen con la **tasa BCV del día** (la carga quien tiene el permiso «tasa»). Cada cobro guarda la tasa de ese momento.
- **Presupuestos de materiales:**
  - el profesional lo envía;
  - el cliente lo acepta y el superadmin lo aprueba;
  - el cliente paga;
  - se confirma el pago;
  - AHA HOME le paga los materiales al profesional;
  - queda listo para instalar.
- **Penalidad por entrega fallida:** si la cuadrilla ya retiró y salió pero no pudo entregar (el cliente no estaba o no recibió), se cobra **el servicio completo** como penalidad. Pagada o exonerada por el control, se puede reprogramar.
- **Reembolso de una orden cancelada:** solo sobre el servicio, **sin la inspección** (SIS-005).
- **Propina:** una sola vez por servicio, al cerrarlo.
- **Reclamos de dinero:** abierto → en revisión → reembolsado o rechazado. Uno reembolsado no se reabre ni se paga de nuevo.

### Profesionales y ayudantes

- **Tipo de perfil:** Conductor (código TRA), Técnico instalador (TEC) o **Mixto** (PRO). Un solo perfil; el mixto aparece en los dos módulos.
- **Requisitos para el alta:**
  - **todo profesional:** foto de perfil, cédula, foto con la cédula y **verificación facial biométrica** (desde la app);
  - **conductor y mixto, además:** certificado médico, carnet de circulación, licencia de conducir, RCV y ROTC del INTT, **vigentes**.
- **Avisos de vencimiento:** 30 días antes y el día que vence, al profesional y a soporte. Los documentos de un ayudante avisan a su profesional.
- **Ayudantes:**
  - **sin acceso a la app**;
  - los agrega y quita su profesional (aceptando la **cláusula de responsabilidad**) o la oficina;
  - datos: nombre completo, teléfono, correo y foto de perfil; la cédula es opcional;
  - pueden registrarse **aparte** como profesionales independientes.

### Roles

| Rol | Quién es |
|---|---|
| `cliente` | Compra en Damasco y sigue su servicio |
| `agente` | Operador de caja en la tienda |
| `tecnico` | Profesional: conductor, técnico instalador o mixto |
| `ayudante` | Parte del equipo de un profesional; sin acceso a la app |
| `tecnico_supervisor` | Jefe técnico de la tienda |
| `supervisor` | **Centro de control, que también es el soporte** |
| `superadmin` | Seguimiento completo. Con `es_ceo`, además: Usuarios y permisos, Correos corporativos, Auditoría e Historial |
| `ventas` | Departamento de ventas |
| `sistemas` | Departamento de sistemas: solo su módulo, salvo lo que el CEO le habilite |

### Permisos

El CEO los activa o desactiva por persona en Usuarios y permisos. Cada rol trae los suyos por defecto.

- **Ver:** tablero, clientes, empresas, técnicos, órdenes, finanzas, soporte, personal y ventas.
- **Editar:**
  - tasa, precios, QR de tiendas, banners;
  - aprobar presupuestos, pagar materiales;
  - altas de técnicos, activar cuentas;
  - finanzas, diseño;
  - **editar perfiles de técnicos, transportistas y ayudantes**;
  - **editar datos de clientes**.
- **Por defecto:**
  - superadmin y CEO: todos;
  - supervisor (soporte): todos los «Ver», más altas, editar profesionales y editar clientes;
  - técnico supervisor: técnicos, órdenes y altas;
  - ventas: solo ventas;
  - sistemas: ninguno, solo su módulo.
- **Activar o desactivar cuentas:** solo superadmin con el permiso, o el CEO.

---

## 10. Cómo correr el proyecto en local

### Requisitos

- **Python 3.12 o más nuevo** (se prueba con 3.13).
- **Node.js 20 o más nuevo** (se prueba con 22) y npm.
- Git.
- Opcional: Docker (instalación en Linux o Mac con `instalar.sh`).

### API y panel

```bash
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed.py                                    # datos de demostración (tienda piloto, profesionales, personal)
uvicorn app.main:app --reload --port 8000
```

- **API y documentación:** <http://127.0.0.1:8000/docs>
- **Panel:** <http://127.0.0.1:8000/panel/>
- **Usuarios de demostración:** los crea `seed.py`. La clave de prueba está en la constante `CLAVE` de ese archivo. Son datos inventados, no de clientes reales.
- **Comparar rostros** (opcional): `python descargar_modelos.py` descarga los modelos a `backend/modelos/`.

### Copia de prueba igual a la del servidor (puerto 8097, base aparte)

```bash
python ops/prueba_local.py secreto     # llave de sesión propia de la prueba
python ops/prueba_local.py             # datos de prueba en backend/prueba/
AHAHOME_DATABASE_URL=sqlite:///$PWD/backend/prueba/prueba.db AHAHOME_EMAIL=0 AHAHOME_PUSH=0 \
  AHAHOME_JWT_SECRET="$(cat backend/prueba/secreto.txt)" AHAHOME_MONITOR=0 \
  uvicorn app.main:app --app-dir backend --port 8097
```

En Windows: `ops\prueba-local.cmd`. Abre <http://127.0.0.1:8097/panel/>.

### App (Expo)

```bash
cd mobile
npm install
npx expo start                           # Expo Go en el teléfono o la web (tecla w)
npx expo export --platform web --output-dir dist-web   # la web que sirve la API
npx tsc --noEmit -p .                    # revisar tipos
```

La dirección del servidor sale de `AHAHOME_API_URL` (`app.config.js`); también se cambia dentro de la app. Las compilaciones para las tiendas apuntan a `https://api-home.aha-go.com` (`eas.json`).

### Pruebas

```bash
cd backend
python -m pytest -q         # hoy: 64 pruebas, todas deben pasar
python -m pytest -q -x      # como las corre el publicador (se detiene en la primera que falla)
```

- Las pruebas corren también en **Windows** (en AHASERVER). No supongas el sistema operativo: si algo depende de él, usa `sys.platform`.
- El vigilante del Departamento de sistemas se apaga con `AHAHOME_MONITOR=0`.

### Variables de entorno útiles (sin secretos)

| Variable | Para qué |
|---|---|
| `AHAHOME_DATABASE_URL` | Base de datos |
| `AHAHOME_SOLO_EQUIPO` | Modo equipo |
| `AHAHOME_EMAIL`, `AHAHOME_PUSH` | Apagar el envío de correos y de notificaciones push en pruebas |
| `AHAHOME_MONITOR` | Apagar el vigilante del Departamento de sistemas |
| `AHAHOME_PUBLIC_URL`, `AHAHOME_PANEL_URL` | Direcciones públicas |
| `AHAHOME_REPROGRAMAR_HORAS`, `AHAHOME_PAUSA_INSPECCION_HORAS`, `AHAHOME_CIERRE_MINUTOS`, `AHAHOME_INSPECCION_USD` | Reglas configurables |
| `AHAHOME_TELEFONO_CONTROL` | Teléfono del centro de control |
| `AHAHOME_CEO_EMAILS` | Cuentas CEO |

---

## 11. Convenciones

### Idioma

- **Textos para el usuario, nombres de variables y funciones, comentarios y documentos:** en **español** (Venezuela).
  - Ejemplos de nombres: `profesional`, `crear_ayudante`, `estado_documento`.
  - Hay algunos docstrings en inglés en `ops/` y en partes viejas; lo nuevo, en español.
- **Con el CEO:** español sencillo, sin tecnicismos. Explica qué cambia para él y para el usuario, no cómo está hecho.

### Estilo de los textos de la app y del panel

- Español de Venezuela. Las comillas son «latinas».
- La fecha se escribe `27/11/2026`, el dinero `USD 10` o `$10,00`, y los bolívares `Bs 250,00`.
- **Botones:** verbos claros («Guardar cambios», «Agregar al equipo»).
- **Mensajes de error:** dicen qué hacer («Escribe un correo válido»).

### Código

- **Python:**
  - FastAPI y SQLAlchemy 2 (`Mapped`, `mapped_column`);
  - un router por módulo en `backend/app/routers/`;
  - cada acción del panel verifica su permiso con `exigir_permiso`;
  - las columnas nuevas llevan valor por defecto, porque `agregar_columnas_nuevas` las crea solas al arrancar (sin migraciones aparte).
- **Panel:**
  - JavaScript sin framework en `panel.js`, con estilos en `ios.css` y `panel.css`;
  - colores: azul marino `#21244D` y verde lima `#CFD72A`; tema claro y oscuro;
  - todo debe caber en 1366 × 768 al 100 %.
- **App:** TypeScript con los componentes de `mobile/src/ui.tsx`.
- **Pruebas:**
  - cada cambio trae o ajusta su prueba en `backend/tests/test_flujo.py`;
  - nunca se salta ni se desactiva una prueba para poder publicar.

### Mensajes de commit

- **Título** en español, que diga qué cambia para el usuario. Por ejemplo: «Mensajería: chats cliente ↔ profesional en vivo con monitoreo e intervención de soporte».
- **Cuerpo opcional**, con guiones por cada cambio.
- **No incluir** claves, datos de clientes reales ni nombres de modelos de IA.
- Las estaciones que usan un asistente agregan sus líneas de coautoría al final del mensaje.

### Pull requests

- **Título:** qué se publica. Si es versión: «Versión X.Y.Z: …».
- **Cuerpo:** lista de cambios por módulo y el resultado de las pruebas («64 de 64 correctas»).
- **Los de publicación** (`main` → `produccion`) se llaman «Publicar versión X.Y.Z en producción».

### Versiones

- **El último número**, para mejoras y arreglos (1.0.1 → 1.0.2). **El del medio**, para módulos grandes (1.0.x → 1.1.0).
- **Antes de publicar:** subir el número en `VERSION` y agregar la fila en `docs/VERSIONES.md`.

### Documentos

- **Guías y traspasos:** Markdown en `docs/`, con pasos numerados y comandos en bloques de código listos para copiar (PowerShell para AHASERVER).
- **Informes para el CEO:** PDF en `docs/`, con capturas reales del antes y el después.

---

## 12. Documentos de referencia

| Documento | Contenido |
|---|---|
| `README.md` | Resumen del proyecto, reglas principales y cómo instalar |
| `docs/VERSIONES.md` | Historial de versiones |
| `docs/AHA-HOME-Version-1.0.1-Informe.pdf` | Informe del antes y el después de la 1.0.1, con capturas |
| `docs/INSTALAR-SERVIDOR-WINDOWS.md` | Instalación y día a día de AHASERVER |
| `docs/SERVIDORES-EN-CONJUNTO.md` | Modo de dos servidores con PostgreSQL (**no se usa**; solo referencia) |
| `docs/PUBLICAR-EN-TIENDAS.md` | Compilar y publicar las apps |
| `docs/Especificaciones-Tecnicas-y-Flujo-Operativo.pdf` | Especificación original del servicio |
| `docs/AHA-HOME-Modelo-de-negocio-y-recorrido.pdf`, `docs/AHA-HOME-Informe-completo.pdf`, `docs/AHA-HOME-Superadmin-Diseno-Finanzas-Ventas.pdf` | Informes anteriores |
| `docs/fusion-aha-hogar/` | Material de la fusión con AHA HOGAR |
