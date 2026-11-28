@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $st = [Environment]::GetFolderPath('Startup'); $s1 = $ws.CreateShortcut($st + '\NIHAT_PRO.lnk'); $s1.TargetPath = 'wscript.exe'; $s1.Arguments = '\"%~dp0ArkaPlanda_Baslat.vbs\"'; $s1.WorkingDirectory = '%~dp0'; $s1.Save(); $s2 = $ws.CreateShortcut($st + '\NIHAT_PRO_GITHUB_VERCEL_SYNC.lnk'); $s2.TargetPath = 'wscript.exe'; $s2.Arguments = '\"%~dp0GitHub_Anlik_Senkron_Baslat.vbs\"'; $s2.WorkingDirectory = '%~dp0'; $s2.Save()"
wscript.exe "%~dp0ArkaPlanda_Baslat.vbs"
wscript.exe "%~dp0GitHub_Anlik_Senkron_Baslat.vbs"
echo.
echo  NIHAT PRO sunucusu ve GitHub + Vercel Anlik Senkronizasyonu Windows acilisina eklendi ve baslatildi!
echo  Artik yaptiginiz her degisiklik saniyeler icinde otomatik olarak GitHub ve Vercel'da guncellenecek.
echo.
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:8787"
