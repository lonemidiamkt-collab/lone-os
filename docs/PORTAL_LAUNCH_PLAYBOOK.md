# Portal de Resultados — Playbook de Lançamento

Checklist operacional para liberar o portal para clientes reais.
Executar nesta ordem, com validação manual em cada etapa.

---

## Pré-requisitos (antes de qualquer coisa)

- [ ] Sentry configurado e recebendo eventos (`SENTRY_DSN` no VPS)
- [ ] Subdomínio `resultados.lonemidia.com` funcionando com HTTPS
- [ ] Migration `042_public_report_portal.sql` aplicada em produção
- [ ] `CRON_SECRET` definido no `.env` do VPS

---

## Etapa 1 — Warm-up de snapshots

Rodar **2 horas antes** de enviar os links aos clientes.
Isso pré-popula o cache de todos os períodos para cada cliente ativo,
evitando latência alta e risco de rate limit no primeiro acesso.

```bash
curl -s -X POST https://painel.lonemidia.com/api/system/warmup-snapshots \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" | jq
```

**Resposta esperada:**
```json
{
  "clients_processed": 12,
  "snapshots_generated": 48,
  "snapshots_failed": 0,
  "log": [
    { "client": "Armazém do Ferr0", "period": "last_week",   "status": "ok" },
    { "client": "Armazém do Ferr0", "period": "last_2_weeks","status": "ok" },
    { "client": "Armazém do Ferr0", "period": "this_month",  "status": "ok" },
    { "client": "Armazém do Ferr0", "period": "last_month",  "status": "ok" }
  ]
}
```

**Como verificar no banco:**
```sql
SELECT client_id, period_kind, generated_at
FROM client_report_snapshots
ORDER BY generated_at DESC
LIMIT 20;
```

**Se `snapshots_failed > 0`:** verificar o campo `log` para identificar qual cliente/período falhou. Causas comuns:
- Token Meta expirado para o cliente
- Conta Meta sem dados no período selecionado
- Rate limit (aguardar 15min e rodar novamente só para os clientes falhados)

---

## Etapa 2 — Cliente piloto

Antes de liberar para todos:

1. Escolher 1 cliente com conta Meta ativa e dados recentes
2. Gerar token via `PortalManagementCard` no painel interno (`/clients/[id]` → aba Dados)
3. Validar o snapshot gerado: KPIs batem com relatório interno?
4. Enviar link via WhatsApp e colher feedback em 48h
5. Monitorar log de acessos no banco:
   ```sql
   SELECT * FROM public_report_access_log ORDER BY accessed_at DESC LIMIT 20;
   ```

---

## Etapa 3 — Lançamento para demais clientes

Após piloto aprovado:

1. Gerar tokens para todos os clientes elegíveis via `PortalManagementCard`
2. Rodar warm-up novamente (Etapa 1) se passou mais de 6h desde o último
3. Enviar links individualmente via WhatsApp com a mensagem personalizada configurada
4. Monitorar `public_report_access_log` nas primeiras 24h

---

## Cron de snapshots (manutenção diária)

O cron mantém os snapshots atualizados automaticamente.
Verificar se está configurado no VPS:

```bash
crontab -l | grep generate-snapshots
```

Deve aparecer:
```
0 9 * * * /opt/loneos/scripts/generate-snapshots-cron.sh
```

Se não aparecer: consultar `docs/CRON_SCHEDULE.md` para configurar.

---

## Rollback de acesso

Para revogar o acesso de um cliente ao portal:

```bash
curl -X POST https://painel.lonemidia.com/api/clients/{client_id}/portal/revoke \
  -H "Authorization: Bearer {admin_token}"
```

O link existente passa a retornar 404. Para reativar, gerar novo token via `rotate`.
