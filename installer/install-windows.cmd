@echo off
rem Double-click this file to install or update the stream server on Windows.
setlocal
set "SCRIPT=%~dp0install.ps1"
if not exist "%SCRIPT%" (
  set "SCRIPT=%TEMP%\ecg-stream-install.ps1"
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = 'Tls12'; Invoke-WebRequest 'https://raw.githubusercontent.com/ecg-media/stream/main/installer/install.ps1' -OutFile $env:TEMP\ecg-stream-install.ps1 -UseBasicParsing" || goto :error
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b
:error
echo Das Installationsprogramm konnte nicht geladen werden. Bitte die Internetverbindung pruefen.
pause
