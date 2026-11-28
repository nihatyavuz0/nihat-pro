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

$env:PATH = "$env:LOCALAPPDATA\Programs\SmartGitTools\git\cmd;$env:LOCALAPPDATA\Programs\SmartGitTools\gh\bin;$env:LOCALAPPDATA\Programs\nodejs;" + $env:PATH
Set-Location $RootDir

function Write-SyncLog([string]$Msg) {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $LogFile -Value "[$ts] $Msg" -Encoding UTF8
}

function Test-NoStagedSecrets {
    $stagedFiles = @(& git diff --cached --name-only 2>$null)
    foreach ($f in $stagedFiles) {
        if ($f -match '(^|/)\.env($|\.)' -and $f -ne '.env.example') { return $false }
        if ($f -match '^(data/|\.vercel/|.*\.(key|pem|log|sql|dump|bak)$)') { return $false }
    }
    $diffText = (& git diff --cached -U0 2>$null) -join "`n"
    if ($diffText -match '(AIza[0-9A-Za-z\-_]{20,}|sk-[0-9A-Za-z\-_]{20,}|ya29\.[0-9A-Za-z\-_]{20,}|EAA[0-9A-Za-z]{25,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)') {
        return $false
    }
    return $true
}

Write-SyncLog "NIHAT PRO GitHub guvenli anlik senkronizasyon baslatildi."

try {
    while ($true) {
        Start-Sleep -Seconds 4
        try {
            $status = (& git status --porcelain 2>$null)
            if ($status -and ($status.Count -gt 0 -or ($status -is [string] -and $status.Trim().Length -gt 0))) {
                Start-Sleep -Seconds 4
                & git add -A 2>$null | Out-Null
                if (-not (Test-NoStagedSecrets)) {
                    & git reset 2>$null | Out-Null
                    Write-SyncLog "GUVENLIK ENGELI: Gizli anahtar veya hassas dosya tespit edildigi icin otomatik commit durduruldu!"
                    continue
                }
                $staged = @(& git diff --cached --name-only 2>$null)
                if ($staged.Count -gt 0) {
                    $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                    $summary = if ($staged.Count -le 3) { $staged -join ", " } else { "$($staged.Count) dosya" }
                    $commitMsg = "Auto-sync: $summary ($stamp)"
                    & git commit -m $commitMsg 2>&1 | Out-Null
                    $pushOut = (& git push origin main 2>&1) -join " | "
                    if ($LASTEXITCODE -eq 0) {
                        Write-SyncLog "PUSH OK: $commitMsg"
                    } else {
                        Write-SyncLog "PUSH HATA: GitHub baglantisini kontrol edin."
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
