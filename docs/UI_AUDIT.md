# UI Audit — Onda 1 (Dashboard + /traffic)

**Data:** 2026-05-14  
**Branch:** refactor/ui-onda-1  
**Escopo:** app/page.tsx (1.075 linhas) + app/traffic/page.tsx (4.458 linhas)

---

## 1. Componentes shadcn instalados

`components/ui/` tem 16 componentes:

| Componente | Usado em |
|------------|----------|
| `button.tsx` | Global |
| `card.tsx` | Global (mas raramente — a maioria usa div com className manual) |
| `dialog.tsx` | Modais de formulários |
| `tabs.tsx` | Instalado mas **NÃO usado no /traffic** (usa tabs manuais com botões) |
| `badge.tsx` | Counters e status tags |
| `input.tsx` | Campos de formulário |
| `label.tsx` | Labels de form |
| `select.tsx` | Selects de formulário |
| `textarea.tsx` | Briefing |
| `progress.tsx` | Health score de clientes |
| `scroll-area.tsx` | Áreas com scroll customizado |
| `separator.tsx` | Divisores |
| `tooltip.tsx` | Tooltips |
| `avatar.tsx` | Avatares de usuário |
| `dropdown-menu.tsx` | Menus contextuais |
| `Logo.tsx` | Logo Lone Mídia |

---

## 2. KPI Cards — situação atual

### `components/MetricCard.tsx` — componente existente

Já existe e é relativamente bem estruturado. Props:
- `label`, `value`, `sub`, `trend`, `trendValue`
- `icon`, `iconColor`, `iconBg`
- `href` (opcional, torna clicável via Link)
- `onClick` (opcional, torna clicável via button)

**Visual atual:** border `#2a2a2a`, bg `#121212`, sombra `0_8px_32px`, linha azul no topo via gradiente. Border-radius `rounded-2xl`. Padding `p-5`.

**Problemas:**
- bg `#121212` hardcoded, difere do `--card: #111113` do CSS var
- Usa `rounded-2xl` mas portal usa `rounded-xl` — inconsistente
- Tamanho do value: `text-2xl` peso `font-bold` — mais fino que o proposto (28px/800)
- Linha azul no topo é decoração desnecessária
- `iconBg` e `iconColor` passados como string Tailwind em cada uso — não padronizado

**Onde é usado:**
- `app/page.tsx`: 12x (dashboard admin, dashboard employee, por role)
- `app/traffic/page.tsx`: 4x (KPIs da página de tráfego)
- Total: 16 instâncias

**Variações informais sem `<MetricCard>`** (KPIs custom inline em traffic):
- Seção de KPIs financeiros em `/traffic/budgets` — div manual
- Seção de resumo por campanha — div manual

---

## 3. Sistema de design tokens

### CSS Custom Properties (globals.css)

O sistema JÁ tem CSS vars bem definidos:

| Var | Valor | Uso |
|-----|-------|-----|
| `--background` | `#09090b` | Fundo principal |
| `--card` | `#111113` | Cards |
| `--muted` | `#0c0c0e` | Surface secundária |
| `--border` | `rgba(255,255,255,0.06)` | Bordas sutis |
| `--primary` | `#0d4af5` | Brand blue |
| `--foreground` | `#e4e4e7` | Texto principal |
| `--muted-foreground` | `#52525b` | Texto secundário |
| `--destructive` | `#ef4444` | Danger |

**Problema:** metade do código **ignora** essas vars e usa hex hardcoded.

### Tailwind config

- Fonte: `Montserrat, Inter, ui-sans-serif`
- Paleta `zinc` sobrescrita com tons escuros customizados
- `border-radius`: usa `--radius: 0.75rem` = 12px como `rounded-lg`
- Animações definidas: `fade-in` (0.3s), `slide-up` (0.3s, translateY 8px)

---

## 4. Paleta de cores efetiva em uso

### Dashboard (page.tsx)

| Hex | Ocorrências | Uso |
|-----|------------|-----|
| `#0d4af5` | 41x | Brand blue (primary) |
| `#3b6ff5` | 6x | Brand blue variant (inconsistente) |

O dashboard usa majoritariamente classes semânticas (`text-primary`, `text-muted-foreground`, etc.) — **está relativamente correto**.

### Tráfego (traffic/page.tsx)

| Hex | Ocorrências | Uso |
|-----|------------|-----|
| `#0d4af5` | 129x | Brand blue — MUITO usado diretamente |
| `#3b6ff5` | 23x | Variante azul — duplica o primary |
| `#1e1e2a` | 7x | Surface/card escuro |
| `#1a1a1a` | 6x | Background de elementos |
| `#0c0c12` | 5x | Surface ainda mais escuro |
| `#111118` | 2x | Variação extra de card |
| `#0a0a0a` | 2x | Fundo profundo |

**Problema grave:** /traffic tem 129 ocorrências de `#0d4af5` hardcoded e ~7 variações de fundo escuro diferentes. Não usa as CSS vars.

---

## 5. Tipografia em uso

### Escala atual (inconsistente)

| Contexto | Tamanho | Peso | Notas |
|----------|---------|------|-------|
| Título de página (`<Header>`) | ~20px? | `font-bold` | Não auditado no componente |
| Label de MetricCard | `text-xs` = 12px | `font-medium uppercase` | tracking-wider |
| Value de MetricCard | `text-2xl` = 24px | `font-bold` | |
| Sub de MetricCard | `text-xs` = 12px | — | color zinc-600 |
| Texto de aba (tab) | `text-sm` = 14px | `font-medium` | |
| Labels de seção (traffic) | `text-xs` | `uppercase tracking-wider` | |
| Inline KPIs custom | `text-3xl` / `text-4xl` | `font-bold` | inconsistente vs MetricCard |

**Problema:** `/traffic/page.tsx` tem KPIs inline (não usando MetricCard) com `text-3xl` e `text-4xl` que são maiores que o MetricCard padrão (`text-2xl`). Escala não tem regra documentada.

---

## 6. Estrutura atual do Dashboard (page.tsx)

O dashboard já tem lógica de role-splitting:
- `<AdminDashboard />` → para admin e manager
- `<EmployeeDashboard />` → para traffic, social, designer

**Componentes "meta" no topo (que poluem o espaço):**
1. `<PlatformUpdatesWidget />` — novidades do sistema (aparece sempre)
2. `{isAdmin && <SystemAlertBanner />}` — banner de sistema
3. `{isAdmin && <MetaHealthCard />}` — semáforo da integração Meta
4. `<SmartAlerts />` — alertas inteligentes (dentro do AdminDashboard)
5. `<MorningBriefing />` — card de IA gerado por role

Todos aparecem ANTES dos KPIs operacionais — hierarquia invertida.

---

## 7. Estrutura atual do /traffic (traffic/page.tsx)

### Tabs internas (7 tabs)
```
Rotina Diária | Status Clientes | Kanban Tarefas | Relatórios Mensais | 
Análise | Anúncios | Controle de Investimento
```

### Sidebar secondary nav (/traffic)
A sidebar já tem sub-navegação em /traffic:
```
Sidebar:
├─ Tráfego (link principal)
│  └─ Sub-itens (definidos em Sidebar.tsx linha 83):
│     └─ "Saldos & Alertas" → /traffic/budgets
```
Ou seja: sidebar só tem 1 sub-item. As outras 7 seções são TODAS tabs internas da mesma página. Não há conflito sidebar/tabs para 6 das 7 seções — apenas Saldos & Alertas está na sidebar E nas tabs.

**Diagnóstico real:** não é exatamente "sidebar + tabs duplicados" para o mesmo conteúdo, mas sim **uma única página gigante (4.458 linhas) com 7 seções escondidas em tabs**. O problema é a página monolítica, não duplicação de nav.

---

## 8. Problemas confirmados (priorizados)

| # | Problema | Impacto | Arquivo |
|---|---------|---------|---------|
| 1 | Dashboard: meta-info antes de KPIs operacionais | Alto | page.tsx |
| 2 | `/traffic` monolítico: 4.458 linhas, 7 tabs na mesma página | Alto | traffic/page.tsx |
| 3 | 129 `#0d4af5` hardcoded em /traffic (ignora CSS vars) | Médio | traffic/page.tsx |
| 4 | Escala tipográfica sem regra (text-2xl vs text-4xl para KPIs) | Médio | traffic/page.tsx |
| 5 | ~7 variações de bg escuro diferentes em /traffic | Médio | traffic/page.tsx |
| 6 | MetricCard usa bg/border hardcoded diferente do CSS var do sistema | Baixo | MetricCard.tsx |
| 7 | `<SystemAlertBanner>` e `<MetaHealthCard>` ocupam espaço mesmo sem alertas | Baixo | page.tsx |

---

## 9. O que reaproveitaremos (NÃO reescrever)

| Componente | Situação | Ação |
|-----------|---------|------|
| `MetricCard.tsx` | Bem estruturado, props flexíveis | Melhorar visual, manter API |
| shadcn `card`, `button`, `dialog` | Funcionando | Manter |
| CSS vars em globals.css | Bem definidas | Reforçar uso, parar de ignorar |
| Animações `fade-in`, `slide-up` | Boas | Manter e aplicar mais |
| Lógica admin/employee split | Boa | Manter, reorganizar visual dentro |

---

## 10. O que a Fase 1 deve fazer

1. **NÃO criar** `lib/ui/tokens.ts` separado — o sistema de tokens JÁ EXISTE em `globals.css` + tailwind.config. A Fase 1 deve **documentar e reforçar** os tokens existentes, não duplicar.

2. **ATUALIZAR** `MetricCard.tsx` para usar CSS vars (`bg-card`, `border-border`) em vez de hex hardcoded — mantendo a API de props.

3. **CRIAR** `components/shared/KPICard.tsx` com a especificação do plano — mas com visual alinhado ao CSS var system existente (não criar nova paleta que conflita).

4. **CRIAR** `components/shared/SectionHeader.tsx` — reutilizável em dashboard e traffic.

5. **DOCUMENTAR** `docs/UI_COMPONENTS.md` com escala tipográfica e tokens.
