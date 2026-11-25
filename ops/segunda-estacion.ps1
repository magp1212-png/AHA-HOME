# ============================================================================
#  AHA HOME - preparar OTRA estacion de trabajo (Windows) con la misma configuracion que el servidor principal.
#  Deja la computadora lista y unida a la base de datos compartida del principal.
#
#  Uso (PowerShell como Administrador):
#    powershell -ExecutionPolicy Bypass -File segunda-estacion.ps1 -Principal 192.168.1.50
#
#  Te va a pedir (se escriben solo aqui, nunca en el chat):
#    - la llave de Brevo (AHA HOME, solo envio)
#    - el token del tunel de Cloudflare (empieza con eyJ)
#    - la clave de conexion que mostro el principal
# ============================================================================
param([Parameter(Mandatory = $true)][string]$Principal, [string]$Carpeta = "C:\Users\Administrator\APP AHA HOME")
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = "SilentlyContinue"
Write-Host "== AHA HOME - preparar esta estacion (se une al principal $Principal) ==" -ForegroundColor Cyan

function Ruta() { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Program Files (x86)\cloudflared;C:\Program Files\cloudflared" }
function Instalar($nombre, $prueba, $url, $archivo, $argumentos) {
  Ruta
  if (Get-Command $prueba -ErrorAction SilentlyContinue) { Write-Host "[OK] $nombre ya esta instalado"; return }
  Write-Host "Instalando $nombre..."
  $f = Join-Path $env:TEMP $archivo
  Invoke-WebRequest $url -OutFile $f -UseBasicParsing
  if ($archivo -like "*.msi") { Start-Process msiexec -ArgumentList "/i `"$f`" /qn" -Wait } else { Start-Process $f -ArgumentList $argumentos -Wait }
  Ruta
  if (-not (Get-Command $prueba -ErrorAction SilentlyContinue)) { Write-Host "No se pudo instalar $nombre" -ForegroundColor Red; exit 1 }
  Write-Host "[OK] $nombre instalado"
}

# 1. Programas que necesita AHA HOME
Instalar "Python 3.12" "py" "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe" "python.exe" "/quiet InstallAllUsers=1 PrependPath=1 Include_launcher=1"
Instalar "Node.js" "node" "https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi" "node.msi" ""
Instalar "Git" "git" "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/Git-2.47.1-64-bit.exe" "git.exe" "/VERYSILENT /NORESTART"
Instalar "cloudflared" "cloudflared" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi" "cloudflared.msi" ""

# 2. Descargar AHA HOME (rama produccion) o actualizarlo si ya esta
if (Test-Path (Join-Path $Carpeta ".git")) {
  Push-Location $Carpeta; git fetch -q origin produccion; git checkout -q produccion; git reset -q --hard origin/produccion; Pop-Location
  Write-Host "[OK] AHA HOME actualizado"
} else {
  git clone -q -b produccion https://github.com/magp1212-png/AHA-HOME.git $Carpeta
  Write-Host "[OK] AHA HOME descargado"
}

# 3. Instalar AHA HOME (Python, web, correo, tunel y tareas). La cuenta CEO NO se crea aqui: vive en la base del principal.
$backend = Join-Path $Carpeta "backend"
New-Item -ItemType Directory -Force $backend | Out-Null
if (-not (Test-Path (Join-Path $backend ".ceo-listo"))) { New-Item (Join-Path $backend ".ceo-listo") | Out-Null }
& powershell -ExecutionPolicy Bypass -File (Join-Path $Carpeta "ops\instalar-windows.ps1")

# 4. Unirse a la base de datos compartida del principal
& powershell -ExecutionPolicy Bypass -File (Join-Path $Carpeta "ops\conjunto-windows.ps1") -Rol segundo -Principal $Principal

Write-Host "`nListo: esta estacion trabaja junto con el principal ($Principal)." -ForegroundColor Green
Write-Host "Comprueba en el navegador: superad.aha-go.com y www.aha-go.com"
