# Instalar AHA HOME en el servidor Windows

Guía probada en el servidor físico de AHA HOME, en noviembre de 2026. Todo se hace en **PowerShell como Administrador**: clic derecho → *Ejecutar como administrador*. Copia **un bloque a la vez**.

## 1. Programas necesarios

**Descargas seguras** (necesario en Windows Server):
```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'
```
**Python 3.12:**
```powershell
Invoke-WebRequest https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe -OutFile $env:TEMP\python.exe -UseBasicParsing; Start-Process $env:TEMP\python.exe -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1 Include_launcher=1' -Wait
```
**Node.js:**
```powershell
Invoke-WebRequest https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi -OutFile $env:TEMP\node.msi -UseBasicParsing; Start-Process msiexec -ArgumentList "/i $env:TEMP\node.msi /qn" -Wait
```
**Git:**
```powershell
Invoke-WebRequest https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/Git-2.47.1-64-bit.exe -OutFile $env:TEMP\git.exe -UseBasicParsing; Start-Process $env:TEMP\git.exe -ArgumentList '/VERYSILENT /NORESTART' -Wait
```
**cloudflared:**
```powershell
Invoke-WebRequest https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi -OutFile $env:TEMP\cloudflared.msi -UseBasicParsing; Start-Process msiexec -ArgumentList "/i $env:TEMP\cloudflared.msi /qn" -Wait
```
**Cierra PowerShell y ábrela otra vez como Administrador.** Para comprobar que todo quedó instalado:
```powershell
py -3.12 --version; node --version; git --version; cloudflared --version
```
Deben salir 4 versiones.

## 2. Descargar AHA HOME
```powershell
git clone -b produccion https://github.com/magp1212-png/AHA-HOME.git "C:\Users\Administrator\APP AHA HOME"
```

## 3. Túnel de Cloudflare (en el navegador)
1. Entra a **one.dash.cloudflare.com** y ve a **Networks** → **Tunnels** → **Create a tunnel** → **Cloudflared**.
2. Ponle de nombre `aha-home` y presiona **Save tunnel**.
3. Copia **solo el token**: el texto que empieza con `eyJ`. No copies `cloudflared.exe service install`.
4. Agrega 3 *Public hostnames* con **HTTP** · `127.0.0.1:8096`: `superad`, `www` y `api-home`, todos en `aha-go.com`.

## 4. Instalador
```powershell
cd "C:\Users\Administrator\APP AHA HOME"
```
```powershell
powershell -ExecutionPolicy Bypass -File ops\instalar-windows.ps1
```
Te va a pedir:
- **La llave API de Brevo** (la llave «AHA HOME», de solo envío).
- **El token del túnel.** Pégalo con clic derecho y luego presiona Enter. No se ve mientras lo pegas.
- **Tu nombre.**
- **La clave del CEO.** Presiona Enter sin escribir nada: aparece una **clave provisional**. Anótala en papel.

La primera vez tarda entre 10 y 15 minutos, porque arma la web.

Al final debe decir **«[OK] Tareas programadas creadas y arrancadas»**. Si dice «La API todavía no responde», espera 1 minuto y haz la comprobación del paso 5.

## 5. Comprobar
```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8096/salud | Select-Object -ExpandProperty Content
```
Debe responder `{"ok":true,...,"solo_equipo":true}`. Después abre **superad.aha-go.com** y **www.aha-go.com** en el navegador.

## Si el túnel no conecta (Cloudflare muestra el error 1033)
Revisa el registro del túnel:
```powershell
Get-Content "C:\Users\Administrator\APP AHA HOME\ops\tunel.log" -Tail 8
```
Si dice **«Provided Tunnel token is not valid»**, limpia el token:
```powershell
$f = "C:\Users\Administrator\APP AHA HOME\ops\cloudflared\token.txt"; $m = [regex]::Match((Get-Content $f -Raw), 'eyJ\S+'); if ($m.Success) { [IO.File]::WriteAllText($f, $m.Value); "[OK] token limpio" } else { "No se encontró el token (eyJ...)" }
```
Y reinicia el túnel:
```powershell
Stop-ScheduledTask -TaskName "aha home tunel"; Start-ScheduledTask -TaskName "aha home tunel"
```

## Primer ingreso
1. Entra a **superad.aha-go.com** con `magp@aha-go.com` y la clave provisional, y cámbiala por una tuya.
2. Carga la **tasa BCV** del día.
3. En **Centro de mando › Usuarios y permisos**, crea la cuenta de la caja y la del centro de control.

## Día a día
- **Actualizaciones:** cada 5 minutos el servidor publica solo lo que llegue a la rama `produccion`. Antes de cambiar nada, corre las pruebas y hace un respaldo; si algo falla, vuelve a la versión anterior.
- **Respaldos:** se hacen todos los días a las 3:15.
- **Reinicio:** AHA HOME y el túnel arrancan solos cuando el servidor se reinicia.
- **Ver el estado de las tareas:**
  ```powershell
  Get-ScheduledTask -TaskName "aha home*" | Select-Object TaskName, State
  ```
- **Registro de AHA HOME:**
  ```powershell
  Get-Content "C:\Users\Administrator\APP AHA HOME\backend\logs\api.log" -Tail 25
  ```
- **Abrir la app a clientes y técnicos** (cuando termine el modo equipo): borra `backend\.solo-equipo` y reinicia la tarea **aha home API**.
