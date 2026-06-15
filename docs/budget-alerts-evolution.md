# Alertas de Saldo (Tráfego) via Evolution API

Notifica o **grupo de WhatsApp do gestor de tráfego** sobre contas Meta Ads sem saldo:

- **Digest completo** toda **segunda, quarta e sexta às 08:00 BRT** (lista todas as contas).
- **Alerta em tempo real** quando uma conta cruza o limite no meio da semana, incluindo
  **aviso de antecedência aos 20% de verba restante** (ex: verba R$ 1.000 → avisa em R$ 200).

> Motivação: o cliente *Imperio dos Pisos* zerou (R$ 0,00) e ficou verde "Ativa" sem ninguém ser
> avisado. Causas: severidade usava `< 0` (zero não contava), notificação era só `console.log`, e o
> motor só rodava no sync manual. Tudo corrigido neste módulo.

---

## 1. Modelo de threshold (camadas)

1. **Regra manual** (`budget_alert_rules`, R$ absoluto) — se existir, vence.
2. **% da verba contratada** (`ad_accounts.monthly_budget`):
   - **atenção**: saldo ≤ `traffic_alert_warning_pct`% (default **20%**)
   - **crítico**: saldo ≤ `traffic_alert_critical_pct`% (default **5%**)
3. **Paraquedas universal** (sempre): crítico se saldo ≤ 0 ou dias ≤ 1; atenção se dias ≤ 3.

> Para liberar o aviso de 20%, preencha **"Verba mensal contratada"** na engrenagem da conta
> (página Tráfego → Saldos). Sem verba definida, só valem o paraquedas (zero/dias) e regras manuais.

Lógica única em [`lib/budgets/alert-engine.ts`](../lib/budgets/alert-engine.ts) — coberta por
`tests/budget-alert.test.ts` (`npm test`).

---

## 2. Configuração

### 2.1 Segredos da Evolution (env — NÃO vão pro banco)

No `.env` do container Next (e no compose de produção):

```
EVOLUTION_API_URL=https://evo.lonemidia.com   # base da instância
EVOLUTION_API_KEY=<apikey-da-INSTÂNCIA Julio_gestor>
EVOLUTION_INSTANCE=Julio_gestor               # número 5522981712589
CRON_SECRET=<já existente, usado pelos crons>
```

### 2.2 Operação (banco — `agency_settings`, editável sem redeploy)

Semeadas pela migration `047_budget_digest.sql`:

| key                          | default | descrição                                   |
|------------------------------|---------|---------------------------------------------|
| `traffic_alert_enabled`      | `true`  | liga/desliga todo o disparo                 |
| `traffic_alert_group_jid`    | `''`    | **JID do grupo** (ex: `12036...@g.us`)      |
| `traffic_alert_warning_pct`  | `20`    | % da verba p/ atenção                        |
| `traffic_alert_critical_pct` | `5`     | % da verba p/ crítico                        |
| `traffic_alert_mode`         | `digest`| `digest` (1 resumo) ou `per_account` (1 msg/conta) |

### Modo de entrega (`traffic_alert_mode`)

- `digest` — um único resumo consolidado por envio.
- `per_account` — cabeçalho + **uma mensagem por conta** (crítico primeiro), com cores por
  severidade. Há um delay de ~1,2s entre mensagens (evita flood/rate-limit).

Preview sem trocar o setting (override por query): `POST /api/system/budget-digest?dryRun=1&mode=per_account`
retorna o array `messages` sem enviar. Para ativar de fato:
`update agency_settings set value='per_account' where key='traffic_alert_mode';`

Setar o JID do grupo:

```sql
update agency_settings set value = '120363418195771831@g.us' where key = 'traffic_alert_group_jid';
```

> **Valores atuais (instância final confirmada):** instância **`Julio_gestor`** (número
> `5522981712589`, base `https://evo.lonemidia.com`, conectada — `state:"open"`). Grupo de destino
> pretendido: **"Automação Lone Mídia"** = `120363418195771831@g.us` (Julio é membro; `announce:false`).
>
> ⚠️ **Limitação conhecida (bloqueio de envio a GRUPO):** em 2026-06-15, o envio a grupo dessa
> instância retorna `400 / "not-acceptable"` — testado em 2 grupos distintos. Envio **individual (DM)
> funciona** (DM ao próprio Julio foi entregue). Diagnóstico: os participantes dos grupos vêm em
> formato `@lid`, indicando o problema de **migração LID do WhatsApp/Baileys** — a versão da
> Evolution/Baileys dessa instância não envia a grupos no momento. É questão de **infra da Evolution**
> (não do código deste projeto). Caminhos:
> 1. **Atualizar a imagem da Evolution API / Baileys** (versão que trata LID) e reconectar a instância;
> 2. **Fallback imediato:** entregar o digest por **DM** — basta pôr um **número** (ex: `5522981712589`)
>    em `traffic_alert_group_jid` no lugar do JID; `sendText` aceita número ou JID, sem mudança de código.

### 2.3 Descobrir o JID do grupo

Com a Evolution conectada, use a função `listGroups()` de
[`lib/whatsapp/evolution.ts`](../lib/whatsapp/evolution.ts) (ou direto na API):

```
GET {EVOLUTION_API_URL}/group/fetchAllGroups/{EVOLUTION_INSTANCE}?getParticipants=false
Header: apikey: {EVOLUTION_API_KEY}
```

Pegue o `id` (`...@g.us`) do grupo certo pelo `subject`.

---

## 3. Provisionar a Evolution (se ainda não existe)

Não há instância hoje. Sugestão: container no mesmo VPS (Hostinger — ver CLAUDE.md). Snippet base:

```yaml
# docker-compose (trecho) — Evolution API
evolution:
  image: atendai/evolution-api:latest
  restart: always
  environment:
    - AUTHENTICATION_API_KEY=<gerar-uma-chave-forte>
    - DATABASE_ENABLED=false        # ou aponte para o Postgres existente
  ports:
    - "8080:8080"
  volumes:
    - evolution_instances:/evolution/instances
```

Depois: criar a instância, ler o QR code, parear com o número do WhatsApp do disparo, conectar e
adicionar esse número ao grupo do gestor.

---

## 4. Agendamento (crontab no VPS)

Mesmo padrão dos outros crons (`check-meta-token`). Em `crontab -e` (root) ou `/etc/cron.d/loneos`:

```cron
# Digest de saldos — seg/qua/sex 08:00 BRT (VPS em UTC → 11:00). Confirme o TZ do servidor!
0 8 * * 1,3,5 curl -s -X POST https://painel.lonemidia.com/api/system/budget-digest \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/loneos-crons.log 2>&1

# (Opcional) Alerta em tempo real no meio da semana — sync de hora em hora em dia útil.
# Cada sync dispara alerta urgente p/ contas que cruzaram o limite (anti-spam: 1x por dia/severidade).
0 9-19 * * 1-5 curl -s -X POST https://painel.lonemidia.com/api/traffic/sync-balances \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/loneos-crons.log 2>&1
```

> **TZ**: se o VPS roda em UTC, `0 8` dispara às 05:00 BRT. Para 08:00 BRT use `0 11`. Cheque com
> `timedatectl` e ajuste — ou rode `TZ=America/Sao_Paulo` no crontab.

---

## 5. Como testar (verificação)

1. **Unit** (sem infra): `npm test` — valida severidade (zero → crítico, 20% → atenção) e mensagens.
2. **Dry-run** (dados reais, sem enviar):
   ```bash
   curl -X POST 'https://painel.lonemidia.com/api/system/budget-digest?dryRun=1' \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
   Retorna `{ status:"dry_run", counts, message }` — confira a *Imperio* aparecendo como crítica.
3. **Health**:
   ```bash
   curl 'https://painel.lonemidia.com/api/system/budget-digest' -H "Authorization: Bearer $CRON_SECRET"
   ```
   Mostra `ready`, conexão Evolution, grupo configurado, idade do sync e último digest.
4. **Envio real**: `POST` sem `dryRun` → mensagem chega no grupo; confira `budget_digest_log`.
5. **UI**: abrir Tráfego → Saldos — *Imperio dos Pisos* agora aparece **vermelha (Crítico)**.

---

## 6. Tratamento de erro

- Client Evolution: timeout + retry, retorno `{ ok, error }`, **nunca lança** no cron.
- Falha no envio → **e-mail ao admin** + linha `failed` em `budget_digest_log` + `console.error`
  (sem falha silenciosa).
- Idempotência: `budget_digest_log.date_key` (1 digest/dia) e `budget_alert_log.cycle_key`
  (1 alerta urgente por conta/severidade/dia).
- Token Meta expirado / conta com erro de sync: a conta aparece na seção **"Sem sincronizar / com
  erro"** do digest em vez de sumir.
