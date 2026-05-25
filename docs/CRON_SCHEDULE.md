# Cron Schedule — Lone OS VPS

**Sistema:** UTC puro (`timedatectl` confirma `Time zone: Etc/UTC`)  
**Variável TZ:** não definida (crons interpretam horários como UTC)  
**Conversão:** BRT = UTC − 3h  
**Última verificação:** 2026-05-13

---

## Crons ativos

| Schedule (UTC) | Horário BRT | Job | Status |
|----------------|-------------|-----|--------|
| `0 3 * * *` | 00:00 diário | `/opt/backups/backup-postgres.sh` | ✅ OK |
| `0 3 * * 0` | 00:00 domingo | `/opt/loneos/scripts/cleanup-storage.sh` | ✅ OK |
| `*/5 * * * *` | a cada 5min | `/opt/loneos/scripts/healthcheck.sh` | ✅ OK |
| `0 4 * * 0` | 01:00 domingo | `docker builder prune` | ✅ OK |
| `0 8 * * *` | 05:00 diário | `curl .../api/system/followup` | ✅ OK |
| `0 9 * * *` | 06:00 diário | `curl .../api/system/contract-renewal` | ✅ OK |
| `0 9 * * *` | 06:00 diário | `curl .../api/system/compute-health` | ✅ OK |
| `*/15 * * * *` | a cada 15min | `curl .../api/system/defense-scan` | ✅ OK |
| `0 9 20 * *` | 06:00 dia 20 | `curl .../api/system/holiday-alert` | ✅ OK |

---

## Crons pendentes (não configurados no VPS)

| Schedule sugerido (UTC) | Horário BRT | Job | Status |
|------------------------|-------------|-----|--------|
| `0 9 * * *` | 06:00 diário | `generate-snapshots-cron.sh` | ⚠️ **FALTA CONFIGURAR** |

O cron de `generate-snapshots` está documentado em `docs/PORTAL.md` mas nunca foi adicionado ao crontab do VPS. Sem ele, snapshots do portal são gerados só sob demanda (primeiro acesso do cliente), causando latência alta e risco de rate limit no lançamento.

**Configurar antes do lançamento do portal** — ver TAREFA 9 em `docs/PORTAL_LAUNCH_PLAYBOOK.md`.

---

## Notas de timezone

- Todos os crons operam em UTC. Não há risco de interpretação incorreta pois o sistema é UTC puro.
- O código da aplicação usa BRT internamente via `lib/meta/timezone.ts` — isso é independente do timezone do sistema.
- Quando adicionar novos crons: se quiser executar às HH:00 em BRT, configure `HH+3:00` em UTC (ex: 06:00 BRT = `0 9 * * *` em UTC).
