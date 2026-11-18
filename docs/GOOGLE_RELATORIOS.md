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

## Limites conhecidos

- **Conversões do Google Ads:** a coluna principal usa as ações **principais** da conta. O quadro "O que os anúncios geraram" usa **todas as conversões**, que incluem as secundárias, como as rotas e as ligações da Performance Max.
- **Perfil da Empresa:** o Google não conta toques repetidos da mesma pessoa no mesmo dia. Os termos de busca com pouco volume vêm como "menos de N".
- **Relatório mensal:** o `scripts/relatorio-mensal.sh` só confere o token da Meta antes de rodar. Se a Meta estiver fora, o mensal para para todos, inclusive para quem só tem Google.
- **Relatório semanal:** a legenda personalizada da segunda (placar) continua só para a Meta. Clientes só de Google recebem o PDF com a mensagem padrão.
