# CS — Painel de Jornada + Ficha de Relacionamento (plano)

> Anexo à visão do agente de CS "guardião da jornada". SEM financeiro (sem MRR, inadimplência,
> pagamento). A âncora: responder as **8 perguntas diárias** num lugar só, apoiado numa ficha de
> relacionamento por cliente. Reaproveita ao máximo o que já roda; cria o mínimo.

## 0. As 8 perguntas (o alvo)
1. Quais clientes estão saudáveis? · 2. Precisam de atenção? · 3. Em risco de cancelamento? ·
4. Com pendências? · 5. Entregas da Lone atrasadas? · 6. Info que o cliente ainda deve? ·
7. Quem não percebe valor? · 8. **Qual a próxima ação de cada cliente?**

## 1. Ficha de relacionamento (por cliente)
A memória primária do CS. Cada campo é **DERIVADO** (calculado de sinal que já existe) ou **NOVO** (precisa guardar):

| Campo | Origem |
|---|---|
| Estado da jornada | DERIVADO de status/health/atividade + **override manual** (NOVO) |
| **Risco consolidado** (1 veredito) | DERIVADO — junta os 5 detectores (§2) |
| Health score | DERIVADO (compute-health, já existe) |
| Pendências da **Lone** | DERIVADO (cards atrasados, tarefas overdue, design atrasado) |
| Pendências do **cliente** | **NOVO** (lista: materiais, aprovações, acessos, infos) |
| Último feedback / humor | DERIVADO (mood_entries / sentimento recente) |
| **Próxima ação** + responsável + prazo | **NOVO** (o campo que hoje não existe em lugar nenhum) |
| Última / próxima reunião | **NOVO** (placeholder; módulo de reunião vem depois) |
| Notas do relacionamento | **NOVO** |

Só isso é campo novo: **próxima ação (+resp+prazo), pendências do cliente, reuniões, notas, override de estado**. O resto já existe — o painel só agrega.

## 2. Risco consolidado (resolve o gap: 5 detectores que não se conversam)
Uma função `riscoConsolidado(clientId)` lê os sinais que JÁ rodam e devolve **UM** veredito + motivos:
- `current_health_level` (compute-health)
- sentimento recente do cliente (sentimento.ts / mood_entries, 14d) — inclui flag de "quero cancelar"
- esfriando (last_client_msg_at — sumiu ≥7d)
- attention_level
- cs-risco (sumiço + reclamação + IG parado)

Regra (rascunho):
- **crítico** → health critical OU sinal explícito de cancelamento
- **risco** → health high OU (sentimento negativo recente + esfriando)
- **atenção** → health attention OU attention_level high OU reclamação recente
- **saudável** → nenhum acima

Cacheado 1x/dia (estende o cron compute-health que já roda 06:00) na ficha. Suggest-only: é alerta operacional, não verdade absoluta (igual você pediu pro health).

## 3. Como o painel responde as 8 perguntas
| # | Fonte |
|---|---|
| 1 Saudáveis | risco consolidado = saudável |
| 2 Atenção | risco = atenção |
| 3 Risco cancelamento | risco = risco/crítico |
| 4 Com pendências | pendências da Lone > 0 **ou** pendências do cliente > 0 |
| 5 Entregas atrasadas | content_cards com due_date vencido e não publicado |
| 6 Info que o cliente deve | pendências do cliente ≠ vazio |
| 7 Não percebe valor | **participação + sentimento** (esfriando, aprovação lenta, sem feedback positivo recente) — NÃO financeiro |
| 8 Próxima ação | campo "próxima ação"; quem está **sem próxima ação** = alerta |

## 4. DDL proposto (entra só na sua aprovação — SEM financeiro)
```sql
CREATE TABLE IF NOT EXISTS client_journey (
  client_id uuid PRIMARY KEY REFERENCES clients(id),
  estado text,                     -- override do estado da jornada (null = derivado)
  proxima_acao text,
  proxima_acao_responsavel text,
  proxima_acao_prazo date,
  pendencias_cliente jsonb,        -- [{item, desde, impacto}]
  ultima_reuniao date,
  proxima_reuniao date,
  notas text,
  risco_cache jsonb,               -- {nivel, motivos[]} — atualizado pelo cron
  updated_at timestamptz DEFAULT now(),
  updated_by text
);
ALTER TABLE client_journey ENABLE ROW LEVEL SECURITY; -- app usa service_role; sem anon/authenticated direto
```

## 5. Painel de Jornada (UI — pro time/gestão)
Página `/jornada` (ou aba no /churn): lista dos clientes ativos com colunas **estado · risco (cor) · health · pendências (Lone+cliente) · próxima ação · responsável**, com seções/filtros que respondem cada uma das 8 perguntas. Clicar num cliente → a ficha de relacionamento completa (editar próxima ação, pendências do cliente, notas). Insights no topo ("3 sem próxima ação · 2 em risco · 5 com pendência do cliente").

## 6. Fases (âncora primeiro)
1. **Âncora (esta):** ficha de relacionamento + risco consolidado + painel das 8 perguntas. Reaproveita ~60% dos sinais; cria só os campos novos.
2. Check-in que **pergunta ao cliente** (qualidade de leads/vendas/objeções — dado de negócio, não financeiro) e guarda.
3. Cobrança de pendências **ao cliente** com impacto.
4. Prep + resumo de reunião.
5. Handoff comercial→CS (registrar o que foi prometido na venda).

Cada fase pendura na ficha. Governança: tudo suggest-only / human-gated; grave (cancelamento/jurídico) escala pra humano — nunca o agente decide sozinho.
