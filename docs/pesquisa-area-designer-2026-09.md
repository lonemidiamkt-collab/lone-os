# Área do designer — pesquisa e decisões (set/2026)

**Por que existe.** Depois da Leva 5b (um quadro de produção com seis etapas), o Rodrigo abriu o
/design e viu o quadro do social inteiro: Pauta, Revisão interna e Com o cliente cheios de cards que
não são dele. O Meu Trabalho › Hoje mostrava "Tarefas 10 · Design 1", e o card abria com legenda e
comentários na frente e a arte escondida. O pedido do CEO: melhorar a versão nova com o que
funcionava na antiga e com o que times de criação usam de verdade.

A regra não muda: **uma fonte de verdade**. A etapa de design continua morando no card, e toda
transição passa por `lib/conteudo/producao-server.ts`. A fila do designer é uma LEITURA desse dado
(`lib/conteudo/fila-designer.ts`), não um registro paralelo.

## O que a pesquisa trouxe (10 buscas)

| # | Padrão | Fonte | Como entrou no Lone OS |
|---|---|---|---|
| 1 | Colunas com o nome do trabalho de quem faz ("Submitted → In Design → In Review → Approved"), não do fluxo inteiro | Asana, template Creative Requests | Fila com cinco colunas do designer: Na fila → Fazendo → Ajustes pedidos → Entregue → Aprovado/No ar. Pauta, Com o cliente e Agendado viram contexto no card |
| 2 | Revisões como vista/coluna própria ("Revisions View") | ClickUp, Design Board template | "Ajustes pedidos" é coluna, com o motivo no card (a antiga "Alterações" já era a primeira coluna) |
| 3 | Fila pelo prazo e prioridade; toda linha diz a próxima ação | monday.com, colunas essenciais de creative workflow | Na fila ordena por prazo da arte, depois prioridade; cada card tem um botão só (Pegar / Entregar / Entregar ajuste) |
| 4 | "Definition of ready": pedido incompleto volta no mesmo dia, com o que falta nomeado | Zyner (creative ops) e Adobe Workfront (request queues) | O card mostra "Falta: briefing, formato…"; "Devolver ao social" já vem com o que falta escrito |
| 5 | Limite de WIP nas etapas que acumulam | Zyner (creative ops) | "Fazendo" avisa acima de 3 por designer (aviso, não trava) |
| 6 | O gargalo mora entre "pronto" e "aprovado" — o lead time é espera, não trabalho | Zyner (creative ops) | "Entregue" mostra há quanto tempo a arte espera o social ou o cliente: não é cobrança do designer, é o gargalo à vista |
| 7 | Uma versão atrás de um link só + comparação lado a lado | Ziflow (proofing) | Versão atual e referências na frente do card; "Comparar V1 × V2" no topo quando há ajuste |
| 8 | Feedback num canal só, no próprio arquivo | Ziflow (proofing) | O motivo do ajuste fica fixado no topo do card do designer e no cartão da fila, com o histórico de rodadas |
| 9 | Referência de guia de marca como campo do pedido | Asana (campo "Brand Guidelines Reference") | Kit da marca aberto ao lado do briefing no card do designer |
| 10 | Contar rodadas de revisão (2 é saudável, 5+ é problema de processo) | Ziflow (creative workflow optimization) | O card do designer mostra a rodada ("2º ajuste") vinda do histórico da arte |

## O que era bom na área antiga (antes da Leva 5b)

Lido de `git show 421f86f^:app/design/page.tsx`:

1. **Colunas com nome de designer.** "Fila / Pra Fazer", "Em Produção", "Bloqueado / Devolvido",
   "Aprovação" — quatro, nenhuma com nome de etapa do social. "Aprovação" juntava tudo o que já saiu
   da mão dele.
2. **"Alterações" como a primeira coluna** do Quadro de Tarefas, em vermelho, com o motivo no card.
3. **Card com o que o designer precisa:** miniatura da arte, cliente em destaque, formato, data e
   hora com selo de urgência (Vencido / Hoje / Em breve), "Arte ✓ / Sem arte", atalho do Drive,
   "Entregue · aguardando social" e o botão **Enviar arte / Trocar arte no próprio card**.
4. **"Próximas pendências — artes sem entrega"**: a faixa do que vence primeiro.
5. **O modal da demanda era do designer:** alteração no topo, saúde do briefing, "Padrão deste
   cliente — leia antes de começar", briefing completo, referências, guidelines e Drive, comentário
   do designer, "Enviar arte", assumir/devolver e proposta por IA. Legenda e agendamento não
   apareciam.
6. **Selo "Auto-iniciada"** e "por {quem pediu}" na tarefa; filtro por cliente.
7. **Cada designer abre no próprio quadro**, com o do colega a um clique (para ajudar).

## Como ficou

- **/design (designer):** abre em "Fila de artes" — Na fila, Fazendo, Ajustes pedidos, Entregue e
  Aprovado/No ar (recolhida, só os últimos 7 dias). Filtros: Minha fila / colega / Todos, cliente e
  busca. Modo foco, Nova tarefa, carga dos designers e o alerta de datas continuam.
- **/design (gestão e social):** a mesma fila, mais o "Quadro de produção" (as seis etapas, Por
  cliente e Por designer) num seletor.
- **Card do designer:** briefing, referências e versão atual primeiro; kit da marca ao lado; entregar
  em destaque; comparação de versões e histórico de ajustes; legenda, data de postagem, etapa do
  social e conversa recolhidos em "Contexto do post". "Ver card completo" leva ao modal de sempre.
- **Meu Trabalho › Hoje (designer):** a fila de arte primeiro — ajustes pedidos, prazo de hoje ou
  vencido, próximas na fila — e as tarefas depois.

## Fontes

- Asana — Creative requests template: https://asana.com/templates/creative-requests
- Asana — Build a creative requests project: https://help.asana.com/s/article/asana-in-practice-build-a-streamlined-creative-requests-project
- ClickUp — Design Board template: https://clickup.com/templates/design-board-t-228089727
- monday.com — Creative workflow: https://monday.com/blog/project-management/creative-workflow/
- Zyner — Creative operations guide: https://zyner.io/blog/creative-operations
- Adobe Workfront — Request queue overview: https://experienceleague.adobe.com/en/courses/administer-and-maintain-adobe-workfront-i/work-intake-and-request-management/request-queue-overview
- Ziflow — Creative workflow optimization: https://www.ziflow.com/blog/creative-workflow-optimization
- Filestage vs Ziflow (versões lado a lado, rodadas): https://filestage.io/filestage-vs-ziflow/
- Wrike — Creative workflow management: https://www.wrike.com/workflow-guide/creative-workflow-management/
