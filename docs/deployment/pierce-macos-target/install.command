#!/bin/bash
set -u
PACKAGE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
clear
echo "TimeOnChrome Pierce installation"
sudo "$PACKAGE_DIR/timeonchrome-managed-installer.sh" install
status=$?
echo
echo "Result code: $status"
read -r -p "Press Return to close this window."
exit "$status"
