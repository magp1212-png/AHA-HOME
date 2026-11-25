@echo off
REM ============================================================================
REM  Mantiene viva la API de AHA HOME (puerto 8096, solo local: entra por el
REM  tunel de Cloudflare). anunciate usa el 8095 en este mismo servidor.
REM  Si uvicorn se cae, vuelve a levantarlo a los 5 s.
REM  Lo arranca la tarea programada "aha home API" (SYSTEM, al iniciar Windows).
REM ============================================================================
cd /d "%~dp0..\backend"
if not exist logs mkdir logs
set AHAHOME_PUBLIC_URL=https://api-home.aha-go.com
REM Servidores trabajando juntos: la base de datos compartida (PostgreSQL) la define ops\conjunto.cmd
if exist "%~dp0conjunto.cmd" call "%~dp0conjunto.cmd"
:loop
echo [%date% %time%] arrancando uvicorn >> logs\arranques.log
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8096 --proxy-headers --forwarded-allow-ips=127.0.0.1 >> logs\api.log 2>&1
echo [%date% %time%] uvicorn se detuvo, reintento en 5s >> logs\arranques.log
timeout /t 5 /nobreak >nul
goto loop
