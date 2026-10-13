@echo off
setlocal
cd /d "%~dp0"
set "SV_WORKER=%TEMP%\server-validator-%RANDOM%-%RANDOM%.cmd"
copy /y "scripts\run_worker.cmd" "%SV_WORKER%" >nul
if errorlevel 1 (
  echo Cannot prepare the startup script. Check the extracted program folder.
  pause
  exit /b 1
)
call "%SV_WORKER%" "%CD%" %*
set "SV_RESULT=%ERRORLEVEL%"
del "%SV_WORKER%" >nul 2>nul
exit /b %SV_RESULT%
