# LONE MARKETING OS — Metodologia Oficial do Estrategista

> Manual vivo. Este documento é a **fonte de verdade** de COMO a Lone pensa conteúdo.
> Todo módulo do agente que cria/planeja conteúdo deve seguir esta metodologia.
> Código do contrato: [`lib/cs/pipeline.ts`](../lib/cs/pipeline.ts) · Núcleo de prompt: [`lib/cs/estrategista.ts`](../lib/cs/estrategista.ts)

## 0. A tese

A Lone não é uma **automação de conteúdo** (gerador de posts bonitos). É um **motor de decisão de marketing**.

A diferença, que é o nosso diferencial difícil de replicar:

- Um **prompt** diz *como escrever*.
- Um **pipeline de raciocínio** decide **o que vale a pena escrever, por quê, em que momento e com qual objetivo** — e só então escreve.

Regra de ouro: **DECIDIR vem antes de EXECUTAR, e a decisão é um objeto persistido e auditável.** Nenhuma peça nasce sem uma decisão que a justifique.

## 1. Os princípios (o "como pensar")

Estão codificados em [`lib/cs/estrategista.ts`](../lib/cs/estrategista.ts) e entram em toda geração:

1. **Foco na dor, não na empresa.** O cliente final não acorda querendo o serviço — acorda com um problema. (O empresário não quer "um contador"; quer pagar menos imposto, evitar multa, lucrar.) Traduza tudo em dor resolvida e desejo realizado.
2. **Fluxo de decisão obrigatório.** Antes de escrever: público → dor/desejo → objeção/crença → objetivo estratégico → como aproxima da venda.
3. **Pilares 60/25/15** (autoridade / aproximação / comercial), ajustável pela maturidade da marca.
4. **Funil na semana.** Uma peça quebra percepção, uma educa (compartilhável), uma posiciona/vende.
5. **Quebra de padrão visual.** Manter identidade, variar a construção da arte (principalmente carrossel).
6. **Marketing é mudar percepção, não postar.** Se não muda percepção nem aproxima da venda, não vale o slot.

## 2. O pipeline (o "motor")

Cinco estágios, cada um com entrada/saída estruturada (contrato em [`pipeline.ts`](../lib/cs/pipeline.ts)):

| # | Estágio | Entra | Sai | Frequência |
|---|---------|-------|-----|------------|
| 1 | **Diagnóstico** | briefing do cliente | `DiagnosticoEstrategico` (público, dores, desejos, objeções, crença atual→desejada, diferenciais, ângulos vs. concorrência, maturidade) | 1x por cliente, cacheado; recomputa quando o briefing muda |
| 2 | **Objetivo do período + narrativa** | diagnóstico + momento/eventos | `ObjetivoPeriodo` (o que provar agora, tema que costura a semana/mês, mix-alvo de pilares) | por período (semana ou mês) |
| 3 | **Decisão por peça** | objetivo + diagnóstico + datas | `DecisaoDeConteudo[]` (pilar, objetivo, dor-alvo, ângulo, posição no funil, **por que agora**) | por período |
| 4 | **Execução** | uma `DecisaoDeConteudo` | copy/roteiro/legenda/brief de arte | por peça |
| 5 | **Revisão crítica** | peça + a decisão que a gerou | `VereditoRevisao` (aprovado, **cumpriu o objetivo?**, problemas com sugestão) | por peça |

**O ponto que hoje não existe:** o estágio 3. A peça passa a carregar sua justificativa. O time consegue ver *por que* cada post existe.

**Execução vira executor.** Os geradores atuais (`gerarLegenda`, `gerarRoteiros`, `gerarBriefingDesign`, `gerarPautaSemanal`) deixam de decidir e passam a **executar uma `DecisaoDeConteudo`**. O núcleo estrategista continua sendo a "instrução de raciocínio" de cada estágio.

## 3. Quando roda o pipeline pesado (e quando não)

Pipeline não pode virar peso morto. Ele roda onde a **decisão nasce**:

- **Roda inteiro:** planejamento semanal/mensal (calendário) e roteiro — a decisão é criada ali.
- **Só o núcleo-prompt basta:** legenda de uma arte que **já existe**. Aquela arte já é a materialização de uma decisão passada; refazer o pipeline seria redundante. Executar com foco/gancho/checklist é suficiente.

Custo/latência sãos: diagnóstico 1x por cliente (cacheado); ciclo do período por cliente — **nunca por mensagem**.

## 4. Persistência (proposta — Fase 3)

Para ser auditável e aprender, a decisão precisa morar no banco:

- `content_cards`: colunas `pilar`, `objetivo`, `posicao_funil`, `angulo`, `por_que_agora` (ou um `decisao` jsonb). O board passa a refletir o mix de pilares.
- Estratégia viva por cliente: `DiagnosticoEstrategico` em `client_briefings` (coluna jsonb) ou tabela própria; `ObjetivoPeriodo` por período.
- *DDL entra só na Fase 3, com aprovação — nada é criado agora.*

## 5. O loop de aprendizado — o motor melhora a si mesmo E o briefing

O que faz isso ser um ativo difícil de replicar: o motor não é estático. Ele vê o que deu certo, ouve o time e observa o mercado — e **enriquece o próprio briefing**. O briefing vira um **documento vivo**.

```
        decide → executa → PUBLICA
           ↑                   ↓
   briefing vivo ←— aprende ←— 4 sinais
   (v2, v3…)                   │
              ┌────────┬───────┼────────────┬──────────────┐
        performance  time    observação   radar EXTERNO
        (métricas IG) ensina  (concorrência (formatos novos,
                      (grupo)  datas, gaps)  estilos que
                                             performam) 🔎
```

**Os 4 sinais** (contrato: `SinalAprendizado`, `ResultadoPeca`, `TendenciaExterna`):
1. **Performance** — métricas orgânicas por post (salvamentos, compartilhamentos, alcance). O motor correlaciona **decisão → resultado** (por isso a decisão precisa estar persistida) e aprende qual pilar/ângulo/gancho funciona **para aquele cliente** → ajusta o mix e prioriza ângulos.
2. **O time ensina** — `cs_client_rules` (ensino no grupo) + aprovar/reprovar arte (`cs_rework_events`). Erro vira regra; regra afina a próxima decisão.
3. **Observação** — ao diagnosticar e ver datas/concorrência/o que performou, o motor identifica o que **falta no briefing** (uma dor, um ângulo, uma oportunidade sazonal).
4. **Radar externo** 🔎 — pesquisa **fora**: formatos de vídeo novos, estilos de post que performam, tendências do nicho e da plataforma. Vira `TendenciaExterna` que alimenta as **bibliotecas** (repertório vivo) e o **curador**. **Regra:** tendência é insumo pro estrategista, **não ordem** — filtrada pela lente da marca (nunca "copiar o que tá na moda"). Requer um provedor de busca (ver §8, passo 6).

**O curador de briefing** (contrato: `Curar` → `PropostaBriefing`): um job periódico que lê os sinais e **propõe** enriquecimentos ao briefing (nunca aplica sozinho). O time aprova → o briefing ganha uma **nova versão**.

Dois princípios que tornam isto seguro:
- **Briefing versionado** (`client_briefings.version`/`is_current`) → cada aprendizado é uma versão nova, **auditável e reversível**.
- **Human-gated** — tudo é sugestão; o time decide. Mesma filosofia do resto do agente CS.

Sementes que já existem: métricas orgânicas do IG, `cs_client_rules`, `cs_rework_events`, briefing versionado. O que a Fase 3 liga: **persistir a decisão por peça** e o **elo decisão↔resultado** (sem ele a IA não aprende de verdade) + o curador.

## 6. Bibliotecas — o repertório curado

Código: [`lib/cs/bibliotecas.ts`](../lib/cs/bibliotecas.ts). São referências (não regras rígidas) que os estágios de decisão e execução consultam. Já seedadas:

- **Estruturas por formato** — o esqueleto de execução de carrossel, reel, post, stories, vídeo de venda (`ESTRUTURAS_FORMATO` + `estruturaDoFormato()`).
- **Frameworks de copy** — AIDA, PAS, BAB, Hook-Story-Offer, PASTOR, 4U, Golden Circle, FAB (`FRAMEWORKS_COPY`).
- **Ganchos** — padrões de 1ª linha (erro-comum, contraste, custo-oculto, pergunta provocativa, número, mito…) com template + exemplo (`GANCHOS`).
- **CTAs por objetivo** — salvar, compartilhar, comentar, direct, agendar, posicionamento (`CTAS`).
- **Checklists** — carrossel, reel, legenda, calendário; portões da revisão crítica (`CHECKLISTS` + `checklistDe()`).

A crescer (por nicho, alimentado pelo diagnóstico e pelo que o time ensina): dores · desejos · objeções por segmento · séries/campanhas · analogias · storytelling.

## 7. Status do roadmap

- **Fase 1 — Upgrade dos prompts:** ✅ feita. Núcleo estrategista plugado em legenda/roteiro/briefing/pauta; revisão-post ganhou dimensão `estrategia`.
- **Fase 2 — Manual/KB + contrato:** ✅ feita. Este doc + [`pipeline.ts`](../lib/cs/pipeline.ts) (contrato) + [`bibliotecas.ts`](../lib/cs/bibliotecas.ts) (repertório seedado). Bibliotecas por nicho crescem com o uso.
- **Fase 3 — Calendário = pipeline inteiro:** ⏳ plano pronto (§8). Primeiro módulo a rodar decide→executa→revisa com estado persistido + loop.

## 8. Plano de execução — Fase 3

O calendário deixa de ser gerador de pauta e passa a rodar o pipeline inteiro, com a decisão **persistida** e o loop ligado.

**Passo 0 — Pré-requisito (Trilha A):** enriquecer os briefings (o construtor/enriquecedor). Sem briefing bom, o Diagnóstico raciocina no vazio. Roda na carteira antes de tudo.

**Passo 1 — DDL** *(entra na sua mão, com aprovação — o classifier me bloqueia)*:

Persistir o Diagnóstico (campos estratégicos que faltam no briefing):
```sql
ALTER TABLE client_briefings
  ADD COLUMN IF NOT EXISTS desejos text[],
  ADD COLUMN IF NOT EXISTS objecoes text[],
  ADD COLUMN IF NOT EXISTS crenca_atual text,
  ADD COLUMN IF NOT EXISTS crenca_desejada text,
  ADD COLUMN IF NOT EXISTS diferenciais text[],
  ADD COLUMN IF NOT EXISTS angulos_concorrencia text[],
  ADD COLUMN IF NOT EXISTS maturidade_marca text,
  ADD COLUMN IF NOT EXISTS mix_pilares jsonb;
```

Persistir a Decisão por peça (o que hoje não existe em lugar nenhum):
```sql
ALTER TABLE content_cards
  ADD COLUMN IF NOT EXISTS pilar text,
  ADD COLUMN IF NOT EXISTS objetivo text,
  ADD COLUMN IF NOT EXISTS posicao_funil text,
  ADD COLUMN IF NOT EXISTS angulo text,
  ADD COLUMN IF NOT EXISTS dor_alvo text,
  ADD COLUMN IF NOT EXISTS por_que_agora text,
  ADD COLUMN IF NOT EXISTS published_media_id text; -- liga o card ao post do IG (p/ métricas do loop)
```

Plano do período (objetivo + narrativa por semana/mês):
```sql
CREATE TABLE IF NOT EXISTS content_period_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  periodo text NOT NULL,               -- "2026-W31" | "2026-08"
  objetivo_principal text, narrativa text, mix_pilares jsonb,
  diagnostico_snapshot jsonb,          -- foto do diagnóstico usado
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, periodo)
);
ALTER TABLE content_period_plans ENABLE ROW LEVEL SECURITY; -- app usa service_role; sem acesso anon/authenticated direto
```

**Passo 2 — Motor** (`lib/cs/motor.ts`): implementar `diagnosticar` → `definirObjetivoPeriodo` → `decidirPecas` → `planejarPeriodo`, cada estágio 1 chamada IA com núcleo estrategista + bibliotecas, saída no schema do contrato.

**Passo 3 — Execução:** `gerarPautaSemanal` passa a **receber** as `DecisaoDeConteudo[]` (deixa de decidir); `criarCardsPauta` grava pilar/objetivo/ângulo/por_que_agora. Legenda/roteiro/brief recebem a decisão como contexto.

**Passo 4 — Entrega:** calendário no padrão Max (cada peça: objetivo · gancho · copy · CTA · sugestão visual · **justificativa**) → PDF branded + brief pro designer com variação de arte. Comando novo ("Lone, monta o calendário do X") + anúncio em `conversa.ts`.

**Passo 5 — Loop interno:** `registrarResultado` (cron liga métricas do IG ao card via `published_media_id`) + `curar` (job → `PropostaBriefing` pro time aprovar → nova versão do briefing).

**Passo 6 — Radar externo** (`Pesquisar`): job periódico que pesquisa formatos/estilos/tendências (geral + por nicho) → grava `TendenciaExterna` numa `content_trends` (jsonb) → alimenta as bibliotecas e o curador. **Requer um provedor de busca** (o agente hoje só tem o conhecimento estático do gpt-4o, com data de corte — não vê o que é novo). Opções: web search da OpenAI (reusa `OPENAI_API_KEY`, menos infra) · API dedicada (Tavily/Brave/SerpAPI, mais controle, nova key). Decisão do Roberto (custo + integração). Tendências passam pela lente do estrategista antes de virar decisão.

**Ordem segura:** Trilha A → Passo 1 (DDL) → 2–4 (validar num cliente) → 5 (loop interno) → 6 (radar externo).
