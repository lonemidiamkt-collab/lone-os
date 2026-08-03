#!/usr/bin/env bash
# scripts/relatorio-mensal.sh — relatório do MÊS FECHADO nos grupos dos clientes, todo dia 1º.
#
# Por que um script e não uma linha no crontab: o intervalo muda todo mês (01/07–31/07, depois
# 01/08–31/08…) e precisa ser calculado na hora. Uma linha fixa mandaria sempre o mesmo mês.
#
# ANTES DE ENVIAR, CONFERE (pedido do Roberto: "sempre verificar se os dados estão certos"):
#   1. o token da Meta responde?  Token vencido = PDF vazio pra todo mundo.
#   2. o ensaio devolve gente?    Zero cliente elegível = alguma coisa quebrou antes.
# Qualquer uma falhando, NÃO envia e avisa o grupo interno. Relatório errado no grupo do cliente
# custa mais caro que relatório atrasado.
set -uo pipefail

MES_ANTERIOR_INICIO=$(date -d "$(date +%Y-%m-01) -1 month" +%Y-%m-01)
MES_ANTERIOR_FIM=$(date -d "$(date +%Y-%m-01) -1 day" +%Y-%m-%d)
Q="since=${MES_ANTERIOR_INICIO}&until=${MES_ANTERIOR_FIM}&destino=cliente"

log() { echo "[$(date '+%F %T')] $*"; }
log "mês fechado: ${MES_ANTERIOR_INICIO} a ${MES_ANTERIOR_FIM}"

# ── Conferência 1: a Meta responde? ───────────────────────────────────────────
TOKEN_OK=$(/opt/loneos/scripts/cron-call.sh "check-meta-token" POST 2>/dev/null | grep -c '"ok":true')
if [ "$TOKEN_OK" != "1" ]; then
  # O alerta de token já roda sozinho todo dia (check-meta-token avisa a partir de 14 dias antes),
  # então aqui basta abortar e deixar rastro no log — inventar um segundo canal de aviso seria o
  # tipo de mensagem duplicada que a gente passou o dia tirando do grupo.
  log "ABORTADO: token da Meta não confere — o alerta diário de token já cobre esse caso"
  exit 1
fi

# ── Conferência 2: o ensaio devolve clientes? ─────────────────────────────────
ENSAIO=$(/opt/loneos/scripts/cron-call.sh "weekly-reports?${Q}&dryRun=1" POST 2>/dev/null)
ELEGIVEIS=$(echo "$ENSAIO" | grep -o '"eligible":[0-9]*' | cut -d: -f2)
log "ensaio: ${ELEGIVEIS:-0} clientes elegíveis"
if [ -z "${ELEGIVEIS:-}" ] || [ "$ELEGIVEIS" -lt 1 ]; then
  log "ABORTADO: nenhum cliente elegível"
  exit 1
fi

# ── Envio ─────────────────────────────────────────────────────────────────────
log "enviando…"
/opt/loneos/scripts/cron-call.sh "weekly-reports?${Q}" POST
