#!/bin/bash
# Wrapper de cron para /api/system/client-messages com ?kind=.
# Uso: client-messages.sh <monday|wed|fri>
# Passa pelo cron-call.sh para a Central de Automações registrar e poder desligar cada dia
# separado (client-messages-monday / -wed / -fri).
KIND="${1:-support}"
CRON_JOB="client-messages-${KIND}" CRON_MAX_TIME=1800 \
  exec "$(dirname "$0")/cron-call.sh" "client-messages?kind=${KIND}" POST
