# ============================================================================
#  AHA HOME en el mismo servidor Windows que anunciate. Ejecutar UNA vez como Administrador:
#    cd "C:\Users\Administrator\APP AHA HOME"
#    powershell -ExecutionPolicy Bypass -File ops\instalar-windows.ps1
#  Crea el entorno de Python, la clave secreta, la web, el superadministrador y 4 tareas programadas:
#    "aha home API"       al iniciar Windows   → ops\servidor-ahahome.cmd (puerto 8096)
#    "aha home tunel"     al iniciar Windows   → ops\tunel-ahahome.cmd   (api-home.aha-go.com)
#    "aha home publicar"  cada 5 minutos       → ops\publicar.py         (rama produccion de GitHub)
#    "aha home respaldo"  todos los días 3:15  → ops\respaldo.py         (30 días + copia en R2)
# ============================================================================
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Mobile = Join-Path $Root "mobile"
$env:Path = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;" + $env:Path
Write-Host "== AHA HOME · instalación en este servidor ==" -ForegroundColor Cyan

# 1. Python
if (-not (Test-Path "$Backend\.venv")) { py -3.12 -m venv "$Backend\.venv" }
& "$Backend\.venv\Scripts\python.exe" -m pip install -q -r "$Backend\requirements.txt"
Write-Host "✓ Python listo"

# 2. Clave secreta de las sesiones (solo en este servidor)
$secreto = Join-Path $Backend ".secreto-jwt.txt"
if (-not (Test-Path $secreto)) {
  $bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes) | Set-Content -NoNewline -Encoding ascii $secreto
  Write-Host "✓ Clave secreta creada"
}

# 3. Correo (Brevo): backend\correo.key
$correo = Join-Path $Backend "correo.key"
if (-not (Test-Path $correo)) {
  Write-Host "`nCorreo de la app (Brevo → SMTP y API → Claves API; basta permiso de envío). Enter para dejarlo para después."
  $k = Read-Host "  Llave API de Brevo (xkeysib-…)" -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($k))
  if ($plain) {
    @{ api_key = $plain; from = "AHA HOME <no-responder@aha-go.com>"; domain = "aha-go.com" } |
      ConvertTo-Json | Set-Content -Encoding utf8 $correo
    Write-Host "✓ Correo configurado"
  }
}

# 4. Respaldos en R2: reutiliza la configuración de anunciate si existe
$r2Anunciate = "C:\Users\Administrator\APP ANUNCIATE\ops\r2.json"
if ((Test-Path $r2Anunciate) -and -not (Test-Path "$PSScriptRoot\r2.json")) { Copy-Item $r2Anunciate "$PSScriptRoot\r2.json"; Write-Host "✓ Respaldo en R2 (el de anunciate)" }

# 5. Web (la misma app, en www.aha-go.com)
Push-Location $Mobile
npm ci --no-audit --no-fund
npx expo export --platform web --output-dir dist-web
Pop-Location
Write-Host "✓ Web armada"

# 6. Tareas programadas (como anunciate)
$py = "$Backend\.venv\Scripts\python.exe"
schtasks /Create /F /TN "aha home API" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "`"$PSScriptRoot\servidor-ahahome.cmd`"" | Out-Null
schtasks /Create /F /TN "aha home tunel" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "`"$PSScriptRoot\tunel-ahahome.cmd`"" | Out-Null
schtasks /Create /F /TN "aha home publicar" /SC MINUTE /MO 5 /RU SYSTEM /RL HIGHEST /TR "`"$py`" `"$PSScriptRoot\publicar.py`"" | Out-Null
schtasks /Create /F /TN "aha home respaldo" /SC DAILY /ST 03:15 /RU SYSTEM /RL HIGHEST /TR "`"$py`" `"$PSScriptRoot\respaldo.py`"" | Out-Null
schtasks /Run /TN "aha home API" | Out-Null
schtasks /Run /TN "aha home tunel" | Out-Null
Write-Host "✓ Tareas programadas creadas y arrancadas"

# 7. ¿Responde?
Start-Sleep -Seconds 8
try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8096/salud).Content; Write-Host "✓ API funcionando" -ForegroundColor Green }
catch { Write-Host "La API todavía no responde: revisa backend\logs\api.log" -ForegroundColor Yellow }

# 8. Superadministrador real
if (-not (Test-Path "$Backend\.superadmin-listo")) {
  Push-Location $Backend; & $py crear_superadmin.py; if ($LASTEXITCODE -eq 0) { New-Item "$Backend\.superadmin-listo" | Out-Null }; Pop-Location
}
Write-Host "`nListo. Falta el túnel con nombre: ver ops\cloudflared\config.ejemplo.yml" -ForegroundColor Cyan
