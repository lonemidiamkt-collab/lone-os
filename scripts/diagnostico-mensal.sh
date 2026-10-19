#!/usr/bin/env bash
# scripts/diagnostico-mensal.sh — diagnóstico do MÊS FECHADO de cada cliente (tráfego + social), no grupo de TRÁFEGO.
#
# Roberto (19/10/2026): "bateu o dia 31, tem que ter o diagnóstico do dia 1º até o dia 31".
# No dia 1º a rota assume sozinha o mês que acabou (periodoPadrao). Um PDF por cliente + placar no fim.
# Idempotente: quem já recebeu no período é pulado (reenvio só com force=1, à mão).
set -uo pipefail
echo "[$(date '+%F %T')] diagnóstico mensal…"
CRON_JOB=diagnostico-mensal CRON_MAX_TIME=1500 /opt/loneos/scripts/cron-call.sh "diagnostico-mensal?enviar=1" POST
