@echo off
rem === VoxelForge voxel world launcher (Windows) ===
rem Starts the static server in the BACKGROUND, then opens the browser.
rem Closing this window will NOT stop the server.
rem Use stop.bat to shut it down.
setlocal
set "NODE=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if not exist "%NODE%" (
  echo [ERROR] WorkBuddy Node runtime not found: %NODE%
  pause
  exit /b 1
)
cd /d "%~dp0"
set "PORT=18082"

rem Check if already running on this port
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -Command "try { $c=New-Object System.Net.Sockets.TcpClient('localhost', %PORT%); $c.Close(); exit 0 } catch { exit 1 }"
if %errorlevel% equ 0 (
  echo [OK] VoxelForge is already running at http://localhost:%PORT%/
  start "" "http://localhost:%PORT%/"
  echo You can close this window.
  timeout /t 2 /nobreak
  exit /b 0
)

echo === VoxelForge voxel world ===
echo Note: loads three.js from unpkg CDN, keep network on.
echo Starting background static server at http://localhost:%PORT%/ ...
rem Launch Node in a hidden, independent process so closing this cmd won't kill it.
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -WindowStyle Hidden -Command "Start-Process -FilePath '%NODE%' -ArgumentList '%~dp0serve.js','%PORT%' -WorkingDirectory '%~dp0' -WindowStyle Hidden"

echo Waiting for server to come up ...
:waitloop
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -Command "try { $c=New-Object System.Net.Sockets.TcpClient('localhost', %PORT%); $c.Close(); exit 0 } catch { exit 1 }"
if %errorlevel% neq 0 (
  timeout /t 1 /nobreak
  goto waitloop
)

start "" "http://localhost:%PORT%/"
echo.
echo [OK] Server is running in the background.
echo     URL: http://localhost:%PORT%/
echo     Tip: Close this window anytime; the server stays alive.
echo     Run stop.bat when you want to shut it down.
timeout /t 3 /nobreak
