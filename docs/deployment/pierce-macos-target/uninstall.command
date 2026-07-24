#!/bin/bash
set -u
PACKAGE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
clear
echo "TimeOnChrome Pierce uninstall"
read -r -p "Type UNINSTALL to restore the pre-install state: " answer
if [ "$answer" != "UNINSTALL" ]; then
  echo "Cancelled."
  read -r -p "Press Return to close this window."
  exit 2
fi
sudo "$PACKAGE_DIR/timeonchrome-managed-installer.sh" uninstall
status=$?
echo
echo "Result code: $status"
read -r -p "Press Return to close this window."
exit "$status"
