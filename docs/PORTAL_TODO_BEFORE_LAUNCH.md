# Portal de Resultados — Checklist pré-lançamento

Itens obrigatórios antes de liberar o portal para clientes reais.
Completar nesta ordem.

---

## 1. Sentry

- [ ] Criar projeto "lone-os-portal" no Sentry
- [ ] Adicionar `SENTRY_DSN` ao `.env` de produção no VPS
- [ ] Instalar SDK: `npm install @sentry/nextjs`
- [ ] Rodar `npx @sentry/wizard@latest -i nextjs` para gerar `sentry.*.config.ts`
- [ ] Verificar que erros do portal (token inválido, snapshot falha) chegam ao Sentry

## 2. Subdomínio resultados.lonemidia.com

- [ ] Adicionar registro CNAME `resultados` → `painel.lonemidia.com` no Cloudflare
- [ ] Configurar `NEXT_PUBLIC_PORTAL_DOMAIN=https://resultados.lonemidia.com` no VPS
- [ ] Adicionar bloco `server_name resultados.lonemidia.com` ao nginx.conf
- [ ] Confirmar que Cloudflare proxy (modo laranja) está ativo no novo registro
- [ ] Testar HTTPS no subdomínio com aba anônima

## 3. Plano de testes

- [ ] Executar todos os casos do `docs/PORTAL_TEST_PLAN.md`
- [ ] Testar em mobile (iOS Safari + Android Chrome)
- [ ] Testar token inválido → página de erro correta
- [ ] Testar token revogado → página de erro correta
- [ ] Testar troca de período com loading state
- [ ] Testar drill-down de criativo
- [ ] Testar botão WhatsApp (abre com texto pré-preenchido)

## 4. Cliente piloto

- [ ] Escolher 1 cliente com dados Meta reais e conta ativa
- [ ] Gerar token via PortalManagementCard
- [ ] Validar snapshot gerado (JSON faz sentido, KPIs batem com relatório interno)
- [ ] Enviar link para o cliente via WhatsApp e colher feedback
- [ ] Monitorar `public_report_access_log` por 48h
- [ ] Ajustar antes de liberar para os demais clientes

---

> Fase 5 da feature inclui configuração de Sentry e nginx como parte do deploy.
> Não liberar o portal em produção antes de todos os itens acima estarem marcados.
