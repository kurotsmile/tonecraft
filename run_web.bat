@echo off
cd /d %~dp0
python -m http.server 8111
pause
