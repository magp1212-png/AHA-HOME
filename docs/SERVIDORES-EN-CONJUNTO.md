# AHA HOME · Dos estaciones trabajando juntas

Esta es la configuración de AHA HOME con **dos computadoras Windows en la misma red local**. Las dos usan **una sola base de datos** y atienden la web al mismo tiempo.

## Cómo está armado

| | Estación principal | Otra estación |
|---|---|---|
| Base de datos | **PostgreSQL 16** (la guarda esta) | Usa la del principal por la red local |
| Web y panel | Sí (puerto 8096) | Sí (puerto 8096) |
| Túnel de Cloudflare `aha-home` | Sí | Sí (mismo túnel, segunda salida a internet) |
| Fotos | Dentro de la base de datos | Dentro de la base de datos |
| Respaldo diario (3:15) | `pg_dump` de la base | `pg_dump` de la base |
| Publicación automática | Rama `produccion`, cada 5 min | Rama `produccion`, cada 5 min |

- **Direcciones:** www.aha-go.com (caja), superad.aha-go.com (panel), api-home.aha-go.com (servidor).
- **Carpeta en cada estación:** `C:\Users\Administrator\APP AHA HOME`.
- **La conexión a la base de datos** queda en `ops\conjunto.cmd` de cada estación. Ese archivo **no va a GitHub** porque tiene la clave.
- **Importante:** la base de datos vive **solo en la estación principal (AHASERVER)**. Si AHASERVER se apaga o pierde la red, **ninguna de las dos puede trabajar** (no hay datos). La otra estación solo aporta una segunda salida a internet y una segunda API: sirve si se cae el internet o el programa de una, no si se apaga AHASERVER. AHASERVER debe estar siempre encendido, idealmente con UPS.
- **La llave de las sesiones** es la misma en las dos (está guardada en la base de datos): si alguien entra por una y lo atiende la otra, sigue conectado.

## Lo que hay que tener a mano (nunca en el chat)

- Llave API de Brevo **AHA HOME** (solo envío).
- Token del túnel de Cloudflare `aha-home`. Está en one.dash.cloudflare.com › Networks › Tunnels › aha-home › Configure. Empieza con `eyJ`.
- **IP de la estación principal** y **clave de conexión**. Las muestra el paso 1 al terminar.
- Clave del administrador de PostgreSQL, la que creaste en el paso 1.

## 1. Estación principal (una sola vez)

PowerShell como Administrador:

```powershell
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
cd "C:\Users\Administrator\APP AHA HOME"; git pull
powershell -ExecutionPolicy Bypass -File ops\conjunto-windows.ps1 -Rol principal
```

Qué hace:
- Instala PostgreSQL y crea la base `ahahome`.
- Deja que solo la red local se conecte.
- Pasa los datos de esta estación a la base compartida. Si lo repites, no vuelve a migrar: sigue con lo que ya hay.
- Solo dice **[OK]** si se creó `ops\conjunto.cmd` y la API responde usando PostgreSQL.
- Al final muestra **IP** y **clave de conexión**: anótalas en papel.

## 2. Otra estación, la que ya tiene AHA HOME

```powershell
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
cd "C:\Users\Administrator\APP AHA HOME"; git pull
powershell -ExecutionPolicy Bypass -File ops\conjunto-windows.ps1 -Rol segundo -Principal 192.168.X.X
```

Cambia `192.168.X.X` por la IP del principal.

Qué hace:
- Comprueba que el principal está en la **misma red local** (puerto 5432). Si no llega, se detiene.
- Muestra cuántos usuarios y órdenes tiene esta estación en su base propia. **Esos datos no pasan al principal**: quedan como respaldo en `backend\respaldos`. Si alguno es real, detente y pide que se pasen antes. Para seguir escribe `UNIR`.
- Pide la clave de conexión y une la estación.
- Solo dice **[OK]** si la API responde usando PostgreSQL.

## 3. Una estación NUEVA, desde cero (misma configuración)

1. Descarga el preparador: https://raw.githubusercontent.com/magp1212-png/AHA-HOME/produccion/ops/segunda-estacion.ps1
   (o cópialo de `ops\segunda-estacion.ps1` de la principal).
2. PowerShell como Administrador, en la carpeta donde lo guardaste:

```powershell
powershell -ExecutionPolicy Bypass -File segunda-estacion.ps1 -Principal 192.168.X.X
```

El preparador hace todo solo:
- instala Python, Node, Git y cloudflared;
- descarga AHA HOME;
- lo instala (te pide la llave de Brevo y el token del túnel);
- lo une a la base del principal (te pide la clave de conexión).

## 4. Cuenta CEO

Se crea una sola vez, en la base compartida, desde cualquier estación ya unida:

```powershell
cd "C:\Users\Administrator\APP AHA HOME\backend"; .venv\Scripts\python.exe crear_ceo.py magp@aha-go.com
```

Cuando pida la clave, presiona Enter sin escribir nada. Aparece una clave provisional: entra a superad.aha-go.com con ella y cámbiala por la tuya.

## Comprobar que todo está bien

```powershell
Get-ScheduledTask -TaskName "aha home*" | Select-Object TaskName, State
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8096/salud | Select-Object -ExpandProperty Content
Get-Content "C:\Users\Administrator\APP AHA HOME\ops\publicar.log" -Tail 5 -Encoding UTF8
Get-Content "C:\Users\Administrator\APP AHA HOME\backend\respaldos\respaldo.log" -Tail 3 -Encoding UTF8
```

- Tareas: «aha home API» y «aha home tunel» deben estar en **Running**.
- Salud: debe responder `{"ok":true,...,"base":"postgresql"}`.
- Publicación: la última línea debe decir **PUBLICADO**.
- Respaldo: la última línea debe decir **OK ... PostgreSQL compartido**.

## Si algo falla

- **La otra estación no conecta con la base:** revisa que las dos estén en la misma red y que la principal esté encendida. Prueba desde la otra estación: `Test-NetConnection 192.168.X.X -Port 5432`.
- **«git no se reconoce»:** `$env:Path = "C:\Program Files\Git\cmd;" + $env:Path`.
- **Túnel desconectado (error 1033):** revisa `ops\tunel.log` y limpia el token según `ops\cloudflared\LEEME.md`.
- **Restaurar un respaldo de PostgreSQL:** `pg_restore -h 127.0.0.1 -U ahahome -d ahahome --clean backend\respaldos\ahahome-AAAAMMDD-HHMM.dump`. Pídelo con calma: borra los datos actuales.
