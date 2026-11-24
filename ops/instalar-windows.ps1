# ============================================================================
#  AHA HOME en el mismo servidor Windows que anunciate. Ejecutar UNA vez como Administrador:
#    cd "C:\Users\Administrator\APP AHA HOME"
#    powershell -ExecutionPolicy Bypass -File ops\instalar-windows.ps1
#  Crea el entorno de Python, la clave secreta, la web, el superadministrador y 4 tareas programadas:
#    "aha home API"       al iniciar Windows   -> ops\servidor-ahahome.cmd (puerto 8096)
#    "aha home tunel"     al iniciar Windows   -> ops\tunel-ahahome.cmd   (api-home.aha-go.com)
#    "aha home publicar"  cada 5 minutos       -> ops\publicar.py         (rama produccion de GitHub)
#    "aha home respaldo"  todos los días 3:15  -> ops\respaldo.py         (30 días + copia en R2)
# ============================================================================
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Mobile = Join-Path $Root "mobile"
$env:Path = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Program Files (x86)\cloudflared;C:\Program Files\cloudflared;" + $env:Path
foreach ($falta in @(@("py", "Python 3.12 (winget install Python.Python.3.12)"), @("node", "Node.js (winget install OpenJS.NodeJS.LTS)"),
                     @("git", "Git (winget install Git.Git)"), @("cloudflared", "cloudflared (winget install Cloudflare.cloudflared)"))) {
  if (-not (Get-Command $falta[0] -ErrorAction SilentlyContinue)) { Write-Host "Falta $($falta[1]). Instálalo y vuelve a correr este instalador." -ForegroundColor Yellow; exit 1 }
}
Write-Host "== AHA HOME - instalación en este servidor ==" -ForegroundColor Cyan

# 1. Python
if (-not (Test-Path "$Backend\.venv")) { py -3.12 -m venv "$Backend\.venv" }
& "$Backend\.venv\Scripts\python.exe" -m pip install -q -r "$Backend\requirements.txt"
Push-Location $Backend; & "$Backend\.venv\Scripts\python.exe" descargar_modelos.py; Pop-Location
Write-Host "[OK] Python listo (con los modelos de verificación facial)"

# 2. Clave secreta de las sesiones (solo en este servidor)
$secreto = Join-Path $Backend ".secreto-jwt.txt"
if (-not (Test-Path $secreto)) {
  $bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes) | Set-Content -NoNewline -Encoding ascii $secreto
  Write-Host "[OK] Clave secreta creada"
}

# 3. Correo (Brevo): backend\correo.key
$correo = Join-Path $Backend "correo.key"
if (-not (Test-Path $correo)) {
  Write-Host "`nCorreo de la app (Brevo -> SMTP y API -> Claves API; basta permiso de envío). Enter para dejarlo para después."
  $k = Read-Host "  Llave API de Brevo (xkeysib-...)" -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($k))
  if ($plain) {
    @{ api_key = $plain; from = "AHA HOME <no-responder@aha-go.com>"; domain = "aha-go.com" } |
      ConvertTo-Json | Set-Content -Encoding utf8 $correo
    Write-Host "[OK] Correo configurado"
  }
}

# 4. Respaldos en R2: reutiliza la configuración de anunciate si existe
$r2Anunciate = "C:\Users\Administrator\APP ANUNCIATE\ops\r2.json"
if ((Test-Path $r2Anunciate) -and -not (Test-Path "$PSScriptRoot\r2.json")) { Copy-Item $r2Anunciate "$PSScriptRoot\r2.json"; Write-Host "[OK] Respaldo en R2 (el de anunciate)" }

# 5. Web (la misma app, en www.aha-go.com)
Push-Location $Mobile
# npm ci falla en Windows si quedo una instalacion a medias: se borra antes (rmdir aguanta rutas largas)
if (Test-Path "node_modules") { cmd /c "rmdir /s /q node_modules" }
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "npm ci fallo: revisa el mensaje de arriba y vuelve a correr el instalador." -ForegroundColor Red; exit 1 }
npx --no-install expo export --platform web --output-dir dist-web
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "No se pudo armar la web: revisa el mensaje de arriba." -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host "[OK] Web armada"

# 5b. Modo equipo: mientras se prueba, solo entran caja, centro de control, superadmin y CEO.
#     Para abrirla a clientes y técnicos: borra backend\.solo-equipo y reinicia la tarea "aha home API".
if (-not (Test-Path "$Backend\.solo-equipo-decidido")) {
  New-Item "$Backend\.solo-equipo" -Force | Out-Null; New-Item "$Backend\.solo-equipo-decidido" | Out-Null
  Write-Host "[OK] Modo equipo activado (solo personal)"
}

# 5c. Túnel de Cloudflare: token del panel (Networks -> Tunnels -> aha-home). Queda solo en este servidor.
$tokenFile = Join-Path $PSScriptRoot "cloudflared\token.txt"
if (-not (Test-Path $tokenFile)) {
  Write-Host "`nTúnel de Cloudflare: pega el token del túnel aha-home (empieza con eyJ). Enter para dejarlo para después."
  $t = Read-Host "  Token del túnel" -AsSecureString
  $plainT = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($t))
  if ($plainT) { Set-Content -NoNewline -Encoding ascii $tokenFile $plainT.Trim(); Write-Host "[OK] Túnel configurado" }
}

# 6. Tareas programadas (como anunciate)
$py = "$Backend\.venv\Scripts\python.exe"
schtasks /Create /F /TN "aha home API" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "`"$PSScriptRoot\servidor-ahahome.cmd`"" | Out-Null
schtasks /Create /F /TN "aha home tunel" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "`"$PSScriptRoot\tunel-ahahome.cmd`"" | Out-Null
schtasks /Create /F /TN "aha home publicar" /SC MINUTE /MO 5 /RU SYSTEM /RL HIGHEST /TR "`"$py`" `"$PSScriptRoot\publicar.py`"" | Out-Null
schtasks /Create /F /TN "aha home respaldo" /SC DAILY /ST 03:15 /RU SYSTEM /RL HIGHEST /TR "`"$py`" `"$PSScriptRoot\respaldo.py`"" | Out-Null
schtasks /Run /TN "aha home API" | Out-Null
schtasks /Run /TN "aha home tunel" | Out-Null
Write-Host "[OK] Tareas programadas creadas y arrancadas"

# 7. ¿Responde?
Start-Sleep -Seconds 8
try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8096/salud).Content; Write-Host "[OK] API funcionando" -ForegroundColor Green }
catch { Write-Host "La API todavía no responde: revisa backend\logs\api.log" -ForegroundColor Yellow }

# 8. Cuenta CEO (magp@aha-go.com) y la tienda del piloto. Enter en la clave = clave provisional (se cambia al entrar)
if (-not (Test-Path "$Backend\.ceo-listo")) {
  Push-Location $Backend; & $py crear_ceo.py magp@aha-go.com; if ($LASTEXITCODE -eq 0) { New-Item "$Backend\.ceo-listo" | Out-Null }; Pop-Location
}
Write-Host "`nListo. Falta el túnel: guarda el token del túnel en ops\cloudflared\token.txt (ver ops\cloudflared\LEEME.md)" -ForegroundColor Cyan
