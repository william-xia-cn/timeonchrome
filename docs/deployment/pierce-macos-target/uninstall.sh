#!/bin/bash
set -euo pipefail

LAUNCH_DAEMON="/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
MCX_FILE="/tmp/timeonchrome-pierce-stage-b-managed-policy-remove.plist"

echo "[TimeOnChrome] Uninstalling Pierce macOS policy keeper"

launchctl bootout system "$LAUNCH_DAEMON" 2>/dev/null || true

rm -f "$LAUNCH_DAEMON"
rm -f "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
rm -rf "/usr/local/timeonchrome-policy"
rm -f "/Library/Managed Preferences/com.google.Chrome.plist"

cat > "$MCX_FILE" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.google.Chrome.extensions.jdcancbiocacabbjdkngadmjpjmkdnih</key>
  <dict/>
</dict>
</plist>
EOF

if dscl /Local/Default -read /Computers/local_computer >/dev/null 2>&1; then
  dscl /Local/Default -mcxdelete /Computers/local_computer com.google.Chrome.extensions.jdcancbiocacabbjdkngadmjpjmkdnih 2>/dev/null || true
fi

killall cfprefsd >/dev/null 2>&1 || true

echo "[TimeOnChrome] Uninstalled. Restart Chrome and check chrome://policy."
