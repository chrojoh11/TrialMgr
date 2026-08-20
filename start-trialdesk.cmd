@echo off
setlocal
cd /d "%~dp0"
echo Starting SDDA TrialDesk at http://127.0.0.1:3000
"C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" dev --webpack -H 127.0.0.1 -p 3000
endlocal
