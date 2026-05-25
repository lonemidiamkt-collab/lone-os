#!/bin/bash
set -e

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="/var/log/loneos-snapshots.log"
CRON_SECRET=$(grep '^CRON_SECRET=' /opt/loneos/.env | cut -d'=' -f2)

echo "[$TIMESTAMP] Iniciando generate-snapshots" >> "$LOG_FILE"

START=$(date +%s)

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST   http://localhost:3000/api/system/generate-snapshots   -H "Authorization: Bearer $CRON_SECRET"   -H "Content-Type: application/json")

END=$(date +%s)
DURATION=$((END - START))

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "[$TIMESTAMP] HTTP $HTTP_CODE em ${DURATION}s" >> "$LOG_FILE"
echo "[$TIMESTAMP] Body: $BODY" >> "$LOG_FILE"

if [ "$HTTP_CODE" != "200" ]; then
  echo "[$TIMESTAMP] ERRO no generate-snapshots" >> "$LOG_FILE"
  exit 1
fi
