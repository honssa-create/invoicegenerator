#!/bin/sh
set -eu

if [ -z "${CRON_SECRET:-}" ]; then
  echo "Missing CRON_SECRET"
  exit 1
fi

if [ -z "${APP_URL:-}" ]; then
  echo "Missing APP_URL (e.g. https://\${{invoice-generator.RAILWAY_PUBLIC_DOMAIN}})"
  exit 1
fi

BASE="${APP_URL%/}"
URL="${BASE}/api/cron/rental-invoices"

echo "POST ${URL}"
HTTP_CODE=$(curl -sS --max-time 120 -o /tmp/cron-body.json -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${URL}")
echo "HTTP ${HTTP_CODE}"
cat /tmp/cron-body.json
echo

case "${HTTP_CODE}" in
  2??) exit 0 ;;
  *) echo "Rental invoices cron failed with HTTP ${HTTP_CODE}"; exit 1 ;;
esac
