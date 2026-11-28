param(
    [int]$Port = 8787
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalServerJs = Join-Path $RootDir "local-server.js"

# Locate Node.js 22 runtime (User PATH, LocalAppData, or Program Files)
$NodeCandidates = @(
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
    "C:\Program Files\nodejs\node.exe"
)
$NodeExe = $null
if (Get-Command node -ErrorAction SilentlyContinue) {
    $NodeExe = (Get-Command node).Source
} else {
    foreach ($cand in $NodeCandidates) {
        if (Test-Path -LiteralPath $cand) {
            $NodeExe = $cand
            break
        }
    }
}

if (-not $NodeExe) {
    Write-Error "Node.js calisma zamani bulunamadi. Lutfen Node.js LTS kurulumunu kontrol edin."
    exit 1
}

Set-Location $RootDir
$env:NIHAT_PORT = "$Port"
& $NodeExe $LocalServerJs $Port
exit $LASTEXITCODE
