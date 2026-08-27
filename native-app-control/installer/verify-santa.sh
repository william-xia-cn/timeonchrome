#!/bin/zsh
set -euo pipefail

SANTACTL="/usr/local/bin/santactl"
[[ -x "$SANTACTL" ]] || SANTACTL="/Library/Google/Santa/santactl"
[[ -x "$SANTACTL" ]] || { echo "santactl not found." >&2; exit 1; }

"$SANTACTL" status
"$SANTACTL" sync

echo "Santa status and sync completed. Confirm ClientMode is MONITOR and FullSyncInterval is 60."
