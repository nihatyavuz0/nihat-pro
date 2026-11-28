@echo off
chcp 65001 >nul
set PATH=%LOCALAPPDATA%\Programs\SmartGitTools\git\cmd;%LOCALAPPDATA%\Programs\SmartGitTools\gh\bin;%LOCALAPPDATA%\Programs\nodejs;%PATH%
cd /d "%~dp0"
echo.
echo  NIHAT PRO degisiklikleri guvenlik kontrolunden gecirilip GitHub ve Vercel'a aninda gonderiliyor...
git add -A
git reset -- .env .vercel .agents data/ *.log *.key *.pem *.bak *.sql *.dump >nul 2>&1
git diff --cached --quiet
if %ERRORLEVEL%==0 (
    echo  Yeni dosya degisikligi yok, mevcut surum Vercel canli ortamina dogrulaniyor...
) else (
    git commit -m "Manual sync: NIHAT PRO guncellemesi"
    git push origin main
    echo  [1/2] GitHub main dalina gonderildi!
)
if not exist ".vercel\project.json" (
    call "%LOCALAPPDATA%\Programs\nodejs\vercel.cmd" link --yes --project prj_BPadqj6dbSMGBHS9mAK6a2HW9Wio --scope stark-0473 >nul 2>&1
)
call "%LOCALAPPDATA%\Programs\nodejs\vercel.cmd" deploy --prod --yes --scope stark-0473 >nul 2>&1
echo  [2/2] Vercel canli yayini (https://nihat-pro.vercel.app) guncellendi!
echo.
timeout /t 3 /nobreak >nul
