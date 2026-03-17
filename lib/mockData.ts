import type { Client, Task, ContentCard, DesignRequest, Activity, Notice, QuinzReport, TimelineEntry, GlobalChatMessage, OnboardingItem, MoodEntry, CreativeAsset } from "./types";

export const mockClients: Client[] = [
  {
    id: "c1",
    name: "TechVision Soluções",
    industry: "Tecnologia",
    monthlyBudget: 8500,
    status: "good",
    attentionLevel: "low",
    tags: ["Premium"],
    assignedTraffic: "Ana Lima",
    assignedSocial: "Carlos Melo",
    lastPostDate: "2026-03-14",
    joinDate: "2024-06-01",
    paymentMethod: "cartao",
    toneOfVoice: "authoritative",
    instagramUser: "@techvisao",
    driveLink: "https://drive.google.com/drive/folders/techvision",
    postsThisMonth: 9,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-16T10:00:00",
  },
  {
    id: "c2",
    name: "Clínica Saúde+",
    industry: "Saúde",
    monthlyBudget: 4200,
    status: "average",
    attentionLevel: "medium",
    tags: [],
    assignedTraffic: "Pedro Alves",
    assignedSocial: "Mariana Costa",
    lastPostDate: "2026-03-10",
    joinDate: "2024-09-15",
    paymentMethod: "pix",
    toneOfVoice: "formal",
    instagramUser: "@clinicasaudemais",
    driveLink: "https://drive.google.com/drive/folders/clinicasaude",
    postsThisMonth: 5,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-15T09:00:00",
  },
  {
    id: "c3",
    name: "LuxHome Imóveis",
    industry: "Imobiliário",
    monthlyBudget: 12000,
    status: "good",
    attentionLevel: "low",
    tags: ["Premium", "MatCon"],
    assignedTraffic: "Ana Lima",
    assignedSocial: "Carlos Melo",
    lastPostDate: "2026-03-15",
    joinDate: "2024-01-20",
    paymentMethod: "transferencia",
    toneOfVoice: "formal",
    instagramUser: "@luxhomeimoveis",
    driveLink: "https://drive.google.com/drive/folders/luxhome",
    postsThisMonth: 11,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-16T12:00:00",
  },
  {
    id: "c4",
    name: "Fitness Power Academia",
    industry: "Fitness",
    monthlyBudget: 2800,
    status: "at_risk",
    attentionLevel: "critical",
    tags: ["Risco de Churn"],
    assignedTraffic: "Pedro Alves",
    assignedSocial: "Mariana Costa",
    lastPostDate: "2026-03-07",
    joinDate: "2025-02-01",
    paymentMethod: "boleto",
    notes: "Cliente insatisfeito com resultados do último mês. Reunião de alinhamento agendada.",
    toneOfVoice: "funny",
    instagramUser: "@fitnesspowerac",
    postsThisMonth: 2,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-13T10:00:00",
  },
  {
    id: "c5",
    name: "Restaurante Bella Vista",
    industry: "Gastronomia",
    monthlyBudget: 3500,
    status: "onboarding",
    attentionLevel: "medium",
    tags: [],
    assignedTraffic: "Ana Lima",
    assignedSocial: "Carlos Melo",
    joinDate: "2026-03-01",
    paymentMethod: "pix",
    notes: "Cliente novo — onboarding em andamento. Aguardando acessos.",
    toneOfVoice: "casual",
    instagramUser: "@bellavistarest",
    postsThisMonth: 0,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-16T14:00:00",
  },
  {
    id: "c6",
    name: "EduPro Cursos Online",
    industry: "Educação",
    monthlyBudget: 5500,
    status: "good",
    attentionLevel: "low",
    tags: ["MatCon"],
    assignedTraffic: "Pedro Alves",
    assignedSocial: "Mariana Costa",
    lastPostDate: "2026-03-13",
    joinDate: "2024-11-10",
    paymentMethod: "cartao",
    toneOfVoice: "authoritative",
    instagramUser: "@eduprocursos",
    driveLink: "https://drive.google.com/drive/folders/edupro",
    postsThisMonth: 8,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-16T11:00:00",
  },
];

export const mockTasks: Task[] = [
  { id: "t1", title: "Revisar campanhas Google Ads", clientId: "c1", clientName: "TechVision", assignedTo: "Ana Lima", role: "traffic", status: "in_progress", priority: "high", dueDate: "2026-03-16" },
  { id: "t2", title: "Otimizar criativos Meta Ads", clientId: "c4", clientName: "Fitness Power", assignedTo: "Pedro Alves", role: "traffic", status: "pending", priority: "critical", dueDate: "2026-03-16" },
  { id: "t3", title: "Configurar pixel de conversão", clientId: "c5", clientName: "Bella Vista", assignedTo: "Ana Lima", role: "traffic", status: "pending", priority: "medium", dueDate: "2026-03-17" },
  { id: "t4", title: "Relatório mensal de performance", clientId: "c2", clientName: "Clínica Saúde+", assignedTo: "Pedro Alves", role: "traffic", status: "review", priority: "medium", dueDate: "2026-03-18" },
  { id: "t5", title: "Criar reels para feed", clientId: "c3", clientName: "LuxHome", assignedTo: "Carlos Melo", role: "social", status: "in_progress", priority: "high", dueDate: "2026-03-16" },
  { id: "t6", title: "Elaborar calendário de conteúdo", clientId: "c5", clientName: "Bella Vista", assignedTo: "Carlos Melo", role: "social", status: "pending", priority: "medium", dueDate: "2026-03-18" },
  { id: "t7", title: "Responder comentários e DMs", clientId: "c1", clientName: "TechVision", assignedTo: "Mariana Costa", role: "social", status: "done", priority: "low" },
  { id: "t8", title: "Banner campanha Black Friday antecipada", clientId: "c6", clientName: "EduPro", assignedTo: "Rafael Designer", role: "designer", status: "in_progress", priority: "high", dueDate: "2026-03-17" },
];

export const mockContentCards: ContentCard[] = [
  { id: "cc1", title: "Reel: 5 dicas de investimento", clientId: "c6", clientName: "EduPro", socialMedia: "Carlos Melo", status: "in_production", priority: "high", format: "Reel (9:16)", dueDate: "2026-03-17", briefing: "Reel educativo com 5 dicas de investimento para iniciantes. Usar linguagem acessível, tom descontraído. Inserir chamada para o curso no final. Duração ~30s.", imageUrl: "https://picsum.photos/seed/cc1/400/600" },
  { id: "cc2", title: "Carrossel: Cases de sucesso Q1", clientId: "c1", clientName: "TechVision", socialMedia: "Carlos Melo", status: "script", priority: "medium", format: "Carrossel", dueDate: "2026-03-19", briefing: "6 slides apresentando cases de clientes satisfeitos com resultados reais. Tom técnico mas acessível. Usar paleta azul/branco da marca." },
  { id: "cc3", title: "Story: Promoção apartamento garden", clientId: "c3", clientName: "LuxHome", socialMedia: "Carlos Melo", status: "approval", priority: "high", format: "Story (9:16)", dueDate: "2026-03-16", briefing: "Story apresentando o apartamento garden disponível. Fotos profissionais do imóvel. Incluir valor, metragem e link para formulário de interesse.", imageUrl: "https://picsum.photos/seed/cc3/400/600" },
  { id: "cc4", title: "Post estático: novo procedimento", clientId: "c2", clientName: "Clínica Saúde+", socialMedia: "Mariana Costa", status: "scheduled", priority: "low", format: "Post Feed (1:1)", dueDate: "2026-03-18", briefing: "Apresentar o novo procedimento de harmonização facial. Fundo branco, tipografia clean, ícones médicos. Incluir CTA para agendamento.", imageUrl: "https://picsum.photos/seed/cc4/400/400" },
  { id: "cc5", title: "Reel: Tour pela academia", clientId: "c4", clientName: "Fitness Power", socialMedia: "Mariana Costa", status: "ideas", priority: "medium", format: "Reel (9:16)", briefing: "Tour pelas instalações da academia mostrando equipamentos novos. Trilha energética, edição dinâmica com cortes rápidos. Finalizar com oferta de matrícula." },
  { id: "cc6", title: "Carrossel: Menu especial semana", clientId: "c5", clientName: "Bella Vista", socialMedia: "Carlos Melo", status: "ideas", priority: "low", format: "Carrossel" },
  { id: "cc7", title: "Reels lançamento do novo curso", clientId: "c6", clientName: "EduPro", socialMedia: "Mariana Costa", status: "published", priority: "high", format: "Reel (9:16)", dueDate: "2026-03-14", imageUrl: "https://picsum.photos/seed/cc7/400/600" },
];

export const mockDesignRequests: DesignRequest[] = [
  { id: "d1", title: "Banner Landing Page — campanha", clientId: "c6", clientName: "EduPro", requestedBy: "Carlos Melo", priority: "high", status: "in_progress", format: "1920x1080px", briefing: "Fundo escuro, gradiente roxo, destaque na oferta de 50% off.", deadline: "2026-03-17" },
  { id: "d2", title: "Story Stories Kit — 5 artes", clientId: "c3", clientName: "LuxHome", requestedBy: "Carlos Melo", priority: "high", status: "queued", format: "1080x1920px (x5)", briefing: "Estilo premium, cores bege e dourado. Fotos do imóvel anexas.", deadline: "2026-03-16" },
  { id: "d3", title: "Carrossel 6 slides — cases", clientId: "c1", clientName: "TechVision", requestedBy: "Carlos Melo", priority: "medium", status: "queued", format: "1080x1080px (x6)", briefing: "Paleta azul/branco. Tom técnico mas acessível.", deadline: "2026-03-19" },
  { id: "d4", title: "Post novo procedimento estético", clientId: "c2", clientName: "Clínica Saúde+", requestedBy: "Mariana Costa", priority: "low", status: "done", format: "1080x1080px", briefing: "Fundo branco, tipografia clean, ícones médicos.", deadline: "2026-03-15" },
  { id: "d5", title: "Arte motivacional para feed", clientId: "c4", clientName: "Fitness Power", requestedBy: "Mariana Costa", priority: "critical", status: "queued", format: "1080x1080px", briefing: "URGENTE: cliente pediu para ontem. Tom energético, frase de impacto.", deadline: "2026-03-15" },
];

export const mockActivities: Activity[] = [
  { id: "a1", user: "Carlos Melo", action: "concluiu arte para", target: "EduPro — Reel lançamento", timestamp: "há 15 min", type: "task" },
  { id: "a2", user: "Ana Lima", action: "atualizou campanha de", target: "TechVision — Google Ads", timestamp: "há 32 min", type: "task" },
  { id: "a3", user: "Mariana Costa", action: "agendou post para", target: "Clínica Saúde+ — Story", timestamp: "há 1h", type: "post" },
  { id: "a4", user: "Pedro Alves", action: "marcou como em risco", target: "Fitness Power Academia", timestamp: "há 2h", type: "client" },
  { id: "a5", user: "Carlos Melo", action: "enviou relatório quinzenal de", target: "LuxHome Imóveis", timestamp: "há 3h", type: "report" },
  { id: "a6", user: "Rafael Designer", action: "concluiu design para", target: "Clínica Saúde+ — Banner", timestamp: "há 5h", type: "task" },
];

export const mockNotices: Notice[] = [
  { id: "n1", title: "🚨 Reunião de alinhamento — Sexta 16h", body: "Todos os gestores de tráfego devem apresentar relatório semanal. Link no Google Meet.", createdBy: "Admin", createdAt: "2026-03-15", urgent: true },
  { id: "n2", title: "📋 Novo processo para briefing de arte", body: "A partir de agora todos os briefings devem ter referência visual anexada. Ver doc no Notion.", createdBy: "Admin", createdAt: "2026-03-12", urgent: false },
];

export const mockTeamMembers = [
  { id: "u1", name: "Admin CEO", role: "admin" as const, avatar: "AC" },
  { id: "u2", name: "Gerente Ops", role: "manager" as const, avatar: "GO" },
  { id: "u3", name: "Ana Lima", role: "traffic" as const, avatar: "AL" },
  { id: "u4", name: "Pedro Alves", role: "traffic" as const, avatar: "PA" },
  { id: "u5", name: "Carlos Melo", role: "social" as const, avatar: "CM" },
  { id: "u6", name: "Mariana Costa", role: "social" as const, avatar: "MC" },
  { id: "u7", name: "Rafael Designer", role: "designer" as const, avatar: "RD" },
];

// Per-client internal chat messages
export const mockClientChats: Record<string, { user: string; text: string; time: string }[]> = {
  c1: [
    { user: "Ana Lima", text: "Campanhas Google Ads com ROAS de 4.2x essa semana. Excelente!", time: "Ter 14:30" },
    { user: "Carlos Melo", text: "Calendário de Abril pronto. Vou enviar para aprovação amanhã.", time: "Ter 15:12" },
    { user: "Gerente Ops", text: "Ótimo desempenho. Manter estratégia e ampliar budget no Search.", time: "Qua 09:00" },
  ],
  c2: [
    { user: "Pedro Alves", text: "CPC subiu 18% essa semana. Preciso revisar os grupos de anúncio.", time: "Seg 10:20" },
    { user: "Mariana Costa", text: "Post do novo procedimento teve bom engajamento — 230 curtidas.", time: "Seg 11:45" },
    { user: "Pedro Alves", text: "Ajustes feitos. Vamos monitorar os próximos 3 dias.", time: "Ter 08:30" },
  ],
  c3: [
    { user: "Ana Lima", text: "3 imóveis com atribuição direta às campanhas esse mês. Cliente feliz!", time: "Sex 16:00" },
    { user: "Carlos Melo", text: "Precisamos agilizar o fluxo de aprovação de artes — cliente demora muito.", time: "Sex 17:10" },
    { user: "Gerente Ops", text: "Vou entrar em contato com o cliente para alinhar o processo.", time: "Sab 09:00" },
  ],
  c4: [
    { user: "Pedro Alves", text: "CPA está 3x acima do meta. Situação crítica — precisa de reunião urgente.", time: "Qui 10:00" },
    { user: "Mariana Costa", text: "Cliente reclamou de falta de posts. Estava esperando aprovação das artes.", time: "Qui 11:30" },
    { user: "Gerente Ops", text: "Reunião agendada para sexta 15h. Vamos reestruturar a estratégia completa.", time: "Qui 14:00" },
  ],
  c5: [
    { user: "Ana Lima", text: "Pixel instalado e rastreando corretamente. Aguardando criativo para lançar.", time: "Seg 09:45" },
    { user: "Carlos Melo", text: "Calendário inicial de conteúdo criado — 3 posts/semana pra começar.", time: "Ter 10:00" },
    { user: "Gerente Ops", text: "Cliente confirmou acesso às redes. Onboarding no prazo!", time: "Ter 14:00" },
  ],
  c6: [
    { user: "Pedro Alves", text: "Lançamento do novo curso gerou 180 leads. Custo por lead ótimo.", time: "Qua 09:00" },
    { user: "Mariana Costa", text: "Reels do lançamento bombando — 15k visualizações em 24h.", time: "Qua 11:30" },
    { user: "Ana Lima", text: "Escalando budget no Meta para aproveitar o momentum do lançamento.", time: "Qua 13:00" },
  ],
};

// Default onboarding checklist items
export const DEFAULT_ONBOARDING_ITEMS: Omit<OnboardingItem, "id">[] = [
  { label: "Acessos às redes sociais recebidos", completed: false },
  { label: "Briefing de marca preenchido", completed: false },
  { label: "Paleta de cores e fontes definidas", completed: false },
  { label: "Tom de voz e persona definidos", completed: false },
  { label: "Pixel de rastreamento instalado", completed: false },
  { label: "Contas de anúncios configuradas", completed: false },
  { label: "Calendário inicial de conteúdo criado", completed: false },
  { label: "Primeira reunião de alinhamento realizada", completed: false },
  { label: "Histórico de conteúdo analisado", completed: false },
];

// Timeline per client — audit log of all operations
export const mockTimeline: Record<string, TimelineEntry[]> = {
  c1: [
    { id: "tl-c1-1", clientId: "c1", type: "task", actor: "Ana Lima", description: "Lançou nova campanha Search + Display no Google Ads com verba ampliada.", timestamp: "15/03/2026 14:30" },
    { id: "tl-c1-2", clientId: "c1", type: "report", actor: "Ana Lima", description: "Relatório quinzenal enviado: ROAS 4.2x, 180 leads, CPL abaixo do meta.", timestamp: "15/03/2026 10:00" },
    { id: "tl-c1-3", clientId: "c1", type: "content", actor: "Carlos Melo", description: "Publicou Reel '3 tendências de IA para 2026' — 8.2k views em 24h.", timestamp: "13/03/2026 09:00" },
    { id: "tl-c1-4", clientId: "c1", type: "task", actor: "Ana Lima", description: "Otimizou audiências do Meta Ads — CPL reduziu 22% em relação à semana anterior.", timestamp: "10/03/2026 16:00" },
    { id: "tl-c1-5", clientId: "c1", type: "chat", actor: "Carlos Melo", description: "Calendário de conteúdo de Abril enviado para aprovação do cliente.", timestamp: "09/03/2026 15:12" },
    { id: "tl-c1-6", clientId: "c1", type: "meeting", actor: "Gerente Ops", description: "Reunião mensal de alinhamento realizada. Cliente muito satisfeito com resultados.", timestamp: "01/03/2026 10:00" },
  ],
  c2: [
    { id: "tl-c2-1", clientId: "c2", type: "task", actor: "Pedro Alves", description: "Revisou grupos de anúncios — CPC caiu 14% após ajustes de segmentação.", timestamp: "14/03/2026 11:00" },
    { id: "tl-c2-2", clientId: "c2", type: "content", actor: "Mariana Costa", description: "Post sobre novo procedimento: 230 curtidas, 48 comentários, alto engajamento.", timestamp: "12/03/2026 09:30" },
    { id: "tl-c2-3", clientId: "c2", type: "status", actor: "Pedro Alves", description: "Status atualizado: Resultados Médios. CPC ainda acima do ideal.", timestamp: "10/03/2026 14:00" },
    { id: "tl-c2-4", clientId: "c2", type: "chat", actor: "Pedro Alves", description: "Ajustes de segmentação concluídos. Aguardando resultados dos próximos 3 dias.", timestamp: "08/03/2026 08:30" },
  ],
  c3: [
    { id: "tl-c3-1", clientId: "c3", type: "task", actor: "Ana Lima", description: "3 imóveis vendidos com atribuição direta às campanhas. Ticket médio: R$ 850k.", timestamp: "15/03/2026 16:00" },
    { id: "tl-c3-2", clientId: "c3", type: "design", actor: "Rafael Designer", description: "Kit Stories — 5 artes para imóveis publicadas. Alto volume de mensagens no DM.", timestamp: "14/03/2026 10:00" },
    { id: "tl-c3-3", clientId: "c3", type: "report", actor: "Carlos Melo", description: "Relatório quinzenal: melhor mês da conta, 3 vendas atribuídas.", timestamp: "15/03/2026 15:00" },
    { id: "tl-c3-4", clientId: "c3", type: "manual", actor: "Gerente Ops", description: "Alinhar processo de aprovação de artes com cliente — demora comprometendo cronograma.", timestamp: "13/03/2026 09:00" },
    { id: "tl-c3-5", clientId: "c3", type: "meeting", actor: "Gerente Ops", description: "Proposta de renovação anual apresentada. Cliente demonstrou interesse.", timestamp: "01/03/2026 14:00" },
  ],
  c4: [
    { id: "tl-c4-1", clientId: "c4", type: "status", actor: "Pedro Alves", description: "ALERTA: CPA 3x acima da meta. Campanha pausada para reestruturação urgente.", timestamp: "15/03/2026 10:00" },
    { id: "tl-c4-2", clientId: "c4", type: "manual", actor: "Gerente Ops", description: "Cliente ameaçou cancelar contrato via WhatsApp. Reunião de crise agendada para 20/03.", timestamp: "14/03/2026 14:00" },
    { id: "tl-c4-3", clientId: "c4", type: "content", actor: "Mariana Costa", description: "Cliente reclamou da falta de posts — artes estavam aguardando aprovação interna.", timestamp: "12/03/2026 11:30" },
    { id: "tl-c4-4", clientId: "c4", type: "task", actor: "Pedro Alves", description: "Alterou estratégia de lances: Maximizar Conversões → CPA Alvo de R$ 35.", timestamp: "10/03/2026 11:30" },
    { id: "tl-c4-5", clientId: "c4", type: "status", actor: "Pedro Alves", description: "Status atualizado para Em Risco. Nível de atenção: Crítico.", timestamp: "08/03/2026 09:00" },
  ],
  c5: [
    { id: "tl-c5-1", clientId: "c5", type: "onboarding", actor: "Ana Lima", description: "Pixel de rastreamento instalado e validado. Pronto para lançar campanhas.", timestamp: "10/03/2026 09:45" },
    { id: "tl-c5-2", clientId: "c5", type: "onboarding", actor: "Carlos Melo", description: "Calendário inicial de conteúdo criado — 3 posts/semana. Cliente aprovou.", timestamp: "08/03/2026 10:00" },
    { id: "tl-c5-3", clientId: "c5", type: "onboarding", actor: "Gerente Ops", description: "Acessos às redes sociais recebidos e confirmados pela equipe.", timestamp: "04/03/2026 14:00" },
    { id: "tl-c5-4", clientId: "c5", type: "onboarding", actor: "Sistema", description: "Cliente cadastrado. Onboarding iniciado automaticamente.", timestamp: "01/03/2026 09:00" },
  ],
  c6: [
    { id: "tl-c6-1", clientId: "c6", type: "task", actor: "Pedro Alves", description: "Escalonamento de budget: +30% no Meta Ads. 180 leads gerados no lançamento.", timestamp: "15/03/2026 13:00" },
    { id: "tl-c6-2", clientId: "c6", type: "content", actor: "Mariana Costa", description: "Reels do lançamento: 15k visualizações em 24h. Melhor resultado da conta.", timestamp: "14/03/2026 11:30" },
    { id: "tl-c6-3", clientId: "c6", type: "design", actor: "Rafael Designer", description: "Banner da landing page de lançamento entregue e publicado.", timestamp: "13/03/2026 17:00" },
    { id: "tl-c6-4", clientId: "c6", type: "meeting", actor: "Gerente Ops", description: "Briefing de lançamento do novo curso realizado com o cliente.", timestamp: "10/03/2026 10:00" },
    { id: "tl-c6-5", clientId: "c6", type: "report", actor: "Pedro Alves", description: "Relatório quinzenal: 180 leads, CPL R$ 12,50 — abaixo da meta de R$ 20.", timestamp: "15/03/2026 09:00" },
  ],
};

// Global chat mock data
export const mockGlobalChat: GlobalChatMessage[] = [
  { id: "gc1", user: "Admin CEO", role: "admin", text: "Bom dia equipe! Reunião de alinhamento sexta às 16h. Todos confirmados?", timestamp: "16/03 08:00" },
  { id: "gc2", user: "Ana Lima", role: "traffic", text: "Confirmado! Vou trazer o relatório consolidado de tráfego.", timestamp: "16/03 08:15" },
  { id: "gc3", user: "Carlos Melo", role: "social", text: "Confirmado! Novos criativos da LuxHome ficaram ótimos, vou apresentar.", timestamp: "16/03 09:30" },
  { id: "gc4", user: "Pedro Alves", role: "traffic", text: "Preciso de ajuda com a situação da Fitness Power. Vou trazer o histórico completo.", timestamp: "16/03 10:00" },
  { id: "gc5", user: "Mariana Costa", role: "social", text: "Calendários de Abril para todos os clientes estão prontos para revisão.", timestamp: "16/03 11:20" },
  { id: "gc6", user: "Rafael Designer", role: "designer", text: "Fila de artes: tenho 3 na fila. A da Fitness Power é a mais urgente.", timestamp: "16/03 11:45" },
];

// Quinzennial reports per client (CEO-exclusive)
export const mockQuinzReports: QuinzReport[] = [
  {
    id: "qr1", clientId: "c1", clientName: "TechVision Soluções",
    period: "01–15 Mar/2026", createdBy: "Ana Lima", createdAt: "2026-03-15",
    communicationHealth: 4, clientEngagement: 5,
    highlights: "Cliente muito satisfeito com os leads gerados. ROAS de 4.2x no período.",
    challenges: "Criativos saturando rapidamente. Precisamos de novos assets.",
    nextSteps: "Criar 5 novos criativos em vídeo e testar novas audiências no Meta.",
  },
  {
    id: "qr2", clientId: "c4", clientName: "Fitness Power Academia",
    period: "01–15 Mar/2026", createdBy: "Pedro Alves", createdAt: "2026-03-15",
    communicationHealth: 2, clientEngagement: 1,
    highlights: "Nenhum resultado significativo a destacar no período.",
    challenges: "CPA está 3x acima do meta. Cliente ameaçou cancelar.",
    nextSteps: "Reunião de alinhamento urgente. Proposta de reestruturação completa da estratégia.",
  },
  {
    id: "qr3", clientId: "c3", clientName: "LuxHome Imóveis",
    period: "01–15 Mar/2026", createdBy: "Carlos Melo", createdAt: "2026-03-15",
    communicationHealth: 5, clientEngagement: 4,
    highlights: "3 imóveis vendidos com atribuição direta. Ticket médio de R$850k.",
    challenges: "Aprovação de artes demora muito por parte do cliente.",
    nextSteps: "Propor fluxo de aprovação mais ágil. Ampliar verba para vídeo.",
  },
  {
    id: "qr4", clientId: "c6", clientName: "EduPro Cursos Online",
    period: "01–15 Mar/2026", createdBy: "Pedro Alves", createdAt: "2026-03-15",
    communicationHealth: 5, clientEngagement: 5,
    highlights: "180 leads gerados no lançamento do novo curso. CPL abaixo do meta.",
    challenges: "Escalar mantendo qualidade dos leads é o principal desafio.",
    nextSteps: "Testar lookalike audiences e ampliar verba em 30%.",
  },
];

// Mood history per client
export const mockMoodHistory: Record<string, MoodEntry[]> = {
  c1: [
    { id: "m-c1-1", mood: "happy", note: "Cliente elogiou os resultados de Março.", recordedBy: "Carlos Melo", date: "2026-03-14" },
    { id: "m-c1-2", mood: "happy", recordedBy: "Carlos Melo", date: "2026-03-07" },
    { id: "m-c1-3", mood: "neutral", recordedBy: "Carlos Melo", date: "2026-02-28" },
  ],
  c2: [
    { id: "m-c2-1", mood: "neutral", note: "CPC subiu, cliente um pouco preocupado.", recordedBy: "Mariana Costa", date: "2026-03-13" },
    { id: "m-c2-2", mood: "happy", recordedBy: "Mariana Costa", date: "2026-03-06" },
  ],
  c3: [
    { id: "m-c3-1", mood: "happy", note: "3 imóveis vendidos! Cliente muito feliz.", recordedBy: "Carlos Melo", date: "2026-03-15" },
    { id: "m-c3-2", mood: "happy", recordedBy: "Carlos Melo", date: "2026-03-08" },
    { id: "m-c3-3", mood: "neutral", recordedBy: "Carlos Melo", date: "2026-03-01" },
  ],
  c4: [
    { id: "m-c4-1", mood: "angry", note: "Ameaçou cancelar. CPA muito alto.", recordedBy: "Mariana Costa", date: "2026-03-14" },
    { id: "m-c4-2", mood: "angry", recordedBy: "Mariana Costa", date: "2026-03-07" },
    { id: "m-c4-3", mood: "neutral", recordedBy: "Mariana Costa", date: "2026-02-28" },
  ],
  c5: [],
  c6: [
    { id: "m-c6-1", mood: "happy", note: "Lançamento foi um sucesso. Cliente animadíssimo.", recordedBy: "Mariana Costa", date: "2026-03-15" },
    { id: "m-c6-2", mood: "happy", recordedBy: "Mariana Costa", date: "2026-03-08" },
  ],
};

// Creative assets per client (visual references)
export const mockCreativeAssets: Record<string, CreativeAsset[]> = {
  c1: [
    { id: "ca-c1-1", clientId: "c1", type: "reference", url: "https://picsum.photos/seed/ref1/400/300", label: "Referência de feed tech", uploadedBy: "Carlos Melo", uploadedAt: "2026-03-10" },
    { id: "ca-c1-2", clientId: "c1", type: "palette", url: "https://picsum.photos/seed/pal1/400/200", label: "Paleta: Azul + Branco", uploadedBy: "Carlos Melo", uploadedAt: "2026-03-10" },
  ],
  c3: [
    { id: "ca-c3-1", clientId: "c3", type: "reference", url: "https://picsum.photos/seed/ref3/400/300", label: "Estilo premium bege/dourado", uploadedBy: "Carlos Melo", uploadedAt: "2026-03-08" },
    { id: "ca-c3-2", clientId: "c3", type: "typography", url: "https://picsum.photos/seed/typ3/400/200", label: "Tipografia: Playfair Display", uploadedBy: "Carlos Melo", uploadedAt: "2026-03-08" },
    { id: "ca-c3-3", clientId: "c3", type: "reference", url: "https://picsum.photos/seed/ref3b/400/300", label: "Referência Story imóvel", uploadedBy: "Carlos Melo", uploadedAt: "2026-03-12" },
  ],
  c6: [
    { id: "ca-c6-1", clientId: "c6", type: "palette", url: "https://picsum.photos/seed/pal6/400/200", label: "Paleta: Roxo + Amarelo", uploadedBy: "Mariana Costa", uploadedAt: "2026-03-05" },
  ],
};
