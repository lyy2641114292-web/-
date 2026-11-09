@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js：https://nodejs.org/
  pause
  exit /b 1
)
start "Between Us" cmd /k "npm.cmd run dev -- --host 127.0.0.1"
