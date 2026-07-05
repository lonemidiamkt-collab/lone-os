# Runbook — Rollout do Agente CS (monitor[IA]) pros grupos de cliente

Como levar o agente do piloto (hoje **16 grupos**) pra carteira toda (~40) **sem derrubar o número**.
O agente já está construído e calibrado; o que falta é COBERTURA (estar nos grupos) + a virada final.

> ⚠️ Regra de ouro: **NUNCA** adicionar o número em massa pela Evolution/automação. Isso desloga o
> número (foi o que derrubou o Julio em 25/jun). A entrada nos grupos é **manual, aos poucos**.

## Estado atual (04/jul/2026)
- Instância Evolution dedicada: `monitor[IA]` (número 5522988237830). Creds em standby no `.env`
  (`EVOLUTION_INSTANCE_NEW` / `EVOLUTION_API_KEY_NEW`).
- Allowlist `CS_PILOT_GROUP_JIDS`: **16 grupos** monitorados.
- `CS_INTERNAL_GROUP_JID`: grupo interno onde a Lone sugere/conversa (backstage; cliente nunca vê).
- Webhook Evolution `messages.upsert` → `POST /api/cs/inbound` (valida `CS_INBOUND_SECRET`).
- Suggest-only: em grupo de cliente o agente **só observa e sugere no grupo interno** — nunca fala
  com o cliente (exceto onboarding conduzido).

## Passo a passo pra adicionar mais grupos (o que fazer a cada leva)

1. **Admin adiciona o monitor[IA] no grupo do cliente** (manualmente, pelo WhatsApp). Faça em levas
   pequenas (5–8 por vez), não todos de uma vez.
2. **Pegar o JID de cada grupo novo.** Depois que o número entra, o JID aparece nas mensagens que
   chegam no webhook (log do `/api/cs/inbound`) ou via Evolution `GET /group/fetchAllGroups`. Formato
   `55xxxxxxxxxxxxxxxxxx@g.us`.
3. **Adicionar os JIDs em `CS_PILOT_GROUP_JIDS`** (separados por vírgula) no `.env` do VPS.
4. **Reiniciar o app** pra carregar o env: `cd /opt/loneos && docker compose -f docker-compose.prod.yml up -d` (ou o restart usado no deploy).
5. **Confação:** mande uma mensagem de teste no grupo novo e veja se o agente classifica (log
   `[CS/inbound]`) e, se for demanda, sugere no grupo interno.

> Só grupos na allowlist são processados — adicionar o número num grupo sem pôr o JID no
> `CS_PILOT_GROUP_JIDS` = o agente ignora (seguro por padrão).

## Migração do número (se for reaproveitar o número do Julio)
Se o plano for o monitor[IA] assumir os grupos que hoje têm o número do Julio:
1. NÃO adicionar o monitor[IA] em massa (derruba). Adicionar grupo a grupo, como acima.
2. Quando os grupos estiverem cobertos pelo monitor[IA], **virar a chave**: apontar
   `EVOLUTION_INSTANCE`/`EVOLUTION_API_KEY` pras creds `_NEW` e reiniciar (a virada em si é rápida —
   eu faço env+restart).
3. Só então tirar o número antigo dos grupos, se for o caso.

## Checklist da virada final (piloto → produção plena)
- [ ] Monitor[IA] presente em todos os grupos-alvo (contagem = nº de clientes ativos com grupo).
- [ ] Todos os JIDs no `CS_PILOT_GROUP_JIDS`.
- [ ] `CS_INTERNAL_GROUP_JID` = grupo interno REAL da equipe (hoje pode estar apontando pro grupo de
      teste "Automação" — conferir e trocar quando sair do teste).
- [ ] `CS_LONE_TEAM_JIDS` com os JIDs dos membros da equipe (pro filtro de autor — mensagem da
      equipe nunca vira demanda).
- [ ] Webhook Evolution `messages.upsert` ativo apontando pra `/api/cs/inbound` com o secret certo.
- [ ] Rodar 1 dia em modo observação e conferir a taxa de acerto das sugestões (harness em
      `scripts/cs-calibracao/` + funil de `cs_demandas`).
- [ ] Consentimento/LGPD com os clientes sobre o monitoramento do grupo (decisão do Roberto).
- [ ] Avisar a equipe que a Lone passou a valer pra todos os grupos (pra responderem os ok/não).

## Verificações úteis (VPS)
- Grupos monitorados: `grep CS_PILOT_GROUP_JIDS /opt/loneos/.env | tr ',' '\n' | grep -c @g.us`
- Últimas demandas: `docker exec supabase-db-1 psql -U postgres -d loneos -c "SELECT cliente_nome, tipo, status FROM cs_demandas ORDER BY created_at DESC LIMIT 20;"`
- Funil (captadas vs confirmadas): comparar `status` das `cs_demandas` dos últimos 30 dias.
