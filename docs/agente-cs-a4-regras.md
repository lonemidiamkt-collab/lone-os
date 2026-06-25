# Agente CS — A4 (Acompanhamento & SLA) · Regras concretas

> Artefato do [blueprint](agente-cs-design.md). Especifica janelas, SLAs, watch de 1ª
> resposta e escada de escalonamento — prontos pra virar cron/código. Reusa a infra que
> já existe (cron `cron-call.sh`, `agency_settings`, Evolution `sendGroupText`).

## 1. O que o A4 faz
Acompanha dois relógios por demanda e dispara digests/escalações:
1. **SLA de 1ª resposta (CS):** o cliente foi reconhecido no grupo?
2. **SLA de entrega:** o card andou e foi entregue?

A **detecção** (A1/A2) é tempo real; o A4 cuida só do **surfacing agendado** e da **cobrança**.

## 2. Parâmetros (configuráveis em `agency_settings`)

| Chave | Exemplo | O que é |
|---|---|---|
| `cs_agent_enabled` | `true` | Trava global (default `false`) |
| `cs_internal_group_jid` | `120363418195771831@g.us` | Grupo interno (reusa o de alertas) |
| `cs_business_hours` | `08:00-18:00` | Horário comercial (BRT) |
| `cs_business_days` | `1-5` | Dias úteis (seg–sex) |
| `cs_windows_media` | `09:00,12:00,15:00,18:00` | Janelas de média urgência |
| `cs_window_baixa` | `18:00` | Janela única de baixa urgência |
| `cs_sla_resp_alta_min` | `10` | SLA 1ª resposta — alta (min) |
| `cs_sla_resp_media_min` | `20` | SLA 1ª resposta — média (min) |
| `cs_escala_gestor_jid` | `…@g.us`/DM | Destino nível 2 |
| `cs_escala_ceo_jid` | `…` | Destino nível 3 |

## 3. SLA por tipo

| `tipo` | 1ª resposta | Entrega |
|---|---|---|
| `arte_nova` | 20 min | 2 dias úteis |
| `ajuste_arte` | 20 min | 1 dia útil |
| `cobranca_prazo` | **10 min** | 4h |
| `feedback_campanha` | 20 min | 1 dia útil |
| `duvida` | 20 min | 4h |
| `reclamacao` | **10 min** | 2h |
| `elogio` | — | — (só registra) |
| `agendamento` | próxima janela | conforme a data |
| `retracao` | — | imediato (fecha demanda) |

## 4. Janelas de surfacing (cron)

| Urgência | Quando sobe | Cron (UTC = BRT+3) |
|---|---|---|
| **Alta** | imediato (ao confirmar) | — (event-driven, não cron) |
| **Média** | 09h/12h/15h/18h BRT, dias úteis | `0 12,15,18,21 * * 1-5` |
| **Baixa** | 18h BRT, dias úteis | `0 21 * * 1-5` |

- Cada janela monta um **digest agrupado** ("📋 5 demandas novas: …") em vez de N pings.
- **Fora do horário comercial** → enfileira pra próxima janela útil (nada de madrugada).
- Roda igual aos outros: `cron-call.sh cs-surface POST`.

## 5. Watch de 1ª resposta (regra)

```
ao surfacing(demanda):
  demanda.surfaced_at = agora
  demanda.status = "aguardando_resposta"
  agenda check em sla_1a_resposta(demanda.tipo)

no check(demanda):
  se existe mensagem da EQUIPE DA LONE no grupo do cliente APÓS surfaced_at:
      demanda.status = "respondida"        # fecha o watch EM SILÊNCIO
      return
  se agora está dentro do horário comercial:
      escala(demanda, nivel = demanda.nivel_escala)
  senão:
      reagenda check pro próximo horário comercial
```

> A "mensagem da equipe da Lone" usa a **detecção de autor** (números/nomes conhecidos).
> Isso é a guarda contra "cobrar algo já respondido".

## 6. Escada de escalonamento (sem spam)

| Nível | Gatilho | Destino | Mensagem |
|---|---|---|---|
| 0 | surfacing | **responsável** (nomeado) | "Carlos (designer) — Império pediu arte…" |
| 1 | sem resposta após SLA 1ª resp. | responsável (lembrete) + flag no grupo | "⏰ Império sem resposta há 20 min" |
| 2 | persistiu +1h | **gestor** | "⚠️ Demanda do Império parada — Carlos não respondeu" |
| 3 | persistiu +mais | **CEO** | "🔴 Demanda crítica do Império sem ação" |

- **Anti-spam:** no máximo **1 aviso por (demanda, nível, dia)** — mesma mecânica do
  `cycle_key` que já usamos no `budget_alert_log`.

## 7. Estados da demanda (máquina simples)

```
detectada → (humano confirma) → EM ABERTO (aguardando produção — visível a designer E social)
   ├─ pegou + avançou no Kanban → em_producao → … → entregue → (relatório A5)
   ├─ ninguém pegou (não confirmou) ──── nudge → responsável
   ├─ pegou mas o card PAROU numa etapa ── nudge → responsável → gestor
   ├─ cliente sem 1ª resposta ─────────── watch (§5) → escala
   └─ retracao/descartada → fechada
```

> **"Em aberto" = fila de produção compartilhada.** A demanda fica visível aos **dois**
> responsáveis (uma peça costuma precisar do **designer** pra criar e do **social** pra
> agendar/postar). Só sai de "em aberto" quando alguém **pega e avança**.

## 8. Nudge de produção (avanço no Kanban)
O agente acompanha se a demanda **anda**, não só se foi entregue — usando os campos que **já
existem** no `ContentCard`: `columnEnteredAt` / `statusChangedAt`.

- **Dois lembretes distintos** (ambos no grupo interno, nomeando o responsável):
  - **Não confirmou / não pegou:** card parado em "Ideias/aguardando" sem dono ativo →
    lembra o responsável.
  - **Não avançou:** card foi pego mas **travou numa etapa** além do tempo → lembra;
    persistiu → **gestor** (escada da §6).
- **SLA por etapa (configurável):** cada coluna do Kanban tem um tempo máximo de permanência;
  estourou → nudge. (Aproveita o `getSlaBadge` que o board já calcula.)
- **Fecha em silêncio** quando o card chega em "Publicado/entregue" — nunca cobra o que já saiu.

## 8b. SLA de entrega (prazo final)
Além do avanço por etapa, o A4 também compara o tempo total com a coluna **Entrega** da §3;
estourou o prazo final → escalonamento normal (§6).

## 9. Mapeamento pra infra existente
- **Cron:** entradas no crontab via `cron-call.sh` (igual a `budget-digest`, `client-messages`).
- **Config:** `agency_settings` (igual às travas e janelas atuais).
- **Envio:** `lib/whatsapp/evolution.ts` → `sendGroupText` (grupo interno).
- **Dedup/anti-spam:** padrão `cycle_key` do `budget_alert_log`.
- **Dados da demanda:** nova tabela `cs_demandas` (status, surfaced_at, responded_at,
  delivered_at, nivel_escala, client_id, card_id) — base do relatório A5 e das métricas.
