param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference = "Stop"
$userData = Join-Path $env:RUNNER_TEMP "fork-window-profile"
$stdout = Join-Path $env:RUNNER_TEMP "fork-window-stdout.log"
$stderr = Join-Path $env:RUNNER_TEMP "fork-window-stderr.log"
$applicationProcess = Start-Process -FilePath $Executable -ArgumentList "--user-data-dir=`"$userData`"" -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $applicationProcess.Refresh()
        if ($applicationProcess.HasExited) { throw "Installed app exited before opening a window: $(Get-Content $stderr -Raw)" }
        if ($applicationProcess.MainWindowHandle -ne 0) { break }
        if ([DateTime]::UtcNow -gt $deadline) { throw "Installed app did not open a window: $(Get-Content $stderr -Raw)" }
        Start-Sleep -Milliseconds 200
    } while ($true)
    $output = (Get-Content $stdout -Raw) + (Get-Content $stderr -Raw)
    if ($output -match 'Failed to load renderer|Renderer process gone|Uncaught exception') { throw $output }
    Write-Host "Installed Superset++ opened a native window with an isolated profile"
} finally {
    & taskkill.exe /PID $applicationProcess.Id /T /F | Out-Null
}
