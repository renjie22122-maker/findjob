@echo off
rem Stop only a Node process whose command line identifies this FindJob checkout.
setlocal
for %%I in ("%~dp0..\..") do set "FINDJOB_PROJECT=%%~fI"
powershell -NoProfile -Command "$target=Join-Path $env:FINDJOB_PROJECT 'server\dist\index.js'; $matches=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains($target) }; if($matches){ $matches | ForEach-Object { Stop-Process -Id $_.ProcessId; Write-Output ('Stopped FindJob PID '+$_.ProcessId) } } else { Write-Output 'No matching FindJob process found. For pnpm dev, use Ctrl+C in its terminal.' }"
pause
