#!/bin/bash
set -euo pipefail
umask 077

PACKAGE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
CONFIG_FILE="$PACKAGE_DIR/private-config.plist"
TEMP_ROOT="${TMPDIR:-/tmp}"

say() { /bin/echo "[TimeOnChrome] $*"; }
fail() { /bin/echo "[TimeOnChrome] ERROR: $*" >&2; exit 1; }

config_string() {
  /usr/bin/plutil -extract "$1" raw -n "$CONFIG_FILE" 2>/dev/null
}

config_bool() {
  /usr/bin/plutil -extract "$1" raw -n "$CONFIG_FILE" 2>/dev/null
}

config_optional_string() {
  local value
  value="$(/usr/bin/plutil -extract "$1" raw -n "$CONFIG_FILE" 2>/dev/null || true)"
  if [ -n "$value" ]; then /bin/echo "$value"; else /bin/echo "$2"; fi
}

[ -f "$CONFIG_FILE" ] || fail "private-config.plist is missing beside the installer."
[ -d "$TEMP_ROOT" ] && [ -w "$TEMP_ROOT" ] || fail "A writable temporary directory is unavailable."
/usr/bin/plutil -lint "$CONFIG_FILE" >/dev/null || fail "private-config.plist is invalid."

TARGET_EMAIL="$(config_string targetProfileEmail)"
TARGET_LABEL="$(config_string deviceLabel)"
EXTENSION_ID="$(config_string extensionId)"
UPDATE_URL="$(config_string updateUrl)"
CLOUD_ENDPOINT="$(config_string cloudEndpoint)"
EXPECTED_VERSION="$(config_optional_string expectedVersion latest)"
ENABLE_HARDENING="$(config_bool enableHardening)"
MANAGED_DEVICE_TOKEN="$(config_string managedDeviceToken)"
EXPECTED_INSTALL_VERSION=""

POLICY_SRC="/usr/local/timeonchrome-policy/com.google.Chrome.plist"
MCX_SRC="/usr/local/timeonchrome-policy/timeonchrome-managed-mcx.plist"
MANAGED_PREF_DOMAIN="com.google.Chrome.extensions.$EXTENSION_ID"
MANAGED_PREF_SRC="/usr/local/timeonchrome-policy/timeonchrome-managed-extension.plist"
RESTORE_SCRIPT="/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
LAUNCH_DAEMON="/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
POLICY_DST="/Library/Managed Preferences/com.google.Chrome.plist"
MANAGED_PREF_DST="/Library/Managed Preferences/$MANAGED_PREF_DOMAIN.plist"
DAEMON_LABEL="local.timeonchrome.restore-chrome-policy"
COMPUTER_RECORD="/Computers/local_computer"
BACKUP_ROOT="/Library/Application Support/TimeOnChrome/private-deployment/$EXTENSION_ID"
BASELINE_POINTER="$BACKUP_ROOT/baseline"
CURRENT_RUN_POINTER="$BACKUP_ROOT/current-run"

TARGET_USER=""
TARGET_HOME=""
PROFILE_DIRECTORY=""
CHROME_PROFILE_ROOT=""
EXTENSION_STORAGE_DIR=""
TEMP_FILES=""

register_temp() { TEMP_FILES="$TEMP_FILES $1"; }
cleanup_temps() {
  local item
  for item in $TEMP_FILES; do /bin/rm -f "$item" >/dev/null 2>&1 || true; done
}
trap cleanup_temps EXIT

require_root() {
  [ "$(/usr/bin/id -u)" -eq 0 ] || fail "Run this command with sudo."
}

validate_private_config() {
  [ "$(/usr/bin/stat -f '%Lp' "$CONFIG_FILE")" = "600" ] || fail "private-config.plist permissions must be 600."
  [ "$(/usr/bin/stat -f '%Lp' "$PACKAGE_DIR")" = "700" ] || fail "Package directory permissions must be 700."
  [ "$(/usr/bin/stat -f '%Lp' "$0")" = "700" ] || fail "Installer permissions must be 700."
  [[ "$EXTENSION_ID" =~ ^[a-p]{32}$ ]] || fail "Configured extension ID is invalid."
  [[ "$MANAGED_DEVICE_TOKEN" =~ ^[A-Fa-f0-9]{64}$ ]] || fail "Configured managed Device Token is invalid."
  [[ "$TARGET_EMAIL" == *@* ]] || fail "Configured target Profile email is invalid."
  [[ "$UPDATE_URL" == https://* ]] || fail "Configured update URL must use HTTPS."
  [[ "$CLOUD_ENDPOINT" == https://* ]] || fail "Configured cloud endpoint must use HTTPS."
  case "$EXPECTED_VERSION" in
    ""|latest|LATEST) EXPECTED_VERSION="latest" ;;
    *) [[ "$EXPECTED_VERSION" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]] || fail "Configured expectedVersion must be latest or a Chrome extension version." ;;
  esac
  if [ "$EXPECTED_VERSION" != "latest" ]; then EXPECTED_INSTALL_VERSION="$EXPECTED_VERSION"; fi
  case "$ENABLE_HARDENING" in
    true|1|yes) ;;
    *) fail "This Pierce private package requires full Chrome hardening." ;;
  esac
  say "Private configuration shape and package permissions are valid."
}

resolve_console_user() {
  TARGET_USER="$(/usr/bin/stat -f '%Su' /dev/console)"
  [ -n "$TARGET_USER" ] && [ "$TARGET_USER" != "root" ] && [ "$TARGET_USER" != "loginwindow" ] || fail "Unable to resolve an active desktop user."
  TARGET_HOME="$(/usr/bin/dscl . -read "/Users/$TARGET_USER" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{$1=""; sub(/^ /, ""); print; exit}')"
  [ -d "$TARGET_HOME" ] || fail "Unable to resolve the active user's home directory."
}

resolve_target_profile() {
  resolve_console_user
  local chrome_root
  chrome_root="$TARGET_HOME/Library/Application Support/Google/Chrome"
  [ -d "$chrome_root" ] || fail "Google Chrome profile data was not found for the active user."
  PROFILE_DIRECTORY="$(/usr/bin/python3 - "$chrome_root" "$TARGET_EMAIL" <<'PY'
import json, os, sys
root, expected = sys.argv[1], sys.argv[2].strip().lower()
matches = []
for name in sorted(os.listdir(root)):
    prefs = os.path.join(root, name, "Preferences")
    if not os.path.isfile(prefs):
        continue
    try:
        with open(prefs, encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:
        continue
    emails = set()
    for item in data.get("account_info", []):
        value = str(item.get("email", "")).strip().lower()
        if value:
            emails.add(value)
    profile = data.get("profile", {})
    for key in ("user_name", "gaia_name"):
        value = str(profile.get(key, "")).strip().lower()
        if "@" in value:
            emails.add(value)
    if expected in emails:
        matches.append(name)
if len(matches) != 1:
    raise SystemExit(2)
print(matches[0])
PY
)" || fail "Exactly one Chrome Profile must match the configured Pierce email."
  case "$PROFILE_DIRECTORY" in
    ""|*/*|.*) fail "Resolved Chrome Profile directory is unsafe." ;;
  esac
  CHROME_PROFILE_ROOT="$chrome_root/$PROFILE_DIRECTORY"
  EXTENSION_STORAGE_DIR="$CHROME_PROFILE_ROOT/Local Extension Settings/$EXTENSION_ID"
  say "The active user and unique target Chrome Profile were resolved."
}

validate_update_feed() {
  local feed status
  feed="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-feed.XXXXXX")"
  register_temp "$feed"
  /bin/chmod 600 "$feed"
  status="$(/usr/bin/curl --silent --show-error --connect-timeout 15 --max-time 30 --output "$feed" --write-out '%{http_code}' "$UPDATE_URL")" || fail "Production update feed request failed."
  [ "$status" = "200" ] || fail "Production update feed returned HTTP $status."
  EXPECTED_INSTALL_VERSION="$(/usr/bin/python3 - "$CONFIG_FILE" "$feed" "$EXTENSION_ID" "$EXPECTED_VERSION" <<'PY'
import os, re, sys, urllib.parse, xml.etree.ElementTree as ET
cfg_path, path, extension_id, expected = sys.argv[1:]
try:
    import plistlib
    with open(cfg_path, "rb") as fh:
        cfg = plistlib.load(fh)
except Exception:
    cfg = {}

def valid_version(value):
    parts = str(value).split(".")
    return 1 <= len(parts) <= 4 and all(re.fullmatch(r"0|[1-9][0-9]*", p) and int(p) <= 65535 for p in parts)

def fail():
    raise SystemExit(1)

root = ET.parse(path).getroot()
ns = {"g": "http://www.google.com/update2/response"}
apps = root.findall("g:app", ns)
if not apps:
    apps = root.findall("app")
app = next((item for item in apps if item.attrib.get("appid") == extension_id), None)
if app is None:
    fail()
check = app.find("g:updatecheck", ns)
if check is None:
    check = app.find("updatecheck")
if check is None:
    fail()
feed_version = check.attrib.get("version", "").strip()
codebase = check.attrib.get("codebase", "").strip()
if not valid_version(feed_version):
    fail()
parsed = urllib.parse.urlparse(codebase)
if parsed.scheme != "https" or not parsed.netloc:
    fail()
filename = os.path.basename(parsed.path)
if not filename.endswith(".crx") or feed_version not in filename:
    fail()
mode = "latest" if expected.strip().lower() in ("", "latest") else "pinned"
if mode == "pinned":
    if not valid_version(expected) or feed_version != expected:
        fail()
    suffix = str(cfg.get("expectedCrxCodebaseSuffix") or "")
    if suffix:
        suffix = suffix.replace("{version}", expected)
        if not codebase.endswith(suffix):
            fail()
else:
    suffix = str(cfg.get("expectedCrxCodebaseSuffix") or "")
    if suffix:
        suffix = suffix.replace("{version}", feed_version)
        if not codebase.endswith(suffix):
            fail()
print(feed_version)
PY
  )" || fail "Production update feed is invalid for the configured version policy."
  say "Production update feed targets the expected extension ID and version $EXPECTED_INSTALL_VERSION."
}

validate_api_token() {
  local curl_config response status
  curl_config="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-curl.XXXXXX")"
  response="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-response.XXXXXX")"
  register_temp "$curl_config"
  register_temp "$response"
  /bin/chmod 600 "$curl_config" "$response"
  /usr/bin/python3 - "$CONFIG_FILE" "$curl_config" <<'PY'
import plistlib, sys
with open(sys.argv[1], "rb") as fh:
    token = plistlib.load(fh)["managedDeviceToken"]
with open(sys.argv[2], "w", encoding="utf-8") as fh:
    fh.write('header = "Authorization: Bearer ' + token + '"\n')
    fh.write('header = "Accept: application/json"\n')
PY
  status="$(/usr/bin/curl --silent --show-error --connect-timeout 15 --max-time 30 --config "$curl_config" --output "$response" --write-out '%{http_code}' "$CLOUD_ENDPOINT/device/config")" || fail "Cloud token preflight request failed."
  [ "$status" = "200" ] || fail "Cloud token preflight returned HTTP $status."
  /usr/bin/python3 - "$response" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)
for key in ("account_email", "profile_name", "profile_id", "device_id"):
    if not isinstance(data.get(key), str) or not data[key].strip():
        raise SystemExit(1)
PY
  say "Cloud token authentication succeeded; required account, Profile, and Device fields are present."
}

run_preflight() {
  validate_private_config
  resolve_target_profile
  validate_update_feed
  validate_api_token
}

stop_chrome() {
  local uid remaining
  uid="$(/usr/bin/id -u "$TARGET_USER")"
  /bin/launchctl asuser "$uid" /usr/bin/sudo -u "$TARGET_USER" /usr/bin/osascript -e 'tell application "Google Chrome" to quit' >/dev/null 2>&1 || true
  remaining=30
  while /usr/bin/pgrep -u "$uid" -f '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' >/dev/null 2>&1; do
    [ "$remaining" -gt 0 ] || fail "Google Chrome did not exit normally."
    /bin/sleep 1
    remaining=$((remaining - 1))
  done
  say "Google Chrome is fully stopped."
}

open_chrome() {
  local uid
  uid="$(/usr/bin/id -u "$TARGET_USER")"
  /bin/launchctl asuser "$uid" \
    /usr/bin/sudo -H -u "$TARGET_USER" \
    /usr/bin/env HOME="$TARGET_HOME" USER="$TARGET_USER" LOGNAME="$TARGET_USER" \
    /usr/bin/open -a "Google Chrome" --args "--profile-directory=$PROFILE_DIRECTORY"
  say "Google Chrome was opened for the target desktop user."
}

extension_storage_fingerprint() {
  /usr/bin/python3 - "$EXTENSION_STORAGE_DIR" <<'PY'
import hashlib, os, sys
root = sys.argv[1]
if not os.path.isdir(root):
    print("missing")
    raise SystemExit(0)
h = hashlib.sha256()
for base, dirs, files in os.walk(root):
    dirs.sort()
    for name in sorted(files):
        path = os.path.join(base, name)
        rel = os.path.relpath(path, root).encode()
        h.update(len(rel).to_bytes(4, "big")); h.update(rel)
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
print(h.hexdigest())
PY
}

state_value() {
  /usr/bin/awk -F= -v key="$2" '$1 == key { print $2; exit }' "$1/state"
}

backup_path() {
  local backup_dir="$1" path="$2" key
  key="$(/bin/echo "$path" | /usr/bin/sed 's#^/##; s#/#__#g')"
  if [ -e "$path" ]; then
    /bin/echo "$path=present" >> "$backup_dir/state"
    /bin/cp -p "$path" "$backup_dir/$key"
  else
    /bin/echo "$path=missing" >> "$backup_dir/state"
  fi
}

mcx_domain_present() {
  /usr/bin/dscl /Local/Default -mcxread "$COMPUTER_RECORD" 2>/dev/null | /usr/bin/grep -Fq "com.google.Chrome.extensions.$EXTENSION_ID"
}

backup_current_state() {
  local purpose="$1" stamp backup_dir fingerprint
  stamp="$(/bin/date '+%Y%m%d-%H%M%S')"
  backup_dir="$BACKUP_ROOT/$purpose-$stamp"
  /bin/mkdir -p "$backup_dir"
  /bin/chmod 700 "$BACKUP_ROOT" "$backup_dir"
  : > "$backup_dir/state"
  /bin/chmod 600 "$backup_dir/state"
  backup_path "$backup_dir" "$POLICY_SRC"
  backup_path "$backup_dir" "$MCX_SRC"
  backup_path "$backup_dir" "$MANAGED_PREF_SRC"
  backup_path "$backup_dir" "$RESTORE_SCRIPT"
  backup_path "$backup_dir" "$LAUNCH_DAEMON"
  backup_path "$backup_dir" "$POLICY_DST"
  backup_path "$backup_dir" "$MANAGED_PREF_DST"
  if /bin/launchctl print "system/$DAEMON_LABEL" >/dev/null 2>&1; then
    /bin/echo "daemon_loaded=present" >> "$backup_dir/state"
  else
    /bin/echo "daemon_loaded=missing" >> "$backup_dir/state"
  fi
  if /usr/bin/dscl /Local/Default -read "$COMPUTER_RECORD" >/dev/null 2>&1; then
    /bin/echo "computer_record=present" >> "$backup_dir/state"
  else
    /bin/echo "computer_record=missing" >> "$backup_dir/state"
  fi
  if mcx_domain_present; then
    /bin/echo "mcx_domain=present" >> "$backup_dir/state"
  else
    /bin/echo "mcx_domain=missing" >> "$backup_dir/state"
  fi
  fingerprint="$(extension_storage_fingerprint)"
  /bin/echo "extension_storage_fingerprint=$fingerprint" >> "$backup_dir/state"
  if [ "$fingerprint" = "missing" ]; then
    /bin/echo "extension_storage=missing" >> "$backup_dir/state"
  else
    /bin/echo "extension_storage=present" >> "$backup_dir/state"
    /bin/mkdir -p "$backup_dir/extension-local-storage"
    /bin/cp -pR "$EXTENSION_STORAGE_DIR/." "$backup_dir/extension-local-storage/"
    /bin/chmod -R go-rwx "$backup_dir/extension-local-storage"
  fi
  /bin/echo "$backup_dir" > "$CURRENT_RUN_POINTER"
  /bin/chmod 600 "$CURRENT_RUN_POINTER"
  if { [ "$purpose" = "install" ] || [ "$purpose" = "reinstall" ]; } && [ ! -f "$BASELINE_POINTER" ]; then
    /bin/echo "$backup_dir" > "$BASELINE_POINTER"
    /bin/chmod 600 "$BASELINE_POINTER"
  fi
  say "A private rollback snapshot was created for this run."
  /bin/echo "$backup_dir"
}

restore_path() {
  local backup_dir="$1" path="$2" key status
  key="$(/bin/echo "$path" | /usr/bin/sed 's#^/##; s#/#__#g')"
  status="$(state_value "$backup_dir" "$path")"
  /bin/rm -f "$path"
  if [ "$status" = "present" ]; then
    /bin/mkdir -p "$(/usr/bin/dirname "$path")"
    /bin/cp -p "$backup_dir/$key" "$path"
  fi
}

restore_extension_storage() {
  local backup_dir="$1" status
  status="$(state_value "$backup_dir" extension_storage)"
  /bin/rm -rf "$EXTENSION_STORAGE_DIR"
  if [ "$status" = "present" ]; then
    /bin/mkdir -p "$EXTENSION_STORAGE_DIR"
    /bin/cp -pR "$backup_dir/extension-local-storage/." "$EXTENSION_STORAGE_DIR/"
    /usr/sbin/chown -R "$TARGET_USER":staff "$EXTENSION_STORAGE_DIR"
    /bin/chmod -R go-rwx "$EXTENSION_STORAGE_DIR"
  fi
}

build_policy_plist() {
  local output="$1"
  /usr/bin/python3 - "$CONFIG_FILE" "$output" <<'PY'
import plistlib, re, sys
with open(sys.argv[1], "rb") as fh:
    cfg = plistlib.load(fh)
eid = cfg["extensionId"]
policy = {
    "ExtensionSettings": {
        eid: {
            "installation_mode": "force_installed",
            "toolbar_pin": "force_pinned",
            "update_url": cfg["updateUrl"],
            "override_update_url": True,
        }
    }
}
if cfg.get("enableHardening") is True:
    policy.update({
        "BrowserSignin": 2,
        "RestrictSigninToPattern": "^" + re.escape(cfg["targetProfileEmail"]) + "$",
        "BrowserAddPersonEnabled": False,
        "BrowserGuestModeEnabled": False,
        "IncognitoModeAvailability": 1,
    })
with open(sys.argv[2], "wb") as fh:
    plistlib.dump(policy, fh, fmt=plistlib.FMT_XML, sort_keys=False)
PY
}

build_mcx_plist() {
  local output="$1"
  /usr/bin/python3 - "$CONFIG_FILE" "$output" <<'PY'
import plistlib, sys
with open(sys.argv[1], "rb") as fh:
    cfg = plistlib.load(fh)
def always(value): return {"state": "always", "value": value}
domain = "com.google.Chrome.extensions." + cfg["extensionId"]
payload = {domain: {
    "enabled": always(True),
    "deploymentMode": always("managed"),
    "cloudEndpoint": always(cfg["cloudEndpoint"]),
    "managedDeviceToken": always(cfg["managedDeviceToken"]),
    "managedDeviceLabel": always(cfg["deviceLabel"]),
    "managedProfileEmail": always(cfg["targetProfileEmail"]),
    "allowIdentityRecovery": always(False),
}}
with open(sys.argv[2], "wb") as fh:
    plistlib.dump(payload, fh, fmt=plistlib.FMT_XML, sort_keys=False)
PY
}

build_managed_preferences_plist() {
  local output="$1"
  /usr/bin/python3 - "$CONFIG_FILE" "$output" <<'PY'
import plistlib, sys
with open(sys.argv[1], "rb") as fh:
    cfg = plistlib.load(fh)
payload = {
    "enabled": True,
    "deploymentMode": "managed",
    "cloudEndpoint": cfg["cloudEndpoint"],
    "managedDeviceToken": cfg["managedDeviceToken"],
    "managedDeviceLabel": cfg["deviceLabel"],
    "managedProfileEmail": cfg["targetProfileEmail"],
    "allowIdentityRecovery": False,
}
with open(sys.argv[2], "wb") as fh:
    plistlib.dump(payload, fh, fmt=plistlib.FMT_XML, sort_keys=False)
PY
}

install_keeper_assets() {
  local policy_tmp mcx_tmp managed_pref_tmp
  policy_tmp="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-policy.XXXXXX")"
  mcx_tmp="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-mcx-source.XXXXXX")"
  managed_pref_tmp="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-managed-pref.XXXXXX")"
  register_temp "$policy_tmp"
  register_temp "$mcx_tmp"
  register_temp "$managed_pref_tmp"
  build_policy_plist "$policy_tmp"
  build_mcx_plist "$mcx_tmp"
  build_managed_preferences_plist "$managed_pref_tmp"
  /usr/bin/plutil -lint "$policy_tmp" "$mcx_tmp" "$managed_pref_tmp" >/dev/null
  /usr/bin/install -d -m 755 "/Library/Managed Preferences" "/usr/local/timeonchrome-policy" "/usr/local/sbin"
  /usr/bin/install -o root -g wheel -m 644 "$policy_tmp" "$POLICY_SRC"
  /usr/bin/install -o root -g wheel -m 600 "$mcx_tmp" "$MCX_SRC"
  /usr/bin/install -o root -g wheel -m 600 "$managed_pref_tmp" "$MANAGED_PREF_SRC"
  /bin/cat > "$RESTORE_SCRIPT" <<'KEEPER'
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
KEEPER
  /usr/sbin/chown root:wheel "$RESTORE_SCRIPT"
  /bin/chmod 755 "$RESTORE_SCRIPT"
  /bin/cat > "$LAUNCH_DAEMON" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$DAEMON_LABEL</string>
  <key>UserName</key><string>root</string>
  <key>ProgramArguments</key><array><string>$RESTORE_SCRIPT</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>60</integer>
  <key>WatchPaths</key><array><string>/Library/Managed Preferences</string><string>$POLICY_SRC</string><string>$MCX_SRC</string><string>$MANAGED_PREF_SRC</string></array>
  <key>StandardOutPath</key><string>/var/log/timeonchrome-policy-restore.out.log</string>
  <key>StandardErrorPath</key><string>/var/log/timeonchrome-policy-restore.err.log</string>
</dict></plist>
EOF
  /usr/sbin/chown root:wheel "$LAUNCH_DAEMON"
  /bin/chmod 644 "$LAUNCH_DAEMON"
  /usr/bin/plutil -lint "$LAUNCH_DAEMON" >/dev/null
  "$RESTORE_SCRIPT"
}

install_managed_activation() {
  local hardware_uuid mcx_tmp guid ether
  hardware_uuid="$(/usr/sbin/ioreg -rd1 -c IOPlatformExpertDevice | /usr/bin/awk -F'"' '/IOPlatformUUID/ {print $(NF-1); exit}')"
  [ -n "$hardware_uuid" ] || fail "Unable to resolve the Mac Hardware UUID."
  if ! /usr/bin/dscl /Local/Default -read "$COMPUTER_RECORD" >/dev/null 2>&1; then
    guid="$(/usr/bin/uuidgen)"
    ether="$(/sbin/ifconfig en0 2>/dev/null | /usr/bin/awk '/ether/ {print $2; exit}')"
    /usr/bin/dscl /Local/Default -create "$COMPUTER_RECORD"
    /usr/bin/dscl /Local/Default -create "$COMPUTER_RECORD" RealName "Local Computer"
    /usr/bin/dscl /Local/Default -create "$COMPUTER_RECORD" GeneratedUID "$guid"
    [ -z "${ether:-}" ] || /usr/bin/dscl /Local/Default -create "$COMPUTER_RECORD" ENetAddress "$ether"
  fi
  /usr/bin/dscl /Local/Default -create "$COMPUTER_RECORD" HardwareUUID "$hardware_uuid"
  mcx_tmp="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-mcx.XXXXXX")"
  register_temp "$mcx_tmp"
  build_mcx_plist "$mcx_tmp"
  /bin/chmod 600 "$mcx_tmp"
  /usr/bin/plutil -lint "$mcx_tmp" >/dev/null
  /usr/bin/dscl /Local/Default -mcximport "$COMPUTER_RECORD" "$mcx_tmp"
  /usr/bin/mcxrefresh -n "$TARGET_USER"
  /usr/bin/killall cfprefsd >/dev/null 2>&1 || true
}

start_keeper() {
  /bin/launchctl bootout system "$LAUNCH_DAEMON" >/dev/null 2>&1 || true
  /bin/launchctl bootstrap system "$LAUNCH_DAEMON"
  /bin/launchctl kickstart -k "system/$DAEMON_LABEL"
}

remove_managed_state_no_restart() {
  /bin/launchctl bootout system "$LAUNCH_DAEMON" >/dev/null 2>&1 || true
  /usr/bin/dscl /Local/Default -mcxdelete "$COMPUTER_RECORD" "com.google.Chrome.extensions.$EXTENSION_ID" >/dev/null 2>&1 || true
  /bin/rm -f "$LAUNCH_DAEMON" "$RESTORE_SCRIPT" "$POLICY_DST" "$MANAGED_PREF_DST"
  /bin/rm -rf "/usr/local/timeonchrome-policy"
  /usr/bin/mcxrefresh -n "$TARGET_USER"
  /usr/bin/killall cfprefsd >/dev/null 2>&1 || true
}

verify_clean_state() {
  local path
  for path in "$POLICY_SRC" "$MCX_SRC" "$MANAGED_PREF_SRC" "$RESTORE_SCRIPT" "$LAUNCH_DAEMON" "$POLICY_DST" "$MANAGED_PREF_DST"; do
    [ ! -e "$path" ] || fail "Clean-state verification found a remaining TimeOnChrome asset."
  done
  if /bin/launchctl print "system/$DAEMON_LABEL" >/dev/null 2>&1; then fail "Clean-state verification found the LaunchDaemon loaded."; fi
  if mcx_domain_present; then fail "Clean-state verification found the Pierce MCX domain."; fi
  say "Clean managed state was verified while Chrome remained closed."
}

check_file() {
  local remaining=15
  while [ ! -e "$1" ] && [ "$remaining" -gt 0 ]; do
    /bin/sleep 1
    remaining=$((remaining - 1))
  done
  [ -e "$1" ] || fail "A required system asset is missing."
  [ "$(/usr/bin/stat -f '%Su:%Sg' "$1")" = "root:wheel" ] || fail "A system asset has the wrong owner."
  [ "$(/usr/bin/stat -f '%Lp' "$1")" = "$2" ] || fail "A system asset has the wrong permissions."
}

validate_hardening_policy() {
  /usr/bin/python3 - "$POLICY_SRC" "$EXTENSION_ID" "$TARGET_EMAIL" <<'PY'
import plistlib, re, sys
with open(sys.argv[1], "rb") as fh:
    p = plistlib.load(fh)
eid, email = sys.argv[2:]
s = p.get("ExtensionSettings", {}).get(eid, {})
if s.get("installation_mode") != "force_installed" or s.get("override_update_url") is not True:
    raise SystemExit(1)
expected = {
    "BrowserSignin": 2,
    "RestrictSigninToPattern": "^" + re.escape(email) + "$",
    "BrowserAddPersonEnabled": False,
    "BrowserGuestModeEnabled": False,
    "IncognitoModeAvailability": 1,
}
if any(p.get(k) != v for k, v in expected.items()):
    raise SystemExit(1)
PY
}

validate_mcx() {
  local dump expected_source key hardware_uuid
  dump="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-mcx-read.XXXXXX")"
  expected_source="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-mcx-expected.XXXXXX")"
  register_temp "$dump"
  register_temp "$expected_source"
  /bin/chmod 600 "$dump" "$expected_source"
  build_mcx_plist "$expected_source"
  /usr/bin/cmp -s "$expected_source" "$MCX_SRC" || fail "The managed policy recovery source does not match the private configuration."
  /usr/bin/dscl /Local/Default -mcxread "$COMPUTER_RECORD" > "$dump" 2>/dev/null || fail "Unable to read the Pierce managed extension policy."
  for key in enabled deploymentMode cloudEndpoint managedDeviceToken managedDeviceLabel managedProfileEmail allowIdentityRecovery; do
    /usr/bin/grep -q "$key" "$dump" || fail "A required managed policy key is missing."
  done
  /usr/bin/python3 - "$dump" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
if not re.search(r"(?<![0-9A-Fa-f])[0-9A-Fa-f]{64}(?![0-9A-Fa-f])", text):
    raise SystemExit(1)
PY
  hardware_uuid="$(/usr/sbin/ioreg -rd1 -c IOPlatformExpertDevice | /usr/bin/awk -F'"' '/IOPlatformUUID/ {print $(NF-1); exit}')"
  /usr/bin/dscl /Local/Default -read "$COMPUTER_RECORD" HardwareUUID 2>/dev/null | /usr/bin/grep -Fq "$hardware_uuid" || fail "The local computer record does not match this Mac Hardware UUID."
  /usr/bin/mcxquery -user "$TARGET_USER" -format space | /usr/bin/grep -Fq "com.google.Chrome.extensions.$EXTENSION_ID" || fail "The Pierce managed extension policy is not effective for the target user."
  say "Managed storage fields, Token shape, Hardware UUID, and effective MCX are valid."
}

validate_managed_preferences_files() {
  local expected
  expected="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-managed-pref-expected.XXXXXX")"
  register_temp "$expected"
  /bin/chmod 600 "$expected"
  build_managed_preferences_plist "$expected"
  /usr/bin/cmp -s "$expected" "$MANAGED_PREF_SRC" || fail "The extension managed preferences source does not match the private configuration."
  /usr/bin/cmp -s "$MANAGED_PREF_SRC" "$MANAGED_PREF_DST" || fail "The active extension managed preferences do not match the recovery source."
  say "The extension managed preferences source and active plist are valid."
}

validate_system_installation() {
  check_file "$POLICY_SRC" 644
  check_file "$MCX_SRC" 600
  check_file "$MANAGED_PREF_SRC" 600
  check_file "$POLICY_DST" 644
  check_file "$MANAGED_PREF_DST" 644
  check_file "$LAUNCH_DAEMON" 644
  check_file "$RESTORE_SCRIPT" 755
  /usr/bin/plutil -lint "$POLICY_SRC" "$MCX_SRC" "$MANAGED_PREF_SRC" "$POLICY_DST" "$MANAGED_PREF_DST" "$LAUNCH_DAEMON" >/dev/null
  /usr/bin/cmp -s "$POLICY_SRC" "$POLICY_DST" || fail "Source and active Chrome policies differ."
  validate_hardening_policy
  /bin/launchctl print "system/$DAEMON_LABEL" >/dev/null 2>&1 || fail "The policy keeper LaunchDaemon is not loaded."
  "$RESTORE_SCRIPT"
  /usr/bin/cmp -s "$POLICY_SRC" "$POLICY_DST" || fail "The policy keeper idempotency check failed."
  validate_mcx
  validate_managed_preferences_files
  say "System policy, hardening, permissions, keeper, MCX, and Chrome managed-preferences validation passed."
}

installed_manifest_path() {
  [ -n "$EXPECTED_INSTALL_VERSION" ] || fail "Expected install version is unavailable; enable update feed validation or pin expectedVersion."
  /usr/bin/python3 - "$CHROME_PROFILE_ROOT" "$EXTENSION_ID" "$EXPECTED_INSTALL_VERSION" <<'PY'
import json, os, sys
profile, eid, expected = sys.argv[1:]
root = os.path.join(profile, "Extensions", eid)
if not os.path.isdir(root): raise SystemExit(1)
paths=[]
for name in os.listdir(root):
    p=os.path.join(root,name,"manifest.json")
    if os.path.isfile(p): paths.append(p)
for p in paths:
    try:
        with open(p,encoding="utf-8") as fh: m=json.load(fh)
        if m.get("version")==expected:
            print(p); raise SystemExit(0)
    except Exception: pass
raise SystemExit(1)
PY
}

validate_installed_extension() {
  local manifest
  manifest="$(installed_manifest_path)" || fail "The expected TimeOnChrome version is not installed in the target Profile."
  /usr/bin/python3 - "$manifest" <<'PY'
import json, os, sys
with open(sys.argv[1], encoding="utf-8") as fh: m=json.load(fh)
schema=m.get("storage",{}).get("managed_schema")
if schema != "managed-storage-schema.json": raise SystemExit(1)
path=os.path.join(os.path.dirname(sys.argv[1]),schema)
with open(path,encoding="utf-8") as fh: s=json.load(fh)
expected={"enabled":"boolean","deploymentMode":"string","cloudEndpoint":"string","managedDeviceToken":"string","managedDeviceLabel":"string","managedProfileEmail":"string","allowIdentityRecovery":"boolean","tenantId":"string","devicePolicyId":"string"}
props=s.get("properties",{})
if s.get("type")!="object" or any(props.get(k,{}).get("type")!=v for k,v in expected.items()): raise SystemExit(1)
PY
  say "Installed extension version and managed storage schema are valid."
}

managed_storage_contains() {
  local storage_root="$1" needle="$2" file
  while IFS= read -r file; do
    /usr/bin/grep -aFq -- "$needle" "$file" 2>/dev/null && return 0
  done < <(/usr/bin/find "$storage_root" -maxdepth 1 -type f -print 2>/dev/null)
  return 1
}

validate_chrome_managed_storage() {
  local storage_root key
  storage_root="$CHROME_PROFILE_ROOT/Managed Extension Settings/$EXTENSION_ID"
  [ -d "$storage_root" ] || fail "Chrome has not created managed storage for TimeOnChrome."
  for key in enabled deploymentMode cloudEndpoint managedDeviceToken managedDeviceLabel managedProfileEmail allowIdentityRecovery; do
    managed_storage_contains "$storage_root" "$key" || fail "Chrome managed storage is missing a required policy key."
  done
  managed_storage_contains "$storage_root" "$MANAGED_DEVICE_TOKEN" || fail "Chrome managed storage has not adopted the configured Device Token."
  managed_storage_contains "$storage_root" "$TARGET_EMAIL" || fail "Chrome managed storage has not adopted the configured Profile email."
  managed_storage_contains "$storage_root" "$CLOUD_ENDPOINT" || fail "Chrome managed storage has not adopted the configured cloud endpoint."
  say "Chrome's own managed extension storage contains the configured policy."
}

wait_for_complete_validation() {
  local elapsed=0 stable_rounds=0 choice rc
  say "Chrome is open; waiting for three consecutive Chrome-readable managed-policy validation rounds."
  while :; do
    if (
      validate_system_installation >/dev/null 2>&1
      validate_installed_extension >/dev/null 2>&1
      validate_chrome_managed_storage >/dev/null 2>&1
    ); then
      stable_rounds=$((stable_rounds + 1))
      say "Managed-policy stability check $stable_rounds of 3 passed."
      if [ "$stable_rounds" -ge 3 ]; then
        say "Chrome policy, extension managed preferences, effective MCX, extension version, and schema remained valid."
        return 0
      fi
    else
      stable_rounds=0
    fi
    /bin/sleep 10
    elapsed=$((elapsed + 10))
    if [ "$elapsed" -ge 60 ]; then
      say "The extension is still pending after ${elapsed} seconds; system policy remains installed."
      /bin/echo "Choose: [r] restart Chrome and continue, [c] continue waiting, [q] quit waiting (keep policy)."
      if ! read -r -p "Your choice: " choice; then
        choice=q
      fi
      case "$choice" in
        r|R)
          say "Save browser work; restarting Chrome now."
          stop_chrome
          open_chrome
          ;;
        q|Q)
          say "System policy is installed, but managed activation has not been accepted as complete."
          return 2
          ;;
        *) say "Continuing to wait without restarting Chrome." ;;
      esac
      elapsed=0
    fi
  done
}

validate_installation() {
  require_root
  run_preflight
  validate_system_installation
  validate_installed_extension
  say "Complete Pierce installation validation passed."
}

verify_storage_unchanged() {
  local backup_dir="$1" expected actual
  expected="$(state_value "$backup_dir" extension_storage_fingerprint)"
  actual="$(extension_storage_fingerprint)"
  [ "$expected" = "$actual" ] || fail "Extension local storage changed while Chrome was closed."
  say "Extension local storage remained unchanged while Chrome was closed."
}

run_restore_test() {
  require_root
  validate_private_config
  resolve_target_profile
  validate_system_installation
  local safety managed_safety remaining
  safety="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-restore-safety.XXXXXX")"
  managed_safety="$(/usr/bin/mktemp "$TEMP_ROOT/timeonchrome-pierce-managed-restore-safety.XXXXXX")"
  register_temp "$safety"
  register_temp "$managed_safety"
  /bin/cp -p "$POLICY_DST" "$safety"
  /bin/cp -p "$MANAGED_PREF_DST" "$managed_safety"
  /bin/chmod 600 "$safety" "$managed_safety"
  /bin/rm -f "$POLICY_DST"
  /bin/rm -f "$MANAGED_PREF_DST"
  /usr/bin/dscl /Local/Default -mcxdelete "$COMPUTER_RECORD" "com.google.Chrome.extensions.$EXTENSION_ID" >/dev/null 2>&1 || true
  /bin/launchctl kickstart -k "system/$DAEMON_LABEL"
  remaining=30
  while [ "$remaining" -gt 0 ]; do
    if [ -f "$POLICY_DST" ] && /usr/bin/cmp -s "$POLICY_SRC" "$POLICY_DST" \
      && [ -f "$MANAGED_PREF_DST" ] && /usr/bin/cmp -s "$MANAGED_PREF_SRC" "$MANAGED_PREF_DST" \
      && mcx_domain_present; then
      check_file "$POLICY_DST" 644
      check_file "$MANAGED_PREF_DST" 644
      validate_managed_preferences_files >/dev/null
      say "Controlled Chrome policy, managed preferences, and MCX directory-record keeper restore test passed."
      return 0
    fi
    /bin/sleep 1
    remaining=$((remaining - 1))
  done
  /bin/cp -p "$safety" "$POLICY_DST"
  /usr/sbin/chown root:wheel "$POLICY_DST"
  /bin/chmod 644 "$POLICY_DST"
  /bin/cp -p "$managed_safety" "$MANAGED_PREF_DST"
  /usr/sbin/chown root:wheel "$MANAGED_PREF_DST"
  /bin/chmod 644 "$MANAGED_PREF_DST"
  install_managed_activation >/dev/null 2>&1 || true
  fail "Controlled keeper restore test failed; the safety policy and managed activation were restored."
}

restore_snapshot() {
  local backup_dir="$1" storage_mode="${2:-restore-storage}" mcx_state record_state daemon_state
  /bin/launchctl bootout system "$LAUNCH_DAEMON" >/dev/null 2>&1 || true
  /usr/bin/dscl /Local/Default -mcxdelete "$COMPUTER_RECORD" "com.google.Chrome.extensions.$EXTENSION_ID" >/dev/null 2>&1 || true
  restore_path "$backup_dir" "$POLICY_SRC"
  restore_path "$backup_dir" "$MCX_SRC"
  restore_path "$backup_dir" "$MANAGED_PREF_SRC"
  restore_path "$backup_dir" "$RESTORE_SCRIPT"
  restore_path "$backup_dir" "$LAUNCH_DAEMON"
  restore_path "$backup_dir" "$POLICY_DST"
  restore_path "$backup_dir" "$MANAGED_PREF_DST"
  if [ "$storage_mode" != "preserve-storage" ]; then
    restore_extension_storage "$backup_dir"
  fi
  mcx_state="$(state_value "$backup_dir" mcx_domain)"
  record_state="$(state_value "$backup_dir" computer_record)"
  daemon_state="$(state_value "$backup_dir" daemon_loaded)"
  if [ "$mcx_state" = "present" ]; then install_managed_activation; fi
  if [ "$record_state" = "missing" ] && [ "$mcx_state" = "missing" ]; then
    /usr/bin/dscl /Local/Default -delete "$COMPUTER_RECORD" >/dev/null 2>&1 || true
  fi
  if [ "$daemon_state" = "present" ] && [ -f "$LAUNCH_DAEMON" ]; then
    /bin/launchctl bootstrap system "$LAUNCH_DAEMON" >/dev/null 2>&1 || true
  fi
  /usr/bin/mcxrefresh -n "$TARGET_USER" >/dev/null 2>&1 || true
  /usr/bin/killall cfprefsd >/dev/null 2>&1 || true
}

ensure_first_install_target_is_clean() {
  local path
  for path in "$POLICY_SRC" "$MCX_SRC" "$MANAGED_PREF_SRC" "$RESTORE_SCRIPT" "$LAUNCH_DAEMON" "$POLICY_DST" "$MANAGED_PREF_DST"; do
    [ ! -e "$path" ] || fail "Existing local Chrome policy assets were found; use install repair only for an already validated Pierce installation."
  done
  if mcx_domain_present; then fail "An existing TimeOnChrome MCX domain was found; refusing to overwrite it during first install."; fi
}

installation_state_present() {
  local path
  for path in "$POLICY_SRC" "$MCX_SRC" "$MANAGED_PREF_SRC" "$RESTORE_SCRIPT" "$LAUNCH_DAEMON" "$POLICY_DST" "$MANAGED_PREF_DST"; do
    [ -e "$path" ] && return 0
  done
  mcx_domain_present
}

install_all() {
  require_root
  run_preflight
  if installation_state_present; then
    say "Existing or partial Pierce policy state detected; entering repair/reinstall flow."
    reinstall_all
    return $?
  fi
  ensure_first_install_target_is_clean
  stop_chrome
  local backup_dir
  backup_dir="$(backup_current_state install | /usr/bin/tail -n 1)"
  if ! (
    install_keeper_assets
    install_managed_activation
    start_keeper
    validate_system_installation
  ); then
    restore_snapshot "$backup_dir"
    open_chrome >/dev/null 2>&1 || true
    fail "Installation failed and the pre-install state was restored."
  fi
  open_chrome
  if wait_for_complete_validation; then
    say "Pierce installation and validation completed successfully."
  else
    rc=$?
    [ "$rc" -eq 2 ] || fail "Pierce validation failed unexpectedly; installed policy was retained."
    say "Pierce system policy was installed, but managed activation was not accepted as complete."
  fi
}

reinstall_all() {
  require_root
  run_preflight
  stop_chrome
  local backup_dir
  backup_dir="$(backup_current_state reinstall | /usr/bin/tail -n 1)"
  if ! (
    remove_managed_state_no_restart
    verify_clean_state
    verify_storage_unchanged "$backup_dir"
    install_keeper_assets
    install_managed_activation
    start_keeper
    validate_system_installation
    run_restore_test
    verify_storage_unchanged "$backup_dir"
  ); then
    restore_snapshot "$backup_dir"
    open_chrome >/dev/null 2>&1 || true
    fail "Reinstall failed and the state captured at the start of this run was restored."
  fi
  open_chrome
  if wait_for_complete_validation; then
    say "Pierce repair/reinstall and validation completed successfully."
  else
    rc=$?
    [ "$rc" -eq 2 ] || fail "Pierce validation failed unexpectedly; installed policy was retained."
    say "Pierce repair/reinstall policy was installed, but managed activation was not accepted as complete."
  fi
}

uninstall_all() {
  require_root
  validate_private_config
  resolve_target_profile
  [ -f "$BASELINE_POINTER" ] || fail "No baseline snapshot exists; refusing an untracked uninstall."
  local baseline safety
  baseline="$(/bin/cat "$BASELINE_POINTER")"
  [ -f "$baseline/state" ] || fail "The baseline snapshot is missing or invalid."
  stop_chrome
  safety="$(backup_current_state uninstall-safety | /usr/bin/tail -n 1)"
  if ! (restore_snapshot "$baseline" preserve-storage); then
    restore_snapshot "$safety" >/dev/null 2>&1 || true
    open_chrome >/dev/null 2>&1 || true
    fail "Uninstall failed; the state at uninstall start was restored."
  fi
  /bin/rm -f "$BASELINE_POINTER" "$CURRENT_RUN_POINTER"
  say "The pre-install system state was restored and this installation baseline was closed."
  say "Chrome remains closed and extension local storage was preserved; run install before reopening Chrome to test a clean rebuild without losing local statistics."
}

case "${1:-}" in
  install) install_all ;;
  uninstall) uninstall_all ;;
  *) /bin/echo "Usage: sudo $0 {install|uninstall}" >&2; exit 2 ;;
esac

