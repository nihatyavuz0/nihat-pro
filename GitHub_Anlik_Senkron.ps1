$ErrorActionPreference = "Continue"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $RootDir "data"
$LogFile = Join-Path $DataDir "git-sync.log"

if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

# Single-instance guard
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\NIHAT_PRO_GITHUB_AUTO_SYNC", [ref]$createdNew)
if (-not $createdNew) {
    exit 0
}

$GitBin = "$env:LOCALAPPDATA\Programs\SmartGitTools\git\cmd"
$GhBin  = "$env:LOCALAPPDATA\Programs\SmartGitTools\gh\bin"
$NodeBin = "$env:LOCALAPPDATA\Programs\nodejs"
$VercelCmd = Join-Path $NodeBin "vercel.cmd"
$env:PATH = "$GhBin;$GitBin;$NodeBin;" + $env:PATH
Set-Location $RootDir

function Write-SyncLog([string]$Msg) {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $LogFile -Value "[$ts] $Msg" -Encoding UTF8
}

function Ensure-VercelLink {
    $projJson = Join-Path $RootDir ".vercel\project.json"
    if (-not (Test-Path $projJson) -and (Test-Path $VercelCmd)) {
        & $VercelCmd link --yes --project prj_BPadqj6dbSMGBHS9mAK6a2HW9Wio --scope stark-0473 >$null 2>&1
    }
}

function Test-NoStagedSecrets {
    $stagedFiles = @(& git diff --cached --name-only 2>$null)
    foreach ($f in $stagedFiles) {
        if ($f -match '(^|/)\.env($|\.)' -and $f -ne '.env.example') { return $false }
        if ($f -match '^(data/|\.vercel/|\.agents/|.*\.(key|pem|log|sql|dump|bak)$)') { return $false }
    }
    $diffText = (& git diff --cached -U0 2>$null) -join "`n"
    if ($diffText -match '(AIza[0-9A-Za-z\-_]{20,}|sk-[0-9A-Za-z\-_]{20,}|ya29\.[0-9A-Za-z\-_]{20,}|EAA[0-9A-Za-z]{25,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)') {
        return $false
    }
    return $true
}

Ensure-VercelLink
Write-SyncLog "NIHAT PRO GitHub + Vercel anlik otomatik senkronizasyon servisi baslatildi."

try {
    while ($true) {
        Start-Sleep -Seconds 3
        try {
            $status = (& git status --porcelain 2>$null)
            if ($status -and ($status.Count -gt 0 -or ($status -is [string] -and $status.Trim().Length -gt 0))) {
                # 3s debounce so multi-file edits group into one atomic commit + deploy
                Start-Sleep -Seconds 3
                & git add -A 2>$null | Out-Null
                & git reset -- .env .vercel .agents data/ *.log *.key *.pem *.bak *.sql *.dump >$null 2>&1

                if (-not (Test-NoStagedSecrets)) {
                    & git reset 2>$null | Out-Null
                    Write-SyncLog "GUVENLIK ENGELI: Gizli anahtar veya hassas dosya tespit edildigi icin otomatik senkron durduruldu!"
                    continue
                }

                $staged = @(& git diff --cached --name-only 2>$null)
                if ($staged.Count -gt 0) {
                    $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                    $summary = if ($staged.Count -le 3) { $staged -join ", " } else { "$($staged.Count) dosya" }
                    $commitMsg = "Auto-sync: $summary ($stamp)"
                    & git commit -m $commitMsg 2>&1 | Out-Null

                    & git push origin main >$null 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        Write-SyncLog "GITHUB PUSH OK: $commitMsg"
                    } else {
                        Write-SyncLog "GITHUB PUSH HATA: Baglantiyi kontrol edin."
                    }

                    if (Test-Path $VercelCmd) {
                        Ensure-VercelLink
                        & $VercelCmd deploy --prod --yes --scope stark-0473 >$null 2>&1
                        if ($LASTEXITCODE -eq 0) {
                            Write-SyncLog "VERCEL PROD DEPLOY OK: https://nihat-pro.vercel.app guncellendi ($summary)"
                        } else {
                            Write-SyncLog "VERCEL DEPLOY UYARI: GitHub webhook uzerinden devam ediyor."
                        }
                    }
                }
            }
        } catch {
            Write-SyncLog "Dongu hatasi algilandi."
        }
    }
} finally {
    try { $mutex.ReleaseMutex() } catch {}
    $mutex.Dispose()
}
