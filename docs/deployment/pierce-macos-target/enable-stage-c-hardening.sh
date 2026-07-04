#!/bin/bash
set -euo pipefail

POLICY_SRC="/usr/local/timeonchrome-policy/com.google.Chrome.plist"
RESTORE_SCRIPT="/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"

echo "[TimeOnChrome] Enabling Stage C: Chrome profile hardening"

if [ ! -x "$RESTORE_SCRIPT" ]; then
  echo "ERROR: restore script missing. Run install-stage-a.sh first." >&2
  exit 1
fi

cat > "$POLICY_SRC" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>ExtensionSettings</key>
  <dict>
    <key>jdcancbiocacabbjdkngadmjpjmkdnih</key>
    <dict>
      <key>installation_mode</key>
      <string>force_installed</string>
      <key>toolbar_pin</key>
      <string>force_pinned</string>
      <key>update_url</key>
      <string>https://timeonchrome-update.pages.dev/timeonchrome/update.xml</string>
    </dict>
  </dict>

  <key>BrowserSignin</key>
  <integer>2</integer>

  <key>RestrictSigninToPattern</key>
  <string>^[Pp]ierce\.xia@icloud\.com$</string>

  <key>BrowserAddPersonEnabled</key>
  <false/>

  <key>BrowserGuestModeEnabled</key>
  <false/>

  <key>IncognitoModeAvailability</key>
  <integer>1</integer>
</dict>
</plist>
EOF

chown root:wheel "$POLICY_SRC"
chmod 644 "$POLICY_SRC"
plutil -lint "$POLICY_SRC"
"$RESTORE_SCRIPT"
launchctl kickstart -k system/local.timeonchrome.restore-chrome-policy 2>/dev/null || true
killall cfprefsd >/dev/null 2>&1 || true

echo "[TimeOnChrome] Stage C enabled. Restart Chrome and check chrome://policy."
