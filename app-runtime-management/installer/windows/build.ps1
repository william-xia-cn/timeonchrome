param(
  [string]$Configuration = 'Release',
  [string]$Version = '1.0.1'
)

$ErrorActionPreference = 'Stop'
$runtimeRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$windowsRoot = Join-Path $runtimeRoot 'agents\windows'
$artifactRoot = Join-Path $runtimeRoot 'artifacts\win-x64'
$agentProject = Join-Path $windowsRoot 'src\TimeOnChrome.AppRuntime.Agent\TimeOnChrome.AppRuntime.Agent.csproj'
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

dotnet publish $agentProject -c $Configuration -r win-x64 --self-contained true -o $artifactRoot `
  -p:Version=$Version -p:AssemblyVersion=$fileVersion -p:FileVersion=$fileVersion `
  -p:InformationalVersion=$Version -p:IncludeSourceRevisionInInformationalVersion=false
if ($LASTEXITCODE -ne 0) { throw 'Agent publish failed.' }
dotnet publish $setupProject -c $Configuration -r win-x64 --self-contained true -o $artifactRoot `
  -p:Version=$Version -p:AssemblyVersion=$fileVersion -p:FileVersion=$fileVersion `
  -p:InformationalVersion=$Version -p:IncludeSourceRevisionInInformationalVersion=false
if ($LASTEXITCODE -ne 0) { throw 'Setup publish failed.' }
dotnet build (Join-Path $PSScriptRoot 'TimeOnChrome.AppRuntime.Installer.wixproj') -c $Configuration -p:ProductVersion=$Version
if ($LASTEXITCODE -ne 0) { throw 'MSI build failed.' }
