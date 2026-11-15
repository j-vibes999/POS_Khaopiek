#!/bin/bash
# Use the Mac's default printer. Pass --local to use the trusted cashier app.
if [[ "${1:-}" == --local ]]; then
  cashier_url='http://127.0.0.1:5173/?kitchen-print=kiosk'
else
  cashier_url='https://khao-piek888.darkside404404.workers.dev/?kitchen-print=kiosk'
fi

/Applications/Brave\ Browser.app/Contents/MacOS/Brave\ Browser \
  --kiosk-printing \
  --user-data-dir="$HOME/.khao-piek-pos-profile" \
  --app="$cashier_url" \
  >/dev/null 2>&1 &
