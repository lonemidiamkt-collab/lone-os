# Agente CS — Revisão & Análise de Integração com a Plataforma

> Auditoria do [blueprint](agente-cs-design.md) (A0–A5 + prompts A1/A2 + regras A4) e de
> **como o Lone OS vai lidar** com o agente. Verificado contra o código real.

## 1. Correções/melhorias no design (após a análise)

| # | Achado | Correção |
|---|---|---|
| C1 | Sugestão ≠ card. Se o agente criasse card direto, **poluiria o Kanban** com itens não confirmados | **Sugestões ficam em `cs_demandas` (pendentes)**; viram ContentCard/DesignRequest **só na confirmação humana**. O board só recebe demanda confirmada. |
| C2 | Cards do agente precisam ser identificáveis | **Tag de origem** (`source: "cs_agent"`), reusando o padrão `requestedByTraffic` (que já mostra badge no board). |
| C3 | Detecção de autor depende de saber os números da equipe | **Gap de dado:** manter a **lista de números/JIDs da equipe da Lone** (hoje não centralizada). |
| C4 | Webhook pode entregar a mesma mensagem 2× | **Idempotência por id de mensagem** (chave única). |
| M1 | Visibilidade além do WhatsApp | (Opcional) **"Inbox do agente"** na UI — fila de sugestões com Confirmar/Ajustar/Descartar, além do grupo interno. |

## 2. O que a plataforma JÁ suporta (reuso, sem reinventar)

| Necessidade do agente | Já existe | Onde |
|---|---|---|
| Criar card | ✅ | `app/api/content-cards/create` |
| Criar design-request | ✅ | `app/api/design-requests/create` |
| Atualizar/mover card | ✅ | `app/api/content-cards/update` |
| Enviar msg ao grupo interno | ✅ | `lib/whatsapp/evolution.ts` → `sendGroupText` |
| Board reflete card novo na hora | ✅ | realtime (`useContentStore`) |
| Cron + config | ✅ | `cron-call.sh` + `agency_settings` |
| SLA por etapa do Kanban | ✅ | `ContentCard.columnEnteredAt`/`statusChangedAt` + `getSlaBadge` |
| Tag de origem (badge) | ✅ | padrão `requestedByTraffic` |
| Gerar PDF (relatório A5) | ✅ | browserless / `htmlToPdf` |
| Anti-spam/dedup | ✅ | padrão `cycle_key` (`budget_alert_log`) |
| Roteamento por responsável | ✅ | `clients.assigned_*` |

**Conclusão:** a maior parte do agente é **orquestração sobre peças que já existem.**

## 3. O que é NOVO (precisa construir)

| Item | Por quê | Esforço/risco |
|---|---|---|
| **Recebimento de WhatsApp (inbound)** | hoje Evolution é **só saída**; o agente precisa LER os grupos | **endpoint webhook** + configurar Evolution pra POSTar `messages.upsert`. Nova superfície. |
| Tabelas novas | estado e memória | `cs_demandas` (sugestões/estado), `cs_log` (classificações+decisão humana), do's&don'ts por cliente, exemplos rotulados |
| Pipeline A1/A2 + orquestração | o cérebro | chamadas Anthropic (externas) + roteamento/criação |
| Lista de números da equipe | detecção de autor | centralizar JIDs/telefones da Lone |
| Tag `source` no card | transparência | coluna/flag no ContentCard |

## 4. Riscos de integração (e mitigação)

| Risco | Impacto | Mitigação |
|---|---|---|
| **VPS pequena** (1 vCPU/4GB) já roda Next+Postgres+Evolution+chromium | inbound + LLM podem **degradar o app inteiro** | LLM é **externo** (não queima CPU local); ingestão/DB sim → **fila + debounce + assíncrono**, não bloquear requisições web; considerar **worker/processo isolado**; monitorar carga |
| **Número compartilhado/pessoal do Julio** | ban derruba **inbound E outbound** (ponto único de falha) | **número dedicado** (já flagueado); avaliar **API oficial** pra produção |
| **Webhook = superfície de ataque** | mensagem forjada → demanda falsa | **autenticar/validar** (segredo/assinatura), reusar guarda das rotas `/api` |
| **Double-delivery / perda de mensagem** (instabilidade Evolution/Meta — já vista) | demanda duplicada ou perdida | **idempotência** por id + **reconciliação periódica** do histórico |
| **Poluição do board** com não-confirmados | board vira lixo, time perde confiança | sugestões em `cs_demandas` (pending); card só na confirmação (C1) |
| **Race condition** agente × humano editando | sobrescrita | usar as **rotas de update existentes** + idempotência |
| **Burst de realtime** (janela cria vários cards) | UI pisca | aceitável; observar; criar em lote moderado |
| **Vazamento entre clientes** (já tivemos!) | dado de A no grupo de B | isolamento por cliente em toda etapa |

## 5. Mudanças necessárias na plataforma (resumo acionável)
1. **Endpoint webhook inbound** (`/api/cs/inbound`) + configurar Evolution pra enviar mensagens recebidas, com **autenticação** e **idempotência**.
2. **Migrations:** `cs_demandas`, `cs_log`, campo do's&don'ts em `clients`, exemplos/memória, lista de números da equipe.
3. **Tag `source`** no ContentCard/DesignRequest (origem = agente).
4. **Fila/worker assíncrono** pro processamento (não rodar LLM/ingestão no caminho da requisição web).
5. **(Produção)** número dedicado / API oficial + consentimento LGPD.

## 6. Veredito
Tecnicamente **sólido e em grande parte reuso**. O **único bloco realmente novo e sensível**
é o **inbound de WhatsApp** (webhook) + a **capacidade da VPS**. Nada impede o **piloto**
(1 grupo de teste, fila leve), mas produção pede número dedicado, isolamento de carga e LGPD.
