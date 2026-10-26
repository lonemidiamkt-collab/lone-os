# Contrato assinado (D4Sign) — passagem (26/10/2026)

Pedido do Roberto: "criar uma API que verifica quando o cliente assinou o contrato e informa dentro do grupo
de cadastro: 'Cliente X assinou o contrato'". A equipe esquecia de olhar a D4Sign e perguntava ao cliente
se ele tinha assinado quando ele já tinha.

Branch `contrato-assinado-d4sign`, a partir de `deploy/budget-only` 152e8c98. **Sem push, sem deploy, sem
webhook cadastrado na D4Sign e sem mensagem enviada a grupo nenhum.** Tudo isso espera o ok do Roberto.

## Como funciona

| Peça | Onde | O que faz |
|---|---|---|
| Webhook 2.0 do cofre | `POST /api/integracoes/d4sign` | A D4Sign chama quando algo acontece num documento do cofre dos contratos. O Lone OS confere o `Content-Hmac`, **relê o documento na D4Sign** e, se todas as assinaturas fecharam, manda a mensagem. |
| Consulta de hora em hora | `POST /api/system/contratos-d4sign` (cron `15 11-23 * * *`) | Lista o cofre, relê só o que mudou de fase e pega o que o webhook não trouxe. Guarda há quantos dias cada documento espera assinatura. |
| Linha da manhã | seção `contratos` do `cs-manha` (8h, grupo interno) | `✍️ *Contrato sem assinatura na D4Sign:* Cliente X (5 dias).` — a partir de **3 dias**, no máximo uma vez por semana por contrato. |
| Tela | Contratos e ficha › Contratos | "Assinado na D4Sign em dd/mm · falta subir o PDF". O contrato continua fechando com o PDF assinado (não mexe em `signed_at` nem em `status`). |

A mensagem, no grupo de cadastro (`CS_CADASTRO_GROUP_JID`, o mesmo do link do portal e do onboarding):

```
✅ *Padaria do Zé* assinou o contrato em 26/10.
```

Sem cadastro ligado, sai com o nome do arquivo e uma segunda linha: `_Não achei o cadastro no Lone OS: a data
não foi gravada na ficha._`

Regras (todas com teste em `tests/contrato-assinado-d4sign.test.ts`, D4Sign e banco simulados):

- **Uma mensagem por documento.** A trava é `d4sign_documentos.aviso_reservado_em`, marcada antes de mandar.
  Evento repetido, dois eventos ao mesmo tempo e webhook + consulta no mesmo documento dão uma mensagem só.
  Envio que falha solta a trava (o webhook responde 503 e a D4Sign repete; a consulta tenta na hora
  seguinte). Envio incerto (o WhatsApp não respondeu a tempo) mantém a trava.
- **O evento nunca é acreditado.** Vale a fase que a D4Sign devolve em `GET /documents/{uuid}/list`.
- **Falha de leitura não vira resposta.** D4Sign com erro, fora do ar, lenta ou devolvendo HTML, e banco que
  não lê: não grava assinatura, não manda, responde 503 (webhook) ou `ok:false` (consulta).
- **Histórico não é novidade.** A primeira consulta acha o cofre inteiro: assinatura com mais de 4 dias entra
  em silêncio. Lê no máximo 40 documentos por consulta (os pendentes primeiro); o resto fica para a hora seguinte.
- **Ligação ao cadastro só com par único:** e-mail de quem assinou igual ao do cadastro (`email` ou
  `email_corporativo`); senão, o nome do arquivo (o .docx do Lone OS sai como "Cliente - Contrato - Serviço").
  O contrato escolhido é o mais recente sem assinatura que já existia quando o documento saiu para assinatura —
  um documento antigo não cai no rascunho de renovação.
- Distrato, aditivo e termo saem como "assinou _nome do documento_", sem gravar data de contrato.
- Nunca manda para grupo de cliente (confere o JID antes).

## Onde a chave da D4Sign entra

Só no `.env` da VPS (`/opt/loneos/.env`). **Nunca no repositório (é público) nem no chat.**
O `docker-compose.prod.yml` já passa as variáveis para o app; vazias = integração desligada.

| Variável | Onde achar na D4Sign |
|---|---|
| `D4SIGN_API_TOKEN` | Opções da conta › Dev (API) › tokenAPI |
| `D4SIGN_CRYPT_KEY` | mesma tela › cryptKey |
| `D4SIGN_HMAC_SECRET` | mesma tela › "Gerar Secret Key MAC" |
| `D4SIGN_SAFE_UUID` | UUID do cofre "Contratos Lone Midia" (aparece na URL do cofre) |
| `D4SIGN_API_URL` | opcional; vazio = `https://secure.d4sign.com.br/api/v1` |

## Para ligar (depois do ok do Roberto, nesta ordem)

1. Aplicar `supabase/migrations/20261026150000_contrato_assinado_d4sign.sql` (antes do deploy: sem a tabela o
   webhook responde 503 e a consulta dá erro; a lista de contratos funciona com ou sem a coluna).
2. Deploy (não em cima da publicação das 18h40 de 26/10 da outra frente; agrupar).
3. Roberto põe as 5 variáveis no `/opt/loneos/.env` e recria o app (`docker compose -f docker-compose.prod.yml up -d app`).
4. Na D4Sign: Opções da conta › Dev (API) › Webhook › **Ativar Webhook 2.0**.
5. Ensaio do cadastro do webhook e depois o cadastro (com o CRON_SECRET, na VPS):
   ```bash
   CRON_JOB=- /opt/loneos/scripts/cron-call.sh "contratos-d4sign?webhook=cadastrar&dry=1" POST
   ```
   Confere a URL (`https://painel.lonemidia.com/api/integracoes/d4sign`) e o cofre; aí sem `&dry=1`.
   `?webhook=ver` mostra o que ficou cadastrado. (`CRON_JOB=-` evita que a chamada à mão conte como execução
   da rotina na Central de Automações.)
6. Ensaio da consulta: `CRON_JOB=- … "contratos-d4sign?dry=1" POST` — lista o que mandaria (a primeira leitura do cofre deve dar
   no máximo as assinaturas dos últimos 4 dias).
7. Crontab: `15 11-23 * * * /opt/loneos/scripts/cron-call.sh contratos-d4sign POST >> /var/log/loneos-contratos-d4sign.log 2>&1`;
   depois `crontab -l > ops/crontab-producao.txt`, `npx tsx scripts/gerar-agenda-cron.ts` e tirar
   `contratos-d4sign` de `EM_TRANSICAO.entrando` em `tests/automacoes-registro.test.ts`.
8. Changelog:

```sql
insert into platform_updates (title, description, category, icon, published, created_by) values (
  'Contrato assinado avisa no grupo de cadastro',
  'Quando a D4Sign fecha todas as assinaturas de um contrato, o grupo de cadastro recebe uma mensagem: "✅ Cliente X assinou o contrato em dd/mm." — uma vez só, mesmo que a D4Sign avise duas vezes. A data aparece no contrato ("Assinado na D4Sign em dd/mm · falta subir o PDF"), então ninguém precisa perguntar ao cliente. Contrato há 3 dias ou mais sem assinatura entra numa linha do resumo da manhã, no máximo uma vez por semana.',
  'feature', '✍️', true, 'Sistema');
```

## Não verificado

- **Nada foi testado contra a D4Sign de verdade** (não há chave aqui, e não se pede chave no chat). O formato
  segue a documentação oficial; o que ela não mostra com exemplo foi lido com folga: a paginação do cofre
  (`total_pages`) e o formato das datas dos signatários (`date_signed_atom`, `date_signed`, `date`). O
  ensaio do passo 6 é o primeiro contato real — conferir ali que os nomes e as datas vieram certos.
- Não confirmei se o webhook 2.0 manda em form-data ou JSON: a rota aceita os dois (e urlencoded).
- O grupo de cadastro não tem resumo de manhã próprio; a linha "Contrato sem assinatura" foi para o resumo da
  manhã que já existe (`cs-manha`, grupo interno), ao lado do "Marco de contrato". Se o Roberto quiser no grupo
  de cadastro, é trocar o destino dessa seção — mas seria uma mensagem a mais por dia naquele grupo.
- Quem assina pela Lone também conta: o documento só fecha quando todos assinam. Se a Lone assinar depois do
  cliente, o aviso sai quando a Lone assinar.
