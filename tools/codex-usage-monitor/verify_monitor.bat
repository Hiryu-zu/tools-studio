@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   monitor.py --once  (live quota check)
echo ============================================
python monitor.py --once
echo.
echo ============================== state.json ==
type state.json
echo.
echo ============================================
pause
