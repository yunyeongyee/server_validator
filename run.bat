@echo off
setlocal
cd /d "%~dp0"
if exist .venv\Scripts\python.exe goto :ready
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -m venv .venv
) else (
  where python >nul 2>nul
  if errorlevel 1 goto :python_missing
  python -m venv .venv
)
if errorlevel 1 goto :failure
:ready
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto :failure
if /I "%~1"=="--ai" (
  .venv\Scripts\python.exe -m pip install -r requirements-ai.txt
  if errorlevel 1 goto :failure
)
if not exist web\index.html (
  echo The built React screen is missing. Use the release ZIP or build frontend.
  goto :failure
)
.venv\Scripts\python.exe launcher.py
if errorlevel 1 goto :failure
exit /b 0
:python_missing
echo Python 3.10 or newer is required.
echo Install Python from https://www.python.org/downloads/windows/
echo Then double-click run.bat again. No domain or Node.js is needed for the ZIP.
pause
exit /b 1
:failure
echo Startup failed. Read the output above. Close this window after checking.
pause
exit /b 1
