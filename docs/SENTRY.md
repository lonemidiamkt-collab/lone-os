# Sentry — Monitoramento de Erros

Lone OS usa `@sentry/nextjs` para capturar erros em todos os três runtimes:
browser, Node.js server e Edge.

---

## Acesso ao painel

**URL:** https://lone-midia.sentry.io (substituir pelo slug correto da org)  
**Projeto:** lone-os-portal

---

## Variáveis de ambiente necessárias

| Variável | Runtime | Descrição |
|----------|---------|-----------|
| `NEXT_PUBLIC_SENTRY_DSN` | Browser | DSN público (bakeado no bundle) |
| `SENTRY_DSN` | Server / Edge | DSN server-side |
| `SENTRY_AUTH_TOKEN` | Build | Upload de source maps (opcional mas recomendado) |
| `SENTRY_ORG` | Build | Slug da organização Sentry |
| `SENTRY_PROJECT` | Build | Slug do projeto Sentry |

**Para ativar em produção:** adicionar as variáveis ao `.env` do VPS e rebuildar o container.

---

## Arquitetura dos arquivos

| Arquivo | Runtime | Função |
|---------|---------|--------|
| `instrumentation-client.ts` | Browser | Init client, Replay, `onRouterTransitionStart` |
| `sentry.server.config.ts` | Node.js | Init server, `includeLocalVariables`, PII filter |
| `sentry.edge.config.ts` | Edge | Init edge (middleware, edge routes) |
| `instrumentation.ts` | Server boot | Carrega configs server/edge + `onRequestError` |
| `app/global-error.tsx` | React | Captura erros no root layout (App Router) |

---

## Tags úteis para filtrar no painel

| Tag | Valor | Quando aparece |
|-----|-------|---------------|
| `meta_api_call` | `true` | Erro em qualquer chamada à Meta Graph API |
| `portal_endpoint` | `true` | Erro em `/api/portal/*` ou geração de snapshot |
| `cron_endpoint` | `true` | Erro em `/api/system/generate-snapshots` |

**Como filtrar no Sentry:** Issues → Filters → Tags → `meta_api_call:true`

---

## Breadcrumbs automáticos

`lib/meta/client.ts` adiciona um breadcrumb a cada chamada de insights:

```
category: "meta-api"
message:  "GET /act_123/insights"
data:     { since: "2026-05-06", until: "2026-05-12", level: "ad" }
```

Quando um erro de Meta API ocorre, o histórico completo de chamadas fica visível no Sentry.

---

## Como adicionar contexto em novas API routes

```typescript
import * as Sentry from "@sentry/nextjs";

// Em qualquer route handler:
Sentry.setContext("meu_contexto", { client_id: "...", period_kind: "last_week" });
Sentry.setTag("portal_endpoint", "true");
```

---

## Filtros PII (LGPD)

`beforeSend` em `sentry.server.config.ts` e `instrumentation-client.ts` remove automaticamente:
- `cpf_cnpj`, `password`, `facebook_password`, `facebook_login`
- `token`, `access_token`, `meta_token`, `service_role_key`
- Header `Authorization` (server)

Rate-limit warnings da Meta API são descartados (`return null`) — são esperados, não são bugs.
Erros de extensões de browser são descartados no client.

---

## Tunnel route (anti ad-blockers)

Eventos do Sentry passam por `/monitoring` (rota interna do Next.js) em vez de ir direto para `sentry.io`.
Isso evita bloqueio por ad-blockers (uBlock Origin, Brave, etc.).

Configurado em `next.config.ts` via `tunnelRoute: "/monitoring"`.
A rota `/monitoring` está na lista pública do middleware — sem autenticação necessária.

---

## Limites do free tier

| Recurso | Limite/mês | Gestão |
|---------|-----------|--------|
| Erros | 5.000 | `tracesSampleRate: 0.1` em produção |
| Transações | 10.000 | 10% de amostragem reduz o volume |
| Session Replays | 50 | `replaysSessionSampleRate: 0.05` |
| Retenção | 90 dias | — |

**Quando considerar upgrade:** se o volume de erros reais exceder 3.000/mês com frequência.

---

## Source maps (stack traces legíveis)

Sem source maps, stack traces mostram código minificado. Para ativar:

1. Gerar auth token em https://sentry.io/settings/auth-tokens/ (escopos: `project:releases`, `org:read`)
2. Adicionar ao `.env` do VPS: `SENTRY_AUTH_TOKEN=sntrys_...`
3. Rebuildar o container — source maps são enviados automaticamente no `next build`

---

## Verificação rápida

Para confirmar que o Sentry está funcionando em produção:

```bash
# No painel Sentry, Issues > All Issues — deve aparecer em <30s após um erro real
# Para testar manualmente, adicionar temporariamente em qualquer API route:
throw new Error("Sentry test — remover depois")
```
