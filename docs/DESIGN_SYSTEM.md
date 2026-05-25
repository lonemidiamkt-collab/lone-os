# Design System v2 — Lone OS

Fundação visual para a Onda UI-1. Tokens de cor, tipografia e 5
componentes-base prontos para uso nas novas telas do sistema.

**Preview visual:** `http://localhost:3000/dev/tokens` (dev) ou
`https://painel.lonemidia.com/dev/tokens` (prod — só admin/manager)

---

## Tokens de Cor

Todos os tokens usam o prefixo `lone-` para garantir coexistência com
o sistema visual anterior (`--background`, `--primary`, etc).

### Quando usar cada grupo

| Grupo | Token | Use quando |
|---|---|---|
| **Fundos** | `lone-bg-primary` | Fundo da página, áreas de layout externo |
| | `lone-bg-card` | Cards, painéis, sidebars |
| | `lone-bg-elevated` | Hover states, dropdowns, tooltips |
| **Bordas** | `lone-border` | Divisórias, bordas de card padrão |
| | `lone-border-strong` | Bordas em foco, hover, selecionado |
| **Texto** | `lone-text-primary` | Títulos, valores principais, conteúdo importante |
| | `lone-text-secondary` | Texto de apoio, descrições, labels |
| | `lone-text-tertiary` | Metadados, timestamps, captions |
| | `lone-text-disabled` | Placeholders, itens desabilitados |
| **Marca** | `lone-brand` | CTAs, elementos de destaque, links |
| | `lone-brand-soft` | Texto sobre fundo de marca (badges, ícones) |
| | `lone-brand-bg-soft` | Fundo de avatar, badge de marca |
| **Semântico** | `lone-danger` | Erros, alertas críticos, clientes em risco |
| | `lone-warning` | Avisos, itens que precisam atenção |
| | `lone-success` | Confirmações, status positivo, métricas boas |
| | `lone-info` | Informações neutras, onboarding, dicas |

### Como usar no Tailwind

```tsx
// Cor de fundo
<div className="bg-lone-bg-card">

// Texto
<p className="text-lone-text-secondary">

// Borda
<div className="border border-lone-border hover:border-lone-border-strong">

// Semântico
<span className="text-lone-danger">Em risco</span>
```

### Como usar via CSS variable (inline ou CSS módulo)

```tsx
style={{ backgroundColor: "var(--lone-brand-bg-soft)" }}
```

---

## Tipografia

### Fontes carregadas

| Família | Classe Tailwind | CSS Variable | Uso |
|---|---|---|---|
| Inter | `font-inter` | `--font-inter` | Textos, labels, UI em geral (novos componentes) |
| JetBrains Mono | `font-jetbrains` | `--font-jetbrains-mono` | IDs, timestamps, hashes, valores técnicos |
| Montserrat | `font-sans` (padrão) | `--font-montserrat` | Sistema existente — não alterar |

### Escala tipográfica

| Token | Tamanho | Peso | Uso recomendado |
|---|---|---|---|
| `text-lone-hero` | 28px / 1.1 | 500 | Títulos de dashboard, hero de seção |
| `text-lone-h1` | 22px / 1.2 | 500 | Cabeçalhos de página, modais |
| `text-lone-h2` | 15px / 1.3 | 500 | Títulos de card, seção |
| `text-lone-body` | 13px / 1.5 | 400 | Texto padrão, descrições |
| `text-lone-caption` | 11px / 1.4 | 400 | Metadados, labels secundárias |
| `text-lone-eyebrow` | 10px / 1.4 | 500 | Labels uppercase, categorias |

```tsx
// Título de seção
<h2 className="text-lone-h2 font-inter font-medium text-lone-text-primary">
  Foco do dia
</h2>

// Eyebrow + seção
<p className="text-lone-eyebrow font-inter tracking-[1.5px] text-lone-text-tertiary uppercase">
  Relatórios
</p>

// Dado técnico em mono
<span className="font-jetbrains text-lone-body text-lone-text-secondary">
  act_1207177640402171
</span>
```

---

## Componentes

Todos em `components/lone-ui/`. Import via barrel:

```ts
import { KPICard, PillBadge } from "@/components/lone-ui";
```

---

### `KPICard`

Cartão de métrica com label, valor, caption opcional e accent bar colorida.

```tsx
import { KPICard } from "@/components/lone-ui";

// Simples
<KPICard label="Ativos" value={34} caption="clientes" />

// Com tone e accent bar
<KPICard
  label="Em risco"
  value={3}
  caption="precisam atenção"
  tone="danger"
  accent
/>

// Clicável
<KPICard
  label="Ver clientes"
  value={34}
  tone="default"
  onClick={() => router.push("/clients")}
/>
```

**Props:**

| Prop | Tipo | Padrão | Descrição |
|---|---|---|---|
| `label` | `string` | — | Eyebrow uppercase |
| `value` | `string \| number` | — | Número ou texto principal |
| `caption` | `string?` | — | Texto pequeno abaixo do valor |
| `icon` | `ReactNode?` | — | Ícone ao lado do label |
| `tone` | `default \| danger \| warning \| success \| info` | `default` | Cor do valor e accent |
| `accent` | `boolean?` | `false` | Barra lateral colorida |
| `onClick` | `() => void?` | — | Torna o card clicável |

---

### `SectionDivider`

Divisor de seção com label eyebrow + linha horizontal + badge opcional.

```tsx
import { SectionDivider } from "@/components/lone-ui";

<SectionDivider label="Foco do dia" />
<SectionDivider label="Equipe" badge="6 membros" />
```

**Props:**

| Prop | Tipo | Padrão | Descrição |
|---|---|---|---|
| `label` | `string` | — | Texto eyebrow uppercase |
| `badge` | `string?` | — | Badge à direita da linha |

---

### `TeamMemberRow`

Linha de membro da equipe com avatar, nome/role e métrica opcional.

```tsx
import { TeamMemberRow } from "@/components/lone-ui";

<TeamMemberRow
  name="Carlos Augusto"
  role="Social Media"
  initials="CA"
  metric={{ label: "posts", value: "14" }}
/>

// Com tone na métrica
<TeamMemberRow
  name="Pedro Henrique"
  initials="PH"
  metric={{ label: "pendentes", value: "3", tone: "warning" }}
  last  // remove separador inferior
/>
```

**Props:**

| Prop | Tipo | Padrão | Descrição |
|---|---|---|---|
| `name` | `string` | — | Nome do membro |
| `role` | `string?` | — | Cargo/função |
| `initials` | `string` | — | 1-2 caracteres para o avatar |
| `metric` | `{ label, value, tone? }?` | — | Métrica à direita |
| `last` | `boolean?` | `false` | Remove borda inferior |

---

### `AlertBanner`

Banner de alerta com ícone, título, descrição e ação opcional.

```tsx
import { AlertBanner } from "@/components/lone-ui";

<AlertBanner
  tone="danger"
  title="3 clientes em risco"
  description="Sem interação há mais de 7 dias."
  icon={<AlertTriangleIcon size={14} />}
  action={{ label: "Ver clientes", onClick: () => {} }}
/>
```

**Props:**

| Prop | Tipo | Padrão | Descrição |
|---|---|---|---|
| `tone` | `danger \| warning \| success \| info` | — | **Obrigatório.** Define cor do banner |
| `title` | `string` | — | Título em peso 500 |
| `description` | `string?` | — | Texto descritivo |
| `icon` | `ReactNode?` | — | Ícone à esquerda |
| `action` | `{ label, onClick }?` | — | Botão de ação à direita |

> Renderiza com `role="alert"` para acessibilidade.

---

### `PillBadge`

Badge em pílula com 6 tones e 2 tamanhos.

```tsx
import { PillBadge } from "@/components/lone-ui";

<PillBadge tone="success">Ativo</PillBadge>
<PillBadge tone="danger" size="md">Em risco</PillBadge>
<PillBadge tone="brand" icon={<StarIcon size={10} />} size="md">Premium</PillBadge>
```

**Props:**

| Prop | Tipo | Padrão | Descrição |
|---|---|---|---|
| `tone` | `default \| brand \| danger \| warning \| success \| info` | `default` | Cor da badge |
| `size` | `sm \| md` | `sm` | Tamanho (`sm`: 10px, `md`: 11px) |
| `icon` | `ReactNode?` | — | Ícone antes do texto |

---

## Como adicionar um novo componente

1. **Cria o arquivo** em `components/lone-ui/MeuComponente.tsx`

2. **Estrutura base:**
```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Variants (se tiver tones/sizes)
const meuComponente = cva("/* classes base */", {
  variants: {
    tone: {
      default: "text-lone-text-primary",
      danger:  "text-lone-danger",
      // ...
    },
  },
  defaultVariants: { tone: "default" },
});

// Props
export interface MeuComponenteProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof meuComponente> {
  label: string;
  // ...
}

// Componente
const MeuComponente = React.forwardRef<HTMLDivElement, MeuComponenteProps>(
  ({ tone, label, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(meuComponente({ tone }), className)}
        {...props}
      >
        {label}
      </div>
    );
  },
);

MeuComponente.displayName = "LoneUI.MeuComponente";

export { MeuComponente };
```

3. **Exporta no barrel** `components/lone-ui/index.ts`:
```ts
export { MeuComponente }      from "./MeuComponente";
export type { MeuComponenteProps } from "./MeuComponente";
```

4. **Adiciona à página `/dev/tokens`** com pelo menos 3 variações

5. **Regras obrigatórias:**
   - `forwardRef` em todo componente (permite `ref` externo)
   - `displayName = "LoneUI.NomeComponente"`
   - Classes de cor sempre via `lone-*` tokens ou CSS vars
   - Sem dependências externas não listadas no projeto
   - `aria-hidden` em ícones decorativos

---

## Referência rápida

```tsx
// Import correto
import { KPICard, PillBadge } from "@/components/lone-ui";

// Sistema antigo — intacto, não alterar
import KPICard from "@/components/shared/KPICard";
import { Badge } from "@/components/ui/badge";
```

---

*Atualizado em 2026-05-19 — Onda UI-1 / Fase 0*
