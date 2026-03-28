@echo off
:: Liminal launcher — delegates to start.vbs so no terminal windows appear.
:: Logs are written to backend.log and frontend.log in this folder.
wscript "%~dp0start.vbs"
