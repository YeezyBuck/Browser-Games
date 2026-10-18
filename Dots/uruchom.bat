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
echo Kropki: start z tunelem Cloudflare (gra przez internet)
echo Kroki: 1) sprawdzenie cloudflared (ewentualna instalacja), 2) tunel, 3) gra i przegladarka
echo.
"%NODE%" server.js --tunnel --open
if errorlevel 1 pause
