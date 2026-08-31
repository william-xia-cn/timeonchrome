param(
  [string]$Configuration = 'Release',
  [string]$Version = '1.0.0'
)

$ErrorActionPreference = 'Stop'
$runtimeRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$windowsRoot = Join-Path $runtimeRoot 'agents\windows'
$artifactRoot = Join-Path $runtimeRoot 'artifacts\win-x64'
$agentProject = Join-Path $windowsRoot 'src\TimeOnChrome.AppRuntime.Agent\TimeOnChrome.AppRuntime.Agent.csproj'
$setupProject = Join-Path $windowsRoot 'src\TimeOnChrome.AppRuntime.Setup\TimeOnChrome.AppRuntime.Setup.csproj'

dotnet publish $agentProject -c $Configuration -r win-x64 --self-contained true -o $artifactRoot
if ($LASTEXITCODE -ne 0) { throw 'Agent publish failed.' }
dotnet publish $setupProject -c $Configuration -r win-x64 --self-contained true -o $artifactRoot
if ($LASTEXITCODE -ne 0) { throw 'Setup publish failed.' }
dotnet build (Join-Path $PSScriptRoot 'TimeOnChrome.AppRuntime.Installer.wixproj') -c $Configuration -p:ProductVersion=$Version
if ($LASTEXITCODE -ne 0) { throw 'MSI build failed.' }
