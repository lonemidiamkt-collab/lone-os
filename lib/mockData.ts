import type { Client, Task, ContentCard, DesignRequest, Notice, QuinzReport, TimelineEntry, GlobalChatMessage, OnboardingItem, MoodEntry, CreativeAsset, TrafficMonthlyReport, TrafficRoutineCheck, SocialMonthlyReport, AdAccount, AdCampaign } from "./types";

// ═══════════════════════════════════════════════════════════
// LONE OS — Production Data (All mock data purged)
// System starts clean. Real data entered via UI.
// ═══════════════════════════════════════════════════════════

export const mockClients: Client[] = [];
export const mockTasks: Task[] = [];
export const mockContentCards: ContentCard[] = [];
export const mockDesignRequests: DesignRequest[] = [];
export const mockNotices: Notice[] = [];
export const mockQuinzReports: QuinzReport[] = [];
export const mockTimeline: Record<string, TimelineEntry[]> = {};
export const mockGlobalChat: GlobalChatMessage[] = [];
export const mockMoodHistory: Record<string, MoodEntry[]> = {};
export const mockCreativeAssets: Record<string, CreativeAsset[]> = {};
export const mockClientChats: Record<string, import("./types").ChatMessage[]> = {};
export const mockTrafficReports: TrafficMonthlyReport[] = [];
export const mockTrafficRoutineChecks: TrafficRoutineCheck[] = [];
export const mockSocialReports: SocialMonthlyReport[] = [];
export const mockAdAccounts: AdAccount[] = [];
export const mockAdCampaigns: AdCampaign[] = [];

// Team members removed — managed via RoleContext USER_PROFILES
export const mockTeamMembers: { id: string; name: string; role: string }[] = [];

// Default onboarding items (used when creating new clients)
export const DEFAULT_ONBOARDING_ITEMS: Omit<OnboardingItem, "id">[] = [
  // Setup de Trafego
  { label: "Pixel de rastreamento instalado", completed: false, department: "traffic" },
  { label: "Contas de anuncios configuradas", completed: false, department: "traffic" },
  { label: "Estrategia inicial de campanhas definida", completed: false, department: "traffic" },
  // Setup de Design
  { label: "Paleta de cores e fontes definidas", completed: false, department: "design" },
  { label: "Briefing de marca preenchido", completed: false, department: "design" },
  { label: "Assets organizados no Drive", completed: false, department: "design" },
  // Setup de Social Media
  { label: "Acessos as redes sociais recebidos", completed: false, department: "social" },
  { label: "Tom de voz e persona definidos", completed: false, department: "social" },
  { label: "Calendario inicial criado", completed: false, department: "social" },
  { label: "Primeira reuniao de alinhamento realizada", completed: false, department: "social" },
];

/** Filter onboarding items based on the service type contracted */
export function getOnboardingItemsForService(serviceType?: string): Omit<OnboardingItem, "id">[] {
  const depts = new Set<string>();
  switch (serviceType) {
    case "assessoria_trafego": depts.add("traffic"); break;
    case "assessoria_social": depts.add("social"); break;
    case "assessoria_design": depts.add("design"); break;
    default: depts.add("traffic"); depts.add("social"); depts.add("design"); break;
  }
  return DEFAULT_ONBOARDING_ITEMS.filter((item) => !item.department || depts.has(item.department));
}
