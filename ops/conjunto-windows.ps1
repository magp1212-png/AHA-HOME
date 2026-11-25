# ============================================================================
#  AHA HOME - dos servidores trabajando juntos (misma red local), con UNA base de datos compartida.
#
#  En el PRINCIPAL (guarda la base de datos PostgreSQL):
#    powershell -ExecutionPolicy Bypass -File ops\conjunto-windows.ps1 -Rol principal
#  En el SEGUNDO servidor (usa la base del principal):
#    powershell -ExecutionPolicy Bypass -File ops\conjunto-windows.ps1 -Rol segundo -Principal 192.168.1.50
#
#  Los dos sirven la web por el mismo tunel de Cloudflare: si uno se apaga, el otro sigue atendiendo.
#  Las claves se escriben solo en estas pantallas: nunca en el chat ni en GitHub (quedan en ops\conjunto.cmd).
# ============================================================================
param([Parameter(Mandatory = $true)][ValidateSet("principal", "segundo")][string]$Rol, [string]$Principal = "")
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Py = Join-Path $Backend ".venv\Scripts\python.exe"
$Conf = Join-Path $PSScriptRoot "conjunto.cmd"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = "SilentlyContinue"

function Plano($seguro) { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)) }
function Clave() { -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 28 | ForEach-Object { [char]$_ }) }
function Probar($url) {
  $code = "import sys,sqlalchemy as s; e=s.create_engine(sys.argv[1]); c=e.connect(); print(c.execute(s.text('select 1')).scalar())"
  & $Py -c $code $url 2>&1
}
function Reiniciar-API {
  Stop-ScheduledTask -TaskName "aha home API" -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like "*uvicorn*8096*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2; Start-ScheduledTask -TaskName "aha home API"
}

if ($Rol -eq "principal") {
  Write-Host "== AHA HOME - servidor PRINCIPAL (guarda la base de datos compartida) ==" -ForegroundColor Cyan
  # 1. PostgreSQL 16: el SERVIDOR de base de datos (no basta con tener las herramientas psql)
  $svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $svc) {
    Write-Host "Instalando el servidor PostgreSQL 16 (unos minutos)..."
    $sp = Plano (Read-Host "  Crea la clave del administrador de PostgreSQL (anotala, no se muestra)" -AsSecureString)
    if ($sp.Length -lt 8) { Write-Host "La clave debe tener al menos 8 caracteres." -ForegroundColor Red; exit 1 }
    $inst = Join-Path $env:TEMP "postgresql16.exe"
    Invoke-WebRequest https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe -OutFile $inst -UseBasicParsing
    Start-Process $inst -ArgumentList "--mode unattended --unattendedmodeui none --superpassword `"$sp`" --serverport 5432 --servicename postgresql-16 --enable-components server,commandlinetools" -Wait
    $svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $svc) { Write-Host "No se pudo instalar el servidor PostgreSQL." -ForegroundColor Red; exit 1 }
    Write-Host "[OK] Servidor PostgreSQL instalado"
  } else {
    Write-Host "PostgreSQL ya esta instalado (servicio $($svc.Name))."
    $sp = Plano (Read-Host "  Clave del administrador de PostgreSQL (la que creaste al instalarlo)" -AsSecureString)
  }
  if ($svc.Status -ne "Running") { Start-Service $svc.Name; Start-Sleep -Seconds 5 }
  Set-Service $svc.Name -StartupType Automatic
  $pgBin = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Sort-Object FullName | Select-Object -Last 1
  $psql = $pgBin.FullName; $data = Join-Path (Split-Path (Split-Path $psql)) "data"
  $env:PGPASSWORD = $sp
  & $psql -U postgres -h 127.0.0.1 -tAc "SELECT 1" | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "No pude entrar a PostgreSQL: revisa la clave del administrador y vuelve a correr este paso." -ForegroundColor Red; exit 1 }
  # 2. Base de datos y usuario de AHA HOME
  $claveApp = Clave
  $existe = & $psql -U postgres -h 127.0.0.1 -tAc "SELECT 1 FROM pg_roles WHERE rolname='ahahome'"
  if ($existe -eq "1") { & $psql -U postgres -h 127.0.0.1 -c "ALTER ROLE ahahome WITH LOGIN PASSWORD '$claveApp'" | Out-Null }
  else { & $psql -U postgres -h 127.0.0.1 -c "CREATE ROLE ahahome WITH LOGIN PASSWORD '$claveApp'" | Out-Null }
  if ($LASTEXITCODE -ne 0) { Write-Host "No se pudo crear el usuario ahahome en PostgreSQL." -ForegroundColor Red; exit 1 }
  $hayBd = & $psql -U postgres -h 127.0.0.1 -tAc "SELECT 1 FROM pg_database WHERE datname='ahahome'"
  if ($hayBd -ne "1") { & $psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE ahahome OWNER ahahome" | Out-Null }
  if ($LASTEXITCODE -ne 0) { Write-Host "No se pudo crear la base de datos ahahome." -ForegroundColor Red; exit 1 }
  Remove-Item Env:\PGPASSWORD
  Write-Host "[OK] Base de datos ahahome lista"
  # 3. Aceptar conexiones solo desde la red local (y abrir el puerto 5432 solo para la red local)
  $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1)
  $base = ($ip.IPAddress -split "\.")[0..2] -join "."
  $red = "$base.0/24"
  $conf = Join-Path $data "postgresql.conf"; $hba = Join-Path $data "pg_hba.conf"
  if (-not (Select-String -Path $conf -Pattern "^listen_addresses = '\*'" -Quiet)) { Add-Content $conf "`nlisten_addresses = '*'" }
  if (-not (Select-String -Path $hba -Pattern "ahahome ahahome" -Quiet)) { Add-Content $hba "`nhost    ahahome    ahahome    $red    scram-sha-256" }
  if (-not (Get-NetFirewallRule -DisplayName "AHA HOME PostgreSQL" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "AHA HOME PostgreSQL" -Direction Inbound -Protocol TCP -LocalPort 5432 -RemoteAddress LocalSubnet -Action Allow | Out-Null
  }
  Restart-Service $svc.Name
  Write-Host "[OK] La red local ($red) puede usar la base de datos"
  # 4. Pasar los datos de este servidor (SQLite) a PostgreSQL
  $url = "postgresql+psycopg://ahahome:$claveApp@127.0.0.1:5432/ahahome"
  Stop-ScheduledTask -TaskName "aha home API" -ErrorAction SilentlyContinue
  Push-Location $Backend
  if (Test-Path "ahahome.db") { & $Py migrar_a_postgres.py ahahome.db $url } else { Write-Host "Sin datos anteriores: base nueva." }
  $okMig = $LASTEXITCODE
  Pop-Location
  if ($okMig -ne 0 -and (Test-Path (Join-Path $Backend "ahahome.db"))) {
    Start-ScheduledTask -TaskName "aha home API"
    Write-Host "No se pudieron pasar los datos a PostgreSQL (mira el mensaje de arriba). AHA HOME sigue con su base anterior." -ForegroundColor Red; exit 1
  }
  # 5. Este servidor usa PostgreSQL desde ahora
  Set-Content -Encoding ascii $Conf "@echo off`r`nREM Generado por conjunto-windows.ps1 (no va a GitHub)`r`nset `"AHAHOME_DATABASE_URL=$url`"`r`n"
  Reiniciar-API; Start-Sleep -Seconds 12
  try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8096/salud).Content | Out-Null; Write-Host "[OK] AHA HOME funcionando con la base compartida" -ForegroundColor Green }
  catch { Write-Host "La API todavia no responde: revisa backend\logs\api.log" -ForegroundColor Yellow }
  Write-Host "`n=== Para el SEGUNDO servidor ===" -ForegroundColor Cyan
  Write-Host "  IP de este servidor:   $($ip.IPAddress)"
  Write-Host "  Clave de conexion:     $claveApp"
  Write-Host "  Escribela en el otro servidor cuando la pida. NO la pegues en el chat." -ForegroundColor Yellow
}
else {
  if (-not $Principal) { Write-Host "Falta la IP del principal: -Principal 192.168.x.x" -ForegroundColor Red; exit 1 }
  Write-Host "== AHA HOME - SEGUNDO servidor (usa la base del principal $Principal) ==" -ForegroundColor Cyan
  $c = Plano (Read-Host "  Clave de conexion que mostro el principal (no se muestra)" -AsSecureString)
  $url = "postgresql+psycopg://ahahome:$c@$($Principal):5432/ahahome"
  $r = Probar $url
  if ("$r" -notmatch "1") { Write-Host "No se pudo conectar con la base del principal: $r" -ForegroundColor Red; exit 1 }
  Write-Host "[OK] Conectado con la base de datos del principal"
  # los datos propios de este servidor quedan guardados como respaldo
  if (Test-Path (Join-Path $Backend "ahahome.db")) {
    $copia = Join-Path $Backend ("respaldos\ahahome-propio-antes-de-juntar-{0}.db" -f (Get-Date -Format "yyyyMMdd-HHmm"))
    New-Item -ItemType Directory -Force (Split-Path $copia) | Out-Null; Copy-Item (Join-Path $Backend "ahahome.db") $copia
    Write-Host "[OK] Datos propios de este servidor guardados en $copia"
  }
  Set-Content -Encoding ascii $Conf "@echo off`r`nREM Generado por conjunto-windows.ps1 (no va a GitHub)`r`nset `"AHAHOME_DATABASE_URL=$url`"`r`n"
  Reiniciar-API; Start-Sleep -Seconds 12
  try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8096/salud).Content | Out-Null; Write-Host "[OK] Este servidor ya trabaja junto con el principal" -ForegroundColor Green }
  catch { Write-Host "La API todavia no responde: revisa backend\logs\api.log" -ForegroundColor Yellow }
}
