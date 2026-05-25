# Meta Health — Monitoramento da Integração

Sistema de semáforo para saúde da integração com a API Meta.
Visível no dashboard principal para admin e manager.

---

## Componente visual

`components/MetaHealthCard.tsx` — card clicável que exibe:

| Semáforo | Condição |
|----------|---------|
| 🟢 Verde | Token válido, sem alertas |
| 🟡 Amarelo | Token expira em ≤14 dias |
| 🔴 Vermelho | Token expirado OU sync parado há >2h com clientes ativos |

Clicar no card abre modal com JSON completo do health check.

---

## Dados exibidos

```json
{
  "status": "green",
  "token_status": {
    "valid": true,
    "expires_at": "2026-07-10T00:00:00.000Z",
    "days_until_expiry": 58
  },
  "last_successful_sync": "2026-05-13T09:00:00Z",
  "hours_since_sync": 3.5,
  "snapshots_last_24h": { "total": 48, "success": 48, "failed": 0 },
  "rate_limit_warnings_last_24h": 0,
  "checked_at": "2026-05-13T13:00:00Z"
}
```

---

## API Route (monitoramento externo)

`GET /api/system/meta-health` — requer `Authorization: Bearer $CRON_SECRET`

```bash
curl -s https://painel.lonemidia.com/api/system/meta-health \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

Útil para integrar com ferramentas de uptime monitoring (UptimeRobot, Betterstack, etc.)
verificando o campo `status` no JSON retornado.

---

## Server action

`lib/actions/metaHealth.ts` — `getMetaHealth()` — leitura direta do banco via supabaseAdmin.
Chamada pelo componente MetaHealthCard via server action (sem expor secrets ao browser).

---

## Renovação de token

Quando `status = "red"` por token expirado:

1. Acessar `/integrations` no painel
2. Reconectar conta Meta (OAuth flow)
3. O novo token é salvo automaticamente em `agency_settings`
4. Card volta para verde na próxima verificação
