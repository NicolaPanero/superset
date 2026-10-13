param([Parameter(Mandatory=$true)][string]$Script)
$ErrorActionPreference = "Stop"
$root = Join-Path $env:RUNNER_TEMP "updater à fixture"
$work = Join-Path $root "staging"
$application = Join-Path $root "app with spaces"
New-Item -ItemType Directory -Force $work,$application | Out-Null
$source = @'
using System;
using System.IO;
class Probe {
 static void Main(string[] args) {
  if (Path.GetFileName(Environment.GetCommandLineArgs()[0]).Equals("setup.exe",StringComparison.OrdinalIgnoreCase)) File.WriteAllText(Environment.GetEnvironmentVariable("FORK_UPDATE_ARGS"),Environment.CommandLine);
  else File.WriteAllText(Environment.GetEnvironmentVariable("FORK_UPDATE_RESTART"),"restarted");
 }
}
'@
$setup = Join-Path $work "setup.exe"
# Windows PowerShell uses the installed .NET Framework compiler.
$sourceFile = Join-Path $root "probe.cs"
Set-Content -LiteralPath $sourceFile -Value $source -Encoding utf8
& "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /target:exe "/out:$setup" $sourceFile
if ($LASTEXITCODE -ne 0) { throw "Cannot compile updater fixture" }
$exe = Join-Path $application "Superset++.exe"
Copy-Item $setup $exe
$env:FORK_UPDATE_ARGS = Join-Path $root "arguments.txt"
$env:FORK_UPDATE_RESTART = Join-Path $root "restarted.txt"
$parentProcess = Start-Process powershell.exe -ArgumentList '-NoProfile -NonInteractive -Command "Start-Sleep -Seconds 60"' -PassThru -WindowStyle Hidden
$manifest = Join-Path $work "update.json"
$status = Join-Path $work "status"
$log = Join-Path $root "update.log"
@{executable=$exe;directory=$application;installer=$setup;status=$status;parentPid=$parentProcess.Id;log=$log;work=$work;sha256=(Get-FileHash $setup -Algorithm SHA256).Hash.ToLower()} | ConvertTo-Json | Set-Content $manifest -Encoding utf8
$updater = Start-Process powershell.exe -ArgumentList "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Script`" -ManifestPath `"$manifest`"" -PassThru -WindowStyle Hidden
try {
 $deadline = [DateTime]::UtcNow.AddSeconds(30)
 while (-not (Test-Path $status)) { if($updater.HasExited -or [DateTime]::UtcNow -gt $deadline){throw "Updater did not prepare"}; Start-Sleep -Milliseconds 100 }
 if ((Get-Content $status).Trim() -ne "ready") { throw "Updater failed before preparation" }
 if(Test-Path $env:FORK_UPDATE_RESTART) {throw "Updater restarted before app shutdown"}
 Stop-Process -Id $parentProcess.Id
 if (-not $updater.WaitForExit(30000)) { throw "Updater did not complete" }
 if($updater.ExitCode -ne 0){throw (Get-Content $log -Raw)}
 $deadline = [DateTime]::UtcNow.AddSeconds(10)
 while (-not (Test-Path $env:FORK_UPDATE_RESTART)){if([DateTime]::UtcNow -gt $deadline){throw "App did not restart"}; Start-Sleep -Milliseconds 100}
 $arguments = Get-Content $env:FORK_UPDATE_ARGS -Raw
 if(-not $arguments.EndsWith("/S /currentuser --updated /D=$application")) {throw "Wrong installer arguments: $arguments"}
 if(Test-Path $work){throw "Updater left staging behind"}
 Write-Host "Windows updater shutdown, Unicode installation arguments and restart OK"
} finally {
 if(-not $parentProcess.HasExited){Stop-Process -Id $parentProcess.Id -ErrorAction SilentlyContinue}
 if(-not $updater.HasExited){Stop-Process -Id $updater.Id -ErrorAction SilentlyContinue}
 Remove-Item Env:FORK_UPDATE_ARGS,Env:FORK_UPDATE_RESTART -ErrorAction SilentlyContinue
}
