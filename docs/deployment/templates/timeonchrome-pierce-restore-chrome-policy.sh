#!/bin/bash
set -euo pipefail
SRC="/usr/local/timeonchrome-policy/com.google.Chrome.plist"
MCX_SRC="/usr/local/timeonchrome-policy/timeonchrome-managed-mcx.plist"
MANAGED_SRC="/usr/local/timeonchrome-policy/timeonchrome-managed-extension.plist"
DST_DIR="/Library/Managed Preferences"
DST="$DST_DIR/com.google.Chrome.plist"
MANAGED_DOMAIN="$(/usr/bin/python3 - "$MCX_SRC" <<'PY'
import plistlib, re, sys
with open(sys.argv[1], "rb") as fh:
    data = plistlib.load(fh)
if len(data) != 1:
    raise SystemExit(1)
domain = next(iter(data))
if not re.fullmatch(r"com\.google\.Chrome\.extensions\.[a-p]{32}", domain):
    raise SystemExit(1)
print(domain)
PY
)" || { log "ERROR: managed extension domain invalid"; exit 1; }
MANAGED_DST="$DST_DIR/$MANAGED_DOMAIN.plist"
TMP="$DST.tmp"
MANAGED_TMP="$MANAGED_DST.tmp"
LOG="/var/log/timeonchrome-policy-restore.log"
COMPUTER_RECORD="/Computers/local_computer"
timestamp() { /bin/date "+%Y-%m-%d %H:%M:%S"; }
log() { /bin/echo "$(timestamp) $1" >> "$LOG"; /usr/bin/logger -t timeonchrome-policy "$1"; }
[ -f "$SRC" ] || { log "ERROR: source policy missing"; exit 1; }
[ -f "$MCX_SRC" ] || { log "ERROR: managed policy source missing"; exit 1; }
[ -f "$MANAGED_SRC" ] || { log "ERROR: extension managed preferences source missing"; exit 1; }
/usr/bin/plutil -lint "$SRC" >/dev/null 2>&1 || { log "ERROR: source policy invalid"; exit 1; }
/usr/bin/plutil -lint "$MCX_SRC" >/dev/null 2>&1 || { log "ERROR: managed policy source invalid"; exit 1; }
/usr/bin/plutil -lint "$MANAGED_SRC" >/dev/null 2>&1 || { log "ERROR: extension managed preferences source invalid"; exit 1; }
/bin/mkdir -p "$DST_DIR"
if [ ! -f "$DST" ] || ! /usr/bin/cmp -s "$SRC" "$DST"; then
  /bin/cp "$SRC" "$TMP"
  /usr/sbin/chown root:wheel "$TMP"
  /bin/chmod 644 "$TMP"
  /usr/bin/plutil -lint "$TMP" >/dev/null 2>&1 || { /bin/rm -f "$TMP"; log "ERROR: temp policy invalid"; exit 1; }
  /bin/mv "$TMP" "$DST"
  /usr/bin/killall cfprefsd >/dev/null 2>&1 || true
  log "Restored Chrome policy"
else
  log "Chrome policy already correct"
fi
if [ ! -f "$MANAGED_DST" ] || ! /usr/bin/cmp -s "$MANAGED_SRC" "$MANAGED_DST"; then
  /bin/cp "$MANAGED_SRC" "$MANAGED_TMP"
  /usr/sbin/chown root:wheel "$MANAGED_TMP"
  /bin/chmod 644 "$MANAGED_TMP"
  /usr/bin/plutil -lint "$MANAGED_TMP" >/dev/null 2>&1 || { /bin/rm -f "$MANAGED_TMP"; log "ERROR: extension managed preferences temp invalid"; exit 1; }
  /bin/mv "$MANAGED_TMP" "$MANAGED_DST"
  /usr/bin/killall cfprefsd >/dev/null 2>&1 || true
  log "Restored extension managed preferences"
else
  log "Extension managed preferences already correct"
fi

hardware_uuid="$(/usr/sbin/ioreg -rd1 -c IOPlatformExpertDevice | /usr/bin/awk -F'"' '/IOPlatformUUID/ {print $(NF-1); exit}')"
[ -n "$hardware_uuid" ] || { log "ERROR: hardware UUID unavailable"; exit 1; }
if ! /usr/bin/dscl /Local/Default -read "$COMPUTER_RECORD" >/dev/null 2>&1; then
  /usr/bin/dscl /Local/Default -create "$COMPUTER_RECORD"
  /usr/bin/dscl /Local/Default -create "$COMPUTER_RECORD" RealName "Local Computer"
  /usr/bin/dscl /Local/Default -create "$COMPUTER_RECORD" GeneratedUID "$(/usr/bin/uuidgen)"
fi
/usr/bin/dscl /Local/Default -create "$COMPUTER_RECORD" HardwareUUID "$hardware_uuid"
mcx_dump="$(/usr/bin/mktemp /private/tmp/timeonchrome-mcx-read.XXXXXX)"
/bin/chmod 600 "$mcx_dump"
trap '/bin/rm -f "$mcx_dump"' EXIT
mcx_ok=false
if /usr/bin/dscl /Local/Default -mcxread "$COMPUTER_RECORD" > "$mcx_dump" 2>/dev/null; then
  if /usr/bin/python3 - "$MCX_SRC" "$mcx_dump" <<'PY'
import plistlib, sys
with open(sys.argv[1], "rb") as fh:
    source = plistlib.load(fh)
text = open(sys.argv[2], encoding="utf-8", errors="ignore").read()
if len(source) != 1:
    raise SystemExit(1)
domain, payload = next(iter(source.items()))
required = ("enabled", "deploymentMode", "cloudEndpoint", "managedDeviceToken", "managedDeviceLabel", "managedProfileEmail", "allowIdentityRecovery")
if domain not in text or any(key not in payload or key not in text for key in required):
    raise SystemExit(1)
for key in ("deploymentMode", "cloudEndpoint", "managedDeviceToken", "managedDeviceLabel", "managedProfileEmail"):
    value = payload[key].get("value")
    if not isinstance(value, str) or value not in text:
        raise SystemExit(1)
PY
  then
    if /usr/bin/dscl /Local/Default -read "$COMPUTER_RECORD" HardwareUUID 2>/dev/null | /usr/bin/grep -Fq "$hardware_uuid"; then
      mcx_ok=true
    fi
  fi
fi
if [ "$mcx_ok" != true ]; then
  /usr/bin/dscl /Local/Default -mcximport "$COMPUTER_RECORD" "$MCX_SRC"
  console_user="$(/usr/bin/stat -f '%Su' /dev/console)"
  case "$console_user" in root|loginwindow|"") ;; *) /usr/bin/mcxrefresh -n "$console_user" >/dev/null 2>&1 || true ;; esac
  /usr/bin/killall cfprefsd >/dev/null 2>&1 || true
  log "Restored managed extension policy"
else
  log "Managed extension policy already correct"
fi
