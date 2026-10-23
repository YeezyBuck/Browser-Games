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
echo Kolko i krzyzyk: start bez tunelu (gra tylko w sieci domowej)
echo.
"%NODE%" server.js --open
if errorlevel 1 pause
