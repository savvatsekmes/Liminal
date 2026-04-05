@echo off
:: Stop Liminal — kills the node processes on ports 3001 and 5173.
echo Stopping Liminal...

powershell -NoProfile -Command "$p = Get-NetTCPConnection -LocalPort 8100 -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue }"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 "') do (
  taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
  taskkill /f /pid %%a >nul 2>&1
)

echo Done.
timeout /t 1 /nobreak >nul
