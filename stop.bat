@echo off
rem === Stop VoxelForge background server ===
setlocal
set "PORT=18082"

echo Stopping VoxelForge server on port %PORT% ...
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo [OK] Port %PORT% is now free.
timeout /t 2 /nobreak
