# Hardening Report — Pós-Auditoria Meta API

**Branch:** hardening/post-audit-meta  
**Data:** 2026-05-13  
**Executado por:** Roberto Lino + Claude

---

## Resumo

Hardening pós-auditoria executado após merge de `fix/metrics-audit` em `main`.
9 tarefas planejadas: 7 concluídas, 1 parcialmente concluída, 1 pendente de OK do usuário.

---

## Tarefas executadas

### TAREFA 1 — Remoção de `extractConversions` ✅
**Commit:** `ff84a0d`  
Função legada removida de `lib/meta/api.ts` após confirmação por grep de zero callers.
Nenhum efeito funcional — apenas limpeza preventiva contra regressão.

### TAREFA 2 — Invalidar caches pré-correção ✅ (cancelada — não necessária)
Queries auditadas em FASE 1 confirmaram 0 registros anteriores a 13/05/2026
em `client_report_snapshots` e `ai_audits`. Banco limpo — nada a invalidar.

### TAREFA 3 — Endpoint de warm-up de snapshots ✅
**Commit:** `50e7e04`  
`POST /api/system/warmup-snapshots`: gera os 4 períodos para cada cliente ativo,
com sleep 500ms entre clientes. Retorna log estruturado.  
`docs/PORTAL_LAUNCH_PLAYBOOK.md` criado com procedimento completo de lançamento.

### TAREFA 4 — Tratamento de divisão por zero em CPA ✅
**Commit:** `4e35f11`  
- `KpiValue.value: number | null` (types.ts)
- `curCpa/prevCpa = null` quando mensagens = 0 (buildSnapshot.ts)
- `val?.value != null ? format(val.value) : "—"` (PortalDashboard.tsx)
- Criativos já tratavam null — sem alteração necessária
- `docs/manual-tests/cpa-zero-division.md` criado

### TAREFA 5 — Health check da integração Meta ✅
**Commit:** `74f9654`  
- `GET /api/system/meta-health`: semáforo verde/amarelo/vermelho via CRON_SECRET
- `lib/actions/metaHealth.ts`: server action (leitura direta do banco)
- `components/MetaHealthCard.tsx`: card no dashboard para admin/manager
  - 🟢 Verde: token válido, tudo OK
  - 🟡 Amarelo: token expira em ≤14 dias
  - 🔴 Vermelho: token expirado OU sync parado >2h com clientes ativos
- `docs/META_HEALTH.md` criado

### TAREFA 6 — Wrapper centralizado para chamadas Meta ✅
**Commit:** `1ac2467`  
- `lib/meta/client.ts`: `metaInsightsFetch()` sempre injeta `attribution_windows`
- `docs/META_API_PATTERN.md`: regras, isenções documentadas, query de validação para PR review
- Isenções conhecidas: `useMetaAds.ts` (client-side), `ad-accounts` e `exchange-token` (metadados/OAuth)

### TAREFA 8 — Confirmar timezone do cron ✅
**Commit:** `4f4584c`  
- VPS: `Etc/UTC`, sem variável TZ — todos os crons em UTC (correto)
- `docs/CRON_SCHEDULE.md`: lista completa com horário UTC e BRT
- Nenhuma discrepância encontrada
- `generate-snapshots` marcado como **pendente de configuração**

---

## Tarefas parcialmente concluídas

### TAREFA 7 — Investigar SUSPEITO-1 (Portal vs Traffic spend) ⚠️
**Status:** Script criado, execução pendente

`scripts/audit-portal-vs-traffic.ts` criado para comparar spend por conta (Portal)
vs soma por campanha (/traffic) com threshold 5%.

`app/api/system/audit-spend/route.ts` criado como alternativa executável no contexto
da app (evita problema de `node_modules` no container standalone).

**Bloqueio:** endpoint está no branch de hardening ainda não mergeado. Executar via curl
após CHECKPOINT 7 (merge + deploy):

```bash
curl -s https://painel.lonemidia.com/api/system/audit-spend \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

**Próximo passo após execução:**
- Divergência > 5%: documentar como BUG-5 e propor correção em PR separado
- Divergência ≤ 5%: atualizar METRICS_AUDIT.md como "monitorado sem evidência"

---

## Tarefas pendentes de OK do usuário

### TAREFA 9 — Configurar cron de generate-snapshots no VPS ⏳
**Status:** Script criado e testado. Aguardando OK para adicionar ao crontab.

**Script criado:** `/opt/loneos/scripts/generate-snapshots-cron.sh`  
**Teste manual:** HTTP 200, `{"generated":2,"errors":0}` em 5s ✅

**Aguardando OK para executar:**
```bash
(crontab -l; echo "0 9 * * * /opt/loneos/scripts/generate-snapshots-cron.sh") | crontab -
```
(09:00 UTC = 06:00 BRT — consistente com os demais crons da aplicação)

**Nota sobre CRON_SECRET:** O script atual não passa Authorization header porque
`CRON_SECRET` não está configurado no `.env` do VPS. O endpoint aceita requisições
sem header quando `CRON_SECRET` é `undefined`. Setar `CRON_SECRET` no `.env` + rebuild
é um item separado de segurança recomendado para após o lançamento.

---

## Riscos remanescentes

| Risco | Severidade | Status |
|-------|-----------|--------|
| SUSPEITO-1: divergência de spend Portal vs Traffic | Baixo | Audit pendente de deploy |
| SUSPEITO-2: snapshot gerado cedo com atribuição incompleta | Baixo | Monitorar com dados reais |
| CRON_SECRET não configurado no VPS | Médio | Pós-lançamento (requer rebuild) |
| `extractConversions` removida mas useMetaAds.ts tem lógica equivalente não unificada | Baixo | Monitorar — lógica correta, só não compartilha código |

---

## Recomendação: pode lançar para cliente piloto?

**Sim, com ressalvas.**

**OK para lançar:**
- 4 bugs críticos de Meta API corrigidos e em produção ✅
- Divisão por zero em CPA corrigida ✅
- Warm-up de snapshots disponível ✅
- Health check configurado ✅

**Antes de lançar (obrigatório):**
- [ ] Adicionar cron de generate-snapshots ao VPS (TAREFA 9 — aguarda OK)
- [ ] Configurar subdomínio `resultados.lonemidia.com` (Cloudflare + nginx)
- [ ] Sentry configurado e recebendo eventos

**Antes de escalar (recomendado):**
- [ ] Rodar audit-spend e concluir TAREFA 7
- [ ] Setar `CRON_SECRET` no VPS e rebuildar container
- [ ] Completar testes funcionais (mobile, token inválido, troca de período)

---

*Gerado automaticamente. Última atualização: 2026-05-13.*
