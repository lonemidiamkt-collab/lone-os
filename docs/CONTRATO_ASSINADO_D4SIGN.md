# Contrato pela D4Sign — passagem (26/10/2026)

Pedido do Roberto: "criar uma API que verifica quando o cliente assinou o contrato e informa dentro do grupo
de cadastro" e depois "faça toda essa integração", com o Lone Finance ligado a ela.

Branch `contrato-assinado-d4sign` (worktree `~/dev/lone-os/.claude/worktrees/contrato-assinado-d4sign`), a
partir de `deploy/budget-only` 152e8c98. Sem push, sem deploy, sem webhook cadastrado e sem mensagem enviada.
Tudo espera o ok do Roberto.

| Etapa | O que | Situação |
|---|---|---|
| 1 | Aviso no grupo de cadastro + PDF assinado entrando sozinho na ficha + chaves da D4Sign no painel | pronta nesta branch |
| 2 | Enviar pelo Lone OS, quem falta assinar em Contratos, lembrete pela D4Sign (desligado) | em seguida |
| 3 | Rota de leitura para o Lone Finance + rotina lá | Finance: commit 177fce3 na branch `contrato-assinado-d4sign` do lone-finance; rota do Lone OS em seguida |

## O que a D4Sign permite (documentação lida em docapi.d4sign.com.br)

Base: `https://secure.d4sign.com.br/api/v1` (sandbox: `https://sandbox.d4sign.com.br/api/v1`). Autenticação por
`tokenAPI` e `cryptKey` na URL (a `cryptKey` só quando está habilitada na conta). **Limite padrão: 10 chamadas
por hora** — para subir, `comercial@d4sign.com.br`. Respostas em JSON; erro como `{ "message": "…" }`.

| Precisamos de | Endpoint | Usado em |
|---|---|---|
| Ler um documento e os signatários (quem assinou, quando, `key_signer`) | `GET /documents/{uuid}/list` | aviso, PDF, quem falta assinar |
| Listar o cofre | `GET /documents/{cofre}/safe` (500 por página, `pg`) | consulta periódica |
| Webhook do cofre inteiro (2.0) | `POST /webhooks/v2/` `{type:"cofre", uuid, url}`; ver: `GET /webhooks/v2/?type=cofre&uuid=…` | botão "Ligar o aviso da D4Sign" |
| Autenticidade do webhook | cabeçalho `Content-Hmac: sha256=<HMAC do uuid com a Secret Key MAC>` | webhook |
| Eventos do webhook | `type_post` 1 finalizado · 2 e-mail não entregue · 3 cancelado · 4 um signatário assinou; form-data; até 6 novas tentativas em 27 h | webhook |
| Baixar o PDF assinado | `POST /documents/{uuid}/download` `{type:"PDF"}` → `{url, name}` | PDF na ficha |
| Subir o contrato | `POST /documents/{cofre}/uploadbinary` `{base64_binary_file, mime_type, name}` → `{uuid}` (aceita DOCX e PDF) | etapa 2 |
| Incluir signatários | `POST /documents/{uuid}/createlist` `{signers:[{email, act, foreign, certificadoicpbr, assinatura_presencial, …}]}`; `act` 4 = assinar como parte, 5 = testemunha | etapa 2 |
| Mandar para assinar | `POST /documents/{uuid}/sendtosigner` `{skip_email:"0", workflow:"0", message?}` | etapa 2 |
| Lembrete ao signatário | `POST /documents/{uuid}/resend` `{email, key_signer}` (e-mail da própria D4Sign, sem texto nosso) | etapa 2 (desligado) |
| Cancelar | `POST /documents/{uuid}/cancel` `{comment?}` | não usado (cancelar continua na D4Sign) |

Também existem (não usados): templates Word/HTML da D4Sign, posição de assinatura e rubrica, observadores,
tags, grupos de assinatura, certificado ICP-Brasil, embed e SSO.

## Etapa 1 — como funciona

- **Webhook** (`POST /api/integracoes/d4sign`): confere o `Content-Hmac` (sem o segredo a porta fica fechada:
  cada evento gastaria uma das 10 chamadas da hora), **relê o documento** e só chama de assinado a fase
  Finalizado. Grava os signatários (quem falta assinar) a cada evento.
- **Aviso**, uma vez por documento, no grupo de cadastro: `✅ *Padaria do Zé* assinou o contrato em 26/10.`
  A trava (`d4sign_documentos.aviso_reservado_em`) é marcada antes de mandar.
- **PDF assinado** (`anexarPdfAssinado`): baixado da D4Sign e guardado em `legal-docs/contracts-signed/{cliente}/…`,
  o mesmo lugar do "Upload assinado". Contrato do Lone OS ligado → fecha pela mesma regra (PDF + `signed_at` +
  `status active`), só se ainda não tinha PDF. Cliente sem contrato registrado no Lone OS (a maioria: a fonte do
  contrato é o Finance) → o PDF aparece no bloco **"Na D4Sign"** da aba Contratos do cliente. Falhou → tenta de
  novo nas consultas (até 5 vezes, nos 30 dias depois da assinatura).
- **Consulta** (`POST /api/system/contratos-d4sign`, cron `15 11-23/3 * * *`): lê o cofre e no máximo mais 3
  chamadas; pega o que o webhook não trouxe e o PDF que ficou para trás. O que já estava assinado quando o Lone OS
  o viu pela primeira vez entra em silêncio e sem chamada.
- **Cota** (`lib/contracts/d4sign-cota.ts`): conta as chamadas da última hora; as rotinas param 4 antes do limite.
- **Linha da manhã** (`cs-manha`, grupo interno): `✍️ *Contrato sem assinatura na D4Sign:* Cliente X (5 dias).`
  A partir de 3 dias, no máximo uma vez por semana por contrato.
- **Chaves no painel** (Configurações › Jurídico › D4Sign, só admin): cifradas com a `VAULT_KEY` (a mesma do Cofre
  de Acessos), numa tabela que só o servidor lê. A tela nunca recebe a chave de volta; mostra só se está configurada
  e de onde vem (painel ou servidor), com "Testar", "Ligar o aviso da D4Sign" e o histórico de quem mexeu. O `.env`
  vale para o campo que o painel deixar vazio.

**Por que o painel não piora a segurança em relação ao `.env`:** um vazamento do banco sozinho não entrega a chave
(falta a `VAULT_KEY`, que só existe no servidor); nem o texto cifrado chega ao navegador (RLS sem policy); o token da
Meta, hoje, volta inteiro para a tela — este não. O risco que muda: um admin com a conta tomada pode TROCAR a chave
(não lê-la). O 2FA dos admins cobre isso.

## Passo a passo das chaves (Roberto)

Tudo no Lone OS em **Configurações › Jurídico › D4Sign**. Ninguém precisa mexer no servidor nem mandar chave no chat.

1. Entre em https://secure.d4sign.com.br com a conta da Lone.
2. **Token e chave de criptografia:** menu da conta (canto superior direito) › **Dev (API)**. Se não houver token,
   clique para gerar. Copie o **tokenAPI** e cole em "Token da API"; copie a **cryptKey** e cole em "Chave de
   criptografia".
3. **Segredo do webhook:** na mesma tela, área **Webhook** › **Ativar Webhook 2.0**; depois **Gerar Secret Key MAC**.
   Copie e cole em "Segredo do webhook".
4. **Cofre:** menu **Cofres** › abra **Contratos Lone Midia** (ou o cofre onde os contratos ficam). O identificador
   é o código no endereço da página, no formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. Cole em "Identificador do cofre".
5. **Salvar chaves** e depois **Testar**: tem que aparecer "Funcionou: a D4Sign abriu o cofre…".
6. **Ligar o aviso da D4Sign** (com a confirmação): a D4Sign passa a avisar o Lone OS de cada assinatura.
7. Recomendado: pedir à D4Sign (comercial@d4sign.com.br) para subir o limite de 10 chamadas por hora.

Na etapa 2 entram os e-mails com que o Roberto e o Lucas assinam na D4Sign (para o envio pelo Lone OS).

## Para publicar a etapa 1 (com o ok do Roberto)

1. Aplicar `supabase/migrations/20261026150000_contrato_assinado_d4sign.sql` (antes do deploy).
2. Deploy, depois da publicação das 18h40 de 26/10.
3. Roberto faz o passo a passo acima (chaves, Testar, Ligar o aviso).
4. Ensaio da consulta na VPS: `CRON_JOB=- /opt/loneos/scripts/cron-call.sh "contratos-d4sign?dry=1" POST`.
5. Crontab: `15 11-23/3 * * * /opt/loneos/scripts/cron-call.sh contratos-d4sign POST >> /var/log/loneos-contratos-d4sign.log 2>&1`;
   depois `crontab -l > ops/crontab-producao.txt`, `npx tsx scripts/gerar-agenda-cron.ts` e tirar `contratos-d4sign`
   de `EM_TRANSICAO.entrando` em `tests/automacoes-registro.test.ts`.
6. Changelog:

```sql
insert into platform_updates (title, description, category, icon, published, created_by) values (
  'Contrato assinado na D4Sign: aviso no grupo e PDF na ficha',
  'Quando a D4Sign fecha todas as assinaturas de um contrato, o grupo de cadastro recebe "✅ Cliente X assinou o contrato em dd/mm" (uma vez só) e o PDF assinado entra sozinho na ficha do cliente — o contrato fecha sem ninguém subir arquivo. A aba Contratos mostra o que está na D4Sign, quem já assinou e quem falta. Contrato há 3 dias ou mais sem assinatura entra numa linha do resumo da manhã. As chaves da D4Sign são coladas em Configurações › Jurídico, guardadas cifradas.',
  'feature', '✍️', true, 'Sistema');
```

## Conflitos para a junção com `deploy/budget-only`

Arquivos que outras frentes também mexem (o resto é novo):

- `middleware.ts` — uma entrada em `PUBLIC_PATHS` (`/api/integracoes/d4sign`).
- `app/api/system/cs-manha/route.ts` e `lib/cs/manha.ts` — seção nova `contratos` (chave, ordem, rótulo do PDF).
- `lib/automacoes/registro.ts` — entrada `contratos-d4sign` e destino `"grupo de cadastro"`;
  `components/automacoes/LinhaAutomacao.tsx` (rótulo do destino); `tests/automacoes-registro.test.ts` (`EM_TRANSICAO`).
- `app/sobre/page.tsx` — módulo Contratos.
- `docker-compose.prod.yml` — variáveis `D4SIGN_*`.
- `app/settings/page.tsx` (cartão D4Sign), `components/ContractGenerator.tsx`, `app/contratos/page.tsx`,
  `app/api/contracts/list/route.ts`.

## Não verificado

- **Nada foi testado contra a D4Sign de verdade** (não há chave aqui). O formato segue a documentação; o que ela não
  mostra com exemplo (paginação do cofre, formato das datas dos signatários, o link do download) foi lido com folga.
  O "Testar" do painel e o ensaio da consulta são o primeiro contato real.
- Não confirmei se o webhook 2.0 manda form-data ou JSON: a rota aceita os dois (e urlencoded).
- A tela não foi aberta no navegador (sem banco local); coberta por tipos e testes de rota.
- O grupo de cadastro não tem resumo de manhã próprio; a linha "Contrato sem assinatura" foi para o `cs-manha`
  (grupo interno), ao lado do "Marco de contrato".
- O documento só fecha quando todos assinam, inclusive quem assina pela Lone.
