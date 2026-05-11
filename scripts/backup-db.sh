#!/usr/bin/env bash
# backup-db.sh — cria dump comprimido do PostgreSQL de produção
# Uso: ./scripts/backup-db.sh
# Cron sugerido (VPS): 0 3 * * * /opt/loneos/scripts/backup-db.sh >> /var/log/loneos-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/loneos}"
KEEP_DAYS="${KEEP_DAYS:-30}"
DB_URL="${DATABASE_URL:?DATABASE_URL não definida}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/loneos_$TIMESTAMP.dump"

mkdir -p "$BACKUP_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Iniciando backup → $FILE"
pg_dump "$DB_URL" --format=custom --compress=9 --no-owner --no-acl --file="$FILE"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup concluído ($(du -sh "$FILE" | cut -f1))"

# Remove backups mais antigos que KEEP_DAYS dias
find "$BACKUP_DIR" -name "loneos_*.dump" -mtime +"$KEEP_DAYS" -delete
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Limpeza: removidos dumps com mais de $KEEP_DAYS dias"
