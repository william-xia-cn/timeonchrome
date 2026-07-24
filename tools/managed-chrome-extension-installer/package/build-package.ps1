param(
  [string]$ConfigPath,
  [string]$OutputDir = "dist/managed-chrome-extension-installer",
  [string]$PackageName,
  [switch]$IncludeExampleConfig
)

$ErrorActionPreference = "Stop"
$moduleRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$moduleRoot = $moduleRoot.Path

if (-not $PackageName) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $PackageName = "managed-chrome-extension-installer-$stamp"
}

$outRoot = Join-Path (Get-Location) $OutputDir
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null
$outRootResolved = (Resolve-Path -LiteralPath $outRoot).Path
$stage = Join-Path $outRootResolved $PackageName

if (Test-Path -LiteralPath $stage) {
  $stageResolved = (Resolve-Path -LiteralPath $stage).Path
  if (-not $stageResolved.StartsWith($outRootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove staging outside output directory: $stageResolved"
  }
  Remove-Item -LiteralPath $stageResolved -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Item -LiteralPath (Join-Path $moduleRoot "src/macos-managed-extension-installer.sh") -Destination (Join-Path $stage "macos-managed-extension-installer.sh")
Copy-Item -LiteralPath (Join-Path $moduleRoot "templates/install.command") -Destination (Join-Path $stage "install.command")
Copy-Item -LiteralPath (Join-Path $moduleRoot "templates/uninstall.command") -Destination (Join-Path $stage "uninstall.command")
Copy-Item -LiteralPath (Join-Path $moduleRoot "README.md") -Destination (Join-Path $stage "README.md")
Copy-Item -LiteralPath (Join-Path $moduleRoot "docs") -Destination (Join-Path $stage "docs") -Recurse

if ($ConfigPath) {
  $resolvedConfig = Resolve-Path -LiteralPath $ConfigPath
  Copy-Item -LiteralPath $resolvedConfig.Path -Destination (Join-Path $stage "private-config.plist")
} elseif ($IncludeExampleConfig) {
  Copy-Item -LiteralPath (Join-Path $moduleRoot "templates/private-config.example.plist") -Destination (Join-Path $stage "private-config.plist")
} else {
  Copy-Item -LiteralPath (Join-Path $moduleRoot "templates/private-config.example.plist") -Destination (Join-Path $stage "private-config.example.plist")
}

$manifestPath = Join-Path $stage "PACKAGE-MANIFEST.txt"
$lines = @()
$lines += "Managed Chrome Extension Installer package"
$lines += "Generated: $(Get-Date -Format o)"
$lines += "NOTE: SHA256 values cover every package file except this manifest itself."
$lines += ""
Get-ChildItem -Path $stage -File -Recurse | Where-Object { $_.Name -ne "PACKAGE-MANIFEST.txt" } | Sort-Object FullName | ForEach-Object {
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
  $relative = $_.FullName.Substring($stage.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
  $lines += "$hash  $relative"
}
Set-Content -LiteralPath $manifestPath -Value ($lines -join "`n") -Encoding utf8NoBOM

$archive = Join-Path $outRootResolved "$PackageName.tar.gz"
if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}

tar -czf $archive -C $outRootResolved $PackageName

[pscustomobject]@{
  PackageName = $PackageName
  StagingPath = $stage
  ArchivePath = $archive
  HasPrivateConfig = [bool]$ConfigPath
  FileCount = (Get-ChildItem -Path $stage -File -Recurse).Count
}
