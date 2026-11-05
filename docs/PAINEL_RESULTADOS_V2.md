# Painel de Resultados v2 — prompt de execução

> Cole este arquivo inteiro numa sessão do Claude Code aberta em `~/dev/lone-os`.
> Diagnóstico feito em 04/11/2026 com dados de produção: 26 clientes com Instagram e 51 leituras medidas.
> Revisado no mesmo dia com pesquisa na documentação atual da Meta e nos concorrentes (seção "Mercado e Meta" no fim).
> **Etapa 1 já executada** (04/11/2026) — começar pela Etapa 0.

---

## Papel e regras

Você vai evoluir o Painel de Resultados que o cliente abre pelo link público (`resultados.lonemidia.com/portal/<token>`). O painel tem duas abas: **Anúncios** e **Crescimento nas redes**.

Antes de mexer:
- leia `CLAUDE.md`, `docs/ERRO_RECUPERAVEL.md`, `docs/PORTAL.md`, `docs/META_API_PATTERN.md` e a skill `placar-semanal`;
- para qualquer tela, use as skills `lone-os:designer` e `lone-os:impeccable`.

Regras que não se negociam:
1. **Falha aparece como falha.** Nunca "—" calado, zero ou tela vazia no lugar de um erro. Quando um número não existe por limitação da Meta, a tela diz isso em uma linha.
2. **O cliente nunca espera a Meta.** Toda leitura sai do cache. Cache velho é entregue na hora e atualizado por trás (stale-while-revalidate).
3. **Nada interno vaza**: notas do time, outros clientes, financeiro da agência.
4. **Português de dono de loja.** Sem jargão. "Reels", nunca "Reel".
5. **Toda regra nova ganha teste** (vitest). `tsc --noEmit` e `vitest run` passam antes de cada commit; o pre-push confere.
6. **Arquivo novo entra no git na mesma tarefa.**
7. **Commits pequenos, um por etapa.** Mensagem em pt-BR dizendo o porquê.

Trabalhe em etapas, na ordem abaixo. Ao fim de cada etapa:
- mostre a saída crua dos testes;
- escreva duas linhas do que mudou para o cliente.

---

## Etapa 0 — Versão da API da Meta (prazo: antes de 21/01/2027)

O projeto chama a Graph API em **v21.0** em 17 arquivos (e um em v20.0: `app/api/system/audit-spend`).
- A v21.0 da Graph API (Instagram, Páginas, OAuth) **para de funcionar em 21/01/2027**.
- Na Marketing API ela já expirou; a Meta faz auto-upgrade desde 29/07/2026. Por isso os números de anúncio hoje rodam numa versão que não escolhemos.

**Fazer:**
- Uma constante só (`lib/meta/config.ts → graphApiVersion`) usada por todos os arquivos. Hoje cada arquivo tem a própria `const GRAPH`.
- Subir para **v25.0**: a v26 é de 29/07/2026, mas a v25 está estável e ainda sem data de fim.
- Ler o changelog v22→v25 contra cada campo que o projeto pede.
- **Teste que trava:** nenhum arquivo com `graph.facebook.com/v2` fora da constante.
- Rodar o warmup e o ig-snapshots em produção e comparar com o dia anterior antes de anunciar.

---

## Etapa 1 — Bugs (prioridade máxima) — ✅ FEITA em 04/11/2026

### 1.1 Aba "Crescimento nas redes" abre vazia na primeira vez

**Causa medida:**
- O cron `ig-snapshots` roda às 3h (BRT) e o cache do Instagram vale 6h. Das 9h em diante, toda primeira abertura monta o relatório ao vivo na Meta. Medido: 36 de 51 leituras levaram de 3,5 a 7,5 s.
- Não existe stale-while-revalidate no Instagram (Anúncios já tem: `lib/portal/snapshotCache.ts`).
- A busca só começa quando o cliente clica na aba.
- Enquanto carrega, só aparecem 4 caixinhas cinza. O resto da seção fica escondido e parece vazio.
- O cliente recarrega. Nesse meio-tempo o primeiro pedido terminou e gravou o cache, então o recarregar "funciona".

**Fazer:**
- Em `lib/meta/igSnapshot.ts → getIgSnapshotCached`, aplicar a mesma decisão de `decidirCache` do snapshot de anúncios:
  - fresco (< 6h): entrega;
  - do dia (6–48h): entrega na hora e atualiza com `after()`, uma atualização por cliente+período de cada vez;
  - sem cache: busca ao vivo.
  - Reaproveitar ou generalizar as funções puras que já existem; não duplicar.
- Aquecer o Instagram junto com os anúncios: o `warmup-snapshots` (ou um irmão) também gera 7d/14d/30d do IG. Rodar o ig-snapshots a cada 6h em vez de 1x/dia (`ops/crontab-producao.txt` + `docs/CRON_SCHEDULE.md`).
- `app/portal/[token]/page.tsx` já entrega o snapshot de anúncios pronto no HTML. Fazer o mesmo com o IG de 7d (`initialIg`), para a aba abrir com número.
- Skeleton da aba inteira (KPIs, frase, público, melhores posts), com o mesmo desenho do conteúdo final.
- Mostrar "Atualizado em dd/mm hh:mm" na aba do Instagram, como já existe em Anúncios.
- **Teste:** cache de 10h é entregue sem chamar a Meta e dispara a atualização por trás.

### 1.2 Reels sem visualização e sem alcance

**Causa:** em `buildIgSnapshot`, o insight de vídeo pede `reach,video_views`. A Meta desligou `video_views` (substituído por `views`). Hoje a chamada inteira falha, e todo post VIDEO/REELS vem com `views=null` e `alcance=null` (conferido no Léo Carros, WT Shopping e outros).

**Fazer:**
- Pedir `reach,views,saved,shares,total_interactions` em todos os tipos de post (conferir na doc da v21 quais valem para cada `media_type`). Se uma métrica for recusada, refazer sem ela, para nunca perder o resto.
- Teste com resposta da Meta simulada.

### 1.3 Erro do Instagram some atrás do Cloudflare

A rota `app/api/meta/instagram/[clientId]/route.ts` devolve status 502 quando a Meta falha. O Cloudflare troca esse corpo pela página HTML dele, e a explicação se perde. Aconteceu com ACM Distribuidora, Dumar e Veneza Estofados.

**Fazer:**
- Devolver 200 com `{ estado: "falha" | "reconectar", motivo }`, igual ao snapshot de anúncios ("indisponivel volta com 200"), e ajustar `PortalInstagram`.
- Registrar no Sentry com o `client_id`.
- Avisar o time no relatório do cron quando o cliente falha nas 3 janelas (isso já existe; confirmar que essas 3 contas aparecem).

### 1.4 Instagram "conectado" que não entrega nada

Armazém dos Fios, Celmapel (28 mil seguidores), Bazar Ribeiro Saquarema e Varejão da Construção têm a seguinte combinação:
- `fonte=owned`;
- alcance `null`;
- público ausente;
- 0 posts em 30 dias.

Isso é permissão pela metade, não "não postou".

**Fazer:**
- Distinguir no snapshot "a Meta recusou insights" de "não houve post".
- Quando os insights forem recusados, cair no business_discovery para os posts, mesmo com `media` vazio.
- Marcar `fonte: "parcial"` com o motivo.
- Painel interno: lista "Instagram com acesso incompleto" para o time reconectar.
- Cliente: uma linha honesta, sem pedir que ele resolva.

### 1.5 Ligar a conta de anúncio não liga o Instagram

A Casa das Telhas tem conta de anúncio e aparece "Instagram ainda não conectado". O vínculo automático (`reconcileIgFromAdAccounts`) só roda no cron, filtra por `status` e não achou o perfil.

**Fazer:**
- No `app/api/clients/update/route.ts`, quando `meta_ad_account_id` mudar, rodar `descobrirIg` desse cliente na hora com `after()`, gravar e esquecer o cache do IG (mesmo padrão do `esquecerSnapshots`).
- Logar quando não achar.
- Trocar o texto do portal "Fala com a nossa equipe que a gente conecta" por algo que não transfira a tarefa para o cliente: "Estamos conectando seu Instagram — os números aparecem aqui em breve."
- **Teste:** ligar a conta dispara a descoberta.

---

## Etapa 2 — "Hoje" em Anúncios

- `PeriodKind` ganha `"today"`, como primeira opção do seletor ("Hoje").
- Mudar em: `lib/portal/types.ts`, `calcPeriod` (de hoje a hoje em SP), `VALID_PERIODS` da rota, `PERIODS` do `PortalDashboard`, `formatDelta` (frases e `periodoAnterior`), `LABELS` e testes de `calcPeriod`.
- **Comparação:** com ontem *até a mesma hora*. Para isso, usar insights com `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone` em hoje e ontem e cortar ontem na hora atual. Se ficar caro, comparar com o dia inteiro de ontem e dizer isso na legenda.
- **Gráfico:** por hora (0h–23h), não por dia. Só investimento, cliques e resultados: no breakdown por hora a Meta devolve **alcance e frequência zerados** (doc de breakdowns). O alcance de "hoje" sai de uma chamada sem breakdown.
- **Cache:** fresco por 15 min. Do-dia vale só até 1h. Nunca mostrar "hoje" de ontem depois da meia-noite. O warmup não aquece "hoje".
- **Aviso fixo:** "Números de hoje ainda estão entrando — a Meta consolida até o fim do dia."
- **Instagram:** avaliar "Hoje" com `period=day`. Se a Meta não entregar alcance do dia de forma confiável, deixar sem "Hoje" e explicar.

---

## Etapa 3 — Métricas melhores

### Anúncios
- Linha secundária de KPIs (recolhível, "Ver mais números"):
  - cliques no link;
  - taxa de clique (CTR);
  - custo por mil pessoas (CPM);
  - frequência da conta;
  - custo por clique.
- Cada métrica com uma frase de uma linha explicando o que significa para o dono.
- **Público:** somar região/cidade (`breakdowns=region`) ao gênero e idade.
- **Top criativos:**
  - ordenar pelo resultado com desempate pelo custo por resultado;
  - mostrar o formato (vídeo/imagem/carrossel);
  - marcar "cansando" quando frequência > 3 e o CTR cai.
- **Ritmo do mês** (em "Este mês"): "No ritmo atual, o mês fecha com ~X conversas e R$ Y investidos". Projeção linear, rotulada como estimativa.

### Instagram
- KPIs:
  - Visualizações (`views` da conta);
  - Alcance;
  - Seguidores novos;
  - Visitas ao perfil;
  - Toques em links/WhatsApp (`profile_links_taps`);
  - Salvamentos + compartilhamentos.
- Comparação com o período anterior (setas e %), no mesmo padrão `PainelComparativo` dos Anúncios. Hoje o Instagram não compara nada.
- Gráfico de seguidores por dia (`follower_count` diário já é buscado; desenhar a série).
- **Melhores posts:**
  - ordenar por interações totais (curtidas + comentários + salvamentos + compartilhamentos), com visualizações como desempate em Reels;
  - mostrar views, alcance e salvamentos no card;
  - filtro Reels / Carrossel / Imagem.
- Saldo real de seguidores com `follows_and_unfollows` (breakdown `follow_type`): "+40 novos, −12 saíram = +28". O rótulo "novos" já foi corrigido na etapa 1.
- Toques nos botões do perfil por tipo (`profile_links_taps` com breakdown `contact_button_type`: ligar, rota, WhatsApp, e-mail). Para loja física é o número que mais vale. As métricas antigas `website_clicks`, `phone_call_clicks` e `get_directions_clicks` foram desligadas pela Meta em 08/01/2025.
- Alcance e visualizações separados por formato (`media_product_type`: Reels, feed, Stories) e por seguidor/não seguidor (`follow_type`). Isso responde "o Reels está trazendo gente nova?".
- Stories: a Meta só guarda as métricas por 24 horas. É preciso um cron que leia os Stories do dia antes de sumirem e guarde em tabela própria.
- Público com `engaged_audience_demographics` (quem interage, não só quem segue), quando a conta tiver 100+ engajamentos. O público só aceita janela `this_week`/`this_month`.
- **14 dias:** o alcance vem da janela de 28. Esconder o alcance nesse período ou usar só o alcance somado dos posts, com rótulo claro. Nunca mostrar número de 28 dias numa tela de 14.

---

## Etapa 4 — IA a favor do cliente

Tudo gerado no servidor, guardado junto do snapshot e nunca ao vivo na visita. Se a IA falhar, o bloco não aparece; nunca entra texto genérico.

1. **"Leitura da semana"** no topo de cada aba, em 3 frases:
   - o que aconteceu;
   - por que (o fator mais provável nos dados: criativo, verba, dia da semana, post);
   - o próximo passo da Lone.
   - Usar a voz por nicho da skill `placar-semanal`. Sem promessa, sem número que não esteja no snapshot. Teste que trava número inventado: todo número do texto precisa existir no snapshot.
2. **"Por que esse post foi bem"**: uma linha por post do top 3, com base em formato, horário, tema e legenda.
3. **Alertas para o time, não para o cliente** (WhatsApp do CS):
   - verba parou;
   - custo por conversa subiu mais de 40% contra a média de 4 semanas;
   - anúncio reprovado;
   - Instagram sem post há 7 dias com pacote de social.
4. **Relatório mensal em PDF**, gerado dia 1º com o mesmo conteúdo do painel (skill `lone-os:documentos`), com link no portal "Baixar relatório de outubro". Enviar o link e o resumo **no WhatsApp do cliente**, que é padrão no Reportei e no mLabs.
5. **Metas por cliente** (custo por conversa alvo, conversas/mês, seguidores/mês), com barra de progresso no painel e alerta ao time quando sair da meta. Reportei ("Controle") e AgencyAnalytics têm; o cliente entende "estamos em 80% da meta" melhor que "+12%".
6. **Formato da leitura por IA** no padrão DashThis: Resumo · Vitórias · O que precisa de atenção · Próximo passo.
7. **Diferencial que ninguém tem: comparação com lojas do mesmo nicho** ("seu custo por conversa está entre os 25% melhores das lojas de tinta que atendemos"). Anônimo, só com 5+ clientes no nicho, mediana e quartis. Os concorrentes pesquisados não oferecem.

Modelo e custo:
- usar o cliente de IA que o projeto já tem (procurar em `lib/`);
- cachear por snapshot;
- teto de chamadas por dia.

---

## Etapa 5 — Acabamento

- Período escolhido na URL (`?periodo=hoje`), para o link abrir já no período certo e o time poder mandar "olha a semana".
- O seletor de período do Instagram lembra a escolha do cliente (localStorage com try/catch).
- O rodapé de atribuição só aparece na aba Anúncios.
- Revisar celular a 360 px nas duas abas (screenshots antes e depois) e tema claro/escuro.
- Atualizar `docs/PORTAL.md` com as regras novas de cache e métricas.

---

## Como validar no fim

- Abrir o portal de 3 clientes reais (Araruama Tintas, Léo Carros e Casa das Telhas) nas duas abas e em todos os períodos.
- Confirmar que:
  - a primeira abertura da aba de Instagram mostra número em menos de 1 s;
  - os Reels mostram visualizações;
  - "Hoje" bate com o Gerenciador de Anúncios (com margem de atraso da Meta).
- Rodar `vitest run` e `tsc --noEmit` e colar a saída crua.

---

## Mercado e Meta — pesquisa de 04/11/2026

**Meta (documentação oficial atual):**

| Antigo | Agora | Desde |
|---|---|---|
| `video_views` (post) | `views` | 08/01/2025 — **era o bug dos Reels (corrigido na etapa 1)** |
| `impressions`, `plays` | `views` | 21/04/2025 |
| `profile_views`, `website_clicks`, `phone_call_clicks`, `get_directions_clicks` | `profile_links_taps` + `contact_button_type` | 08/01/2025 |
| `reach` com `period=week/days_28` | `reach` com `period=day&metric_type=total_value&since&until` | sumiu da doc. A etapa 1 já usa o novo, com o antigo de reserva |
| Atribuição `7d_view` / `28d_view` (anúncios) | 1d_view, 1d_ev, 7d_click… | 12/01/2026. O rodapé "7 dias de clique + 1 dia de visualização" continua certo |

Métricas por post: `views`, `reach`, `saved`, `shares`, `total_interactions`, `profile_visits`, `follows`, e para Reels `ig_reels_avg_watch_time`. Dados de post podem atrasar até 48h.

**Concorrentes:**
- O comum no mercado (Reportei, mLabs, AgencyAnalytics, DashThis, Whatagraph, Metricool): resumo por IA, comparação de períodos, PDF/link automático, metas de KPI, white-label.
- Diferenciais:
  - detecção de anomalia anotada no gráfico (AgencyAnalytics);
  - chat com os dados (AgencyAnalytics, Whatagraph);
  - análise de concorrentes (mLabs, Metricool);
  - envio por WhatsApp (Reportei, mLabs).
- O que a Lone já tem e quase ninguém tem: vendas registradas pelo cliente × investimento, e a linha do tempo do que a equipe fez. Vale destacar mais.
- Ninguém oferece comparação com o nicho: é a oportunidade.
