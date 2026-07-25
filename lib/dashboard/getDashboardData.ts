import type { Client, ContentCard, DesignRequest, Task, TrafficRoutineCheck } from "@/lib/types";

function hoursSince(isoString?: string): number {
  if (!isoString) return 9999;
  return (Date.now() - new Date(isoString).getTime()) / 3600000;
}

export interface SocialMemberData {
  name: string;
  clientCount: number;
  published: number;
  inPipeline: number;
}

export interface TrafficMemberData {
  name: string;
  clientCount: number;
  supportDone: number;
  supportTotal: number;
}

export interface AdminDashboardData {
  activeClients: Client[];
  atRiskClients: Client[];
  onboardingClients: Client[];
  urgentTasks: Task[];
  pipelineCards: ContentCard[];
  publishedThisMonth: number;
  stuckCards: ContentCard[];
  pendingApproval: number;
  designQueued: number;
  designInProg: number;
  teamProductivity: SocialMemberData[];
  trafficProductivity: TrafficMemberData[];
}

interface GetDashboardDataArgs {
  clients: Client[];
  contentCards: ContentCard[];
  designRequests: DesignRequest[];
  tasks: Task[];
  trafficRoutineChecks: TrafficRoutineCheck[];
}

export function getDashboardData({
  clients,
  contentCards,
  designRequests,
  tasks,
  trafficRoutineChecks,
}: GetDashboardDataArgs): AdminDashboardData {
  const activeClients = clients.filter((c) => c.status !== "onboarding");
  const atRiskClients = clients.filter((c) => c.status === "at_risk");
  const onboardingClients = clients.filter((c) => c.status === "onboarding");
  const urgentTasks = tasks.filter((t) => t.priority === "critical" && t.status !== "done");

  const pipelineCards = contentCards.filter((c) => c.status !== "published");
  const publishedThisMonth = contentCards.filter((c) => c.status === "published").length;
  const stuckCards = pipelineCards.filter((c) => {
    const enteredAt = c.columnEnteredAt?.[c.status] ?? c.statusChangedAt;
    return hoursSince(enteredAt) >= 48;
  });
  const pendingApproval = contentCards.filter(
    (c) => c.status === "approval" || c.status === "client_approval"
  ).length;

  const designQueued = designRequests.filter((r) => r.status === "queued").length;
  const designInProg = designRequests.filter((r) => r.status === "in_progress").length;

  const socialMembers = [...new Set(clients.map((c) => c.assignedSocial))];
  const teamProductivity: SocialMemberData[] = socialMembers.map((name) => {
    const memberClients = clients.filter(
      (c) => c.assignedSocial === name && c.status !== "onboarding"
    );
    const memberCards = contentCards.filter((c) => c.socialMedia === name);
    return {
      name,
      clientCount: memberClients.length,
      published: memberCards.filter((c) => c.status === "published").length,
      inPipeline: memberCards.filter((c) => c.status !== "published").length,
    };
  });

  const trafficManagers = [...new Set(clients.map((c) => c.assignedTraffic))];
  const todayStr = new Date().toISOString().slice(0, 10);
  const trafficProductivity: TrafficMemberData[] = trafficManagers.map((name) => {
    const memberClients = clients.filter(
      (c) => c.assignedTraffic === name && c.status !== "onboarding"
    );
    const todayChecks = trafficRoutineChecks.filter(
      (c) => c.date === todayStr && c.completedBy === name
    );
    return {
      name,
      clientCount: memberClients.length,
      supportDone: todayChecks.filter((c) => c.type === "support").length,
      supportTotal: memberClients.length,
    };
  });

  // `inactiveSevenDays` foi REMOVIDO: lia dois campos que nunca eram escritos e, por tratar "não sei"
  // como "ruim", marcava a carteira inteira (33 de 33) como inativa. O sinal agora vem do servidor,
  // com atividade nos dois sentidos e motivo dominante: lib/pulse/ + /api/dashboard/pulse.

  return {
    activeClients,
    atRiskClients,
    onboardingClients,
    urgentTasks,
    pipelineCards,
    publishedThisMonth,
    stuckCards,
    pendingApproval,
    designQueued,
    designInProg,
    teamProductivity,
    trafficProductivity,

  };
}
