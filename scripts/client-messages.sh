#!/bin/bash
# Wrapper de cron para /api/system/client-messages com ?kind=.
# Uso: client-messages.sh <monday|support>   (default = support)
KIND="${1:-support}"
CRON_SECRET=$(grep "^CRON_SECRET=" /opt/loneos/.env | cut -d= -f2)
curl -s -m 1800 -X POST "http://localhost:3000/api/system/client-messages?kind=${KIND}" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
