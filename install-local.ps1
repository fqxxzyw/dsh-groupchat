param(
    [ValidatePattern('^[A-Za-z0-9_.-]+$')]
    [string]$Profile = 'desktop'
)

$ErrorActionPreference = 'Stop'
$pluginDir = $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $pluginDir 'BUILD-MANIFEST.json') -Raw | ConvertFrom-Json
$package = Get-Content -LiteralPath (Join-Path $pluginDir 'package.json') -Raw | ConvertFrom-Json
if ($package.version -ne $manifest.version) { throw 'Package and build manifest versions differ. Extract the complete ZIP again.' }
foreach ($file in $manifest.files) {
    $actual = (Get-FileHash -LiteralPath (Join-Path $pluginDir $file.path) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $file.sha256) { throw "Release file differs: $($file.path). Extract the complete ZIP again." }
}

$dshCommand = Get-Command dsh -ErrorAction Stop
$link = 'link:' + $pluginDir.Replace('\', '/')
Write-Host "Verified version: $($package.version)"
Write-Host "Registering plugin directory: $pluginDir"
& $dshCommand.Source plugin --profile $Profile add $link
if ($LASTEXITCODE -ne 0) { throw "DSH plugin registration failed (exit $LASTEXITCODE). Check the existing bundle path in DSH plugin settings." }
Write-Host 'Registration completed. Exit DSH completely (including the tray process), then restart it.'
Write-Host 'Open Group Chat and confirm both the client and host are beta.11. Existing chat data is retained.'
