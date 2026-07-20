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

## 5. O loop de aprendizado

O motor **aprende**: a revisão crítica (estágio 5) e o que o time ensina no grupo (`cs_client_rules`) retroalimentam o diagnóstico e as próximas decisões. Erro vira regra; regra afina a decisão seguinte.

## 6. Bibliotecas (a preencher — Fase 2 continuada)

O estágio de decisão consulta bibliotecas curadas da Lone. Estrutura prevista:

- Ganchos · Headlines · CTA · Dores · Desejos · Objeções (por nicho)
- Frameworks de copy (AIDA, PAS, BAB, Hook-Story-Offer…)
- Séries/campanhas · Datas · Analogias · Storytelling
- Checklists (briefing, carrossel, reel, stories, calendário, revisão)

## 7. Status do roadmap

- **Fase 1 — Upgrade dos prompts:** ✅ feita. Núcleo estrategista plugado em legenda/roteiro/briefing/pauta; revisão-post ganhou dimensão `estrategia`.
- **Fase 2 — Manual/KB + contrato:** 🔧 em andamento. Este doc + [`pipeline.ts`](../lib/cs/pipeline.ts) (contrato). Falta preencher as bibliotecas (§6).
- **Fase 3 — Calendário = pipeline inteiro:** ⏳ pendente. Primeiro módulo a rodar decide→executa→revisa com estado persistido.
