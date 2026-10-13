@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 launcher.py
  if errorlevel 1 pause
  exit /b
)
where python >nul 2>nul
if not errorlevel 1 (
  python launcher.py
  if errorlevel 1 pause
  exit /b
)
echo Python 3.10 or newer is required for this source version.
echo Install Python from https://www.python.org/downloads/windows/
echo Then double-click start.cmd again.
echo No domain, hosting, npm or pip installation is required to run the mockup.
pause
