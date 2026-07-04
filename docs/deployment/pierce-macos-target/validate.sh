#!/bin/bash
set -euo pipefail

echo "== TimeOnChrome Pierce macOS policy validation =="

echo "-- Files --"
ls -l "/usr/local/timeonchrome-policy/com.google.Chrome.plist" || true
ls -l "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh" || true
ls -l "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist" || true
ls -l "/Library/Managed Preferences/com.google.Chrome.plist" || true

echo "-- Plist lint --"
plutil -lint "/usr/local/timeonchrome-policy/com.google.Chrome.plist" 2>/dev/null || true
plutil -lint "/Library/Managed Preferences/com.google.Chrome.plist" 2>/dev/null || true
plutil -lint "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist" 2>/dev/null || true

echo "-- LaunchDaemon --"
sudo launchctl print system/local.timeonchrome.restore-chrome-policy 2>/dev/null || true

echo "-- Restore log --"
tail -n 50 /var/log/timeonchrome-policy-restore.log 2>/dev/null || true

echo "-- Managed extension policy domain --"
dscl /Local/Default -mcxread /Computers/local_computer 2>/dev/null | grep -A 80 'com.google.Chrome.extensions.jdcancbiocacabbjdkngadmjpjmkdnih' || true

echo ""
echo "Manual checks:"
echo "1. Open chrome://policy and click Reload policies."
echo "2. Confirm ExtensionSettings is OK."
echo "3. Confirm extension ID jdcancbiocacabbjdkngadmjpjmkdnih in chrome://extensions."
echo "4. If Stage B was enabled, confirm Popup/Admin shows managed_policy."
