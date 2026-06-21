@echo off
chcp 65001 >nul
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del "%STARTUP%\ClaudeCodexMonitor.lnk" 2>nul
del "%STARTUP%\ClaudeCodexMonitor.vbs" 2>nul
echo 自動起動を解除しました（稼働中のモニタはそのまま継続します）。
pause
