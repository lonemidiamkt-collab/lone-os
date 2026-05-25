# Design System Audit — Lone OS v2
*Gerado em 2026-05-19 para Onda UI-1 / Fase 0*

---

## 1. Stack Visual Atual

### Tailwind CSS
- **Versão:** 3.4.19 (não v4 — sem mudanças de breaking change)
- **Config:** `tailwind.config.ts` com `theme.extend`
- **PostCSS:** `postcss.config.js` padrão (autoprefixer)
- **Pattern:** shadcn/ui — tokens definidos como CSS variables em `:root`,
  referenciados no Tailwind via `var(--variable-name)`
- **Plugins ativos:** `@tailwindcss/typography`
- **Utilities extras:** `clsx`, `tailwind-merge`, `class-variance-authority`

### Dark Mode
- **Sempre escuro** — sem toggle, sem `darkMode: 'class'` no Tailwind config
- O `<html>` não tem `class="dark"` — os CSS vars do `:root` já são dark por padrão
- Existe `.theme-light` em `globals.css` como override opcional (não está em uso)
- O `<body>` usa `bg-background text-foreground` (referencia vars)

### Radix UI
Primitivas instaladas: avatar, checkbox, dialog, dropdown-menu, label,
progress, scroll-area, select, separator, slot, tabs, tooltip.
Estilizadas via shadcn/ui pattern.

---

## 2. CSS Global

**Arquivo:** `app/globals.css`

Tokens existentes em `:root`:
```
--background, --foreground
--card, --card-foreground
--primary, --primary-foreground  (→ #0d4af5)
--muted, --muted-foreground
--border, --border-glow
--radius (→ 0.75rem)
--led-healthy/attention/critical
--glow-primary, --glow-primary-strong
--sidebar-* (7 vars)
--chart-1 a --chart-5
```

---

## 3. Fontes Carregadas

| Fonte | Carregada? | Como | Uso |
|---|---|---|---|
| **Montserrat** | ✅ | `next/font/google` em `layout.tsx` | `fontFamily.sans` — fonte principal do sistema |
| Inter | ❌ | — | Não carregada |
| JetBrains Mono | ❌ | — | Não carregada |

**Nota:** Montserrat está declarada em `fontFamily.sans`, substituindo todas as fontes sans-serif do sistema.

---

## 4. Componentes UI Existentes

### `components/ui/` (shadcn/ui — 16 arquivos)
```
Logo.tsx          avatar.tsx      badge.tsx
button.tsx        card.tsx        dialog.tsx
dropdown-menu.tsx input.tsx       label.tsx
progress.tsx      scroll-area.tsx select.tsx
separator.tsx     tabs.tsx        textarea.tsx
tooltip.tsx
```

### `components/shared/` (componentes customizados — 3 arquivos)
```
KPICard.tsx       — Card de métrica com trend, status dot, link opcional
SectionHeader.tsx — Cabeçalho de seção com título, contagem e action
SignedImage.tsx   — Imagem com URL assinada de storage
```

**KPICard existente** usa: `label, value, hint, trend, status, icon, href, emphasis`.
**SectionHeader existente** usa: `title, subtitle, action, count`.

---

## 5. Estado de Dark Mode

Sempre dark. Não tem sistema de toggle. Telas novas não precisam se preocupar com `dark:` variants — tudo é dark por default via CSS vars.

---

## 6. Recomendação: Como Criar os Tokens

### Abordagem: MIX (CSS Variables + Tailwind extend)

**Por quê mix e não só CSS vars ou só Tailwind:**
- O projeto já usa o padrão CSS vars → Tailwind (shadcn pattern)
- Manter consistência com o que existe
- CSS vars permitem uso em estilos inline e JS se necessário
- Classes Tailwind `lone-*` ficam disponíveis para qualificadores (`lone-bg-card/50`, `hover:lone-border-strong`, etc.)

**Implementação:**
1. `app/globals.css` — adicionar `--lone-*` vars no bloco `:root` existente
2. `tailwind.config.ts` — estender `theme.extend.colors` com `lone.* → var(--lone-*)`
3. Tipografia — estender `theme.extend.fontSize` com `lone-*` tokens

**Coexistência garantida:** prefixo `lone-` nunca colide com vars ou classes existentes.

---

## 7. Componentes a Criar em `components/lone-ui/`

Todos novos — nenhum duplica o que já existe:

| Componente | Conflito? | Nota |
|---|---|---|
| `KPICard` (lone-ui) | ⚠️ nome igual | API e visual completamente diferente. Fica em `lone-ui/` — coexiste com `shared/KPICard`. |
| `SectionDivider` | ✅ sem conflito | `SectionHeader` existe mas é diferente (sem linha horizontal + badge) |
| `TeamMemberRow` | ✅ sem conflito | Não existe nada similar |
| `AlertBanner` | ✅ sem conflito | Existe `badge.tsx` (shadcn) mas não banner |
| `PillBadge` | ⚠️ nome diferente | `badge.tsx` shadcn existe com API diferente. Novo nome `PillBadge` evita conflito. |

---

## 8. Questão sobre Fontes — PRECISA DE DECISÃO

O projeto usa **Montserrat** como fonte principal. A tarefa pede para adicionar **Inter** se não carregada.

**Opções:**

**A) Adicionar Inter exclusivamente para o design system v2**
Componentes `lone-ui/` usam `font-inter` (variável nova), telas antigas continuam Montserrat. Coexistência total.

**B) Não adicionar Inter — usar Montserrat no design system v2 também**
Tokens tipográficos `lone-*` usam Montserrat (já carregada). Mais simples, sem segunda fonte.

**C) Substituir Montserrat por Inter globalmente**
Fora do escopo desta fase — altera telas existentes.

> **Aguardando decisão sobre Opção A ou B antes do Fase 0.2.**

---

## 9. Confirmação de Escopo

Componentes a criar nesta fase (apenas esses 5, em `components/lone-ui/`):
- `KPICard.tsx`
- `SectionDivider.tsx`
- `TeamMemberRow.tsx`
- `AlertBanner.tsx`
- `PillBadge.tsx`

Página de preview: `app/dev/tokens/page.tsx` (apenas dev mode).

**NÃO será alterado:** nenhuma página, nenhum componente existente, nenhuma cor existente removida.
