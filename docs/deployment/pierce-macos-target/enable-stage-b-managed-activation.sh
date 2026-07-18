#!/bin/bash
set -euo pipefail

MCX_FILE="$(mktemp /tmp/timeonchrome-pierce-stage-b-managed-policy.XXXXXX)"
COMPUTER_RECORD="/Computers/local_computer"
trap 'rm -f "$MCX_FILE"' EXIT
chmod 600 "$MCX_FILE"

HARDWARE_UUID="$(ioreg -rd1 -c IOPlatformExpertDevice | awk -F'\"' '/IOPlatformUUID/ { print $(NF-1); exit }')"
if [ -z "$HARDWARE_UUID" ]; then
  echo "Unable to resolve the current Mac Hardware UUID"
  exit 1
fi

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
dscl /Local/Default -create "$COMPUTER_RECORD" HardwareUUID "$HARDWARE_UUID"

read -rsp "Paste managedDeviceToken from TimeOnChrome cloud console: " MANAGED_DEVICE_TOKEN
echo
if [[ ! "$MANAGED_DEVICE_TOKEN" =~ ^[A-Fa-f0-9]{64}$ ]]; then
  echo "managedDeviceToken must be a 64-character hexadecimal token"
  exit 1
fi

cat > "$MCX_FILE" <<EOF
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
    <key>cloudEndpoint</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <string>https://guardian-api.william-xia-cn.workers.dev</string>
    </dict>
    <key>managedDeviceToken</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <string>${MANAGED_DEVICE_TOKEN}</string>
    </dict>
    <key>managedDeviceLabel</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <string>Pierce MacBook Chrome</string>
    </dict>
    <key>managedProfileEmail</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <string>pierce.xia@icloud.com</string>
    </dict>
    <key>allowIdentityRecovery</key>
    <dict>
      <key>state</key>
      <string>always</string>
      <key>value</key>
      <false/>
    </dict>
  </dict>
</dict>
</plist>
EOF
plutil -lint "$MCX_FILE"
dscl /Local/Default -mcximport "$COMPUTER_RECORD" "$MCX_FILE"
mcxrefresh -n "$(id -un)"
killall cfprefsd >/dev/null 2>&1 || true
mcxquery -user "$(id -un)" -format space | grep -Fq "com.google.Chrome.extensions.jdcancbiocacabbjdkngadmjpjmkdnih"

echo "[TimeOnChrome] Stage B imported. Restart Chrome and check Popup/Admin activationMode."
