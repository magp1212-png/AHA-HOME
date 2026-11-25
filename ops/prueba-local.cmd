@echo off
REM ============================================================================
REM  AHA HOME - copia de PRUEBA del panel en este servidor: http://127.0.0.1:8097/panel/
REM  Base aparte (backend\prueba\prueba.db): NO toca los datos reales.
REM  Sin correos ni notificaciones push. Clave de todos los usuarios de prueba: aha12345
REM  Para cerrarla: Ctrl+C o cerrar esta ventana. Para empezar de cero: borra backend\prueba
REM ============================================================================
cd /d "%~dp0..\backend"
set "AHAHOME_DATABASE_URL=sqlite:///%CD%\prueba\prueba.db"
set "AHAHOME_UPLOADS_DIR=%CD%\prueba\uploads"
set AHAHOME_EMAIL=0
set AHAHOME_PUSH=0
set AHAHOME_PUBLIC_URL=http://127.0.0.1:8097
set AHAHOME_PANEL_URL=http://127.0.0.1:8097
set AHAHOME_CEO_EMAILS=ceo@ahahome.test
.venv\Scripts\python.exe ..\ops\prueba_local.py secreto || goto error
set /p AHAHOME_JWT_SECRET=<prueba\secreto.txt
.venv\Scripts\python.exe ..\ops\prueba_local.py || goto error
echo.
echo  ==== AHA HOME - PRUEBA ====
echo  Abre en el navegador:  http://127.0.0.1:8097/panel/
echo  CEO:     ceo@ahahome.test       clave aha12345
echo  Ventas:  ventas@ahahome.test    clave aha12345
echo  Otros:   superadmin@ / supervisor@ / agente@ahahome.test  (misma clave)
echo  Para cerrar la prueba: Ctrl+C
echo.
start "" http://127.0.0.1:8097/panel/
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8097
goto :eof
:error
echo No se pudo preparar la prueba. Revisa el mensaje de arriba.
pause
