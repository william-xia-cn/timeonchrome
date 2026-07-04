#!/bin/bash
set -euo pipefail

MCX_FILE="/tmp/timeonchrome-pierce-stage-b-managed-policy.plist"
COMPUTER_RECORD="/Computers/local_computer"

echo "[TimeOnChrome] Enabling Stage B: managed activation"

if ! dscl /Local/Default -read "$COMPUTER_RECORD" >/dev/null 2>&1; then
  GUID="$(uuidgen)"
  ETHER="$(ifconfig en0 2>/dev/null | awk '/ether/ {print $2; exit}')"
  if [ -z "${ETHER:-}" ]; then
    ETHER="$(ifconfig 2>/dev/null | awk '/ether/ {print $2; exit}')"
  fi
  dscl /Local/Default -create "$COMPUTER_RECORD"
  dscl /Local/Default -create "$COMPUTER_RECORD" RealName "Local Computer"
  dscl /Local/Default -create "$COMPUTER_RECORD" GeneratedUID "$GUID"
  if [ -n "${ETHER:-}" ]; then
    dscl /Local/Default -create "$COMPUTER_RECORD" ENetAddress "$ETHER"
  fi
fi

cat > "$MCX_FILE" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.google.Chrome.extensions.jdcancbiocacabbjdkngadmjpjmkdnih</key>
  <dict>
    <key>enabled</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <true/>
    </dict>
    <key>deploymentMode</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <string>managed</string>
    </dict>
    <key>tenantId</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <string>pierce-xia-icloud</string>
    </dict>
    <key>devicePolicyId</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <string>pierce-macos-chrome-001</string>
    </dict>
    <key>cloudEndpoint</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <string>https://guardian-api.william-xia-cn.workers.dev</string>
    </dict>
    <key>allowIdentityRecovery</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <true/>
    </dict>
  </dict>
</dict>
</plist>
EOF

plutil -lint "$MCX_FILE"
dscl /Local/Default -mcximport "$COMPUTER_RECORD" "$MCX_FILE"
mcxrefresh -n "$(id -un)" 2>/dev/null || true
killall cfprefsd >/dev/null 2>&1 || true

echo "[TimeOnChrome] Stage B imported. Restart Chrome and check Popup/Admin activationMode."
