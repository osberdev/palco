@echo off
rem PALCO para Windows: comprueba Docker, genera el .env la primera vez, levanta
rem el sistema con compose.app.yml y abre el navegador.
rem   PALCO.bat            arranca PALCO
rem   PALCO.bat detener    lo detiene sin borrar los datos
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

if "%PALCO_PORT%"=="" set "PALCO_PORT=3000"
if "%PALCO_PROJECT%"=="" set "PALCO_PROJECT=palco-app"
set "URL=http://localhost:%PALCO_PORT%"
set "COMPOSE=docker compose -p %PALCO_PROJECT% -f compose.app.yml"

echo.
echo ============================================
echo   PALCO - venta de boletos
echo ============================================
echo.

rem -- Docker -----------------------------------------------------------------
where docker >nul 2>&1
if errorlevel 1 (
  echo No se encontro Docker.
  echo Instala Docker Desktop desde https://www.docker.com/products/docker-desktop/
  echo y vuelve a ejecutar PALCO.bat.
  goto :end
)
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker esta instalado pero el motor no responde.
  echo Abre Docker Desktop, espera a que diga que esta en ejecucion
  echo y vuelve a ejecutar PALCO.bat.
  goto :end
)

if /i "%~1"=="detener" (
  %COMPOSE% stop
  echo PALCO se detuvo. Los datos se conservan.
  goto :end
)

rem -- .env -------------------------------------------------------------------
rem Solo la primera vez: con la base ya creada, otras contrasenas romperian el acceso.
if exist ".env" (
  echo Usando el .env existente.
) else (
  echo Primer arranque: generando .env con claves nuevas...
  powershell -NoProfile -ExecutionPolicy Bypass -File "docker\app\generar-env.ps1" -Root "%CD%"
  if errorlevel 1 (
    echo No se pudo generar el archivo .env.
    goto :end
  )
)

rem -- Arranque ---------------------------------------------------------------
echo.
echo Construyendo y arrancando PALCO. La primera vez tarda unos minutos...
%COMPOSE% up -d --build
if errorlevel 1 goto :failed

echo.
echo Esperando a que %URL% responda...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='%URL%/login'; for ($i = 0; $i -lt 150; $i++) { try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $u).StatusCode -eq 200) { exit 0 } } catch { } ; Start-Sleep -Seconds 2 } ; exit 1"
if errorlevel 1 goto :failed

set "PIN="
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  if "%%a"=="NUXT_GATE_PIN" set "PIN=%%b"
)

echo.
echo ============================================
echo   PALCO esta listo en %URL%
echo ============================================
echo.
echo Usuarios de demostracion (usuario: CURP, y contrasena):
echo   Ana Sofia Rios Vela   RIVA030315MJCSLNA2JC   !Palco26
echo   Bruno Tellez Nava     TENB010908HCMLVRA6CM   Teatro9$
echo   Carmen Ibarra Solis   IASC951122MQTBLR02QT   Cine#204
echo   Diego Mendez          MEXD980704HNLNXG10NL   Museo$7A
echo.
echo Clave de la taquilla (%URL%/acceso): %PIN%
echo.
echo Para detenerlo:            PALCO.bat detener
echo Para borrar tambien datos: %COMPOSE% down -v
echo.
start "" "%URL%"
goto :end

:failed
echo.
echo ERROR: PALCO no pudo arrancar. Ultimas lineas del registro de cada servicio:
for %%s in (db init app) do (
  echo ---- %%s ----
  %COMPOSE% logs --no-color --tail 30 %%s
)

:end
echo.
pause
endlocal
