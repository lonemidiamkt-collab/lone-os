# Ficha Viva 360 — Plano de Implementação

> Status: **plano** (não construído). Documento de decisão — sequência em 3 fases,
> cada uma entregando valor sozinha. Última revisão do retrato do código: 06/jul/2026.

## 1. Visão

Hoje o Lone OS mede o cliente pela **entrega** (postou? atrasou? contrato acabando?).
O Ficha Viva 360 acrescenta a dimensão que falta: o **resultado do cliente** — quanto ele
fatura, quanto vende, qual o ticket, e a **tendência** disso mês a mês.

Isso muda o posicionamento da Lone: de "a gente posta pra você" para
**"a gente faz seu negócio crescer — e aqui está a prova em R$"**. Vira arma de:

- **Retenção** — cliente que vê o gráfico subindo não cancela.
- **Upsell** — cliente crescendo é candidato natural a mais serviço (o SDR/CRM entra aqui).
- **Diagnóstico comercial** — o Raio-X municia o SDR com dor concreta pra vender/expandir.

## 2. O que já existe (reaproveitar) vs. o que é novo

| Precisa | Já existe? | Onde |
|---|---|---|
| Cadastro de cliente + lifecycle (ativo/churn) | ✅ | `clients` (`active`, `churned_at`), migration `20260624000000_client_lifecycle_churn` |
| Saúde de **entrega/risco** (churn-risk) | ✅ | `client_health_scores`, `clients.current_health_*`, `lib/health/compute.ts`, cron `/api/system/compute-health`, página `/churn`, `/api/health` |
| Geração de PDF (HTML → PDF) | ✅ | `lib/traffic/renderPdf.ts` → `htmlToPdf(html)` (browserless) |
| Tela de detalhe do cliente | ✅ | `/clients/[id]` |
| Guard de cron + admin | ✅ | `lib/api/cron-guard.ts` (`requireCronOrUser`), `getServerUser().isAdmin` |
| **Faturamento/vendas/ticket do cliente por mês** | ❌ **novo** | — (não há nada; é o coração da Fase 1) |
| **Health de crescimento** (tendência de faturamento) | ❌ **novo** | complementa o churn-risk existente, não o substitui |
| **Diagnóstico do cliente por link sem login** | ❌ **novo** | Fase 3 |

**Ponto-chave de honestidade:** o "Health Score" do protótipo (crescimento) **não é** o score que
já temos (risco de entrega). São duas lentes diferentes. O Radar (Fase 2) **funde as duas** —
é aí que o reaproveitamento do `/churn` acontece de verdade.

---

## 3. Fase 1 — Painel de Crescimento (a fundação) — ✅ CONSTRUÍDA (06/jul)

**Objetivo:** registrar e visualizar o faturamento/vendas/ticket de cada cliente, mês a mês.
É a base de dados que alimenta tudo. Entrega valor sozinha: o gestor abre o cliente e vê a curva.

> **Decisão de implementação:** ao construir, descobrimos que a aba **"Resultados"** do cliente
> (`components/client-tabs/ResultsTab.tsx`) **já registrava faturamento (revenue) + investimento +
> ROI por mês** na tabela `client_financial_results`, com gráfico recharts. Em vez de criar uma
> tabela `client_growth` paralela (duplicaria o faturamento), **estendemos a tabela existente**.
> Isso mantém uma única fonte de verdade do faturamento e reaproveita todo o gráfico/histórico.

### 3.1 Modelo de dados (migration `068_client_financial_vendas_ticket.sql`)

Em vez de tabela nova, `ALTER TABLE client_financial_results`:

```sql
ALTER TABLE client_financial_results
  ADD COLUMN IF NOT EXISTS vendas integer,                    -- nº de vendas/pedidos no mês
  ADD COLUMN IF NOT EXISTS ticket numeric(12,2)               -- ticket médio (gerado)
    GENERATED ALWAYS AS (
      CASE WHEN vendas IS NOT NULL AND vendas > 0 THEN revenue / vendas ELSE NULL END
    ) STORED;
```

- `revenue` (faturamento), `investment`, `roi`, `strategy_note`, `recorded_by`, `month` (`YYYY-MM`),
  unique `(client_id, month)` — **já existiam**. Só adicionamos `vendas` + `ticket`.
- `ticket` é **coluna gerada** (revenue / vendas) — nunca digitada.
- ⚠️ **A migration precisa ser aplicada no banco de prod ANTES do deploy do app** (o upsert passa
  a mandar `vendas`; sem a coluna, PostgREST rejeita). `deploy.sh` não roda migrations → aplicar
  manual no banco (`ALTER TABLE`).

### 3.2 Backend

Sem rota nova: a aba lê/escreve `client_financial_results` **client-side** via supabase (anon +
RLS), padrão que já existia. Visibilidade segue a da aba "Resultados" (time vê — faturamento já
era visível ali). Se quiser tornar admin-only, é uma mudança de visibilidade da aba inteira,
separada desta fase.

### 3.3 Health de crescimento (implementado — calculado na tela)

`computeGrowthHealth(records)` em `ResultsTab.tsx` — sem cron, sem coluna persistida nesta fase:

- Compara a **média de faturamento dos meses recentes vs. os anteriores** (janela adaptativa até
  3+3, robusta com poucos dados). `< 2 meses` = "Sem dados".
- Resultado: **Crescendo** (≥ +10%, verde) · **Estável** (entre, amarelo) · **Em queda**
  (≤ −8%, vermelho) — com o % e uma leitura em 1 frase.
- A persistência do score (pro Radar/sparkline da Fase 2) fica pra depois, espelhando
  `client_health_scores` num cron `compute-growth`.

### 3.4 Frontend (implementado em `ResultsTab.tsx`)

Tudo dentro da aba **"Resultados"** de `/clients/[id]`, 100% tokens + recharts (já usados ali):

- Campo **Vendas (nº)** + preview de **ticket médio** no formulário "Inserir Faturamento".
- Seção **"Crescimento do Negócio"**: selo de saúde (verde/amarelo/vermelho) + leitura +
  último mês (fat/vendas/ticket) + **gráfico de tendência de ticket médio**.
- Vendas e ticket no **histórico mensal**.
- Gráfico "Investimento vs Faturamento" (já existia) permanece.

**Entregável da Fase 1 (feito):** migration `068` + extensão da aba Resultados (vendas + ticket +
health de crescimento). Typecheck verde. **Falta:** aplicar a migration no banco de prod + deploy.

---

## 4. Fase 2 — Carteira / Radar

**Objetivo:** uma fila única com todos os clientes ativos, cruzando **as duas saúdes**
(entrega/risco que já existe + crescimento da Fase 1), pra decidir onde agir.

- **Verde (crescendo + entrega ok):** candidato a **upsell** (joga pro CRM do SDR).
- **Vermelho (caindo ou risco de entrega):** **reter** antes do cancelamento.

### 4.1 Como reaproveita o que existe

- A página `/churn` e `/api/health` já listam clientes por risco de entrega. O Radar **estende**:
  adiciona a coluna de crescimento (Fase 1) e um **score combinado**.
- Score combinado sugerido (ajustável): tendência de faturamento 40% · preenchimento 25% ·
  risco de entrega (score atual, invertido) 20% · eficiência de contrato 15%.
- Roda no mesmo cron diário/mensal (`compute-health` ou um `compute-growth` irmão) — sem
  infraestrutura nova de agendamento.

### 4.2 Entregável

Aba/coluna "Radar" na `/churn` (ou página própria `/carteira`) com a fila priorizada + ação rápida
("abrir no CRM", "marcar contato de retenção"). Integração leve com o CRM que já montamos.

---

## 5. Fase 3 — Raio-X Comercial (o mais complexo)

**Objetivo:** o cliente responde ~10 perguntas de diagnóstico por um **link sem login**;
a IA cruza com o faturamento (Fase 1) e devolve **SWOT + scripts** de ação/venda.

### 5.1 Modelo de dados

```sql
CREATE TABLE client_diagnostics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token        text UNIQUE NOT NULL,   -- link público, expira
  status       text NOT NULL DEFAULT 'pendente', -- pendente | respondido | analisado
  respostas    jsonb,                  -- as 10 respostas
  analise      jsonb,                  -- SWOT + scripts (saída da IA)
  created_at   timestamptz DEFAULT now(),
  answered_at  timestamptz,
  expires_at   timestamptz
);
```

### 5.2 Rotas

- `POST /api/diagnostics` → gera token + link (admin). Manda pro cliente (WhatsApp via Evolution).
- **`GET /d/[token]`** (página **pública**, sem login) → formulário das 10 perguntas.
- `POST /api/diagnostics/[token]/answer` → salva respostas (rate-limit; valida token/expiração).
- `POST /api/diagnostics/[id]/analyze` → IA (gpt-4o) cruza respostas + série de faturamento →
  SWOT + scripts. Padrão dos outros `lib/cs/*` (chatJson + schema).

### 5.3 Cuidados (é a fase com superfície pública)

- Link **sem login** = token forte + expiração + rate-limit; a página só coleta, nunca expõe
  dado interno do cliente.
- A IA recebe dado do cliente como **dado, nunca instrução** (mesmo princípio dos prompts atuais).
- Saída (SWOT/scripts) alimenta o CRM do SDR e pode virar PDF (reusa `htmlToPdf`).

---

## 6. Sequência recomendada e esforço relativo

1. **Fase 1 — Painel de Crescimento** — esforço médio. Fundação; sem ela o resto fica raso.
2. **Fase 2 — Carteira/Radar** — esforço baixo/médio (muito reaproveitamento do `/churn`).
3. **Fase 3 — Raio-X** — esforço alto (rota pública + IA + segurança). Fazer por último.

## 7. Decisões em aberto (pra confirmar antes de construir cada fase)

- **Quem digita o faturamento** na Fase 1? (assumido: gestor, no check-in mensal.)
- **Visibilidade:** dado financeiro do cliente é admin-only? (assumido: sim.)
- **Onde mora o painel:** aba em `/clients/[id]` ou seção própria? (assumido: aba no cliente.)
- **Fase 3:** o cliente responde por WhatsApp (link Evolution) ou e-mail? Frequência do diagnóstico?
