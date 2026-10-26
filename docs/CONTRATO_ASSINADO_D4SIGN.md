# Contrato na D4Sign: quem assinou e quem falta — passagem (26/10/2026)

Pedido do Roberto: "a maior questão é a gente saber quem assinou, quem não assinou; se o cliente assinou, enviar lá
no nosso grupo de cadastro 'cliente acabou de assinar o contrato', ou 'o cliente ainda não assinou o contrato'".

Branch `contrato-assinado-d4sign` (worktree `~/dev/lone-os/.claude/worktrees/contrato-assinado-d4sign`), a partir de
`deploy/budget-only` 152e8c98. Sem push, sem deploy, sem webhook cadastrado e sem mensagem enviada. Tudo espera o ok
do Roberto.

## O que entra

Três mensagens, todas no **grupo de cadastro** (o mesmo do link do portal e do onboarding), cada uma uma vez:

| Quando | Mensagem |
|---|---|
| Alguém assina e ainda falta alguém | `✍️ *Padaria do Zé*: assinado por José (cliente) em 26/10 · falta Roberto (Lone).` |
| Todos assinaram | `✅ *Padaria do Zé* assinou o contrato em 26/10.` |
| Dia útil, 8h30, se houver contrato enviado há 3 dias ou mais sem todas as assinaturas | `⏳ *Ainda não assinaram o contrato*` + uma linha por contrato: `• *Padaria do Zé* — falta José (cliente) · enviado há 5 dias`. Sem pendência, nada sai. |

Na **tela de Contratos** (bloco "Assinaturas na D4Sign": esperando + assinados há até 30 dias) e na **aba Contratos do
cliente** (bloco "Na D4Sign") aparece o mesmo texto por documento: "assinado por X em dd/mm · falta Y". A data entra no
contrato ("Assinado na D4Sign em dd/mm · falta subir o PDF"); o contrato continua fechando com o PDF assinado na ficha.

A linha que tinha ido para o resumo da manhã (`cs-manha`) **saiu**: o "ainda não assinou" é só o aviso do grupo de cadastro.

Como funciona (`lib/contracts/assinatura.ts`):
- **Vários cofres**: na conta da Lone os contratos ficam em ~10 cofres (um por pacote, renovação, experiência…). Os de
  contrato de cliente são escolhidos no painel; documento de outro cofre (ex.: "Prestadores de serviço") é ignorado.
- **Webhook 2.0 de cada cofre escolhido** (`POST /api/integracoes/d4sign`): a D4Sign avisa a cada assinatura e quando fecha.
  O Lone OS confere o `Content-Hmac` (sem o segredo a porta fica fechada) e **relê o documento** antes de afirmar qualquer coisa.
- **Consulta a cada 3 horas** (`POST /api/system/contratos-d4sign`, cron `15 11-23/3 * * *`): lista os documentos da CONTA
  esperando assinatura (`GET /documents/3/status`, 1 chamada, não uma por cofre), filtra pelos cofres escolhidos e relê só
  o que mudou: pendente conhecido que saiu da lista, assinado cujo aviso não saiu, pendente novo.
- **Aviso da manhã** (`POST /api/system/contratos-d4sign-pendentes`, cron `30 11 * * 1-5`): relê os mais antigos antes de
  escrever (quem assinou de madrugada não aparece como faltando); feriado não manda; uma por dia.
- **Travas**: final = `aviso_reservado_em`; parcial = `aviso_parcial` (o retrato de quem já tinha assinado); manhã = registro
  de saídas do dia. Envio que falha solta a trava; envio incerto não.
- **Quem é quem**: "Lone" = e-mails de quem assina pela Lone (painel) ou o da CONTRATADA; "cliente" = e-mail do cadastro
  ou o outro lado do contrato. Sem os e-mails da Lone configurados, o nome aparece sem rótulo (não chuta).
- **Limite da D4Sign: 10 chamadas por hora** (documentação oficial). Cada chamada é contada (`d4sign_chamadas`); as rotinas
  param 4 antes do limite, que ficam para o webhook. Para subir o limite: comercial@d4sign.com.br.

## Chaves pelo painel (Configurações › Jurídico › D4Sign, só admin)

- Guardadas **cifradas** com a `VAULT_KEY` do servidor (a mesma do Cofre de Acessos), numa tabela que só o servidor lê
  (RLS sem policy): nem o texto cifrado chega ao navegador.
- A tela **nunca mostra a chave de volta**: só "configurada", de onde vem (painel ou servidor), quando e por quem. Para
  trocar, cola de novo; "apagar" volta a valer o `.env`.
- **Buscar meus cofres na D4Sign** lista os cofres da conta (`GET /safes`) com caixas de marcar; **Salvar cofres** guarda os
  escolhidos. **Testar** conta o que espera assinatura nos cofres escolhidos. **Ligar o aviso da D4Sign** cadastra o webhook
  2.0 em cada cofre escolhido (1 chamada por cofre): se a cota da hora acabar no meio, diz quantos faltam e o clique seguinte
  só faz os que faltam (`d4sign_config.webhook_cofres`, migration 20261026170000). Quem clica é o Roberto, com confirmação.
- **Histórico** de quem trocou, apagou, testou ou ligou (nunca o valor).
- O `.env` da VPS (`D4SIGN_*`) continua valendo para o campo que o painel deixar vazio.

Por que não piora a segurança em relação ao `.env`: um vazamento do banco sozinho não entrega a chave (falta a `VAULT_KEY`,
que só existe no servidor); o token da Meta, hoje, volta inteiro para a tela — este não. O que muda: um admin com a conta
tomada pode TROCAR a chave (não lê-la); a verificação em duas etapas dos admins cobre isso.

## Passo a passo para o Roberto (onde pegar cada chave)

Tudo colado em **Lone OS › Configurações › Jurídico › D4Sign**. Ninguém mexe no servidor nem manda chave no chat.

1. Entre em https://secure.d4sign.com.br com a conta da Lone e abra **Minha conta › Gerenciar conta**.
2. **Token da API (tokenAPI) e chave de criptografia (cryptKey)**: menu da esquerda **Dev (API)**. A conta já tem a
   "API Key: 1" (limite "10 por hora"); no menu **⋮** da linha dela, copie o token e cole em "Token da API"; depois a
   cryptKey e cole em "Chave de criptografia".
3. **Ativar o webhook 2.0**: menu da esquerda **Webhooks** › aba **Webhook** › botão **Ativar webhook 2.0**.
4. **Segredo do webhook**: ainda em **Webhooks**, aba **Configurações de webhooks** › **Gerar Secret Key HMAC**. Copie e
   cole em "Segredo do webhook".
5. **E-mails de quem assina pela Lone**: os e-mails com que o Roberto e o Lucas assinam na D4Sign, separados por vírgula.
6. Clique **Salvar chaves**.
7. **Cofres**: clique **Buscar meus cofres na D4Sign**, marque os cofres de contrato de CLIENTE (LM - Lone Growth,
   LM - Assessoria Social, LM - Assessoria Trafego, LM - Assessoria Design, Renovação de contrato…; deixe de fora
   "Prestadores de serviço") e clique **Salvar cofres**.
8. **Testar** (tem que aparecer "Funcionou: N documento(s) esperando assinatura nos X cofre(s) escolhido(s)") e por fim
   **Ligar o aviso da D4Sign** (confirma). Com ~10 cofres e o limite de 10 chamadas por hora, pode parar no meio: aí é só
   clicar de novo uma hora depois (os já ligados não se repetem).

## Para ligar hoje (com o ok do Roberto)

**Publicado em 26/10 ~16h25 (`a117a12`)**: migração 20261026150000 aplicada, deploy e crontab feitos. A mudança para
**vários cofres** veio depois: precisa aplicar `supabase/migrations/20261026170000_d4sign_varios_cofres.sql` e publicar de
novo antes de o Roberto escolher os cofres. Os passos abaixo são os da primeira publicação.

1. Aplicar `supabase/migrations/20261026150000_contrato_assinado_d4sign.sql` (antes do deploy).
2. Deploy, depois da publicação das 18h40 de 26/10 (juntar com `deploy/budget-only`; conflitos abaixo).
3. Crontab, duas linhas:
   ```
   15 11-23/3 * * * /opt/loneos/scripts/cron-call.sh contratos-d4sign POST >> /var/log/loneos-contratos-d4sign.log 2>&1
   30 11 * * 1-5 /opt/loneos/scripts/cron-call.sh contratos-d4sign-pendentes POST >> /var/log/loneos-contratos-d4sign-pendentes.log 2>&1
   ```
   Depois: `crontab -l > ops/crontab-producao.txt`, `npx tsx scripts/gerar-agenda-cron.ts` e tirar as duas de
   `EM_TRANSICAO.entrando` em `tests/automacoes-registro.test.ts`.
4. Roberto faz o passo a passo acima (chaves, Testar, Ligar o aviso).
5. Conferência sem mandar nada, na VPS:
   `CRON_JOB=- /opt/loneos/scripts/cron-call.sh "contratos-d4sign?dry=1" POST` e
   `CRON_JOB=- /opt/loneos/scripts/cron-call.sh "contratos-d4sign-pendentes?dry=1" POST`.
6. Changelog:

```sql
insert into platform_updates (title, description, category, icon, published, created_by) values (
  'Contrato na D4Sign: quem assinou e quem falta, no grupo de cadastro',
  'O grupo de cadastro passa a receber, de cada contrato na D4Sign: "✍️ assinado por X · falta Y" a cada assinatura e "✅ Cliente X assinou o contrato" quando todos assinam — cada aviso uma vez só. Todo dia útil de manhã, se houver contrato enviado há 3 dias ou mais sem todas as assinaturas, uma mensagem "⏳ Ainda não assinaram o contrato" com quem falta e há quantos dias. A tela de Contratos e a aba Contratos do cliente mostram o mesmo. As chaves da D4Sign são coladas em Configurações › Jurídico, guardadas cifradas.',
  'feature', '✍️', true, 'Sistema');
```

## O que a D4Sign permite (documentação lida em docapi.d4sign.com.br)

Base `https://secure.d4sign.com.br/api/v1` (sandbox: `https://sandbox.d4sign.com.br/api/v1`); `tokenAPI` e `cryptKey` na
URL; **10 chamadas por hora** por padrão; JSON; erro como `{ "message": "…" }`.

| Para | Endpoint | Usado agora? |
|---|---|---|
| Ler documento e signatários (quem assinou, quando, `key_signer`) | `GET /documents/{uuid}/list` | sim |
| Listar os cofres da conta | `GET /safes` → `[{"uuid-safe", "name-safe"}]` | sim (botão "Buscar meus cofres") |
| Listar o que espera assinatura na conta | `GET /documents/3/status` (500 por página, `pg`; cada item traz `uuidSafe`) | sim |
| Listar um cofre | `GET /documents/{cofre}/safe` (500 por página, `pg`) | não (seria 1 chamada por cofre) |
| Webhook do cofre inteiro (2.0) | `POST /webhooks/v2/` `{type:"cofre", uuid, url}`; ver: `GET /webhooks/v2/?type=cofre&uuid=…` | sim (botão) |
| Autenticidade do webhook | `Content-Hmac: sha256=<HMAC do uuid com a Secret Key MAC>` | sim |
| Eventos | `type_post` 1 finalizado · 2 e-mail não entregue · 3 cancelado · 4 um signatário assinou; form-data; até 6 novas tentativas em 27 h | sim |
| Baixar o PDF assinado | `POST /documents/{uuid}/download` `{type:"PDF"}` → `{url, name}` | depois |
| Subir o contrato / incluir signatários / mandar assinar | `POST /documents/{cofre}/uploadbinary`, `POST /documents/{uuid}/createlist` (`act` 4 parte, 5 testemunha), `POST /documents/{uuid}/sendtosigner` | depois |
| Lembrete ao signatário | `POST /documents/{uuid}/resend` `{email, key_signer}` (e-mail da D4Sign, sem texto nosso) | depois |
| Cancelar | `POST /documents/{uuid}/cancel` | não |

## Ficou para depois (não entra nesta publicação)

- **PDF assinado automático, botão de enviar, lembrete ao cliente**: o PDF automático está pronto e testado na branch
  `d4sign-pdf-envio-depois` (commit 5c1ca99a); envio e lembrete ainda não começaram.
- **Lone Finance**: branch `contrato-assinado-d4sign` do `~/dev/lone-finance` (commit 177fce3) — lê uma porta do Lone OS
  que ainda não existe aqui. Não publicar o Finance antes dessa porta (e o compose de lá exige o arquivo do segredo novo).

## Conflitos para a junção com `deploy/budget-only`

Arquivos que outras frentes também mexem (o resto é novo):

- `middleware.ts` — uma entrada em `PUBLIC_PATHS` (`/api/integracoes/d4sign`).
- `lib/automacoes/registro.ts` — entradas `contratos-d4sign` e `contratos-d4sign-pendentes`, destino `"grupo de cadastro"`;
  `components/automacoes/LinhaAutomacao.tsx` (rótulo do destino); `tests/automacoes-registro.test.ts` (`EM_TRANSICAO`).
- `app/sobre/page.tsx` — módulo Contratos.
- `docker-compose.prod.yml` — variáveis `D4SIGN_*`.
- `app/settings/page.tsx` (cartão D4Sign), `components/ContractGenerator.tsx`, `app/contratos/page.tsx`,
  `app/api/contracts/list/route.ts`.
- `cs-manha` (`app/api/system/cs-manha/route.ts`, `lib/cs/manha.ts`): **sem mudança** nesta branch.

## Não verificado

- **Nada foi testado contra a D4Sign de verdade** (não há chave aqui). O formato segue a documentação; o que ela não mostra
  com exemplo (paginação da lista de pendentes, nomes dos campos de `GET /safes`, formato das datas dos signatários) foi
  lido com folga. O "Testar" do painel e os ensaios
  `?dry=1` são o primeiro contato real.
- Não confirmei se o webhook 2.0 manda form-data ou JSON: a rota aceita os dois (e urlencoded).
- As telas não foram abertas no navegador (sem banco local); cobertas por tipos e testes de rota.
- Quem assina pela Lone só aparece como "(Lone)" depois que os e-mails forem colados no painel.
