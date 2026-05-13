# Auditoria de Métricas — Lone OS

**Data:** 2026-05-12  
**Branch:** fix/metrics-audit  
**Status:** Fase 1 completa — aguardando aprovação para Fase 2

---

## Mapeamento completo de fluxo de dados

| Métrica | Local exibido | Arquivo | Endpoint Meta | time_range | attribution | Cache |
|---------|--------------|---------|--------------|------------|-------------|-------|
| Mensagens (total período) | Portal `/portal/[token]` | `buildSnapshot.ts:173` | `GET /act_X/insights` | BRT explícito via `calcPeriod()` | **ausente** — padrão da conta | 6h em `client_report_snapshots` |
| Mensagens (série diária) | Portal gráfico | `buildSnapshot.ts:186` | `GET /act_X/insights` | BRT explícito via `calcPeriod()` | **ausente** | 6h |
| Mensagens por criativo | Portal top criativos | `buildSnapshot.ts:191` | `GET /act_X/insights?level=ad` | BRT explícito | **ausente** | 6h |
| Investido (spend) | Portal e tráfego | `buildSnapshot.ts`, `sync-balances` | `GET /act_X/insights` | BRT (portal) / `date_preset` (tráfego) | N/A | 6h (portal) / sync (tráfego) |
| CPA (custo/mensagem) | Portal | `buildSnapshot.ts` | calculado: spend ÷ mensagens | — | via mensagens | 6h |
| Alcance (reach) | Portal | `buildSnapshot.ts` | `GET /act_X/insights` | BRT | **ausente** | 6h |
| Mensagens por campanha | `/traffic` interno | `useMetaAds.ts:491` | `GET /campaign_id/insights` | `date_preset` ou UTC custom | **ausente** | sem cache |
| current_month_spend | `/traffic/budgets` | `account-balance.ts:245` | batch `GET /act_X/insights` | UTC `YYYY-MM-01 → hoje` | N/A | sem cache |
| Anomalia de volume | defense-scan | `api.ts:getAccountInsights` | `GET /act_X/insights` | **UTC** (`.toISOString()`) | **ausente** | sem cache |

---

## Bugs confirmados com evidência numérica

### BUG-1 — CRÍTICO: Double-counting em `extractConversions` (Categoria E)

**Arquivo:** `lib/meta/api.ts:268`  
**Callers:** `buildSnapshot.ts` (portal), `defense-scan/route.ts`  
**Não afeta:** `/traffic` interno (usa `countMessages` de `useMetaAds.ts`)

**Código atual:**
```typescript
// lib/meta/api.ts:268
const convTypes = ["offsite_conversion", "lead",
  "onsite_conversion.messaging_conversation_started_7d", "omni_purchase"];
for (const action of actions) {
  if (convTypes.some((t) => action.action_type.includes(t))) {
    total += parseInt(action.value, 10) || 0;  // SOMA TUDO
  }
}
```

**Código correto (já existe em `useMetaAds.ts:383`):**
```typescript
// lib/meta/useMetaAds.ts:383
function countMessages(actions) {
  for (const type of MESSAGE_ACTION_TYPES) {
    const found = actions.find((a) => a.action_type === type);
    if (found) return safeInt(found.value);  // RETORNA PRIMEIRO MATCH
  }
  return 0;
}
```

**Como a Meta retorna os dados (típico para Click-to-WhatsApp):**
```json
[
  { "action_type": "onsite_conversion.total_messaging_connection", "value": "40" },
  { "action_type": "onsite_conversion.messaging_conversation_started_7d", "value": "37" }
]
```

**Resultado:**
- `extractConversions` (portal): 40 + 37 = **77** ← INFLADO
- `countMessages` (tráfego): **40** ← correto (primeiro match: `total_messaging_connection`)

**Caso confirmado — Armazém do ferr0:**
> "Portal mostrou 77 mensagens em um único dia, não ocorreu isso."  
> Diagnóstico: `total_messaging_connection` (40) + `messaging_conversation_started_7d` (37) = 77  
> Os dois tipos são sobrepostos — `total_messaging_connection` JÁ inclui todas as conversas.

---

### BUG-2 — ALTO: `includes()` em vez de `===` conta pixel events como mensagens (Categoria E)

**Arquivo:** `lib/meta/api.ts:273`

```typescript
convTypes.some((t) => action.action_type.includes(t))
//                                        ^^^^^^^^^
// SUBSTRING match, não exact match
```

`"offsite_conversion"` é prefixo de qualquer ação de pixel:
- `offsite_conversion.fb_pixel_purchase` → `.includes("offsite_conversion")` = **TRUE** → contado como mensagem
- `offsite_conversion.fb_pixel_lead` → **TRUE**
- `offsite_conversion.fb_pixel_add_to_cart` → **TRUE**

**Impacto:** Contas que têm pixel Meta configurado E campanhas de mensagem no mesmo período somam eventos de e-commerce como "mensagens recebidas". Não afeta Armazém diretamente (campanha pura de mensagens, sem pixel), mas afeta clientes que têm ambos.

---

### BUG-3 — MÉDIO: Timezone UTC em `getAccountInsights` e `getCampaignInsights` (Categoria A)

**Arquivo:** `lib/meta/api.ts:116-122` e `api.ts:146-152`

```typescript
const yesterday = new Date();              // UTC agora
yesterday.setDate(yesterday.getDate() - 1);
const sinceStr = since.toISOString().slice(0, 10);  // UTC → "YYYY-MM-DD"
```

Se gerado às 23:00 BRT (= 02:00 UTC do dia seguinte), `yesterday` em UTC já virou o dia correto, mas em BRT ainda seria ontem. Diferença de até 3h.

**Funções afetadas:**
- `getAccountInsights` → usado pelo `defense-scan` ⚠️
- `getCampaignInsights` → não usado diretamente pelo portal (portal usa `getInsightsByDateRange`)

**Funções NÃO afetadas (corretas):**
- `buildSnapshot.ts` usa `toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })` ✅
- `fetchCampaignInsights` (useMetaAds) usa `date_preset` para períodos padrão → Meta gerencia timezone ✅

**Impacto:** defense-scan pode detectar anomalias no dia errado quando gerado entre 21h–00h BRT. Portal NÃO é afetado.

---

### BUG-4 — MÉDIO: `action_attribution_windows` nunca passado (Categoria B)

**Nenhum arquivo** passa `action_attribution_windows` nas chamadas à Meta API.

Sem esse parâmetro, a Meta usa a janela padrão da conta (`7d_click + 1d_view` para a maioria). Se o cliente configurou janela diferente no Gerenciador, os números divergem porque ele compara com a janela configurada na conta, e o portal usa a janela padrão da API.

**Como confirmar:** verificar nas configurações da conta Meta do cliente qual janela está ativa. Se diferir de `7d_click + 1d_view`, qualquer número de mensagens será diferente.

---

## Bugs suspeitos (sem evidência numérica ainda)

### SUSPEITO-1 — Categoria D: Duas fontes de spend

- Portal: `/act_X/insights` (account-level) → inclui campanhas deletadas no período
- Tráfego: soma por campanha → exclui campanhas deletadas se não listadas

Hipótese: cliente pausou campanha no meio do período. Portal conta o spend dela, tráfego não lista mais. Divergência de X% do spend da campanha pausada.

**Como confirmar:** comparar soma das campanhas ativas vs total da conta para o mesmo período no banco.

### SUSPEITO-2 — Categoria G: Cache 6h mascara geração recente

Se snapshot foi gerado antes de campanhas do dia fecharem (ex: gerado às 08h, campanha rodou o dia todo), o dado de "ontem" pode estar incompleto porque a atribuição diferida ainda não consolidou.

**Como confirmar:** comparar snapshot gerado às 08h vs às 20h do mesmo dia.

---

## Resumo executivo

| Bug | Categoria | Impacto | Evidência | Prioridade fix |
|-----|-----------|---------|-----------|----------------|
| BUG-1: double-counting `extractConversions` | E | CRÍTICO — inflação direta de mensagens | ✅ Confirmado numericamente (caso Armazém) | 1 |
| BUG-2: `includes()` conta pixel events | E | ALTO — contas com pixel contam conversions como msgs | ✅ Código analisado | 2 |
| BUG-3: timezone UTC em funções legadas | A | MÉDIO — defense-scan, não portal | ✅ Código analisado | 3 |
| BUG-4: sem `action_attribution_windows` | B | MÉDIO — diverge se conta usa janela não-padrão | ✅ grep confirmou ausência | 4 |
| SUSPEITO-1: duas fontes de spend | D | BAIXO | ⚠️ Sem evidência numérica | 5 |
| SUSPEITO-2: cache precoce | G | BAIXO | ⚠️ Sem evidência numérica | 6 |

---

## Proposta de correção (Fase 2 — pendente aprovação)

### Fix 1 — Substituir `extractConversions` por `countMessages` no portal
- `lib/portal/buildSnapshot.ts`: trocar `extractConversions` por função idêntica à `countMessages`
- Exportar `MESSAGE_ACTION_TYPES` e `countMessages` de `lib/meta/useMetaAds.ts` para uso compartilhado
- Ou criar `lib/meta/messages.ts` com a lógica única

### Fix 2 — Corrigir `includes()` para `===` em `extractConversions`
- Mudar `convTypes.some((t) => action.action_type.includes(t))` para `convTypes.includes(action.action_type)`
- Atualizar `convTypes` para ser exato e completo como `MESSAGE_ACTION_TYPES`

### Fix 3 — Unificar timezone
- Criar `lib/meta/timezone.ts` com helper BRT para todas as funções de data
- Atualizar `getCampaignInsights` e `getAccountInsights`

### Fix 4 — Adicionar `action_attribution_windows`
- Passar `action_attribution_windows: ["7d_click","1d_view"]` explícito em todas as calls de insights
- Documentar no footer do portal: "Atribuição: 7 dias clique + 1 dia visualização"

---

## Pós-correção (a preencher após Fase 2)

| Caso | Antes | Depois | Esperado | ✅/❌ |
|------|-------|--------|----------|------|
| Armazém — pico de 77 msgs | 77 | — | ~40 | — |
