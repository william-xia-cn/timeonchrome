#!/bin/zsh
set -euo pipefail

PACKAGE_PATH=""
PROFILE_PATH=""

usage() {
  echo "Usage: sudo $0 --package /path/to/official-santa.pkg --profile /private/path/TimeOnChrome-Santa-Device.mobileconfig"
}

while (( $# > 0 )); do
  case "$1" in
    --package) PACKAGE_PATH="$2"; shift 2 ;;
    --profile) PROFILE_PATH="$2"; shift 2 ;;
    *) usage; exit 2 ;;
  esac
done

[[ "$(id -u)" == "0" ]] || { echo "Run as root." >&2; exit 1; }
[[ -f "$PACKAGE_PATH" ]] || { echo "Official Santa package not found." >&2; exit 1; }
[[ -f "$PROFILE_PATH" ]] || { echo "Santa enrollment profile not found." >&2; exit 1; }

/usr/bin/plutil -lint "$PROFILE_PATH" >/dev/null
/usr/bin/grep -Fq '<string>com.northpolesec.santa</string>' "$PROFILE_PATH" || {
  echo "Invalid Santa profile payload type." >&2
  exit 1
}
SYNC_BASE_URL="$(/usr/libexec/PlistBuddy -c 'Print :PayloadContent:0:SyncBaseURL' "$PROFILE_PATH")"
[[ "$SYNC_BASE_URL" == https://*/santa/v1/*/*/ ]] || { echo "Invalid HTTPS Santa SyncBaseURL." >&2; exit 1; }

# Require a trusted installer signature. The package itself must come from the official Santa release channel.
/usr/sbin/pkgutil --check-signature "$PACKAGE_PATH" >/dev/null
/usr/sbin/installer -pkg "$PACKAGE_PATH" -target /

unset SYNC_BASE_URL
echo "Santa installed. Enrollment profile validated at: $PROFILE_PATH"
echo "Open that profile as the logged-in user and approve it in System Settings, then run verify-santa.sh."
