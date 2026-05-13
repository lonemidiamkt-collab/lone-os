# Teste manual — CPA com divisão por zero

## Cenário
Cliente com investimento (spend > 0) mas sem mensagens recebidas no período.

## Como reproduzir
1. No banco, selecionar um cliente com `public_report_enabled = true`
2. Forçar snapshot com período onde `messages = 0`:
   ```sql
   -- Verificar snapshot gerado
   SELECT data->'kpis'->'cpa' AS cpa_kpi
   FROM client_report_snapshots
   WHERE client_id = '{id}';
   ```
3. Acessar o portal do cliente: `https://resultados.lonemidia.com/portal/{token}`

## Resultado esperado
- Card "Custo/msg" exibe **"—"** (travessão)
- Card não exibe badge de variação percentual
- Nenhum "R$ NaN", "R$ Infinity" ou "R$ 0,00" incorreto

## Resultado esperado no JSON do snapshot
```json
{
  "kpis": {
    "cpa": {
      "value": null,
      "delta_pct": null,
      "direction": "neutral"
    }
  }
}
```

## Notas de implementação
- `buildSnapshot.ts`: `curCpa = curMessages > 0 ? curSpend / curMessages : null`
- `PortalDashboard.tsx`: `val?.value != null ? format(val.value) : "—"`
- `types.ts`: `KpiValue.value: number | null`
