@echo off
rem FindJob logs: open the server log in Notepad
set LOG=%TEMP%\findjob-server.log
if not exist "%LOG%" (
  echo Log file not found: %LOG%
  echo Start the app first with FindJob-start.cmd
  pause
  exit /b 1
)
start "" notepad "%LOG%"
exit /b 0
