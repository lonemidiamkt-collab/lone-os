# UI Components — Lone OS Design System

Stack: Next.js 15, Tailwind CSS, shadcn/ui. Fonte: Montserrat/Inter.

---

## Tokens de cor (globals.css)

Não criar tokens paralelos. Usar sempre as CSS vars:

| Var Tailwind | CSS Var | Valor dark | Uso |
|---|---|---|---|
| `bg-background` | `--background` | `#09090b` | Fundo da página |
| `bg-card` | `--card` | `#111113` | Cards e painéis |
| `bg-muted` | `--muted` | `#0c0c0e` | Surface secundário |
| `border-border` | `--border` | `rgba(255,255,255,0.06)` | Bordas padrão |
| `text-foreground` | `--foreground` | `#e4e4e7` | Texto principal |
| `text-muted-foreground` | `--muted-foreground` | `#52525b` | Texto secundário |
| `text-primary` | `--primary` | `#0d4af5` | Brand blue |
| `text-destructive` | `--destructive` | `#ef4444` | Danger/erro |

**Nunca hardcodar** `#0d4af5`, `#111113`, `#121212`, `#2a2a2a` etc. Use a var correspondente.

---

## Escala tipográfica

| Contexto | Tamanho | Peso | Classe Tailwind |
|---|---|---|---|
| Título de página | 20px | 700 | `text-xl font-bold` |
| Título de seção (H2) | 16px | 700 | `text-[16px] font-bold` |
| Subtítulo de seção | 13px | 400 | `text-[13px] text-muted-foreground` |
| Label de KPI | 11px | 600 | `text-[11px] font-semibold uppercase tracking-[0.08em]` |
| Valor de KPI | 26–28px | 700–800 | `text-[26px] font-bold tracking-tight` |
| Corpo | 14px | 400 | `text-sm` |
| Caption / hint | 12px | 400 | `text-xs text-muted-foreground` |
| Badge / tag | 11px | 600 | `text-[11px] font-semibold` |

---

## Espaçamento

| Contexto | Gap | Classe |
|---|---|---|
| Entre seções | 24px | `space-y-6` |
| Entre cards de um grid | 12px | `gap-3` |
| Padding de card | 16px v, 20px h | `px-5 py-4` ou `p-5` |
| Margin-bottom de SectionHeader | 12px | `mb-3` |

---

## Componentes

### `<MetricCard>` — `components/MetricCard.tsx`

KPI card com ícone. Usado em dashboard e /traffic.

```tsx
<MetricCard
  icon={Users}
  label="Clientes Ativos"
  value={37}
  sub="em operação"
  iconColor="text-primary"
  iconBg="bg-primary/10"
  href="/clients"
/>
```

Props: `icon`, `label`, `value`, `sub?`, `trend?`, `trendValue?`, `iconColor?`, `iconBg?`, `href?`, `onClick?`

---

### `<KPICard>` — `components/shared/KPICard.tsx`

KPI card sem ícone obrigatório. Mais compacto, suporta status dot e emphasis.

```tsx
// Simples
<KPICard label="Conversas" value={252} hint="últimos 7 dias" />

// Com trend
<KPICard
  label="Custo/msg"
  value="R$ 5,76"
  trend={{ direction: "down", text: "vs semana passada", color: "positive" }}
/>

// Com status e ênfase
<KPICard
  label="Em Risco"
  value={3}
  status="danger"
  emphasis
  href="/clients?filter=at_risk"
/>
```

Props: `label`, `value`, `hint?`, `trend?`, `status?`, `icon?`, `href?`, `emphasis?`

**Quando usar KPICard vs MetricCard:**
- `MetricCard`: dashboard principal, precisa de ícone colorido
- `KPICard`: seções mais compactas, portal, tráfego, sem ícone obrigatório

---

### `<SectionHeader>` — `components/shared/SectionHeader.tsx`

Padroniza cabeçalhos de seção em todo o sistema.

```tsx
<SectionHeader
  title="Carga da Equipe"
  count={8}
  action={{ label: "Ver todos →", onClick: () => router.push("/my-work") }}
/>

<SectionHeader
  title="Status dos Clientes"
  subtitle="últimos 7 dias"
/>
```

Props: `title`, `subtitle?`, `action?`, `count?`

---

### `<SignedImage>` — `components/shared/SignedImage.tsx`

Imagens do Supabase Storage com skeleton, retry e fallback.

```tsx
<SignedImage src={card.imageUrl} alt="Arte do conteúdo" className="w-full h-full object-cover" />
```

---

## Estados padrão

### Loading
```tsx
<div className="h-8 w-24 rounded-md bg-muted animate-pulse" />
```

### Empty
```tsx
<div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
  <Icon size={32} />
  <p className="text-sm">Nenhum item encontrado</p>
</div>
```

### Error / retry
```tsx
<div className="text-sm text-destructive">Falha ao carregar. <button onClick={retry}>Tentar novamente</button></div>
```

---

## Micro-animações

Usar classes já definidas no Tailwind config:
- Entrada suave: `animate-fade-in` (0.3s ease-out)
- Entrada com slide: `animate-slide-up` (0.3s, translateY 8px)
- Hover de cards clicáveis: `transition-colors duration-150`
- Hover de botões: `transition-colors duration-150`

Não adicionar `transition-all` em elementos que não precisam — afeta performance.

---

## Regras de uso

1. **Usar CSS vars, nunca hex hardcoded** (exceto cores semânticas externas: `#22C55E`, `#F59E0B`, `#EF4444`)
2. **Border radius consistente**: `rounded-xl` (12px) para cards, `rounded-lg` para inputs/badges
3. **Bordas sutis**: `border border-border` padrão, `hover:border-border/60` para clicáveis
4. **Nunca duplicar `MetricCard` com div manual** — use o componente
5. **`SectionHeader` em toda seção** com título — elimina H2 + spacing manual
