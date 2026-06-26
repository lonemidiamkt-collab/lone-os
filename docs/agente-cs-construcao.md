# Agente CS (monitor[IA]) — Nota de Construção

**Lone Mídia · estado em junho/2026.** Como o Agente CS foi construído, o que ele faz hoje e
como se encaixa na plataforma. Documento vivo — atualizar conforme evolui.

---

## 1. O que é

Um agente de **Customer Success por IA** que lê os grupos de WhatsApp dos clientes, identifica
**demandas reais** (pedidos acionáveis), redige um **briefing** e sugere à equipe — que **confirma**
antes de qualquer ação. Princípio central: **a IA decide O QUÊ, o código decide QUEM; humano
confirma.** O agente nunca fala com o cliente e nunca cria nada sozinho (suggest-only).

Roda no número dedicado **monitor[IA]** (Evolution API, instância própria), separado do número do
gestor de tráfego.

## 2. O pipeline (estágios, não agentes soltos)

```
WhatsApp (grupo do cliente)
   │  webhook messages.upsert → POST /api/cs/inbound  (valida CS_INBOUND_SECRET)
   ▼
A0  Ingestão & filtro  (lib/cs/ingest.ts — SEM IA)
   • normaliza o evento, extrai texto, detecta autor (equipe Lone vs cliente)
   • descarta trivial (saudação, "kkk", emoji) e mensagem da própria equipe
   • dedup por message_id · debounce (coalescência de rajada)
   ▼
A1  Classificador  (lib/cs/classifier.ts — OpenAI gpt-4o-mini, structured outputs)
   • é demanda? tipo (arte_nova, ajuste_arte, cobranca_prazo, reclamacao, …)? urgência? confiança?
   • calibrado para RECALL (melhor pecar por captar a mais do que deixar passar)
   ▼
A2  Verificador cético  (lib/cs/verifier.ts — OpenAI gpt-4o)  ← só nos AMBÍGUOS (confiança < 0.85)
   • postura de refutar: "é MESMO uma demanda, ou é papo?" → corta falso-positivo
   • fail-open: se o A2 falhar, o fluxo segue
   ▼
A3  Redator do briefing  (lib/cs/briefing.ts — OpenAI gpt-4o)
   • INTERPRETA o pedido. Se vago ("arte sobre as mudanças") → NÃO inventa: escreve curto e
     lista o que perguntar ao cliente. Se claro → briefing acionável no tom da marca.
   • só aplica regras do cliente que se aplicam ÀQUELE pedido (promo só em pedido de promo).
   ▼
Roteamento  (lib/cs/routing.ts — determinístico, SEM IA)
   • tipo → área (designer/social/tráfego) → responsável via clients.assigned_*
   ▼
Sugestão no grupo interno  (lib/cs/notify.ts → monitor[IA])
   • grava a demanda em cs_demandas (status pendente, código curto de 4 hex)
   • posta NOMEANDO o responsável: "Júlio, a *Cliente* pediu: … — crio o card ou você alinha antes?"
   • se o pedido é vago: "tá meio vago, alinhe com o cliente: …"
   ▼
Decisão humana (responder no grupo interno):
   • ok <cód>      → cria o ContentCard no Kanban (status Ideias)
   • ajustar <cód> <texto> → anexa a instrução ao briefing e re-posta
   • nao <cód>     → descarta (o humano cuida)
```

**A4 (SLA/cobrança) e A5 (relatório)** estão no blueprint mas ainda não construídos —
ver a fase "Vigilância de Fluxo".

## 3. Robustez já construída

- **Dedup:** `message_id` repetido (reenvio da Evolution) não duplica demanda.
- **Debounce (coalescência):** rajada do mesmo autor+grupo em ≤90s **vira uma demanda só** — a
  mensagem nova enriquece a demanda pendente em vez de criar/postar outra.
- **Suggest-only com idempotência:** card só nasce no `ok`; confirmar 2× não duplica.
- **Fail-closed no webhook:** segredo errado → 401; grupo fora da allowlist do piloto → ignora.
- **Anti prompt-injection:** o conteúdo das mensagens é tratado como DADO, nunca instrução.

## 4. Como se encaixa na plataforma (Lone OS)

- No `ok`, cria um **ContentCard** real (tabela `content_cards`): status `ideas`, vinculado ao
  cliente, com o briefing do A3, prioridade pela urgência e selo `🤖 Agente CS`. **Dono do card
  (`social_media`) = `assigned_social` do cliente** → aparece no board do social responsável; o
  designer enxerga pelo board dele (filtra por `assigned_designer`).
- O agente **não** cria `design_request` — quem decide mandar pro designer é o humano (botão
  "A fazer"/"Solicitar Design" no card). Coerente com "vigiar/sugerir, não agir".
- Reusa estruturas que já existem: `clients.assigned_*`, `whatsapp_group_jid`,
  `campaign_briefing`/`fixed_briefing`, `content-cards/create`, `team_members`.

## 5. Infra & configuração

| Item | Valor |
|---|---|
| LLM | OpenAI — A1 `gpt-4o-mini`, A2/A3 `gpt-4o` (reusa `OPENAI_API_KEY` da plataforma) |
| WhatsApp | Evolution API, instância **monitor[IA]** (`EVOLUTION_*_NEW`) |
| Webhook | `POST /api/cs/inbound?secret=…`, evento `MESSAGES_UPSERT` |
| Allowlist piloto | `CS_PILOT_GROUP_JIDS` — só os grupos listados são processados |
| Grupo interno | `CS_INTERNAL_GROUP_JID` — onde o agente sugere e recebe ok/ajustar/nao |
| Equipe Lone | `CS_LONE_TEAM_JIDS` — autores que nunca geram demanda |
| Cliente de teste | `CS_TEST_CLIENT_ID` — stand-in p/ grupo de teste sem cliente real |
| Persistência | tabela `cs_demandas` (migrations `20260625*`) |

Custo estimado: ~R$100–130/mês no volume do piloto.

## 6. Estado atual (jun/2026)

- **Em produção, fase de calibração, num grupo de TESTE.** Loop completo verificado ao vivo:
  mensagem real → classifica → briefing → sugestão no grupo → `ok` cria card no Kanban.
- Já processou demandas reais de teste (ex.: "arte de promoção", "feriado do dia 20" → urgência
  alta, 95% de confiança).

## 7. Próxima fase — "Vigilância de Fluxo"

Hoje o agente **capta** demanda. A próxima fase dá a ele **CS de verdade**: vigiar o ciclo inteiro
(pauta planejada → produção → entrega → aprovação → cliente) e **cobrar, no grupo interno, com tom
amigável**, quem trava o fluxo — sem agir pelo humano. 6 pontos de vigilância, calibrados um a um.
Ver `docs/agente-cs-design.md` e o plano faseado.

## 8. Pendências conhecidas

- **Rotacionar a `OPENAI_API_KEY`** (vazou no chat uma vez) — segurança.
- A4 (SLA/cobrança) + A5 (relatório de entregas).
- Coalescência mais esperta (re-classificar a rajada, bump de urgência).
- Migrar do grupo de teste para clientes reais (terminar os ~40 grupos do monitor[IA] + LGPD).
