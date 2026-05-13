# Meta API — Padrão de desenvolvimento

Guia para qualquer desenvolvedor que precise adicionar novas chamadas à API Meta.

---

## Regra principal

**Novas chamadas de insights server-side devem usar `metaInsightsFetch()`** de `lib/meta/client.ts`.

Isso garante automaticamente:
- `action_attribution_windows: ["7d_click","1d_view"]` em todas as chamadas
- `time_range` em vez de `date_preset` (controle explícito de período)
- Parâmetros consistentes com o que o Gerenciador de Anúncios usa por padrão

---

## Como usar

```typescript
import { metaInsightsFetch } from "@/lib/meta/client";
import { getDateRangeBRT } from "@/lib/meta/timezone";

// Buscar insights dos últimos 7 dias em BRT
const { since, until } = getDateRangeBRT(7);

const rows = await metaInsightsFetch(`/${accountId}/insights`, {
  accessToken: token,
  fields: "date_start,date_stop,spend,impressions,actions",
  timeRange: { since, until },
  timeIncrement: 1,
});
```

---

## Regras de timezone

**Nunca usar `toISOString()` para construir datas de relatório.**
Use sempre as helpers de `lib/meta/timezone.ts`:

```typescript
import { getDateRangeBRT, toBRTDateStr } from "@/lib/meta/timezone";

// ✅ Correto — BRT
const { since, until } = getDateRangeBRT(30);

// ❌ Errado — UTC, pode pegar dia errado entre 21h–00h BRT
const since = new Date().toISOString().slice(0, 10);
```

---

## Contagem de mensagens

**Nunca somar action_types de mensagem — usar `countMessagesFromActions()`.**

```typescript
import { countMessagesFromActions } from "@/lib/meta/messages";

const msgs = countMessagesFromActions(row.actions);
```

A função usa prioridade (primeiro match), evitando double-counting.
Ver `lib/meta/messages.ts` para a lista de tipos suportados e a explicação do problema.

---

## Arquivos server-side (seguem todas as regras)

| Arquivo | Status |
|---------|--------|
| `lib/meta/api.ts` | ✅ Correto — usa `getDateRangeBRT` e `attribution_windows` |
| `lib/meta/client.ts` | ✅ Wrapper — use para novas funções |
| `lib/meta/messages.ts` | ✅ Fonte única de contagem de msgs |
| `lib/meta/timezone.ts` | ✅ Helpers de BRT |
| `lib/portal/buildSnapshot.ts` | ✅ Correto |
| `app/api/system/defense-scan/route.ts` | ✅ Correto |

## Arquivos client-side (regras diferentes)

| Arquivo | Observação |
|---------|-----------|
| `lib/meta/useMetaAds.ts` | Hook de browser — usa `date_preset` e auth via token do usuário. Exempt do wrapper. Contagem de mensagens própria (`countMessages`) é equivalente e correta. |

---

## Validação (CI ou revisão de PR)

Novo código server-side não deve chamar `fetch()` diretamente para `graph.facebook.com`.
Verificar com:

```bash
grep -rn "graph.facebook.com" lib/ app/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v "lib/meta/useMetaAds.ts" \
  | grep -v "lib/meta/config.ts" \
  | grep -v "lib/meta/client.ts"
```

Qualquer resultado desta query em código server-side é candidato a revisão.

**Isenções conhecidas e justificadas:**

| Arquivo | Motivo |
|---------|--------|
| `app/api/traffic/ad-accounts/route.ts` | Busca metadados de conta (id, nome, status) — sem actions, sem attribution |
| `app/api/meta/exchange-token/route.ts` | OAuth token exchange — sem insights |
