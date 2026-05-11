# State Management — Lone OS

## Architecture

All mutable application state lives in Zustand stores (`stores/`). The legacy `AppStateContext` is preserved for two localStorage-only features (`reminders`, `automationRules`) until those get DB tables and can be migrated (Task 10).

## Stores

### `useClientsStore`
| State | Type | Source |
|---|---|---|
| `clients` | `Client[]` | `clients` table |
| `clientChats` | `Record<string, ChatMessage[]>` | `client_timeline_messages` table |

**Actions**: `init`, `subscribeRealtime`, `addClient`, `updateClient`, `updateClientStatus`, `sendClientMessage`

### `useContentStore`
| State | Type | Source |
|---|---|---|
| `contentCards` | `ContentCard[]` | `content_cards` table |
| `designRequests` | `DesignRequest[]` | `design_requests` table |
| `contentApprovals` | `ContentApproval[]` | `content_approvals` table |
| `socialReports` | `SocialMonthlyReport[]` | `social_monthly_reports` table |

**Actions**: `init`, `subscribeRealtime`, `addContentCard`, `updateContentCard`, `deleteContentCard`, `approveContent`, `rejectContent`, `addCardComment`, `addDesignRequest`, `updateDesignRequest`, `deleteDesignRequest`, `addSocialReport`, `updateSocialReport`

### `useOperationalStore`
| State | Type | Source |
|---|---|---|
| `timeline` | `Record<string, TimelineEntry[]>` | `client_timeline` table |
| `onboarding` | `Record<string, OnboardingItem[]>` | `onboarding_items` table |
| `globalChat` | `GlobalChatMessage[]` | `global_chat_messages` table |
| `tasks` | `Task[]` | `tasks` table |
| `notices` | `Notice[]` | `notices` table |
| `creativeAssets` | `Record<string, CreativeAsset[]>` | `creative_assets` table |
| `socialProofs` | `Record<string, SocialProofEntry[]>` | `social_proofs` table |
| `crisisNotes` | `Record<string, CrisisNote[]>` | `crisis_notes` table |
| `quinzReports` | `QuinzReport[]` | `quinz_reports` table |
| `moodHistory` | `Record<string, MoodEntry[]>` | `mood_entries` table |
| `clientAccess` | `Record<string, ClientAccess>` | `client_access` table |

**Actions**: `init`, `subscribeRealtime`, `addTimelineEntry`, `toggleOnboardingItem`, `sendGlobalMessage`, `addCreativeAsset`, `addSocialProof`, `addCrisisNote`, `addQuinzReport`, `addMoodEntry`, `updateClientAccess`, `addTask`, `updateTask`, `deleteTask`, `addNotice`, `deleteNotice`

### `useTrafficStore`
| State | Type | Source |
|---|---|---|
| `adAccounts` | `AdAccount[]` | `/api/traffic/ad-accounts` |
| `anomalyAlerts` | `AnomalyAlert[]` | `anomaly_alerts` table |
| `trafficReports` | `TrafficMonthlyReport[]` | `traffic_reports` table |
| `trafficRoutineChecks` | `TrafficRoutineCheck[]` | `traffic_routine_checks` table |
| `investmentData` | `Record<string, ClientInvestmentData>` | `localStorage` |

**Actions**: `init`, `syncBalances`, `addAdAccount`, `addTrafficReport`, `updateTrafficReport`, `addTrafficRoutineCheck`, `updateInvestmentData`

### `useNotificationsStore`
| State | Type | Source |
|---|---|---|
| `notifications` | `AppNotification[]` | `notifications` table |

**Actions**: `init`, `subscribeRealtime`, `push`, `markRead`, `markAllRead`

## Patterns

### Optimistic updates
All mutations apply state immediately, then call the API. On failure, state is rolled back:
```ts
const prev = get().items.find((i) => i.id === id);
set((s) => ({ items: s.items.map((i) => i.id === id ? { ...i, ...updates } : i) }));
try {
  await api.update(id, updates);
} catch {
  if (prev) set((s) => ({ items: s.items.map((i) => i.id === id ? prev : i) }));
}
```

### Realtime subscriptions
Each store has a `subscribeRealtime()` method that sets up `supabase.channel().on('postgres_changes', ...)` listeners and returns an unsubscribe function. Pages call it in a `useEffect` cleanup.

### Cross-store access
Stores access each other via dynamic imports to avoid circular dependencies:
```ts
import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
  useNotificationsStore.getState().push(...);
});
```

### Initialization
Every page that uses store data calls `init()` in a `useEffect` on mount. `init()` is idempotent — it checks `initialized` flag and skips if already loaded.

## Remaining AppStateContext usage

| File | State kept | Reason |
|---|---|---|
| `app/calendar/page.tsx` | `reminders`, `addReminder`, `toggleReminder`, `updateReminder` | No DB table yet — localStorage only |
| `app/automations/page.tsx` | `automationRules`, all rule mutations | No DB table yet — localStorage only |

These will be migrated in Task 10 after the corresponding DB migrations are created.
