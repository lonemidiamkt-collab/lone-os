# Backup e Restauração — Lone OS

## Visão Geral

O banco de dados de produção (PostgreSQL 16 via Supabase) é copiado diariamente através do script `scripts/backup-db.sh`. Os dumps ficam em `/var/backups/loneos/` no VPS e são retidos por 30 dias.

---

## Backup manual

```bash
# No VPS
ssh -i ~/.ssh/loneos_vps root@72.60.142.252
DATABASE_URL="postgresql://..." /opt/loneos/scripts/backup-db.sh
```

Os dumps são nomeados `loneos_YYYYMMDD_HHMMSS.dump` (formato custom do pg_dump, compressão nível 9).

---

## Cron automático (VPS)

```cron
# Backup diário às 3h UTC
0 3 * * * DATABASE_URL="postgresql://..." /opt/loneos/scripts/backup-db.sh >> /var/log/loneos-backup.log 2>&1
```

Para verificar o log: `tail -20 /var/log/loneos-backup.log`

---

## Restauração

```bash
# Listar backups disponíveis
ls -lh /var/backups/loneos/

# Restaurar um dump específico
DATABASE_URL="postgresql://..." /opt/loneos/scripts/restore-db.sh /var/backups/loneos/loneos_20260511_030000.dump
```

O script pede confirmação digitando `sim` antes de sobrescrever o banco.

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | — | Connection string PostgreSQL (obrigatório) |
| `BACKUP_DIR` | `/var/backups/loneos` | Diretório dos dumps |
| `KEEP_DAYS` | `30` | Retenção em dias |

---

## Localização dos Arquivos

| Arquivo | Descrição |
|---|---|
| `scripts/backup-db.sh` | Cria dump comprimido |
| `scripts/restore-db.sh` | Restaura dump com confirmação |
| `/var/log/loneos-backup.log` | Log de execuções (VPS) |
| `/var/backups/loneos/` | Dumps armazenados (VPS) |
