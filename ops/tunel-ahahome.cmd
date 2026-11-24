@echo off
REM ============================================================================
REM  Tunel de Cloudflare hacia la API local de AHA HOME (127.0.0.1:8096).
REM  - Con ops\cloudflared\config.yml (tunel con nombre): publica api.ahahome.app y www.ahahome.app.
REM  - Mientras tanto: tunel temporal trycloudflare (la direccion queda en backend\cf-api.log).
REM  Lo arranca la tarea programada "aha home tunel" (SYSTEM, al iniciar Windows).
REM ============================================================================
cd /d "%~dp0"
:loop
if exist "cloudflared\config.yml" (
  echo [%date% %time%] tunel con nombre >> tunel.log
  cloudflared tunnel --no-autoupdate --config "%~dp0cloudflared\config.yml" run >> tunel.log 2>&1
) else (
  echo [%date% %time%] tunel temporal >> tunel.log
  cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8096 > "%~dp0..\backend\cf-api.log" 2>&1
)
echo [%date% %time%] el tunel se detuvo, reintento en 10s >> tunel.log
timeout /t 10 /nobreak >nul
goto loop
