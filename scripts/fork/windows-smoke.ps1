param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference = "Stop"
$installation = Join-Path $env:RUNNER_TEMP "Superset++ à test"
$env:SUPERSET_HOME_DIR = Join-Path $env:RUNNER_TEMP "fork-profile-test"
$env:ELECTRON_RUN_AS_NODE = "1"
try {
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        $result = Start-Process -FilePath $Installer -ArgumentList ("/S /currentuser --updated /D=" + $installation) -Wait -PassThru
        if ($result.ExitCode -ne 0) { throw "NSIS installation failed: $($result.ExitCode)" }
    }
    $executable = Join-Path $installation "Superset++.exe"
    $probeOutput = Join-Path $env:RUNNER_TEMP "windows-native-stdout.log"
    $probeError = Join-Path $env:RUNNER_TEMP "windows-native-stderr.log"
    $probeArguments = '"' + (Join-Path $PSScriptRoot "windows-native-probe.cjs") + '" "' + $installation + '"'
    $probe = Start-Process -FilePath $executable -ArgumentList $probeArguments -Wait -PassThru -RedirectStandardOutput $probeOutput -RedirectStandardError $probeError
    Get-Content $probeOutput,$probeError -Encoding UTF8
    if ($probe.ExitCode -ne 0) { throw "Installed native runtime failed" }
    $bin = Join-Path $installation "resources/resources/bin"
    & (Join-Path $bin "txcript-transfer.exe") capabilities
    if ($LASTEXITCODE -ne 0) { throw "Installed conversion helper failed" }
    & (Join-Path $bin "txcript-cli.exe") list --json -n 1 --cwd $env:SUPERSET_HOME_DIR
    if ($LASTEXITCODE -ne 0) { throw "Installed session importer failed" }
    & (Join-Path $bin "superset.exe") --help
    if ($LASTEXITCODE -ne 0) { throw "Bundled CLI failed" }
    $script = Join-Path $installation "resources/resources/fork/install-windows.ps1"
    if (-not (Test-Path -LiteralPath $script)) { throw "Update helper missing" }
    & (Join-Path $PSScriptRoot "windows-updater-smoke.ps1") -Script $script
    Remove-Item Env:ELECTRON_RUN_AS_NODE
    & (Join-Path $PSScriptRoot "windows-startup-smoke.ps1") -Executable $executable
} finally { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
