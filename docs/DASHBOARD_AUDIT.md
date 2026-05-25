# Dashboard Audit — Onda UI-1 / Fase 1.1

**Data:** 2026-05-19
**Arquivo auditado:** `app/page.tsx` (1075 linhas)
**Branch:** `feature/dashboard-redesign`

---

## 1. Estrutura atual do arquivo

### Componentes internos (todos em `app/page.tsx`)

| Componente | Linhas | Função |
|---|---|---|
| `NoticeFormBlock` | 48–185 | Card de avisos da empresa (read + add + delete) |
| `EmployeeDashboard` | 188–465 | Dashboard para traffic / social / designer |
| `AdminDashboard` | 468–1019 | Dashboard para admin / manager |
| `DashboardPage` | 1022–1075 | Root component — inicializa stores, roteia por role |

### Componentes externos importados

| Componente | Arquivo | Usado em |
|---|---|---|
| `Header` | `components/Header` | DashboardPage |
| `MetricCard` | `components/MetricCard` | Employee + Admin |
| `MorningBriefing` | `components/MorningBriefing` | AdminDashboard |
| `TrafficChecklist` | `components/sector/TrafficChecklist` | EmployeeDashboard |
| `PostCounter` | `components/sector/PostCounter` | EmployeeDashboard |
| `DesignQueue` | `components/sector/DesignQueue` | EmployeeDashboard |
| `BudgetAlert` | `components/sector/BudgetAlert` | AdminDashboard |
| `SmartAlerts` | `components/SmartAlerts` | AdminDashboard |
| `SystemAlertBanner` | `components/SystemAlertBanner` | DashboardPage |
| `MetaHealthCard` | `components/MetaHealthCard` | DashboardPage |
| `ClientHealthRadar` | `components/ClientHealthRadar` | AdminDashboard |
| `PlatformUpdatesWidget` | `components/PlatformUpdatesWidget` | DashboardPage |

---

## 2. Fontes de dados disponíveis hoje

### Stores Zustand (client-side, Supabase-backed)

#### `useClientsStore`
```
clients[]: { id, name, nomeFantasia, status, assignedTraffic, assignedSocial,
             postsThisMonth, postsGoal, lastKanbanActivity, lastPostDate,
             industry, meta_ad_account_id, ... }
```

#### `useContentStore`
```
contentCards[]: { id, clientName, status, socialMedia, columnEnteredAt{}, statusChangedAt }
designRequests[]: { id, status, ... }
```

#### `useOperationalStore`
```
tasks[]:   { id, title, priority, status, assignedTo, clientName, role, dueDate }
notices[]: { id, title, body, urgent, createdBy, createdAt, scheduledAt, category }
timeline:  Record<clientId, TimelineEntry[]>  — { actor, description, timestamp, type }
```

#### `useTrafficStore`
```
trafficRoutineChecks[]: { date, completedBy, type, ... }
```

### Query Supabase direta (AdminDashboard)
```
supabase.from("contracts").select("id, status, end_date")
→ contractStats: { active: number, pending: number, expiring: number }
```

### Mock data (não-real)
```
mockAdCampaigns — usado no MorningBriefing e Ad Rejection Alert
```

---

## 3. Valores derivados atuais (AdminDashboard)

| Variável | Derivação | Renderizado? |
|---|---|---|
| `activeClients` | `clients.filter(status !== "onboarding")` | ✅ MetricCard |
| `atRiskClients` | `clients.filter(status === "at_risk")` | ✅ MetricCard + Urgências |
| `onboardingClients` | `clients.filter(status === "onboarding")` | ✅ MetricCard + Alert |
| `urgentTasks` | `tasks.filter(priority === "critical" && !done)` | ✅ MetricCard + Urgências |
| `pipelineCards` | `contentCards.filter(status !== "published")` | ✅ Pipeline Stats |
| `publishedThisMonth` | `contentCards.filter(status === "published").length` | ✅ Pipeline Stats |
| `stuckCards` | pipelineCards com `hoursSince >= 48` | ✅ Pipeline Stats + Urgências |
| `pendingApproval` | contentCards em `approval` ou `client_approval` | ✅ Pipeline Stats + Urgências |
| `designQueued` | `designRequests.filter(status === "queued")` | ✅ Pipeline Stats |
| `designInProg` | `designRequests.filter(status === "in_progress")` | ✅ Pipeline Stats |
| `teamProductivity` | por `assignedSocial`: clientCount, published, inPipeline | ✅ Equipe Social |
| `trafficProductivity` | por `assignedTraffic`: clientCount, supportDone, supportTotal | ✅ Equipe Tráfego |
| `inactiveSevenDays` | sem kanban E sem post há 7d | ✅ Relatório 7 Dias |
| `inactivityAlerts` | `hoursSince(lastKanbanActivity) >= 24` | ❌ computado, não renderizado |
| `zeroPostClients` | `postsThisMonth === 0 && !onboarding` | ❌ computado, não renderizado |
| `recentActivities` | timeline geral (10 últimas) | ❌ removido "per Lucas feedback" |
| `contractStats` | query Supabase `contracts` | ✅ Contratos summary |
| `tableClients` | filtrado por `statusFilter` | ✅ Client Status Table |

---

## 4. Seções atuais do AdminDashboard (ordem de renderização)

1. **MetricCard row** — 4 KPIs: Clientes Ativos, Em Risco, Onboarding, Tarefas Urgentes
2. **Quick Actions** — 3 links: Nova Tarefa, Novo Card, Meu Trabalho
3. **Onboarding Pending Alert** — link para `/clients/pending` (condicional)
4. **BudgetAlert** — componente externo (verifica budget dos clientes)
5. **ClientHealthRadar + SmartAlerts** — grid 2 colunas
6. **Contracts Summary** — 3 counters: Assinados, Pendentes, Vence em 30d (condicional)
7. **Ad Rejection Alert** — lista campanhas com `status === "error"` de `mockAdCampaigns`
8. **MorningBriefing (AI)** — só para traffic/admin/manager
9. **Urgências do Dia** — grid com até 4 mini-cards: aprovação, tarefas críticas, cards parados, clientes em risco
10. **Pipeline Quick Stats** — 5 cards: Pipeline, Publicados, Parados 48h+, Aprovação, Design
11. **Bottlenecks** — colunas do kanban com 2+ itens parados (condicional)
12. **Equipe Social + Equipe Tráfego** — grid 2 colunas
13. **NoticeFormBlock + Tarefas Urgentes** — grid 3 colunas (xl)
14. **Relatório 7 Dias** — chips de clientes sem interação (condicional)
15. **Client Status Table** — tabela filtrada com status, posts/meta, responsáveis

---

## 5. Gap analysis — novos componentes vs. dados disponíveis

### `DashboardHeader` (substitui `<Header>`)
| Dado necessário | Disponível? | Fonte |
|---|---|---|
| title, subtitle | ✅ | hardcoded / role |
| currentUser | ✅ | `useRole()` |
| isAdmin flag | ✅ | `role === "admin" \| "manager"` |

**Gap:** nenhum.

---

### `KPICard` row (4 cards via `lone-ui/KPICard`)
| KPI | Dado necessário | Disponível? | Fonte |
|---|---|---|---|
| Clientes Ativos | `activeClients.length` | ✅ | `useClientsStore` |
| Em Risco | `atRiskClients.length` | ✅ | `useClientsStore` |
| Tarefas Urgentes | `urgentTasks.length` | ✅ | `useOperationalStore` |
| Publicados/Mês | `publishedThisMonth` | ✅ | `useContentStore` |

**Gap:** nenhum.

---

### `CriticalAlertBanner` (novo — substitui "Urgências do Dia")
| Condição | Dado necessário | Disponível? | Fonte |
|---|---|---|---|
| Clientes em risco | `atRiskClients.length` | ✅ | store |
| Cards parados | `stuckCards.length` | ✅ | store (derivado) |
| Tarefas críticas | `urgentTasks.length` | ✅ | store |
| Contratos vencendo | `contractStats.expiring` | ✅ | Supabase query |
| Orçamento estourado | via `BudgetAlert` | ✅ | store (já existe) |

**Gap:** nenhum.

---

### `QuickActions` (novo — substitui barra de ações)
| Ação | Dado necessário | Disponível? |
|---|---|---|
| Links de navegação | hardcoded hrefs | ✅ |
| role p/ mostrar/esconder ações | `role` | ✅ |

**Gap:** nenhum.

---

### `TeamSection` (novo — substitui Equipe Social + Tráfego)
| Dado necessário | Disponível? | Fonte |
|---|---|---|
| `teamProductivity[]` (social) | ✅ | derivado de clients + contentCards |
| `trafficProductivity[]` (traffic) | ✅ | derivado de clients + trafficRoutineChecks |
| Avatar initials | ✅ | `name.split(" ").map(n => n[0]).join("")` |

**Gap:** nenhum.

---

### `WeeklyAttention` (novo — substitui Relatório 7 Dias + expande)
| Dado necessário | Disponível? | Fonte |
|---|---|---|
| `inactiveSevenDays[]` | ✅ | já calculado |
| `zeroPostClients[]` | ✅ | calculado mas não renderizado atualmente |
| `inactivityAlerts[]` (24h) | ✅ | calculado mas não renderizado atualmente |
| link para página do cliente | ✅ | `client.id` |

**Gap:** nenhum. Há até dados extras (`zeroPostClients`, `inactivityAlerts`) que estão sendo desperdiçados.

---

### `ClientStatusList` (novo — substitui Client Status Table)
| Dado necessário | Disponível? | Fonte |
|---|---|---|
| `client.name`, `client.status` | ✅ | store |
| `client.postsThisMonth`, `client.postsGoal` | ✅ | store |
| `client.assignedTraffic`, `client.assignedSocial` | ✅ | store |
| Filtro por status | ✅ | `useState<ClientStatus \| "all">` |
| LED de status | ✅ | `getStatusLed(status)` util |

**Gap:** nenhum.

---

## 6. Itens com dados ainda mock (não bloqueiam redesign)

| Item | Situação | Impacto |
|---|---|---|
| `mockAdCampaigns` (Ad Rejection Alert) | Mock — não conectado à Meta API | Visual apenas; bloco pode ser mantido ou movido p/ `MetaHealthCard` |
| `MorningBriefing` AI | Usa mockAdCampaigns para montar prompt | Funciona, mas dados não são reais. Backlog separado. |

Esses dois itens **não bloqueiam a Fase 1.2**. São débitos pré-existentes.

---

## 7. Dependências de componentes externos que precisam ser preservados

Os componentes abaixo ficam fora do escopo da Fase 1 e **não devem ser removidos ou alterados**:

- `PlatformUpdatesWidget` — aparece globalmente no topo
- `SystemAlertBanner` — admin-only, acima do fold
- `MetaHealthCard` — admin-only, acima do fold
- `BudgetAlert` — componente externo com lógica própria
- `ClientHealthRadar` — componente externo com lógica própria
- `SmartAlerts` — componente externo com lógica própria
- `MorningBriefing` — componente externo (AI)
- `TrafficChecklist`, `PostCounter`, `DesignQueue` — só no EmployeeDashboard

---

## 8. Conclusão para CHECKPOINT 1.1

**Todos os dados necessários para os 6 novos componentes já existem nos stores atuais.**

Nenhuma nova API, migração de banco, ou campo novo é necessário para completar a Fase 1.2 (redesign visual).

A Fase 1.2 pode prosseguir com:

1. Criar `components/dashboard-v2/` com os 6 componentes usando `lone-ui` + CSS vars
2. Criar `lib/dashboard/getDashboardData.ts` — centraliza as derivações que hoje estão inline no `AdminDashboard`
3. Substituir o conteúdo de `app/page.tsx` pelos novos componentes

**Nenhum dado faltando. Go/No-go: GO.**
