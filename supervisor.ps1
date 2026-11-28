param(
    [int]$Port = 8787
)

$ErrorActionPreference = "Continue"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerScript = Join-Path $RootDir "server.ps1"
$DataDir = Join-Path $RootDir "data"
$LogFile = Join-Path $DataDir "server.log"

if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

function Test-PortOpen([int]$P) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $ar = $tcp.BeginConnect("127.0.0.1", $P, $null, $null)
        $ok = $ar.AsyncWaitHandle.WaitOne(400, $false)
        if ($ok -and $tcp.Connected) {
            $tcp.EndConnect($ar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
    } catch {}
    return $false
}

# If already running on this port, do not duplicate
if (Test-PortOpen $Port) {
    exit 0
}

while ($true) {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $LogFile -Value "[$ts] NIHAT PRO sunucusu baslatiliyor (Port $Port)..." -Encoding UTF8

    $proc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", "`"$ServerScript`"", "-Port", "$Port") `
        -WindowStyle Hidden -PassThru -Wait

    $code = $proc.ExitCode
    $ts2 = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $LogFile -Value "[$ts2] Sunucu cikis kodu: $code" -Encoding UTF8

    if ($code -eq 42) {
        Start-Sleep -Milliseconds 600
        continue
    }

    # If port was taken by another instance, stop loop; otherwise auto-recover after 2s
    if (Test-PortOpen $Port) {
        exit 0
    }
    Start-Sleep -Seconds 2
}
