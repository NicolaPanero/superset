param(
    [Parameter(Mandatory=$true)][string]$Installer,
    [string]$Installation = (Join-Path $env:RUNNER_TEMP "Superset++ import test")
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath (Join-Path $Installation "Superset++.exe"))) {
    $result = Start-Process -FilePath $Installer -ArgumentList ("/S /currentuser /D=" + $Installation) -PassThru
    if (-not $result.WaitForExit(180000)) {
        & taskkill.exe /PID $result.Id /T /F
        throw "NSIS installation did not finish within three minutes"
    }
    $result.WaitForExit()
    if ($result.ExitCode -ne 0) { throw "NSIS installation failed: $($result.ExitCode)" }
}
$resources = Join-Path $Installation "resources"
& bun (Join-Path $PSScriptRoot "windows-import-smoke.ts") (Join-Path $Installation "Superset++.exe") (Join-Path $resources "app.asar") (Join-Path $resources "resources")
if ($LASTEXITCODE -ne 0) { throw "Project import failed on Windows" }
