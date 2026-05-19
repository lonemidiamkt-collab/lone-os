# API Meta — Status & Auditoria Técnica

**Lone Mídia · Documento interno**
**Data:** 13 de maio de 2026
**Versão:** 1.0 — pós Fase 2 de correções
**Branch:** fix/metrics-audit

---

## Resumo executivo

A integração com a API Meta foi auditada em maio de 2026 após o cliente Armazém do Ferr0 reportar divergência entre os números exibidos no Portal e o que aparecia no Gerenciador de Anúncios. A auditoria identificou **4 bugs confirmados** com evidência numérica. Todos os 4 foram corrigidos antes da publicação deste documento. Dois pontos de atenção adicionais (sem evidência numérica ainda) permanecem em acompanhamento. A seguir está o estado atual, completo e atualizado.

---

## O que a API Meta nos entrega

O Portal de Resultados consome dados da API Meta Graph v20+ para exibir aos clientes:

| Métrica | Endpoint | Nível |
|---------|----------|-------|
| Mensagens recebidas (total) | `GET /act_X/insights` | Conta |
| Mensagens — série diária (gráfico) | `GET /act_X/insights` | Conta |
| Mensagens por criativo (top ads) | `GET /act_X/insights?level=ad` | Anúncio |
| Investimento (spend) | `GET /act_X/insights` | Conta |
| Custo por mensagem (CPA) | calculado: spend ÷ mensagens | — |
| Alcance (reach) | `GET /act_X/insights` | Conta |
| Breakdown demográfico | `GET /act_X/insights?breakdowns=gender,age` | Conta |

O **tráfego interno** (`/traffic`) usa uma fonte diferente: busca campanha a campanha via `GET /campaign_id/insights`. Por isso, pequenas divergências entre o Portal e a tela interna são esperadas — não são bugs.

---

## Bugs corrigidos

### BUG-1 — Crítico: Double-counting de mensagens

**Arquivo original:** `lib/meta/api.ts:268` — função `extractConversions`
**Callers afetados:** Portal (`buildSnapshot.ts`) e `defense-scan`
**Status: CORRIGIDO ✅**

**O problema:**
A Meta retorna múltiplos `action_type` para o mesmo conjunto de conversas, com valores sobrepostos. A função antiga somava todos os tipos que "continham" certos prefixos:

```
onsite_conversion.total_messaging_connection  → 40 conversas
onsite_conversion.messaging_conversation_started_7d → 37 conversas (subconjunto do total acima)

Resultado errado: 40 + 37 = 77 mensagens exibidas no portal
Resultado correto: 40 mensagens (apenas o tipo agregado)
```

**Caso real — Armazém do Ferr0:**
Cliente reportou: "Portal mostrou 77 mensagens em um dia que não chegou a isso."
A investigação confirmou exatamente este duplo-cômputo.

**A correção:**
Criado o arquivo `lib/meta/messages.ts` como **fonte única de verdade** para contagem de mensagens. A lógica usa **primeiro match**, nunca soma. A ordem de prioridade dos tipos é:

1. `onsite_conversion.total_messaging_connection` — métrica agregada oficial (WhatsApp + Messenger + IG DM)
2. `onsite_conversion.messaging_conversation_started_7d` — WhatsApp Business (fallback)
3. `onsite_conversion.messaging_first_conversation_started` — Messenger / IG DM (fallback)
4. `onsite_conversion.messaging_first_reply` — fallback adicional
5. `messaging_conversation_started_7d` — formato legado
6. `onsite_conversion.whatsapp_business_messaging_conversation_started_7d` — formato novo WA
7. `onsite_conversion.engagement` — Click-to-WhatsApp via objetivo Engajamento

Os arquivos `buildSnapshot.ts` e `defense-scan/route.ts` foram atualizados para usar `countMessagesFromActions()` em vez de `extractConversions`.

---

### BUG-2 — Alto: Match por substring contava eventos de pixel como mensagens

**Arquivo original:** `lib/meta/api.ts:273`
**Status: CORRIGIDO ✅** (implicitamente pelo BUG-1 — a nova função usa match exato)

**O problema:**
O código usava `.includes()` para comparar `action_type`, o que é uma comparação de substring. A string `"offsite_conversion"` é prefixo de qualquer evento de pixel:

```
offsite_conversion.fb_pixel_purchase  → .includes("offsite_conversion") = TRUE
offsite_conversion.fb_pixel_lead      → TRUE
offsite_conversion.fb_pixel_add_to_cart → TRUE
```

Clientes com pixel Meta configurado e campanhas de mensagem ativas no mesmo período teriam compras e leads de e-commerce somados nas "mensagens recebidas".

**A correção:**
A nova função `countMessagesFromActions()` usa `===` (igualdade exata) para todos os tipos. Nenhum evento de pixel pode ser confundido com mensagem.

---

### BUG-3 — Médio: Timezone UTC em vez de BRT

**Arquivos:** `lib/meta/api.ts` — funções `getCampaignInsights` e `getAccountInsights`
**Status: CORRIGIDO ✅**

**O problema:**
As datas de `since` e `until` eram calculadas com `new Date().toISOString().slice(0, 10)`, que retorna a data em UTC. Entre 21h e 00h no horário de Brasília, o UTC já está no dia seguinte — o período solicitado à Meta ficava defasado em 1 dia.

**A correção:**
Criado o arquivo `lib/meta/timezone.ts` com a função `getDateRangeBRT()`, que sempre usa `America/Sao_Paulo` como timezone. Todas as funções de insights foram atualizadas para usar este helper.

```
Antes: toISOString() → UTC → dia errado entre 21h–00h BRT
Depois: toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) → sempre correto
```

---

### BUG-4 — Médio: Janela de atribuição não especificada

**Arquivos:** todas as funções de insights em `lib/meta/api.ts`
**Status: CORRIGIDO ✅**

**O problema:**
Nenhuma chamada à API passava o parâmetro `action_attribution_windows`. Sem ele, a Meta usa a janela padrão da conta (geralmente `7d_click + 1d_view`), mas se o cliente tiver configurado uma janela diferente no Gerenciador, os números divergem.

**A correção:**
Adicionado `action_attribution_windows: ["7d_click","1d_view"]` explicitamente nas 4 funções de insights:
- `getCampaignInsights`
- `getAccountInsights`
- `getInsightsByDateRange`
- `getTopAdInsights`

O footer do Portal exibe agora o disclaimer: *"Atribuição: 7 dias por clique · 1 dia por visualização. Divergências de até 5% são normais por atribuição diferida."*

---

## Pontos de atenção em acompanhamento

Estes dois pontos foram identificados na auditoria mas **não têm evidência numérica confirmada ainda**. Não são bugs até que um caso real apareça.

### SUSPEITO-1: Duas fontes de spend (Portal vs Tráfego Interno)

| Fonte | Como calcula | Inclui campanhas pausadas? |
|-------|-------------|--------------------------|
| Portal | Account-level insights (`/act_X`) | Sim — soma todo spend da conta no período |
| Tráfego interno | Soma por campanha listada | Não — campanhas deletadas/não listadas ficam de fora |

**Cenário de risco:** cliente pausou uma campanha no meio do período. O Portal conta o spend dela, a tela interna não lista mais. Divergência correspondente ao gasto da campanha pausada.

**Ação:** monitorar ao vivo quando acontecer. Se confirmado, unificar as fontes.

---

### SUSPEITO-2: Cache de 6h pode capturar snapshot incompleto

Os snapshots do Portal são cacheados por 6 horas no banco. Se o snapshot for gerado às 08h, o dado de "ontem" pode estar incompleto porque a atribuição diferida do Meta não consolidou até esse horário.

**Ação:** monitorar comparando snapshot gerado às 08h vs às 20h do mesmo dia. Se a divergência for relevante, ajustar o horário do cron de geração.

---

## Estado atual da integração

### Funções no `lib/meta/api.ts`

| Função | Timezone | attribution_windows | Contagem de msgs |
|--------|----------|---------------------|-----------------|
| `getCampaignInsights` | BRT ✅ | 7d_click+1d_view ✅ | N/A |
| `getAccountInsights` | BRT ✅ | 7d_click+1d_view ✅ | N/A |
| `getInsightsByDateRange` | BRT (recebe pronto) ✅ | 7d_click+1d_view ✅ | N/A |
| `getTopAdInsights` | BRT (recebe pronto) ✅ | 7d_click+1d_view ✅ | N/A |
| `getDemographicBreakdown` | BRT (recebe pronto) ✅ | Não se aplica ✅ | N/A |
| `extractConversions` | — | — | **Legada — NÃO usar** ⚠️ |

> **Atenção:** A função `extractConversions` ainda existe no arquivo mas não é chamada por nenhum módulo ativo. Ela deve ser removida em uma limpeza futura para evitar regressão acidental.

### Contagem de mensagens

| Módulo | Função usada | Estado |
|--------|-------------|--------|
| Portal — KPIs | `countMessagesFromActions` | Correto ✅ |
| Portal — série diária | `countMessagesFromActions` | Correto ✅ |
| Portal — top criativos | `countMessagesFromActions` | Correto ✅ |
| Defense-scan | `countMessagesFromActions` | Correto ✅ |
| Tráfego interno | `countMessages` (useMetaAds.ts) | Correto ✅ (lógica equivalente) |

---

## O que falta antes de enviar o link aos clientes

O portal está tecnicamente funcional, mas há 4 itens obrigatórios antes do lançamento:

### 1. Sentry — monitoramento de erros

Sem Sentry, erros silenciosos no portal (token inválido, falha de snapshot, erro na API Meta) não chegam à equipe.

- [ ] Criar projeto "lone-os-portal" no Sentry
- [ ] Adicionar `SENTRY_DSN` ao `.env` de produção no VPS
- [ ] Instalar SDK: `npm install @sentry/nextjs`
- [ ] Rodar `npx @sentry/wizard@latest -i nextjs`
- [ ] Confirmar que erros chegam ao painel do Sentry

---

### 2. Subdomínio `resultados.lonemidia.com`

O link que vai para os clientes deve ser `https://resultados.lonemidia.com/portal/{token}`, não o subdomínio interno `painel.lonemidia.com`.

**Cloudflare:**
- [ ] Adicionar registro CNAME: `resultados` → `painel.lonemidia.com` (proxy ativado)

**VPS — nginx.conf:**
```
server {
    listen 80;
    server_name resultados.lonemidia.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- [ ] Adicionar bloco acima ao nginx.conf e reiniciar nginx
- [ ] Configurar `NEXT_PUBLIC_PORTAL_DOMAIN=https://resultados.lonemidia.com` no VPS
- [ ] Testar HTTPS em aba anônima

---

### 3. Testes funcionais

- [ ] Token inválido → exibe página de erro correta
- [ ] Token revogado → exibe página de erro correta
- [ ] Troca de período (semana / mês) com loading state
- [ ] Drill-down de criativo funciona
- [ ] Botão WhatsApp abre com texto pré-preenchido
- [ ] Testar em mobile: iOS Safari + Android Chrome

---

### 4. Cliente piloto

Antes de liberar para todos os clientes:

- [ ] Escolher 1 cliente com conta Meta ativa e dados reais
- [ ] Gerar token via PortalManagementCard (no painel interno)
- [ ] Validar snapshot: KPIs batem com relatório interno?
- [ ] Enviar link via WhatsApp e colher feedback em 48h
- [ ] Monitorar log de acessos (`public_report_access_log`)
- [ ] Ajustar antes de escalar

---

## Cronograma sugerido

| Etapa | Estimativa | Quem |
|-------|-----------|------|
| Deploy do branch fix/metrics-audit em produção | 1h | Dev |
| Configurar Sentry | 1h | Dev |
| Configurar subdomínio no Cloudflare + nginx | 30min | Dev |
| Testes funcionais completos | 2h | Dev + QA |
| Piloto com 1 cliente | 2–3 dias | Ops + Dev |
| Lançamento para demais clientes | após piloto OK | Ops |

---

## Referências técnicas

| Arquivo | Descrição |
|---------|-----------|
| `lib/meta/api.ts` | Client da API Meta (server-side) |
| `lib/meta/messages.ts` | Fonte única de contagem de mensagens |
| `lib/meta/timezone.ts` | Helpers de data em BRT |
| `lib/portal/buildSnapshot.ts` | Geração de snapshots do portal |
| `app/api/system/defense-scan/route.ts` | Varredura de anomalias |
| `docs/METRICS_AUDIT.md` | Auditoria técnica completa (Fase 1 e 2) |
| `docs/PORTAL.md` | Documentação de infraestrutura do portal |
| `docs/PORTAL_TODO_BEFORE_LAUNCH.md` | Checklist de lançamento |
