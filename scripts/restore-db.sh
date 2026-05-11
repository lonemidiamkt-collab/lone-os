#!/usr/bin/env bash
# restore-db.sh — restaura um dump para o banco de produção
# Uso: ./scripts/restore-db.sh /var/backups/loneos/loneos_20260511_030000.dump
# ATENÇÃO: sobrescreve o banco atual. Confirme antes de rodar.
set -euo pipefail

DUMP_FILE="${1:?Informe o caminho do dump: $0 <arquivo.dump>}"
DB_URL="${DATABASE_URL:?DATABASE_URL não definida}"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "ERRO: arquivo não encontrado: $DUMP_FILE" >&2
  exit 1
fi

echo "ATENÇÃO: isso vai sobrescrever o banco em DATABASE_URL."
echo "Dump: $DUMP_FILE"
read -rp "Digite 'sim' para continuar: " CONFIRM
if [[ "$CONFIRM" != "sim" ]]; then
  echo "Restauração cancelada."
  exit 0
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Restaurando $DUMP_FILE → $DB_URL"
pg_restore "$DB_URL" --clean --if-exists --no-owner --no-acl --single-transaction --file="$DUMP_FILE" || true
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Restauração concluída."
