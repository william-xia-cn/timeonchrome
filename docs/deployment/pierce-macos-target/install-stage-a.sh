#!/bin/bash
set -euo pipefail

POLICY_SRC="/usr/local/timeonchrome-policy/com.google.Chrome.plist"
RESTORE_SCRIPT="/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
LAUNCH_DAEMON="/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"

echo "[TimeOnChrome] Installing Stage A: self-hosted force-install policy only"

mkdir -p "/Library/Managed Preferences"
mkdir -p "/usr/local/timeonchrome-policy"
mkdir -p "/usr/local/sbin"

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
      <key>override_update_url</key>
      <true/>
    </dict>
  </dict>
</dict>
</plist>
EOF

cat > "$RESTORE_SCRIPT" <<'EOF'
#!/bin/bash
set -euo pipefail

SRC="/usr/local/timeonchrome-policy/com.google.Chrome.plist"
DST_DIR="/Library/Managed Preferences"
DST="/Library/Managed Preferences/com.google.Chrome.plist"
TMP="/Library/Managed Preferences/com.google.Chrome.plist.tmp"
LOG="/var/log/timeonchrome-policy-restore.log"

timestamp() {
  /bin/date "+%Y-%m-%d %H:%M:%S"
}

log() {
  /bin/echo "$(timestamp) $1" >> "$LOG"
  /usr/bin/logger -t timeonchrome-policy "$1"
}

if [ ! -f "$SRC" ]; then
  log "ERROR: source policy missing: $SRC"
  exit 1
fi

if ! /usr/bin/plutil -lint "$SRC" >/dev/null 2>&1; then
  log "ERROR: source policy invalid: $SRC"
  exit 1
fi

/bin/mkdir -p "$DST_DIR"

if [ ! -f "$DST" ] || ! /usr/bin/cmp -s "$SRC" "$DST"; then
  /bin/cp "$SRC" "$TMP"
  /usr/sbin/chown root:wheel "$TMP"
  /bin/chmod 644 "$TMP"

  if ! /usr/bin/plutil -lint "$TMP" >/dev/null 2>&1; then
    /bin/rm -f "$TMP"
    log "ERROR: temp policy failed plist validation"
    exit 1
  fi

  /bin/mv "$TMP" "$DST"
  /usr/sbin/chown root:wheel "$DST"
  /bin/chmod 644 "$DST"
  /usr/bin/killall cfprefsd >/dev/null 2>&1 || true
  log "Restored Chrome policy to $DST"
else
  log "Chrome policy already correct; no change"
fi

exit 0
EOF

cat > "$LAUNCH_DAEMON" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>local.timeonchrome.restore-chrome-policy</string>

  <key>UserName</key>
  <string>root</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/sbin/timeonchrome-restore-chrome-policy.sh</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>StartInterval</key>
  <integer>300</integer>

  <key>WatchPaths</key>
  <array>
    <string>/Library/Managed Preferences</string>
    <string>/usr/local/timeonchrome-policy/com.google.Chrome.plist</string>
  </array>

  <key>StandardOutPath</key>
  <string>/var/log/timeonchrome-policy-restore.out.log</string>

  <key>StandardErrorPath</key>
  <string>/var/log/timeonchrome-policy-restore.err.log</string>
</dict>
</plist>
EOF

chown root:wheel "$POLICY_SRC"
chmod 644 "$POLICY_SRC"
chown root:wheel "$RESTORE_SCRIPT"
chmod 755 "$RESTORE_SCRIPT"
chown root:wheel "$LAUNCH_DAEMON"
chmod 644 "$LAUNCH_DAEMON"

plutil -lint "$POLICY_SRC"
plutil -lint "$LAUNCH_DAEMON"

"$RESTORE_SCRIPT"

launchctl bootout system "$LAUNCH_DAEMON" 2>/dev/null || true
launchctl bootstrap system "$LAUNCH_DAEMON"
launchctl kickstart -k system/local.timeonchrome.restore-chrome-policy

echo "[TimeOnChrome] Stage A installed. Restart Chrome and check chrome://policy."
