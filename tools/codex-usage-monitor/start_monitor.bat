@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ライブ残量モニタを起動します... (停止: このウィンドウで Ctrl+C)
python monitor.py
pause
