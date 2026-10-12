@echo off
rem FindJob launcher: start server (if needed) and open the web UI
chcp 65001 >nul
setlocal
set PORT=3001
for %%I in ("%~dp0..\..") do set "PROJ=%%~fI"
set LOG=%TEMP%\findjob-server.log
set URL=http://127.0.0.1:%PORT%

rem 1) already running?
set ALREADY=0
for /f %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do set ALREADY=1
if "%ALREADY%"=="1" (
  echo FindJob is already running. Opening %URL% ...
  start "" "%URL%"
  exit /b 0
)

rem 2) build present?
if not exist "%PROJ%\server\dist\index.js" (
  echo [ERROR] Build output not found:
  echo         %PROJ%\server\dist\index.js
  echo Please build first ^(see README: pnpm build / npm build^).
  pause
  exit /b 1
)

rem 3) start detached, logs to %LOG%
echo Starting FindJob server ...
powershell -NoProfile -Command "$entry=Join-Path $env:PROJ 'server\dist\index.js'; Start-Process -FilePath node -ArgumentList ([char]34 + $entry + [char]34) -WorkingDirectory $env:PROJ -WindowStyle Hidden -RedirectStandardOutput $env:LOG -RedirectStandardError ($env:LOG + '.err')"

rem 4) wait for health check (up to 30s)
powershell -NoProfile -Command "$ok=$false; foreach($i in 1..30){ try { if((Invoke-WebRequest -UseBasicParsing '%URL%/api/health' -TimeoutSec 2).StatusCode -eq 200){ $ok=$true; break } } catch {}; Start-Sleep -Seconds 1 }; if($ok){ exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo [WARN] Server not ready in 30s. Check log: %LOG%
  pause
  exit /b 1
)

rem 5) open UI
echo Ready: %URL%
start "" "%URL%"
exit /b 0
