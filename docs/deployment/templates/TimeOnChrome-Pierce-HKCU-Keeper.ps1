# TimeOnChrome Windows HKCU Policy Keeper - Pierce
#
# Scope:
# - Current Windows user only (HKCU).
# - Installs and keeps Chrome policy for the current user's Chrome.
# - Does not target a single Chrome profile.
# - TimeOnChrome activates only when the current Chrome profile email matches Pierce.
#
# Secret handling:
# - This template does not contain a real managedDeviceToken.
# - The token is entered interactively on the target machine.
# - The token is stored locally in the expected policy snapshot and HKCU Chrome policy.

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$UseExistingToken
)

$ErrorActionPreference = 'Stop'

$PolicyRoot = 'C:\ProgramData\TimeOnChromePolicy'
$ExpectedPolicyPath = Join-Path $PolicyRoot 'expected-policy.json'
$RestoreScriptPath = Join-Path $PolicyRoot 'restore-timeonchrome-policy.ps1'
$LogPath = Join-Path $PolicyRoot 'restore.log'
$TaskName = 'TimeOnChrome Restore Chrome Policy'

$ExtensionId = 'jdcancbiocacabbjdkngadmjpjmkdnih'
$UpdateUrl = 'https://timeonchrome-update.pages.dev/timeonchrome/update.xml'
$CloudEndpoint = 'https://guardian-api.william-xia-cn.workers.dev'
$ManagedDeviceLabel = 'Pierce Windows Chrome'
$ManagedProfileEmail = 'pierce.xia@icloud.com'

function Write-PolicyLog {
  param([string]$Message)
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $LogPath -Value "$timestamp $Message" -Encoding UTF8
}

function Remove-TimeOnChromePolicy {
  New-Item -ItemType Directory -Force -Path $PolicyRoot | Out-Null
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-PolicyLog "Removed scheduled task: $TaskName"
  }

  Remove-ItemProperty -Path 'HKCU:\Software\Policies\Google\Chrome' -Name 'ExtensionSettings' -ErrorAction SilentlyContinue
  Remove-Item -Path "HKCU:\Software\Policies\Google\Chrome\3rdparty\extensions\$ExtensionId" -Recurse -Force -ErrorAction SilentlyContinue
  Write-PolicyLog 'Removed HKCU Chrome policy values for TimeOnChrome.'
}

if ($Uninstall) {
  Remove-TimeOnChromePolicy
  Write-Host 'TimeOnChrome HKCU policy removed. Restart Chrome, then check chrome://policy.'
  exit 0
}

New-Item -ItemType Directory -Force -Path $PolicyRoot | Out-Null

if ($UseExistingToken) {
  if (-not (Test-Path -LiteralPath $ExpectedPolicyPath)) {
    throw "Cannot use existing token because expected policy snapshot is missing: $ExpectedPolicyPath"
  }
  $existingPolicy = Get-Content -LiteralPath $ExpectedPolicyPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $managedDeviceToken = [string]$existingPolicy.managedDeviceToken
  if ([string]::IsNullOrWhiteSpace($managedDeviceToken)) {
    throw 'Existing expected policy snapshot does not contain managedDeviceToken.'
  }
} else {
  $secureToken = Read-Host 'Paste managedDeviceToken from TimeOnChrome cloud console' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $managedDeviceToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

if ([string]::IsNullOrWhiteSpace($managedDeviceToken)) {
  throw 'managedDeviceToken is required.'
}

$expectedPolicy = [ordered]@{
  extensionId = $ExtensionId
  updateUrl = $UpdateUrl
  cloudEndpoint = $CloudEndpoint
  managedDeviceToken = $managedDeviceToken
  managedDeviceLabel = $ManagedDeviceLabel
  managedProfileEmail = $ManagedProfileEmail
}

$expectedPolicy | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ExpectedPolicyPath -Encoding UTF8

$restoreScript = @'
$ErrorActionPreference = 'Stop'

$PolicyRoot = 'C:\ProgramData\TimeOnChromePolicy'
$ExpectedPolicyPath = Join-Path $PolicyRoot 'expected-policy.json'
$LogPath = Join-Path $PolicyRoot 'restore.log'

function Write-PolicyLog {
  param([string]$Message)
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $LogPath -Value "$timestamp $Message" -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $ExpectedPolicyPath)) {
  Write-PolicyLog "ERROR: expected policy snapshot missing: $ExpectedPolicyPath"
  exit 1
}

$policy = Get-Content -LiteralPath $ExpectedPolicyPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $policy.extensionId -or -not $policy.updateUrl -or -not $policy.cloudEndpoint -or -not $policy.managedDeviceToken -or -not $policy.managedProfileEmail) {
  Write-PolicyLog 'ERROR: expected policy snapshot is incomplete.'
  exit 1
}

$chromePolicyPath = 'HKCU:\Software\Policies\Google\Chrome'
$managedPolicyPath = "HKCU:\Software\Policies\Google\Chrome\3rdparty\extensions\$($policy.extensionId)\policy"
$legacyNestedPath = "HKCU:\Software\Policies\Google\Chrome\ExtensionSettings\$($policy.extensionId)"

New-Item -Path $chromePolicyPath -Force | Out-Null
Remove-Item -Path $legacyNestedPath -Recurse -Force -ErrorAction SilentlyContinue

$extensionSettings = @{
  $policy.extensionId = @{
    installation_mode = 'force_installed'
    toolbar_pin = 'force_pinned'
    update_url = $policy.updateUrl
  }
} | ConvertTo-Json -Compress -Depth 6

Set-ItemProperty -Path $chromePolicyPath -Name 'ExtensionSettings' -Type String -Value $extensionSettings

Remove-Item -Path "HKCU:\Software\Policies\Google\Chrome\3rdparty\extensions\$($policy.extensionId)" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -Path $managedPolicyPath -Force | Out-Null
Set-ItemProperty -Path $managedPolicyPath -Name 'enabled' -Type DWord -Value 1
Set-ItemProperty -Path $managedPolicyPath -Name 'deploymentMode' -Type String -Value 'managed'
Set-ItemProperty -Path $managedPolicyPath -Name 'cloudEndpoint' -Type String -Value $policy.cloudEndpoint
Set-ItemProperty -Path $managedPolicyPath -Name 'managedDeviceToken' -Type String -Value $policy.managedDeviceToken
Set-ItemProperty -Path $managedPolicyPath -Name 'managedDeviceLabel' -Type String -Value $policy.managedDeviceLabel
Set-ItemProperty -Path $managedPolicyPath -Name 'managedProfileEmail' -Type String -Value $policy.managedProfileEmail

Write-PolicyLog "Restored TimeOnChrome HKCU Chrome policy for extension $($policy.extensionId), gated to Chrome profile $($policy.managedProfileEmail)."
'@

Set-Content -LiteralPath $RestoreScriptPath -Value $restoreScript -Encoding UTF8

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RestoreScriptPath
if ($LASTEXITCODE -ne 0) {
  throw "Initial restore failed with exit code $LASTEXITCODE."
}

$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$RestoreScriptPath`""
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger @($logonTrigger, $repeatTrigger) -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-PolicyLog "Installed scheduled task: $TaskName"
Write-Host 'TimeOnChrome HKCU policy keeper installed.'
Write-Host 'Restart Chrome, open chrome://policy, click Reload policies, then verify ExtensionSettings is OK.'
