# Portal de Resultados — Checklist pré-lançamento

Itens obrigatórios antes de liberar o portal para clientes reais.

---

## 1. Sentry ✅ CONCLUÍDO

- [x] Criar projeto "lone-os-portal" no Sentry
- [x] Adicionar `SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_DSN` ao `.env` do VPS
- [x] Instalar SDK `@sentry/nextjs@10.53.1` + configurar 3 runtimes
- [x] `instrumentation.ts` + `onRequestError` + `global-error.tsx`
- [x] Tunnel `/monitoring` (anti ad-blockers) — Edge runtime
- [x] PII filter LGPD (CPF, senhas, tokens)
- [x] Breadcrumbs e tags em rotas críticas (meta_api_call, portal_endpoint, cron_endpoint)
- [x] Verificar que erros chegam ao Sentry — ✅ confirmado ao vivo
- [ ] **PENDENTE:** `SENTRY_AUTH_TOKEN` no VPS para upload de source maps
  - Gerar em: sentry.io → Settings → Auth Tokens → Create (escopos: `project:releases` + `org:read`)
  - Adicionar ao `.env` do VPS: `SENTRY_AUTH_TOKEN=sntrys_...`
  - Também: `SENTRY_ORG=<slug-da-org>` e `SENTRY_PROJECT=lone-os-portal`
  - Rebuildar container após adicionar

## 2. Subdomínio resultados.lonemidia.com ✅ CONCLUÍDO

- [x] Adicionar registro CNAME `resultados` → `painel.lonemidia.com` no Cloudflare
- [x] Configurar `NEXT_PUBLIC_PORTAL_DOMAIN=https://resultados.lonemidia.com` no VPS
- [x] Nginx `resultados.lonemidia.com` configurado e ativo
- [x] Cloudflare proxy (modo laranja) ativo — HTTPS automático
- [x] Testar HTTPS: HTTP/2 200 ✅
- [x] X-Robots-Tag: noindex, nofollow ✅ (via middleware Next.js)

## 3. Testes funcionais ✅ CONCLUÍDO

- [x] Token inválido → `not-found.tsx` customizado (🔒 "Link expirado ou inválido")
- [x] Token revogado → mesmo 404 customizado
- [x] Warmup de snapshots disponível (`POST /api/system/warmup-snapshots`)
- [x] CPA com divisão por zero → exibe "—" (testado em staging)
- [ ] Testar troca de período com loading state — **fazer com cliente piloto**
- [ ] Testar drill-down de criativo — **fazer com cliente piloto**
- [ ] Testar botão WhatsApp com texto pré-preenchido — **fazer com cliente piloto**
- [ ] Testar em mobile (iOS Safari + Android Chrome) — **fazer com cliente piloto**

## 4. Cliente piloto ⏳ PRÓXIMO PASSO

Clientes com portal já ativado:
- **Araruama Tintas** (`act_1258929028294887`)
- **Armazém do ferr0** (`act_842086772797645`) — caso original do BUG-1

Passos:
- [ ] Rodar warmup de snapshots (2h antes de enviar o link)
- [ ] Gerar/confirmar token via PortalManagementCard no painel
- [ ] Validar snapshot: KPIs batem com Gerenciador Meta?
- [ ] Enviar link `https://resultados.lonemidia.com/portal/{token}` via WhatsApp
- [ ] Monitorar `public_report_access_log` por 48h
- [ ] Checar Sentry por erros nas primeiras 24h

---

> Source maps (item pendente do Sentry) não bloqueiam o lançamento —
> erros chegam ao painel com stack traces minificados, mas ainda identificáveis.
> Configurar em paralelo ou na primeira semana pós-lançamento.
