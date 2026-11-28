@echo off
chcp 65001 >nul
wscript.exe "%~dp0ArkaPlanda_Baslat.vbs"
wscript.exe "%~dp0GitHub_Anlik_Senkron_Baslat.vbs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8787"
exit
