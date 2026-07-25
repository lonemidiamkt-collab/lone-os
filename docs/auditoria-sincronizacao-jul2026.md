# Auditoria de sincronização — jul/2026

Varredura completa em 3 frentes: **entre setores** · **WhatsApp → plataforma** · **plataforma → WhatsApp + coerência das telas**.
Motivação: "muita coisa que o CS vê no WhatsApp não está sendo passada pra cá" + métricas que não batem entre abas.

O caso que provou a tese: o cron `client-messages` enviou **42 mensagens de suporte** num dia e registrou em
`client_group_message_log`, enquanto o dashboard lia `traffic_routine_checks` (parada desde 16/jul) e exibia **0/31**.
O trabalho aconteceu, o registro existia, e a tela olhava outro lugar.

---

## Corrigido nesta rodada

| # | Problema | Efeito |
|---|---|---|
| 1 | `compute-health` lia `posts_this_month` (campo sem writer, sempre 0) | A fórmula pune meta não atingida: **toda a base ganhava risco fantasma** (+8 do dia 15, +15 do dia 25). Como todas as telas passaram a ler `current_health_score`, contaminava /churn, Radar, /ceo, /jornada e /goals. Agora usa `postsMes()`. |
| 2 | `/clients/[id]` "Posts Publicados X/12" sem filtro de mês | Cliente com 67 posts no ano aparecia **"67/12 — 100%"** — na tela usada em reunião com o cliente. |
| 3 | `/calendar`, `/tarefas`, `/my-work` nunca chamavam `init()` | Abrir direto (favorito, F5, link) mostrava **calendário vazio e "Tudo em dia!"** com dezenas de itens pendentes. |
| 4 | `markAllNotificationsReadDb` sem filtro de usuário | Uma pessoa clicava "marcar todas como lidas" e **zerava o sino do time inteiro**. |
| 5 | `insertNotification` sem `targetUser` | 92% das notificações nasciam globais (83 de 1100 tinham destinatário) — "@fulano" chegava no sino de todos. Entrega de arte agora vai ao social do card. |

---

## Corrigido na 2ª rodada (P0 + perdas do agente)

| # | Problema | Correção |
|---|---|---|
| 6 | Portal do cliente não mostrava **nenhuma** arte | 60 cards entregues, 0 com `image_url`, 60 com anexo. Passa a resolver a capa por `card_attachments` e a excluir card arquivado. |
| 7 | "Pedir ajuste" no portal morria num comentário | Reusa `aplicarAjusteNoCard` (o caminho do WhatsApp): volta pra produção, limpa `designer_delivered_at`, registra o motivo. |
| 8 | Ajuste não reabria a demanda do designer | `aplicarAjusteNoCard` agora põe a `design_request` em `in_progress` — corrige portal **e** WhatsApp. |
| 9 | `cs-risco` excluía `at_risk` | Só exclui `churned`. (Impacto hoje = 0: ninguém está `at_risk` — o status manual não reflete a realidade.) |
| 10 | Áudio nunca entrava no corpus | Insert virou função chamada pós-transcrição e pós-visão, com guarda anti-duplicata. |
| 11 | Sentimento sem persistência | Grava em `mood_entries` (inclusive positivo) e **escala** `attention_level` — só pra cima. |
| 12 | Pendência nunca saía da lista | Comando "Lone, o X já mandou as fotos" (human-gated, desambigua quando há várias). |
| 13 | Cobrança sem rastro | Grava em `cs_cobrancas`. |
| 14 | Calendário por WhatsApp não persistia | Grava em `content_period_plans` (a tabela tinha 0 linhas) e a mensagem parou de afirmar que estava salvo quando não estava. |

**Falso positivo da auditoria:** `cs-vigilancia` **não** está em modo seco — `VIGILANCIA_LIVE = true` desde 26/jun, com 208 cobranças postadas. O que enganou foi o comentário do cabeçalho, desatualizado (já corrigido).

## Aberto — ordenado por impacto

### P0 — o time trabalha no escuro
1. **Portal do cliente não mostra artes entregues.** `app/api/portal/[token]/content/route.ts:26` filtra `image_url`, mas a entrega padrão (multi-anexo) grava só em `card_attachments`. Cliente abre e não vê nada.
2. **"Pedir ajuste" no portal morre num comentário.** `app/api/portal/[token]/approve/route.ts:69-77` não muda status, não limpa `designer_delivered_at`, não reabre a `design_request` — e a vigilância **para de cobrar**. Pelo WhatsApp o mesmo fluxo funciona (`lib/cs/card.ts:121-145`).
3. **`cs-vigilancia` em MODO SECO** (`route.ts:7-9`): grava `dry_run=true` e não posta. A cobrança de card parado que o time acha que existe **não acontece**.
4. **`cs-risco` exclui `status='at_risk'`** (`route.ts:23`): o alerta de churn ignora justamente quem já está marcado como risco.

### P1 — agente CS perde informação
5. **Áudio nunca entra no `cs_message_corpus`.** O insert está em `inbound:805`, antes da transcrição (`:867`). Cliente que fala por áudio é invisível para o aprendizado de estilo e briefing.
6. **Sentimento não é persistido.** `checarSatisfacao` só manda WhatsApp + `notifications`. Sem histórico; o agente nunca atualiza `attention_level` → cliente bravo continua verde na jornada.
7. **Nada dá baixa em `pendencias_cliente`.** A lista só cresce (merge aditivo) → o agente cobra de novo o que o cliente já entregou.
8. **Cobrança não registra que cobrou** → possível cobrar o mesmo cliente 3× no dia; impossível medir eficácia.
9. **Calendário por comando não persiste** (`lib/cs/motor.ts` não tem uma escrita sequer) — e a mensagem afirma que está em Planejamento, o que é falso.
10. **`cs_estilo` ilhado:** perfis gerados e revisados, mas `getEstiloTime/Cliente` não são chamados no fluxo — o agente escreve com tom hardcoded.
11. **Sem log de outbound:** nenhuma mensagem enviada pelo agente é registrada.
12. **Pedido de ajuste do cliente não gera `cs_rework_events`** → o motivo real da reprovação não realimenta o briefing do designer.

### P2 — divergência entre telas
13. **"Posts do mês" tem ~21 cálculos diferentes.** Dentro da *mesma* tela `/social` há 4 números distintos (`:522`, `:2296`, `:2338`, `:3191`). A fonte única (`lib/metrics/producao.ts`) tem só 3 consumidores.
14. **"Clientes ativos" tem 6 definições.** `/api/okr/traffic-metrics:24` não filtra `active` → verba de cliente churnado entra no "Investimento Executado".
15. **"Atrasados" tem 5 réguas** (48h corridas vs horas úteis vs due_date, com/sem teto de 30d).
16. **Fallback silencioso do dashboard** (`app/page.tsx:661`): se a rota falhar, cai para o total histórico sem indicar.
17. **Arquivar card não cancela a demanda do designer**; deletar demanda deixa `design_request_id` órfão.
18. **Trocar o social do cliente não move os cards** (board filtra `socialMedia`, carteira filtra `assignedSocial`).
19. **Handoff comercial é de mão única**: `source_lead_id` é escrito e nunca lido; o CRM não sabe que o lead virou cliente; `valor_orcamento` não vira contrato/MRR; sem guarda de idempotência (2 cliques = 2 clientes).
20. **Onboarding aprovado grava credenciais em `clients.*`** enquanto a aba Acessos lê `client_access` → aba vazia. E `status` continua `onboarding` para sempre.
21. **`timeline_entries` quase vazia** — a aba Histórico não recebe entrega, publicação, contrato nem handoff.
22. **`task_transitions` nunca recebe INSERT**; `/my-work` linka a tarefa para a área errada.

### P3 — infraestrutura e dados mortos
23. **Só 9 dos 36 crons estão em `docs/CRON_SCHEDULE.md`**, e `scripts/cron-call.sh` (usado por 4 deles) **não está no repositório** — existe só no VPS.
24. **`notifications.target_user` e `card_id` existem em produção mas não têm migration** — rebuild do banco quebraria o sino.
25. **`traffic_routine_checks` morta desde 16/jul**, ainda lida por `/traffic` e pela página do PDF de sexta.
26. **`useSnapshots` em localStorage** — histórico de OKR difere por navegador.
27. **`social_reports` vazia**, mas `compute-health` lê `posts_goal` dela → meta cai no default 12 para todos.
28. **Tabelas construídas e nunca usadas:** `client_journey` (0), `client_checkins` (0), `social_reports` (0), `task_transitions` (0).
29. **Janela de atribuição Meta divergente:** `lib/meta/client.ts` usa `["7d_click","1d_view"]`, `api.ts`/`insights-server.ts` usam só `["7d_click"]` → leads do portal ≠ do /traffic.

### Sem aviso no WhatsApp
Arte entregue · cliente aprovou no portal · contrato vencendo · cliente arquivado/reativado · lead ganho · card bloqueado · token Meta expirando.

---

## Pontes íntegras (não mexer sem motivo)
- Social → Designer: sincronia de briefing/prazo/título (`app/api/content-cards/update/route.ts:64-82`) e link reverso atômico na criação.
- Reprovação pelo social: reabre a demanda + grava `cs_rework_events` + realimenta o briefing do designer. **Melhor loop fechado do sistema.**
- `/api/cs/decide`: única ação de UI que ecoa no grupo do WhatsApp.
- Onboarding conversacional → `client_briefings` versionado: melhor caminho de dados do agente.
