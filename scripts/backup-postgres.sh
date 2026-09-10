#!/bin/bash
# Backup diário do Postgres do lone-os.
#
# Endurecido em 23/08/2026. Três problemas que o script antigo tinha:
#  1. Não VALIDAVA o dump — um arquivo truncado contava como sucesso. Só se descobriria na hora de
#     restaurar, que é o pior momento possível.
#  2. Falha só ia parar num log que ninguém lê. Numa auditoria hoje o diretório ANTIGO
#     (/var/backups/loneos, abandonado em abril) me fez concluir que o backup estava morto há 4
#     meses. Estava vivo — mas nada avisaria se estivesse morto de verdade.
#  3. Retenção de 7 dias: um problema que aparece numa segunda-feira já perdeu a semana anterior.
#
# ATENÇÃO: os backups ficam no MESMO disco do banco. Se a VPS morrer, os dois vão juntos.
# Cópia off-site continua pendente (precisa de credencial S3/Backblaze/Drive).

BACKUP_DIR="/opt/backups/postgres"
DATE=$(date +%Y%m%d_%H%M)
KEEP_DAYS=14
MIN_BYTES=5000000          # 5 MB. O banco tem ~79 MB; dump menor que isso é dump quebrado.
ARQ="$BACKUP_DIR/loneos_$DATE.dump"

avisar() {
  local JID=$(grep '^CS_INTERNAL_GROUP_JID=' /opt/loneos/.env | cut -d= -f2)
  local URL=$(grep '^EVOLUTION_API_URL=' /opt/loneos/.env | cut -d= -f2)
  local KEY=$(grep '^EVOLUTION_API_KEY=' /opt/loneos/.env | cut -d= -f2)
  local INST=$(grep '^EVOLUTION_INSTANCE=' /opt/loneos/.env | cut -d= -f2)
  [ -z "$JID" ] || [ -z "$URL" ] && return 0
  curl -s -m 20 -X POST "$URL/message/sendText/$INST" -H "apikey: $KEY" \
    -H 'Content-Type: application/json' -d "{\"number\":\"$JID\",\"text\":\"$1\"}" > /dev/null 2>&1
}

mkdir -p "$BACKUP_DIR"
docker exec supabase-db-1 pg_dump -U postgres -d loneos --format=custom > "$ARQ" 2>/tmp/bkp_err.txt
COD=$?

if [ $COD -ne 0 ]; then
  echo "$(date): FALHOU no pg_dump ($COD): $(head -c 200 /tmp/bkp_err.txt)" >> "$BACKUP_DIR/backup.log"
  avisar "🔴 *Backup do banco FALHOU* hoje (pg_dump saiu com código $COD). O último backup bom pode estar velho — vale olhar antes que vire problema."
  exit 1
fi

TAM=$(stat -c%s "$ARQ" 2>/dev/null || echo 0)
if [ "$TAM" -lt "$MIN_BYTES" ]; then
  echo "$(date): FALHOU — dump pequeno demais ($TAM bytes)" >> "$BACKUP_DIR/backup.log"
  avisar "🔴 *Backup do banco saiu quebrado* ($((TAM/1024)) KB, esperado mais de $((MIN_BYTES/1024/1024)) MB). Arquivo descartado."
  rm -f "$ARQ"; exit 1
fi

# Prova real: o dump é LEGÍVEL e tem as tabelas que importam?
docker cp "$ARQ" supabase-db-1:/tmp/verificar.dump > /dev/null 2>&1
TABELAS=$(docker exec supabase-db-1 pg_restore --list /tmp/verificar.dump 2>/dev/null | grep -c 'TABLE DATA')
CRITICAS=$(docker exec supabase-db-1 pg_restore --list /tmp/verificar.dump 2>/dev/null | grep -cE 'TABLE DATA.*(clients|contracts|content_cards)')
docker exec supabase-db-1 rm -f /tmp/verificar.dump > /dev/null 2>&1

if [ "$TABELAS" -lt 50 ] || [ "$CRITICAS" -lt 3 ]; then
  echo "$(date): FALHOU — dump ilegivel ($TABELAS tabelas, $CRITICAS criticas)" >> "$BACKUP_DIR/backup.log"
  avisar "🔴 *Backup do banco não passou na verificação*: só $TABELAS tabelas com dados no arquivo. Não dá pra confiar nesse backup."
  rm -f "$ARQ"; exit 1
fi

gzip -f "$ARQ"
echo "$(date): Backup OK — loneos_$DATE.dump.gz ($((TAM/1024/1024)) MB, $TABELAS tabelas)" >> "$BACKUP_DIR/backup.log"

find "$BACKUP_DIR" -name '*.dump.gz' -mtime +$KEEP_DAYS -delete

# ── CÓPIA OFF-SITE ─────────────────────────────────────────────────────────────────────────────
# 10/09/2026. O aviso no topo deste arquivo dizia "se a VPS morrer, banco e backup vão juntos" e a
# cópia externa seguia pendente por falta de credencial. O bloco abaixo já está pronto: no dia em
# que /opt/loneos/.env ganhar as três linhas do rclone, ele passa a rodar sozinho. Enquanto não
# ganhar, o backup local continua exatamente como está — nada quebra por ausência.
#
# Para ligar, basta acrescentar em /opt/loneos/.env:
#   BACKUP_REMOTO=nome-do-remote:caminho/loneos     (ex.: b2:lone-backups/postgres)
# e ter o rclone configurado em /root/.config/rclone/rclone.conf.
#
# Sem BACKUP_REMOTO o script sai daqui em silêncio — e o silêncio, neste caso, é o estado conhecido.
REMOTO=$(grep '^BACKUP_REMOTO=' /opt/loneos/.env 2>/dev/null | cut -d= -f2-)

if [ -n "$REMOTO" ]; then
  if ! command -v rclone > /dev/null 2>&1; then
    echo "$(date): off-site configurado ($REMOTO) mas rclone não está instalado" >> "$BACKUP_DIR/backup.log"
    avisar "🟠 *Backup off-site não rodou*: BACKUP_REMOTO está configurado mas o rclone não está instalado na VPS."
  else
    # --immutable protege contra o caso em que o arquivo muda no meio do envio.
    if rclone copy "$ARQ.gz" "$REMOTO/" --immutable --transfers 1 --timeout 10m > /tmp/rclone_err.txt 2>&1; then
      # CONFERE DO OUTRO LADO. Cópia que "não deu erro" mas não chegou é o mesmo backup fantasma
      # que este script existe para evitar — e a hora de descobrir não pode ser a da restauração.
      TAM_REMOTO=$(rclone size "$REMOTO/loneos_$DATE.dump.gz" --json 2>/dev/null | grep -o '"bytes":[0-9]*' | cut -d: -f2)
      TAM_LOCAL=$(stat -c%s "$ARQ.gz" 2>/dev/null || echo 0)
      if [ "$TAM_REMOTO" = "$TAM_LOCAL" ] && [ -n "$TAM_REMOTO" ]; then
        echo "$(date): off-site OK — $((TAM_LOCAL/1024/1024)) MB em $REMOTO" >> "$BACKUP_DIR/backup.log"
        # Retenção do lado de lá: 60 dias (mais que os 14 locais — é a cópia que sobrevive à VPS).
        rclone delete "$REMOTO/" --min-age 60d --include 'loneos_*.dump.gz' > /dev/null 2>&1
      else
        echo "$(date): off-site DIVERGIU — local=$TAM_LOCAL remoto=$TAM_REMOTO" >> "$BACKUP_DIR/backup.log"
        avisar "🔴 *Backup off-site chegou diferente*: local $((TAM_LOCAL/1024/1024)) MB, remoto ${TAM_REMOTO:-0} bytes. A cópia externa de hoje não serve."
      fi
    else
      echo "$(date): off-site FALHOU — $(head -c 200 /tmp/rclone_err.txt)" >> "$BACKUP_DIR/backup.log"
      avisar "🔴 *Backup off-site falhou hoje.* O backup local está bom, mas continua só na VPS."
    fi
  fi
fi
