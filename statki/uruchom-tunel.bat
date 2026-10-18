@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=node"
where node >nul 2>nul || set "NODE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE%" if /i not "%NODE%"=="node" (
  echo Nie znaleziono Node.js. Zainstaluj ze strony https://nodejs.org
  pause
  exit /b 1
)
echo Uruchamiam gre w statki z tunelem Cloudflare (gra przez internet)...
"%NODE%" server.js --tunnel
pause
