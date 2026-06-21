@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del "%STARTUP%\ClaudeCodexMonitor.vbs" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $lnk=$w.CreateShortcut((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\ClaudeCodexMonitor.lnk')); $lnk.TargetPath=(Join-Path $PWD.Path 'monitor_hidden.vbs'); $lnk.WorkingDirectory=$PWD.Path; $lnk.Description='Claude Codex zanryo monitor'; $lnk.Save()"
echo 自動起動を登録しました: %STARTUP%\ClaudeCodexMonitor.lnk
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do taskkill /f /pid %%p >nul 2>&1
timeout /t 2 >nul
start "" wscript.exe "%~dp0monitor_hidden.vbs"
timeout /t 5 >nul
start "" "http://localhost:8787/live_dashboard.html"
echo 完了しました。（このウィンドウは閉じて大丈夫です）
pause
