@echo off
chcp 65001 >nul
REM === tools-studio 自動同期スクリプト ===
REM このファイルの場所（リポジトリ直下）へ移動。日本語パスを書かずに済む。
cd /d "%~dp0"

echo [1/4] git pull ...
git pull --no-edit

echo [2/4] stage changes ...
git add -A

echo [3/4] commit (changes only) ...
git diff --cached --quiet && (echo   no changes to commit) || git commit -m "auto sync"

echo [4/4] git push ...
git push

echo done.
