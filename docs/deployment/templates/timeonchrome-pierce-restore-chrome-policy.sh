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
