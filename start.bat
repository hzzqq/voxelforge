@echo off
rem === VoxelForge voxel world launcher (Windows) ===
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Node.js not found. Install from https://nodejs.org && pause && exit /b 1)
set "PORT=8082"
echo === VoxelForge voxel world ===
echo Note: loads three.js from unpkg CDN, keep network on.
echo Starting static server at http://localhost:%PORT%/ ...
start "" "http://localhost:%PORT%/"
node "%~dp0serve.js" %PORT%
pause
