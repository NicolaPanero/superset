param([Parameter(Mandatory=$true)][string]$ManifestPath)
$ErrorActionPreference = "Stop"
$update = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$parent = $null
try {
    if ([IO.Path]::GetFileName($update.executable) -ne "Superset++.exe") { throw "Unexpected application" }
    if ((Get-FileHash -LiteralPath $update.installer -Algorithm SHA256).Hash.ToLower() -ne $update.sha256) { throw "Installer checksum mismatch" }
    try { $parent = [Diagnostics.Process]::GetProcessById([int]$update.parentPid) } catch { throw "Application already stopped" }
    Set-Content -LiteralPath $update.status -Value "ready" -Encoding ascii
    if (-not $parent.WaitForExit(60000)) { throw "Application did not stop; update cancelled" }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $installPrefix = $update.directory.TrimEnd('\') + '\'
    do {
        $remaining = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase) })
        if ($remaining.Count -eq 0) { break }
        if ([DateTime]::UtcNow -gt $deadline) { throw "Application services did not stop; update cancelled" }
        Start-Sleep -Milliseconds 200
    } while ($true)
    $argsForInstaller = "/S /currentuser --updated /D=" + $update.directory
    $installation = Start-Process -FilePath $update.installer -ArgumentList $argsForInstaller -Wait -PassThru
    if ($installation.ExitCode -ne 0) { throw "Installer exited with code $($installation.ExitCode)" }
    Start-Process -FilePath $update.executable
} catch {
    $_ | Out-String | Add-Content -LiteralPath $update.log
    Set-Content -LiteralPath $update.status -Value "failed" -Encoding ascii
    if ($parent -and $parent.HasExited -and (Test-Path -LiteralPath $update.executable)) { Start-Process -FilePath $update.executable }
    exit 1
} finally {
    if ($parent) { $parent.Dispose() }
    Remove-Item -LiteralPath $update.work -Recurse -Force -ErrorAction SilentlyContinue
}
