@echo off
cd /d %~dp0
start "" /B python -m http.server 8111
timeout /t 2 >nul
start chrome --incognito http://localhost:8111/index.html
