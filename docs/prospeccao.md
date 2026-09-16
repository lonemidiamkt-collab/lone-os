# Piloto SDR Lone — agente de prospecção (operação)

Código: `lib/prospeccao/*`, crons em `app/api/system/prospect-*`, API do painel em `app/api/prospeccao/*`,
página `app/prospeccao` (admin/manager). Migration `supabase/migrations/20260915100000_prospeccao.sql`.
Treinamento mestre (regras de negócio) = mensagem do Roberto de 15/09/2026; este arquivo é só o "como ligar".

## O que precisa existir antes de ligar

1. **Migration aplicada** no Postgres da VPS:
   ```bash
   docker exec -i supabase-db-1 psql -U postgres -d loneos < /opt/loneos/supabase/migrations/20260915100000_prospeccao.sql
   ```
2. **Env no `/opt/loneos/.env`** (todas já declaradas no `docker-compose.prod.yml`):
   - `PROSPECT_OUTBOUND_INSTANCE` / `PROSPECT_OUTBOUND_KEY` — vazio = usa `EVOLUTION_INSTANCE_NEW` (monitor[IA] / Loninho `5522988237830`).
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — cliente OAuth "Web" no Google Cloud (APIs: Calendar, Sheets, Drive),
     redirect `https://painel.lonemidia.com/api/auth/google/callback`. Depois: `/prospeccao` → Configuração → Conectar Google.
     Sem isso o agente funciona; reunião online é marcada sem link e a ficha pede pra você mandar o Meet.
   - `DRIVA_API_KEY` — opcional (sem ela, exporte CSV da Driva e importe na página).
   - `CS_ADM_GROUP_JID` — já existe; recebe "precisa de você", handoff (cópia), relatório diário e final.
3. **Webhook da Evolution** — nada a mudar: a instância monitor[IA] já aponta para `/api/cs/inbound`; a DM do prospect entra pelo mesmo webhook (`lib/prospeccao/inbound.ts`).
4. **Piloto criado e iniciado** em `/prospeccao` → Configuração → Piloto (nome, 30 dias, 10/dia) → Iniciar.

## Crontab da VPS (UTC = BRT + 3h)

```cron
# Piloto SDR Lone — descoberta 06:30 BRT
30 9  * * 1-5  /opt/loneos/scripts/cron-call.sh prospect-descobrir POST
# enriquecimento 07:00–08:30 BRT a cada 15 min
0,15,30,45 10 * * 1-5  /opt/loneos/scripts/cron-call.sh prospect-enriquecer POST
0,15,30    11 * * 1-5  /opt/loneos/scripts/cron-call.sh prospect-enriquecer POST
# ranking / fila do dia 08:35 BRT
35 11 * * 1-5  /opt/loneos/scripts/cron-call.sh prospect-ranking POST
# abordagens + follow-ups + nutrição: a cada 5 min, 09:00–10:55 BRT
*/5 12-13 * * 1-5  /opt/loneos/scripts/cron-call.sh prospect-outbound POST
# tick (respostas pendentes, lembretes 24h/1h, planilha): a cada 15 min, 09:00–17:45 BRT
*/15 12-20 * * 1-5  /opt/loneos/scripts/cron-call.sh prospect-tick POST
# relatório diário 18:30 BRT
30 21 * * 1-5  /opt/loneos/scripts/cron-call.sh prospect-relatorio POST
# fim do piloto (auto-stop + relatório final) 00:10 BRT
10 3  * * *    /opt/loneos/scripts/cron-call.sh prospect-piloto POST
```

Todos aceitam `?dry=1` (não envia/grava) e também podem ser disparados pela página (gestão logada).

## Como testar sem WhatsApp

- `/prospeccao` → Configuração → **Simulador de conversa**: você faz o prospect, vê intenção, resposta e estágio. Nada sai.
- `POST /api/system/prospect-descobrir?dry=1&quantas=1` — 1 busca real (OpenAI web_search), sem gravar.
- `POST /api/system/prospect-outbound?dry=1` — mostra quem seria abordado e a mensagem, sem enviar.

## Changelog (platform_updates)

```sql
insert into platform_updates (title, description, category, icon, published, created_by) values (
  'Prospecção: Piloto SDR Lone',
  'Novo módulo /prospeccao: agente de IA que descobre empresas da construção civil no RJ, pesquisa (CNPJ, Instagram, Google, WhatsApp), pontua o ICP, monta a fila das 10 melhores do dia e aborda pelo WhatsApp entre 09h e 11h. Conversa até marcar visita (≤80 km) ou Google Meet, faz o handoff para o Roberto e lembra 24h/1h antes. Piloto de 30 dias com desligamento automático, quality gate antes de cada mensagem, relatório diário e final. Só admin/gestão.',
  'feature', 'radar', true, 'Sistema');
```

```sql
-- 16/09: caça ao WhatsApp + custo
insert into platform_updates (title, description, category, icon, published, created_by) values (
  'Prospecção: Rafaela acha o WhatsApp e gasta menos por empresa',
  'Lead A/B não fica mais preso no gate por telefone fixo: a pesquisa lê a bio e as legendas do Instagram, os dois telefones do CNPJ e o site, confere todos de uma vez na Evolution e, se ainda faltar, faz uma busca dirigida ao celular. Custo da pesquisa por empresa caiu pela metade (uma busca por empresa) e a descoberta só traz empresa com presença digital. Erro da OpenAI (sem crédito) agora deixa o prospect para a próxima rodada em vez de descartá-lo.',
  'improvement', 'radar', true, 'Sistema');
```

## Custo por empresa (medido 16/09)

- Pesquisa web (`prospeccao:pesquisa-empresa`, gpt-5.4-mini + `web_search`, `max_tool_calls: 1`): ~8,3k tokens de entrada ≈ **US$ 0,003**. Sem o limite o modelo fazia 2–3 buscas (15k tokens, US$ 0,0055). `search_context_size: "low"` sozinho não reduz nada.
- Caça ao WhatsApp (`prospeccao:busca-whatsapp`): só lead com score ≥ mínimo sem celular verificado ≈ US$ 0,0025.
- Diagnóstico (gpt-4o) só para A/B ≈ US$ 0,0013. Descoberta ≈ US$ 0,006 por consulta (10/dia).
- Ordem de grandeza: **US$ 0,25–0,35/dia** com 10 consultas e ~60 empresas pesquisadas. MEI/CNPJ inativo saem antes da web (BrasilAPI é grátis).
- Erro da API da OpenAI (sem crédito, 429, 5xx) **sobe** — o prospect fica `descoberto` e volta na próxima rodada. Conferir créditos em platform.openai.com quando `llm_calls.ok=false` acumular.

## Guardas que valem a pena conhecer

- Teto duro: `prospect_messages.eh_primeira_abordagem` conta o dia; `limites.ts` bloqueia fora de 09–11.
- Quem já é cliente (`clients` por nome/Instagram/telefone) nunca vira prospect (`db.ehClienteAtual`).
- `nao_perturbe` é terminal; `perdido` pode ir para nutrição 90d à mão.
- Mensagem pelo celular do Loninho (fromMe sem id nosso) = humano assumiu → agente pausa 24h naquele prospect.
- Depois de `reuniao_agendada`: owner ROBERTO, agente só observa e lembra.
