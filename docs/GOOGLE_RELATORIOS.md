# Google Ads e Perfil da Empresa nos relatórios e no portal

Pedido do Roberto (18/11/2026): os números do Google precisam estar no relatório semanal, no relatório mensal e no painel de resultados de cada cliente. Isso vale para o Google Ads e também para o Google Meu Negócio (ligações, rotas pedidas, entradas no site), com números precisos.

## Como funciona

```
Google Ads API (v26) ─┐                                   ┌─ relatório semanal (segunda, 8h)
                      ├─ google-sync (todo dia, 7h) ─ banco ─┼─ relatório mensal (dia 1º, 8h)
Perfil da Empresa API ┘   lib/google/sincronizar.ts       └─ aba "Google" do portal do cliente
```

- **Leitura diária, gravada dia a dia.** Relatório, PDF e portal leem os números do banco, nunca do Google ao vivo. Por isso os três mostram o mesmo número, e o portal não depende do Google estar no ar.
- **Google Ads.** A rotina relê os últimos 30 dias, porque a conversão chega depois do clique e o Google corrige o custo. Quando uma conta é vinculada, a primeira leitura cobre 120 dias.
  - O que é gravado: campanha × dia (investimento, cliques, impressões, conversões, valor, ligações pelo anúncio) e ação de conversão × dia (ligação, rota, contato, formulário…).
- **Perfil da Empresa.** A rotina relê os últimos 12 dias, porque o Google libera os números com 2 a 5 dias de atraso. A primeira leitura cobre 400 dias.
  - O que é gravado: ligações, rotas pedidas, cliques no site, conversas, reservas, cliques no cardápio e visualizações (Busca × Maps, celular × computador).
  - Os termos de busca são gravados por mês.
- **O atraso do Perfil nunca vira zero.** O sistema guarda até que dia o Google já entregou.
  - No relatório semanal, o bloco do Perfil recua para os últimos 7 dias entregues.
  - No mensal, o bloco é cortado no último dia entregue e comparado com os mesmos dias do mês anterior.
  - Nos dois casos, uma nota diz qual período o bloco cobre.
- **Quem vê o quê:**
  - Google Ads aparece só para clientes com contrato de tráfego (`podeFalarDeAnuncio`, a mesma regra dos anúncios da Meta).
  - O Perfil da Empresa aparece sempre que um perfil está vinculado (como o Instagram).
- **Falha nunca vira zero** (`docs/ERRO_RECUPERAVEL.md`):
  - Se a leitura falha ou está atrasada, o bloco não entra no PDF do cliente e o motivo vai para o time:
    - no grupo interno;
    - nos campos `parciais`/`errors` da rodada;
    - na ficha do cliente.
  - No portal, o cliente vê "estão sendo atualizados".
  - A rotina responde `ok:false` com a lista de falhas, e a Central de Automações mostra isso.
- **Vínculo automático** (`lib/google/detectar.ts`). Só aparece o que a Lone gerencia: o Google só lista as contas e os perfis a que a conta da Lone tem acesso.
  - Todo dia às 7h, antes da leitura, a rotina procura a conta e o perfil de cada cliente sem vínculo. Isso pega também o cliente que deu acesso à Lone depois do cadastro.
  - Ela vincula sozinha quando o nome é igual (ou, no perfil, o telefone é igual), a escolha é única e a conta não está em outro cliente.
  - O que for duvidoso (nome parecido, duas lojas com o mesmo nome) vira sugestão na ficha, com o botão "É este — vincular".
  - Na ficha também há o botão "Procurar agora".
- **Segurança da implantação.** Enquanto a migração não for aplicada, o código funciona como antes: as colunas novas só são pedidas depois de confirmar que existem (`lib/google/colunas.ts`).

## Arquivos

| O quê | Onde |
|---|---|
| Tabelas e colunas | `supabase/migrations/20261118120000_google_relatorios.sql` |
| Conexão (OAuth, só leitura) | `lib/google/marketing-auth.ts`, com o destino `marketing` em `lib/google/estado-oauth.ts` |
| Leitura do Google Ads | `lib/google/ads-api.ts` |
| Leitura do Perfil da Empresa | `lib/google/perfil-api.ts` |
| Rotina diária | `lib/google/sincronizar.ts` e `app/api/system/google-sync/route.ts` |
| Cálculos (puro, testado) | `lib/google/relatorio.ts` |
| Leitura do banco para relatório e portal | `lib/google/relatorio-dados.ts` |
| Folhas do PDF | `lib/reports/relatorioGooglePdf.ts` (ligado em `relatorioClientePdf.ts`) |
| Relatório semanal e mensal | `lib/traffic/weekly-report.ts`, `app/api/system/weekly-reports`, `app/api/system/client-messages` |
| Portal | `app/api/portal/[token]/google/route.ts`, `components/portal/PortalGoogle.tsx` |
| Ficha do cliente (Admin › Google) | `components/client/ficha/ContaGoogle.tsx`, `app/api/clients/[id]/google/route.ts` |
| Sistema › Integrações | cartão "Google Ads e Perfil da Empresa" e `app/api/integracoes/google-marketing/route.ts` |
| Testes | `tests/google-relatorios.test.ts` |

## Para ligar (uma vez)

1. **Google Cloud: o mesmo projeto do app do Google da Lone.**
   1. Ative as APIs: **Google Ads API**, **My Business Account Management API**, **My Business Business Information API** e **Business Profile Performance API**.
   2. Google Ads API › Visão geral: peça o nível de acesso **Explorer**. Desde set/2026 o nível é do projeto (não existe mais developer token). No nível "Test", a API só lê conta de teste.
   3. Perfil da Empresa: as APIs começam com **cota zero**. Peça acesso em `support.google.com/business/contact/api_default`. A aprovação leva alguns dias.
   4. Na tela de consentimento OAuth, adicione os escopos `.../auth/adwords` e `.../auth/business.manage`.
2. **Banco:** aplique `supabase/migrations/20261118120000_google_relatorios.sql`. O `deploy.sh` não aplica migração.
3. **Deploy** do código.
4. **Sistema › Integrações › "Google Ads e Perfil da Empresa" › Conectar.** Use a conta Google que é gerente das contas de anúncio (ou do MCC) e dos perfis dos clientes, e marque as duas permissões.
5. **Em cada cliente**: o vínculo é automático (veja acima). Se não for, na ficha › Admin › Google:
   - vincule a conta do Google Ads (se a conta estiver no MCC, o sistema descobre sozinho);
   - vincule o Perfil da Empresa.

   Ao vincular, a primeira leitura roda na hora. Para o perfil aparecer na lista, o cliente precisa ter adicionado a conta da Lone como gerente.
6. **Crontab do VPS** (depois, regenere `ops/crontab-producao.txt` e tire `google-sync` de `EM_TRANSICAO.entrando` em `tests/automacoes-registro.test.ts`):
   ```
   0 10 * * * /opt/loneos/scripts/cron-call.sh google-sync POST >> /var/log/loneos-google-sync.log 2>&1
   ```
7. **Confira:**
   - `POST /api/system/google-sync?dry=1` lista quem será lido;
   - a prévia `weekly-reports?cliente=<id>&dry=1` mostra o HTML com as folhas do Google.

## Google Analytics: o site do cliente (19/11/2026)

O pedido do Roberto foi saber, pelo site, quantas pessoas visitaram e quantas **clicaram no WhatsApp, ligaram ou mandaram formulário**. Nada de "conversão". No portal, isso aparece na aba Google, parte **"Seu site"**, depois de Google Meu Negócio e Google Anúncios.

- **Mesma conexão de marketing**, com o escopo `analytics.readonly` a mais. Conexão feita antes de 19/11 não tem a permissão, e a tela de Integrações pede para reconectar.
- **Mesma rotina** (`google-sync`, 7h): relê os últimos 7 dias. A primeira leitura de uma propriedade cobre 400 dias. São 3 relatórios da Data API por cliente:
  1. dia × canal: visitas, visitas com interesse, páginas e pessoas novas;
  2. dia × evento: os eventos do site, sem o ruído (page_view, scroll…);
  3. dia × link clicado: só links `wa.me`/WhatsApp e `tel:`. Esses cliques vêm da "medição otimizada" do GA4, que grava sozinha o clique em link de saída.
- **O que é contato** fica em `acaoDoEvento`, em `lib/google/relatorio.ts`:
  - link de WhatsApp ou evento com "whats"/"wpp" no nome → WhatsApp;
  - `tel:` ou evento de ligação → ligação;
  - `generate_lead`, `form_submit` e semelhantes → formulário. `form_start` não conta.
- **Sem contagem em dobro.** O mesmo clique costuma vir duas vezes: o evento do site e o clique no link. Por dia, vale a maior das fontes. A contagem é conservadora de propósito: pode contar a menos, nunca a mais.
- **Contato que o site não mede não vira "0".** O cartão some e o painel avisa que a medição ainda não está ligada.
- **Ainda não entra** no relatório semanal, no mensal nem no PDF; por enquanto, só no portal.
- **Vínculo:**
  - automático pelo nome da propriedade ou pelo nome da conta do Analytics. O domínio no nome é ignorado ("www.loja.com.br - GA4" → "loja");
  - ou na ficha: Admin › Google › Site (Google Analytics).
  - O cliente precisa adicionar a conta Google da Lone como **Leitor** na propriedade.

**Para ligar (uma vez):**

1. Google Cloud (projeto `lone-os-agenda`):
   1. Ative a **Google Analytics Data API** e a **Google Analytics Admin API**.
   2. Na tela de consentimento, adicione o escopo `.../auth/analytics.readonly`.
2. Banco: aplique `supabase/migrations/20261119100000_google_analytics.sql`.
3. Deploy.
4. Sistema › Integrações › Google Ads e Perfil da Empresa › **Reconectar**. Marque as três permissões.
5. Rode `google-sync` uma vez ou use "Procurar agora" na ficha.

## Limites conhecidos

- **Conversões do Google Ads:** a coluna principal usa as ações **principais** da conta. O quadro "O que os anúncios geraram" usa **todas as conversões**, que incluem as secundárias, como as rotas e as ligações da Performance Max.
- **Perfil da Empresa:** o Google não conta toques repetidos da mesma pessoa no mesmo dia. Os termos de busca com pouco volume vêm como "menos de N".
- **Relatório mensal:** o `scripts/relatorio-mensal.sh` só confere o token da Meta antes de rodar. Se a Meta estiver fora, o mensal para para todos, inclusive para quem só tem Google.
- **Relatório semanal:** a legenda personalizada da segunda (placar) continua só para a Meta. Clientes só de Google recebem o PDF com a mensagem padrão.

## O Google dentro do Tráfego (19/11/2026)

Até aqui o Google só aparecia no relatório e no portal. O time de tráfego não tinha onde ver a verba do Google, o ritmo do mês, a campanha travada ou a avaliação sem resposta. Agora o menu **Tráfego** tem duas telas novas, que leem só o banco, como o resto:

- **Tráfego › Google Ads** (`/traffic/google-ads`). Uma linha por cliente com conta vinculada, os piores primeiro:
  - **Ritmo do mês contra a verba do Google** (`clients.google_ads_verba_mensal`, editada na própria tela). Usa a mesma barra de Contas & Verba. É medido até ontem, porque o Google é lido até ontem.
    - O Google pode gastar até 2x o orçamento num dia, mas no mês o teto é 30,4x. Por isso o ritmo é do mês.
    - O modal da verba avisa quando o orçamento diário das campanhas não fecha com a verba.
  - **Últimos 7 dias contra os 7 anteriores:** gasto, conversões e custo por conversão.
  - **Buscas perdidas por verba × por classificação** (`search_budget_lost_impression_share` e `search_rank_lost_impression_share`).
    - Perda por verba alta com custo por conversão bom é argumento para pedir mais verba ao cliente.
    - Perda por classificação alta pede revisão de lance, qualidade ou anúncio.
    - Só existe em campanha de Pesquisa: PMax não informa, e aparece "—".
  - **Sinais:**
    - leitura falhou ou atrasada (mais de 36 h);
    - anúncio reprovado;
    - campanha ativa sem impressão em 7 dias;
    - fora do ritmo;
    - sem conversão na semana com gasto;
    - custo por conversão 50% ou mais acima dos 30 dias;
    - perda por verba de 30% ou mais.
  - **Ao abrir a linha:** o mês, o que os anúncios geraram (ligação, rota, contato…), as campanhas (situação, motivo, orçamento do dia, perdas) e o botão "Ler o Google agora".
- **Tráfego › Google Meu Negócio** (`/traffic/meu-negocio`). Uma linha por perfil vinculado:
  - **Contatos:** ligações, rotas, cliques no site e conversas nos últimos 28 dias que o Google já entregou, contra os 28 anteriores.
  - **Busca × Maps** e os termos de busca do último mês fechado.
  - **Nota e total de avaliações, e a fila de avaliações sem resposta**, com as negativas primeiro. O botão "Responder no Google" abre o perfil, porque o sistema só lê.
  - **Sinais:**
    - avaliação negativa sem resposta;
    - avaliação sem resposta há mais de 48 h;
    - nota abaixo de 4,5;
    - menos de 20 avaliações;
    - sem avaliação nova há 60 dias;
    - contatos caindo 30% ou mais;
    - Google sem número novo há mais de 8 dias (perfil suspenso ou sem verificação).
  - A Q&A do Google foi encerrada em 03/11/2025 e não entra.
- **Leitura (mesma rotina `google-sync`, 7h):**
  - No Ads, mais 2 consultas por conta: o cadastro das campanhas, sem métrica, para não sumir a campanha ativa sem impressão, e os números de 7 dias com as parcelas.
  - No Perfil, as 100 avaliações mais recentes pela **My Business API v4** (`accounts/{conta}/locations/{local}/reviews`). A conta do perfil fica em `google_perfil_resumo.conta`.
  - Falha aqui nunca derruba os números do dia: vira "Parcial — …" no estado do cliente.
- **Regras puras e testadas:** `lib/google/carteira.ts` (`tests/google-carteira.test.ts`). As rotas são `app/api/trafego/google-ads` e `app/api/trafego/google-perfil`.

**Para ligar (uma vez):**

1. Banco: aplique `supabase/migrations/20261119150000_trafego_google.sql`.
   - Antes dela, as telas já abrem: os números do dia aparecem, e um aviso diz que a verba, as perdas e as avaliações esperam a migração.
2. Google Cloud: ative a **Google My Business API** (v4, a das avaliações). Ela usa a mesma cota e o mesmo pedido de acesso do Perfil da Empresa.
3. Deploy. Depois, rode `google-sync` uma vez, ou "Ler o Google agora" num cliente.

## Anúncios Meta: visão Carteira (19/11/2026)

A visão "Todos" da aba Anúncios Meta somava só o que alguém tinha aberto (`meta_campaign_cache`). Na produção, 51 de 53 clientes apareciam "sem leitura".

- **Agora a carteira sai do que o servidor grava todo dia:**
  - `metric_snapshots` (conta × dia);
  - `ad_accounts` (verba, gasto do mês, saldo, status);
  - `meta_ad_period` (frequência de 7 dias).
- **Uma linha por cliente:** gasto, resultados e custo por resultado contra o período anterior, CTR, CPM, frequência, gasto por dia e ritmo do mês.
- **Sinais:**
  - conta com pagamento falhou, carência ou análise;
  - saldo pré-pago para menos de 3 dias;
  - 2 dias sem gasto;
  - sem resultado com gasto;
  - custo por resultado 50% ou mais acima do anterior;
  - frequência acima de 3;
  - CTR abaixo de 0,8%;
  - fora do ritmo.
- **A parede de 53 botões virou um seletor com busca.** As leituras por campanha, que o ZIP de PDFs usa, ficaram recolhidas embaixo.
- **Onde está:** regras em `lib/trafego/carteira-meta.ts` (`tests/trafego-carteira-meta.test.ts`), rota em `app/api/trafego/meta-carteira`.
