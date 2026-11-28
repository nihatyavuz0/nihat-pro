@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Startup') + '\NIHAT_PRO.lnk'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%~dp0ArkaPlanda_Baslat.vbs\"'; $s.WorkingDirectory = '%~dp0'; $s.Save()"
wscript.exe "%~dp0ArkaPlanda_Baslat.vbs"
echo.
echo  NIHAT PRO Windows acilisina eklendi ve arka planda baslatildi!
echo  Artik bilgisayariniz her acildiginda http://127.0.0.1:8787 otomatik hazir olacak.
echo.
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:8787"
