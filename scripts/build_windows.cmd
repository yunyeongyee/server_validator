@echo off
setlocal
cd /d "%~dp0.."
echo Build on Windows with Python 3.10 or newer installed.
py -3 -m venv .venv-build
if errorlevel 1 goto :failure
call .venv-build\Scripts\activate.bat
python -m pip install -r requirements-ai.txt
if errorlevel 1 goto :failure
python -m pip install pyinstaller==6.22.3
if errorlevel 1 goto :failure
if not exist web\index.html (
  echo Build React first: cd frontend, npm ci, npm run build
  goto :failure
)
python -m PyInstaller --noconfirm --clean --onefile --console --name ServerValidator --add-data "static;static" --add-data "data;data" --add-data "web;web" --hidden-import openai launcher.py
if errorlevel 1 goto :failure
echo Built dist\ServerValidator.exe. Double-click it to open the local tool.
echo This build must be tested on Windows before distribution.
pause
exit /b 0
:failure
echo Build failed. Review the output above.
pause
exit /b 1
