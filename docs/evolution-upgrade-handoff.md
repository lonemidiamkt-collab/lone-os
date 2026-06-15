# Handoff — Atualizar Evolution API (2.2.3 → 2.3.7) p/ destravar envio a grupo

> Documento para repassar a quem administra a instância Evolution (host de terceiro).
> Contexto interno: necessário para o módulo de alerta de saldo
> ([budget-alerts-evolution.md](budget-alerts-evolution.md)) conseguir postar no grupo do gestor.

## Problema

- Instância: `https://evo.lonemidia.com` (host `187.77.233.97`), Evolution API **2.2.3**.
- **Envio a GRUPO** retorna `400 {"message":["Error: not-acceptable"]}`.
- **Envio a número individual (DM) funciona** normalmente.
- Os participantes dos grupos aparecem em formato **`@lid`**.

Diagnóstico: bug da **migração LID do WhatsApp/Baileys** — alvos `@lid` faziam o Baileys lançar
`BadRequestException` em envio/presença. Corrigido na série **2.3.x**, consolidado na **2.3.7**
(que trata "@lid integration issues, group message handling" e "unique constraint violations when
sending to groups").

## Alvo

Atualizar **2.2.3 → 2.3.7** (latest stable; tag fixa, **não** `latest`).

## Upgrade seguro (passo a passo)

1. **Backup antes de tudo** (há migração de schema entre 2.2.x e 2.3.x):
   - dump do **banco Postgres** da Evolution;
   - backup do **volume de instâncias** (`/evolution/instances`) e do **Redis**, se usado.
2. No `docker-compose.yml`, fixar a tag da imagem em **`v2.3.7`** (mesmo repositório já em uso —
   ex.: `atendai/evolution-api:v2.3.7` ou `evoapicloud/evolution-api:v2.3.7`).
3. `docker compose pull && docker compose up -d` e **acompanhar os logs**
   (`docker compose logs -f`) para confirmar a migração do banco sem erro.
4. **Revisar breaking changes** entre 2.2.3 e 2.3.x (variáveis de ambiente / config de banco) —
   ver as release notes da 2.3.0.
5. **Reconectar as 4 instâncias**: `Julio_gestor`, `agent-prospec`, `Ph lone midia`, `CL`.
   Conferir em `GET /instance/fetchInstances` se todas voltam com `state:"open"`; se alguma ficar
   `connecting`/`close`, reparear o **QR** pelo `/manager`.
6. **Validar** com envio de teste a um grupo (deve retornar `key.id`, não `not-acceptable`):
   ```bash
   curl -X POST "https://evo.lonemidia.com/message/sendText/Julio_gestor" \
     -H "apikey: <APIKEY_DA_INSTANCIA>" -H "Content-Type: application/json" \
     -d '{"number":"120363418195771831@g.us","text":"teste pós-upgrade"}'
   ```
7. **Rollback** se algo quebrar: voltar a tag para `v2.2.3`, `docker compose up -d`, e restaurar o
   backup do banco/volume.

⚠️ O `up -d` reinicia o container e **desconecta as 4 instâncias por alguns instantes** — agendar
num horário de baixo movimento.

## Quando voltar a funcionar

Do lado do lone-os não há mais nada a codar. Para ativar o digest:
1. `EVOLUTION_API_URL/API_KEY/INSTANCE` no env do `loneos-app` (instância `Julio_gestor`).
2. `update agency_settings set value='120363418195771831@g.us' where key='traffic_alert_group_jid';`
3. Aplicar a migration `047_budget_digest.sql`.
4. Ligar o crontab seg/qua/sex (ver [budget-alerts-evolution.md](budget-alerts-evolution.md)).

## Referências
- CHANGELOG: https://github.com/EvolutionAPI/evolution-api/blob/main/CHANGELOG.md
- Issue LID: https://github.com/EvolutionAPI/evolution-api/issues/1872
