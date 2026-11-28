@echo off
chcp 65001 >nul
set PATH=%LOCALAPPDATA%\Programs\SmartGitTools\git\cmd;%LOCALAPPDATA%\Programs\SmartGitTools\gh\bin;%LOCALAPPDATA%\Programs\nodejs;%PATH%
cd /d "%~dp0"
echo.
echo  NIHAT PRO degisiklikleri guvenlik kontrolunden gecirilip GitHub'a gonderiliyor...
git add -A
git reset -- .env data/ *.log *.key *.pem *.bak *.sql *.dump >nul 2>&1
git diff --cached --quiet
if %ERRORLEVEL%==0 (
    echo  Gonderilecek yeni degisiklik yok, her sey guncel.
) else (
    git commit -m "Manual sync: NIHAT PRO guncellemesi"
    git push origin main
    echo  GitHub'a gonderildi! Vercel otomatik olarak canliya aliyor.
)
echo.
timeout /t 3 /nobreak >nul
