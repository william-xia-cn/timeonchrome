param(
  [string]$Configuration = 'Release',
  [string]$Version = '2.0.1'
)

$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must use major.minor.patch format.' }
$runtimeRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$windowsRoot = Join-Path $runtimeRoot 'agents\windows'
$artifactRoot = Join-Path $runtimeRoot 'artifacts\win-x64'
$releasePlatformRoot = Join-Path $runtimeRoot 'artifacts\release\windows\x64'
$releaseRoot = Join-Path $releasePlatformRoot $Version
$serviceProject = Join-Path $windowsRoot 'src\TimeOnChrome.AppRuntime.Service\TimeOnChrome.AppRuntime.Service.csproj'
$sessionAgentProject = Join-Path $windowsRoot 'src\TimeOnChrome.AppRuntime.SessionAgent\TimeOnChrome.AppRuntime.SessionAgent.csproj'
$migrationProject = Join-Path $windowsRoot 'src\TimeOnChrome.AppRuntime.Migration\TimeOnChrome.AppRuntime.Migration.csproj'
$setupProject = Join-Path $windowsRoot 'src\TimeOnChrome.AppRuntime.Setup\TimeOnChrome.AppRuntime.Setup.csproj'
$fileVersion = "$Version.0"

if (Test-Path -LiteralPath $artifactRoot) {
  $resolvedRuntimeRoot = (Resolve-Path -LiteralPath $runtimeRoot).Path
  $resolvedArtifactRoot = (Resolve-Path -LiteralPath $artifactRoot).Path
  if (-not $resolvedArtifactRoot.StartsWith($resolvedRuntimeRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean artifact directory outside Runtime root: $resolvedArtifactRoot"
  }
  Remove-Item -LiteralPath $resolvedArtifactRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null

dotnet publish $serviceProject -c $Configuration -r win-x64 --self-contained true -o $artifactRoot `
  -p:Version=$Version -p:AssemblyVersion=$fileVersion -p:FileVersion=$fileVersion `
  -p:InformationalVersion=$Version -p:IncludeSourceRevisionInInformationalVersion=false
if ($LASTEXITCODE -ne 0) { throw 'Runtime Service publish failed.' }
dotnet publish $sessionAgentProject -c $Configuration -r win-x64 --self-contained true -o $artifactRoot `
  -p:Version=$Version -p:AssemblyVersion=$fileVersion -p:FileVersion=$fileVersion `
  -p:InformationalVersion=$Version -p:IncludeSourceRevisionInInformationalVersion=false
if ($LASTEXITCODE -ne 0) { throw 'Session Agent publish failed.' }
dotnet publish $migrationProject -c $Configuration -r win-x64 --self-contained true -o $artifactRoot `
  -p:Version=$Version -p:AssemblyVersion=$fileVersion -p:FileVersion=$fileVersion `
  -p:InformationalVersion=$Version -p:IncludeSourceRevisionInInformationalVersion=false
if ($LASTEXITCODE -ne 0) { throw 'Legacy migration preflight publish failed.' }
dotnet publish $setupProject -c $Configuration -r win-x64 --self-contained true -o $artifactRoot `
  -p:Version=$Version -p:AssemblyVersion=$fileVersion -p:FileVersion=$fileVersion `
  -p:InformationalVersion=$Version -p:IncludeSourceRevisionInInformationalVersion=false
if ($LASTEXITCODE -ne 0) { throw 'Setup publish failed.' }
dotnet build (Join-Path $PSScriptRoot 'TimeOnChrome.AppRuntime.Installer.wixproj') -c $Configuration -p:ProductVersion=$Version
if ($LASTEXITCODE -ne 0) { throw 'MSI build failed.' }
dotnet build (Join-Path $PSScriptRoot 'TimeOnChrome.AppRuntime.Bundle.wixproj') -c $Configuration -p:ProductVersion=$Version
if ($LASTEXITCODE -ne 0) { throw 'Burn bootstrapper build failed.' }

$installerOutputRoot = Join-Path $PSScriptRoot "bin\$Configuration"
$msiSource = Join-Path $installerOutputRoot 'TimeOnChrome-AppRuntime-win-x64.msi'
$bootstrapperSource = Join-Path $installerOutputRoot 'TimeOnChrome-AppRuntime-Setup-win-x64.exe'
if (-not (Test-Path -LiteralPath $msiSource) -or -not (Test-Path -LiteralPath $bootstrapperSource)) {
  throw 'Expected MSI or Burn output is missing.'
}

if (Test-Path -LiteralPath $releaseRoot) {
  $resolvedRuntimeRoot = (Resolve-Path -LiteralPath $runtimeRoot).Path
  $resolvedReleaseRoot = (Resolve-Path -LiteralPath $releaseRoot).Path
  if (-not $resolvedReleaseRoot.StartsWith($resolvedRuntimeRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean release directory outside Runtime root: $resolvedReleaseRoot"
  }
  Remove-Item -LiteralPath $resolvedReleaseRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null

$msiName = "TimeOnChrome-AppRuntime-win-x64-$Version.msi"
$bootstrapperName = "TimeOnChrome-AppRuntime-Setup-win-x64-$Version.exe"
$msiPath = Join-Path $releaseRoot $msiName
$bootstrapperPath = Join-Path $releaseRoot $bootstrapperName
Copy-Item -LiteralPath $msiSource -Destination $msiPath
Copy-Item -LiteralPath $bootstrapperSource -Destination $bootstrapperPath

$msi = Get-Item -LiteralPath $msiPath
$bootstrapper = Get-Item -LiteralPath $bootstrapperPath
$manifest = [ordered]@{
  version = $Version
  platform = 'windows'
  architecture = 'x64'
  bootstrapperPath = "windows/x64/$Version/$bootstrapperName"
  bootstrapperSha256 = (Get-FileHash -LiteralPath $bootstrapperPath -Algorithm SHA256).Hash.ToLowerInvariant()
  bootstrapperSizeBytes = $bootstrapper.Length
  msiPath = "windows/x64/$Version/$msiName"
  msiSha256 = (Get-FileHash -LiteralPath $msiPath -Algorithm SHA256).Hash.ToLowerInvariant()
  msiSizeBytes = $msi.Length
  signed = $false
  releaseStatus = 'BLOCKED_BY_AUTHENTICODE_SIGNING'
  latestEligible = $true
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $releaseRoot 'manifest.json') -Encoding utf8NoBOM

New-Item -ItemType Directory -Path $releasePlatformRoot -Force | Out-Null
$latest = [ordered]@{
  version = $Version
  platform = 'windows'
  architecture = 'x64'
  installerType = 'burn'
  installerPath = $manifest.bootstrapperPath
  sha256 = $manifest.bootstrapperSha256
  sizeBytes = $manifest.bootstrapperSizeBytes
  signed = $manifest.signed
  releaseStatus = $manifest.releaseStatus
}
$latest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $releasePlatformRoot 'latest.json') -Encoding utf8NoBOM

Write-Output "Release manifest: $(Join-Path $releaseRoot 'manifest.json')"
Write-Output "Latest candidate: $(Join-Path $releasePlatformRoot 'latest.json')"
