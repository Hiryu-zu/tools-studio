@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === restart %date% %time% === > restart_log.txt
echo [before] netstat :8787 >> restart_log.txt
netstat -ano | findstr :8787 >> restart_log.txt 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do (
  echo killing PID %%p >> restart_log.txt
  taskkill /f /pid %%p >> restart_log.txt 2>&1
)
timeout /t 2 >nul
echo starting monitor_hidden.vbs >> restart_log.txt
start "" wscript.exe "%~dp0monitor_hidden.vbs"
timeout /t 6 >nul
echo [after] netstat :8787 >> restart_log.txt
netstat -ano | findstr :8787 >> restart_log.txt 2>&1
echo [after] tasklist python >> restart_log.txt
tasklist /fi "imagename eq python.exe" >> restart_log.txt 2>&1
start "" "http://localhost:8787/live_dashboard.html"
