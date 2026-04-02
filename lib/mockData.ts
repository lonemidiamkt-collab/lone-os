import type { Client, Task, ContentCard, DesignRequest, Notice, QuinzReport, TimelineEntry, GlobalChatMessage, OnboardingItem, MoodEntry, CreativeAsset, TrafficMonthlyReport, TrafficRoutineCheck, SocialMonthlyReport, AdAccount, AdCampaign } from "./types";

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
    assignedDesigner: "Rafael Designer",
    lastPostDate: "2026-03-14",
    joinDate: "2024-06-01",
    paymentMethod: "cartao",
    toneOfVoice: "authoritative",
    instagramUser: "@techvisao",
    driveLink: "https://drive.google.com/drive/folders/techvision",
    postsThisMonth: 9,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-16T10:00:00",
    fixedBriefing: "Cores: azul escuro (#1a237e) e branco. Fonte: Montserrat. Tom: autoridade técnica. Sempre incluir logo no canto inferior direito. Nunca usar gírias ou emojis excessivos. Fotos devem ter fundo clean.",
    metaAdAccountId: "aa1",
    metaAdAccountName: "TechVision - Principal",
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
    assignedDesigner: "Rafael Designer",
    lastPostDate: "2026-03-10",
    joinDate: "2024-09-15",
    paymentMethod: "pix",
    toneOfVoice: "formal",
    instagramUser: "@clinicasaudemais",
    driveLink: "https://drive.google.com/drive/folders/clinicasaude",
    postsThisMonth: 5,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-15T09:00:00",
    fixedBriefing: "Cores: verde (#2e7d32) e branco. Fonte: Lato. Tom: profissional e acolhedor. Sempre usar fotos reais da clínica. Evitar termos técnicos demais. Logo centralizado no topo.",
    metaAdAccountId: "aa2",
    metaAdAccountName: "Clínica Saúde+ - Ads",
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
    assignedDesigner: "Rafael Designer",
    lastPostDate: "2026-03-15",
    joinDate: "2024-01-20",
    paymentMethod: "transferencia",
    toneOfVoice: "formal",
    instagramUser: "@luxhomeimoveis",
    driveLink: "https://drive.google.com/drive/folders/luxhome",
    postsThisMonth: 11,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-16T12:00:00",
    fixedBriefing: "Cores: dourado (#c9a84c) e preto. Fonte: Playfair Display. Tom: luxo e exclusividade. Fotos sempre em alta resolução. Nunca usar preços nos posts. Logo discreto no canto inferior.",
    metaAdAccountId: "aa3",
    metaAdAccountName: "LuxHome - Premium Ads",
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
    assignedDesigner: "Rafael Designer",
    lastPostDate: "2026-03-07",
    joinDate: "2025-02-01",
    paymentMethod: "boleto",
    notes: "Cliente insatisfeito com resultados do último mês. Reunião de alinhamento agendada.",
    toneOfVoice: "funny",
    instagramUser: "@fitnesspowerac",
    postsThisMonth: 2,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-13T10:00:00",
    fixedBriefing: "Cores: laranja (#ff6d00) e preto. Fonte: Bebas Neue. Tom: motivacional e enérgico. Usar fotos com pessoas reais treinando. Sempre incluir CTA (chamada para ação). Emojis liberados.",
    metaAdAccountId: "aa4",
    metaAdAccountName: "Fitness Power - Meta",
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
    assignedDesigner: "Rafael Designer",
    joinDate: "2026-03-01",
    paymentMethod: "pix",
    notes: "Cliente novo — onboarding em andamento. Aguardando acessos.",
    toneOfVoice: "casual",
    instagramUser: "@bellavistarest",
    postsThisMonth: 0,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-16T14:00:00",
    fixedBriefing: "Cores: vermelho (#b71c1c) e creme (#fff8e1). Fonte: Poppins. Tom: acolhedor e casual. Fotos dos pratos devem ter iluminação quente. Sempre marcar localização no post. Evitar filtros frios.",
    metaAdAccountId: "aa5",
    metaAdAccountName: "Bella Vista - Delivery",
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
    assignedDesigner: "Rafael Designer",
    lastPostDate: "2026-03-13",
    joinDate: "2024-11-10",
    paymentMethod: "cartao",
    toneOfVoice: "authoritative",
    instagramUser: "@eduprocursos",
    driveLink: "https://drive.google.com/drive/folders/edupro",
    postsThisMonth: 8,
    postsGoal: 12,
    lastKanbanActivity: "2026-03-16T11:00:00",
    fixedBriefing: "Cores: roxo (#6a1b9a) e branco. Fonte: Inter. Tom: educativo e acessível. Sempre incluir dados/estatísticas. Carrosséis devem ter 5-7 slides. CTA para link na bio.",
    metaAdAccountId: "aa6",
    metaAdAccountName: "EduPro - Captação",
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
  { id: "cc1", title: "Reel: 5 dicas de investimento", clientId: "c6", clientName: "EduPro", socialMedia: "Carlos Melo", status: "in_production", priority: "high", format: "Reel (9:16)", dueDate: "2026-03-17", dueTime: "18:00", briefing: "Reel educativo com 5 dicas de investimento para iniciantes. Usar linguagem acessível, tom descontraído. Inserir chamada para o curso no final. Duração ~30s.", imageUrl: "https://picsum.photos/seed/cc1/400/600", statusChangedAt: "2026-03-14T09:00:00" },
  { id: "cc2", title: "Carrossel: Cases de sucesso Q1", clientId: "c1", clientName: "TechVision", socialMedia: "Carlos Melo", status: "script", priority: "medium", format: "Carrossel", dueDate: "2026-03-19", dueTime: "10:00", briefing: "6 slides apresentando cases de clientes satisfeitos com resultados reais. Tom técnico mas acessível. Usar paleta azul/branco da marca.", statusChangedAt: "2026-03-19T14:00:00" },
  { id: "cc3", title: "Story: Promoção apartamento garden", clientId: "c3", clientName: "LuxHome", socialMedia: "Carlos Melo", status: "approval", priority: "high", format: "Story (9:16)", dueDate: "2026-03-16", dueTime: "12:00", briefing: "Story apresentando o apartamento garden disponível. Fotos profissionais do imóvel. Incluir valor, metragem e link para formulário de interesse.", imageUrl: "https://picsum.photos/seed/cc3/400/600", statusChangedAt: "2026-03-15T11:00:00" },
  { id: "cc4", title: "Post estático: novo procedimento", clientId: "c2", clientName: "Clínica Saúde+", socialMedia: "Mariana Costa", status: "scheduled", priority: "low", format: "Post Feed (1:1)", dueDate: "2026-03-18", dueTime: "14:00", briefing: "Apresentar o novo procedimento de harmonização facial. Fundo branco, tipografia clean, ícones médicos. Incluir CTA para agendamento.", imageUrl: "https://picsum.photos/seed/cc4/400/400", statusChangedAt: "2026-03-17T16:00:00" },
  { id: "cc5", title: "Reel: Tour pela academia", clientId: "c4", clientName: "Fitness Power", socialMedia: "Mariana Costa", status: "ideas", priority: "medium", format: "Reel (9:16)", dueDate: "2026-03-25", dueTime: "17:00", briefing: "Tour pelas instalações da academia mostrando equipamentos novos. Trilha energética, edição dinâmica com cortes rápidos. Finalizar com oferta de matrícula.", statusChangedAt: "2026-03-13T08:00:00" },
  { id: "cc6", title: "Carrossel: Menu especial semana", clientId: "c5", clientName: "Bella Vista", socialMedia: "Carlos Melo", status: "ideas", priority: "low", format: "Carrossel", dueDate: "2026-03-26", dueTime: "11:00", statusChangedAt: "2026-03-18T10:00:00" },
  { id: "cc7", title: "Reels lançamento do novo curso", clientId: "c6", clientName: "EduPro", socialMedia: "Mariana Costa", status: "published", priority: "high", format: "Reel (9:16)", dueDate: "2026-03-14", dueTime: "19:00", imageUrl: "https://picsum.photos/seed/cc7/400/600", statusChangedAt: "2026-03-14T18:00:00" },
];

export const mockDesignRequests: DesignRequest[] = [
  { id: "d1", title: "Banner Landing Page — campanha", clientId: "c6", clientName: "EduPro", requestedBy: "Carlos Melo", priority: "high", status: "in_progress", format: "1920x1080px", briefing: "Fundo escuro, gradiente roxo, destaque na oferta de 50% off.", deadline: "2026-03-17" },
  { id: "d2", title: "Story Stories Kit — 5 artes", clientId: "c3", clientName: "LuxHome", requestedBy: "Carlos Melo", priority: "high", status: "queued", format: "1080x1920px (x5)", briefing: "Estilo premium, cores bege e dourado. Fotos do imóvel anexas.", deadline: "2026-03-16" },
  { id: "d3", title: "Carrossel 6 slides — cases", clientId: "c1", clientName: "TechVision", requestedBy: "Carlos Melo", priority: "medium", status: "queued", format: "1080x1080px (x6)", briefing: "Paleta azul/branco. Tom técnico mas acessível.", deadline: "2026-03-19" },
  { id: "d4", title: "Post novo procedimento estético", clientId: "c2", clientName: "Clínica Saúde+", requestedBy: "Mariana Costa", priority: "low", status: "done", format: "1080x1080px", briefing: "Fundo branco, tipografia clean, ícones médicos.", deadline: "2026-03-15" },
  { id: "d5", title: "Arte motivacional para feed", clientId: "c4", clientName: "Fitness Power", requestedBy: "Mariana Costa", priority: "critical", status: "queued", format: "1080x1080px", briefing: "URGENTE: cliente pediu para ontem. Tom energético, frase de impacto.", deadline: "2026-03-15" },
];

export const mockNotices: Notice[] = [
  { id: "n1", title: "🚨 Reunião de alinhamento — Sexta 16h", body: "Todos os gestores de tráfego devem apresentar relatório semanal. Link no Google Meet.", createdBy: "Admin", createdAt: "2026-03-15", urgent: true },
  { id: "n2", title: "📋 Novo processo para briefing de arte", body: "A partir de agora todos os briefings devem ter referência visual anexada. Ver doc no Notion.", createdBy: "Admin", createdAt: "2026-03-12", urgent: false },
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

// Traffic monthly performance reports
export const mockTrafficReports: TrafficMonthlyReport[] = [
  // TechVision — 3 months
  { id: "tr-c1-01", clientId: "c1", clientName: "TechVision Soluções", month: "2026-01", createdBy: "Ana Lima", createdAt: "2026-02-02", messages: 210, messageCost: 8.50, impressions: 45000, observations: "Primeiro mês com budget ampliado. Resultados acima do esperado." },
  { id: "tr-c1-02", clientId: "c1", clientName: "TechVision Soluções", month: "2026-02", createdBy: "Ana Lima", createdAt: "2026-03-03", messages: 280, messageCost: 7.20, impressions: 62000, observations: "Otimização de audiências reduziu CPL em 33%." },
  { id: "tr-c1-03", clientId: "c1", clientName: "TechVision Soluções", month: "2026-03", createdBy: "Ana Lima", createdAt: "2026-03-20", messages: 320, messageCost: 6.80, impressions: 70000, observations: "Melhor mês da conta. Criativos em vídeo performando muito bem." },
  // Clínica Saúde+ — 3 months
  { id: "tr-c2-01", clientId: "c2", clientName: "Clínica Saúde+", month: "2026-01", createdBy: "Pedro Alves", createdAt: "2026-02-02", messages: 95, messageCost: 12.00, impressions: 18000, observations: "CPC alto no segmento saúde. Testando novos criativos." },
  { id: "tr-c2-02", clientId: "c2", clientName: "Clínica Saúde+", month: "2026-02", createdBy: "Pedro Alves", createdAt: "2026-03-03", messages: 110, messageCost: 10.50, impressions: 22000, observations: "Melhora no CPC após ajuste de segmentação." },
  { id: "tr-c2-03", clientId: "c2", clientName: "Clínica Saúde+", month: "2026-03", createdBy: "Pedro Alves", createdAt: "2026-03-20", messages: 88, messageCost: 14.20, impressions: 19000, observations: "Custo subiu. Revisando grupos de anúncio." },
  // LuxHome — 2 months
  { id: "tr-c3-01", clientId: "c3", clientName: "LuxHome Imóveis", month: "2026-02", createdBy: "Ana Lima", createdAt: "2026-03-03", messages: 45, messageCost: 38.00, impressions: 35000, observations: "Ticket alto compensa o CPL. 1 imóvel vendido." },
  { id: "tr-c3-02", clientId: "c3", clientName: "LuxHome Imóveis", month: "2026-03", createdBy: "Ana Lima", createdAt: "2026-03-20", messages: 62, messageCost: 32.00, impressions: 42000, observations: "3 imóveis vendidos! Melhor mês. CPL caiu 16%." },
  // Fitness Power — 2 months
  { id: "tr-c4-01", clientId: "c4", clientName: "Fitness Power Academia", month: "2026-02", createdBy: "Pedro Alves", createdAt: "2026-03-03", messages: 150, messageCost: 5.80, impressions: 28000, observations: "Resultados ok. Cliente satisfeito." },
  { id: "tr-c4-02", clientId: "c4", clientName: "Fitness Power Academia", month: "2026-03", createdBy: "Pedro Alves", createdAt: "2026-03-20", messages: 70, messageCost: 12.50, impressions: 15000, observations: "Queda brusca. Situação crítica." },
  // EduPro — 2 months
  { id: "tr-c6-01", clientId: "c6", clientName: "EduPro Cursos Online", month: "2026-02", createdBy: "Pedro Alves", createdAt: "2026-03-03", messages: 120, messageCost: 10.00, impressions: 38000, observations: "Bom volume de leads para o pré-lançamento." },
  { id: "tr-c6-02", clientId: "c6", clientName: "EduPro Cursos Online", month: "2026-03", createdBy: "Pedro Alves", createdAt: "2026-03-20", messages: 180, messageCost: 8.30, impressions: 55000, observations: "Lançamento do novo curso. 180 leads, CPL abaixo da meta." },
];

// Traffic routine checks (daily support, weekly reports/feedback)
export const mockTrafficRoutineChecks: TrafficRoutineCheck[] = [
  { id: "rc-1", clientId: "c1", clientName: "TechVision Soluções", date: "2026-03-21", type: "support", completedBy: "Ana Lima", completedAt: "2026-03-21T09:30:00" },
  { id: "rc-2", clientId: "c3", clientName: "LuxHome Imóveis", date: "2026-03-21", type: "support", completedBy: "Ana Lima", completedAt: "2026-03-21T09:45:00" },
  { id: "rc-3", clientId: "c1", clientName: "TechVision Soluções", date: "2026-03-17", type: "report", completedBy: "Ana Lima", completedAt: "2026-03-17T10:00:00" },
  { id: "rc-4", clientId: "c1", clientName: "TechVision Soluções", date: "2026-03-14", type: "feedback", completedBy: "Ana Lima", completedAt: "2026-03-14T16:00:00", note: "Cliente elogiou os resultados. Pediu mais vídeos." },
];

// Social monthly reports
export const mockSocialReports: SocialMonthlyReport[] = [
  // TechVision
  { id: "sr-c1-01", clientId: "c1", clientName: "TechVision Soluções", month: "2026-01", createdBy: "Carlos Melo", createdAt: "2026-02-02", postsPublished: 10, postsGoal: 12, reelsCount: 3, storiesCount: 15, reach: 18000, impressions: 42000, engagement: 2100, engagementRate: 5.0, followersGained: 320, followersLost: 45, topPost: "Reel: 5 tendências de IA", observations: "Bom engajamento nos reels." },
  { id: "sr-c1-02", clientId: "c1", clientName: "TechVision Soluções", month: "2026-02", createdBy: "Carlos Melo", createdAt: "2026-03-03", postsPublished: 11, postsGoal: 12, reelsCount: 4, storiesCount: 18, reach: 24000, impressions: 55000, engagement: 3200, engagementRate: 5.8, followersGained: 480, followersLost: 38, topPost: "Carrossel: Como a IA muda seu negócio", observations: "Crescimento forte. Reels viralizando." },
  { id: "sr-c1-03", clientId: "c1", clientName: "TechVision Soluções", month: "2026-03", createdBy: "Carlos Melo", createdAt: "2026-03-20", postsPublished: 9, postsGoal: 12, reelsCount: 4, storiesCount: 20, reach: 28000, impressions: 62000, engagement: 3800, engagementRate: 6.1, followersGained: 550, followersLost: 30, topPost: "Reel: 3 tendências de IA para 2026", observations: "Melhor mês. Taxa de engajamento acima de 6%." },
  // Clínica Saúde+
  { id: "sr-c2-01", clientId: "c2", clientName: "Clínica Saúde+", month: "2026-02", createdBy: "Mariana Costa", createdAt: "2026-03-03", postsPublished: 8, postsGoal: 10, reelsCount: 2, storiesCount: 12, reach: 9500, impressions: 22000, engagement: 980, engagementRate: 4.5, followersGained: 150, followersLost: 22, topPost: "Post: Novo procedimento estético", observations: "Engajamento bom no post do procedimento." },
  { id: "sr-c2-02", clientId: "c2", clientName: "Clínica Saúde+", month: "2026-03", createdBy: "Mariana Costa", createdAt: "2026-03-20", postsPublished: 7, postsGoal: 10, reelsCount: 2, storiesCount: 10, reach: 8200, impressions: 19000, engagement: 750, engagementRate: 3.9, followersGained: 110, followersLost: 28, observations: "Queda no alcance. Precisamos de mais reels." },
  // LuxHome
  { id: "sr-c3-01", clientId: "c3", clientName: "LuxHome Imóveis", month: "2026-02", createdBy: "Carlos Melo", createdAt: "2026-03-03", postsPublished: 12, postsGoal: 12, reelsCount: 5, storiesCount: 25, reach: 32000, impressions: 75000, engagement: 4500, engagementRate: 6.0, followersGained: 680, followersLost: 50, topPost: "Tour virtual: Cobertura Jardins", observations: "Cliente atingiu meta de posts. Tours performam muito." },
  { id: "sr-c3-02", clientId: "c3", clientName: "LuxHome Imóveis", month: "2026-03", createdBy: "Carlos Melo", createdAt: "2026-03-20", postsPublished: 10, postsGoal: 12, reelsCount: 4, storiesCount: 22, reach: 35000, impressions: 80000, engagement: 5200, engagementRate: 6.5, followersGained: 720, followersLost: 42, topPost: "Reel: 3 imóveis vendidos este mês", observations: "Alcance cresceu mesmo com menos posts. Qualidade > quantidade." },
  // EduPro
  { id: "sr-c6-01", clientId: "c6", clientName: "EduPro Cursos Online", month: "2026-02", createdBy: "Mariana Costa", createdAt: "2026-03-03", postsPublished: 9, postsGoal: 10, reelsCount: 3, storiesCount: 14, reach: 15000, impressions: 38000, engagement: 2200, engagementRate: 5.8, followersGained: 400, followersLost: 35, topPost: "Reels: Dica rápida de investimento", observations: "Conteúdo educativo tem bom engajamento." },
  { id: "sr-c6-02", clientId: "c6", clientName: "EduPro Cursos Online", month: "2026-03", createdBy: "Mariana Costa", createdAt: "2026-03-20", postsPublished: 11, postsGoal: 10, reelsCount: 5, storiesCount: 20, reach: 22000, impressions: 55000, engagement: 3500, engagementRate: 6.4, followersGained: 620, followersLost: 28, topPost: "Reels: Lançamento novo curso", observations: "Lançamento impulsionou tudo. Melhor mês da conta." },
];

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

// ══════════════════════════════════════════════════════════════
// AD ANALYTICS — Mock Meta Ads data (Phase 1)
// ══════════════════════════════════════════════════════════════

function generateDailyMetrics(
  baseSp: number, baseImp: number, baseClicks: number, baseConv: number,
  opts?: { days?: number; baseMessages?: number; baseLeads?: number }
) {
  const days = opts?.days ?? 30;
  const baseMsg = opts?.baseMessages ?? 0;
  const baseLead = opts?.baseLeads ?? 0;
  const metrics = [];
  const today = new Date("2026-03-31");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const variance = 0.7 + Math.random() * 0.6;
    metrics.push({
      date: d.toISOString().slice(0, 10),
      spend: Math.round(baseSp * variance * 100) / 100,
      impressions: Math.round(baseImp * variance),
      clicks: Math.round(baseClicks * variance),
      conversions: Math.round(baseConv * variance),
      ...(baseMsg > 0 ? { messages: Math.round(baseMsg * variance) } : {}),
      ...(baseLead > 0 ? { leads: Math.round(baseLead * variance) } : {}),
    });
  }
  return metrics;
}

export const mockAdAccounts: AdAccount[] = [
  { id: "aa1", clientId: "c1", clientName: "TechVision Soluções", platform: "meta", accountId: "act_tv_001", accountName: "TechVision - Principal", currency: "BRL" },
  { id: "aa2", clientId: "c2", clientName: "Clínica Saúde+", platform: "meta", accountId: "act_cs_002", accountName: "Clínica Saúde+ - Ads", currency: "BRL" },
  { id: "aa3", clientId: "c3", clientName: "LuxHome Imóveis", platform: "meta", accountId: "act_lh_003", accountName: "LuxHome - Premium Ads", currency: "BRL" },
  { id: "aa4", clientId: "c4", clientName: "Fitness Power Academia", platform: "meta", accountId: "act_fp_004", accountName: "Fitness Power - Meta", currency: "BRL" },
  { id: "aa5", clientId: "c5", clientName: "Restaurante Bella Vista", platform: "meta", accountId: "act_st_005", accountName: "Bella Vista - Delivery", currency: "BRL" },
  { id: "aa6", clientId: "c6", clientName: "EduPro Cursos Online", platform: "meta", accountId: "act_ep_006", accountName: "EduPro - Captação", currency: "BRL" },
];

export const mockAdCampaigns: AdCampaign[] = [
  // TechVision — 3 campaigns (high budget)
  // camp1: objective=messages → messages is the primary result
  { id: "camp1", accountId: "aa1", clientId: "c1", clientName: "TechVision Soluções", name: "Geração de Leads - Software ERP", objective: "messages", status: "active", dailyBudget: 150, totalBudget: 4500, startDate: "2026-03-01", spend: 3245.80, impressions: 185000, reach: 92000, clicks: 4625, ctr: 2.5, cpc: 0.70, cpm: 17.54, conversions: 312, costPerConversion: 10.40, messages: 312, costPerMessage: 10.40, results: 312, costPerResult: 10.40, dailyMetrics: generateDailyMetrics(108, 6167, 154, 10, { baseMessages: 10 }) },
  // camp2: objective=conversions → conversions is the result
  { id: "camp2", accountId: "aa1", clientId: "c1", clientName: "TechVision Soluções", name: "Remarketing - Visitantes Site", objective: "conversions", status: "active", dailyBudget: 80, totalBudget: 2400, startDate: "2026-03-01", spend: 1680.50, impressions: 120000, reach: 35000, clicks: 3600, ctr: 3.0, cpc: 0.47, cpm: 14.00, conversions: 180, costPerConversion: 9.34, results: 180, costPerResult: 9.34, dailyMetrics: generateDailyMetrics(56, 4000, 120, 6) },
  // camp3: objective=reach → clicks as result proxy
  { id: "camp3", accountId: "aa1", clientId: "c1", clientName: "TechVision Soluções", name: "Branding - Autoridade Tech", objective: "reach", status: "active", dailyBudget: 50, totalBudget: 1500, startDate: "2026-03-10", spend: 620.00, impressions: 95000, reach: 72000, clicks: 1425, ctr: 1.5, cpc: 0.44, cpm: 6.53, conversions: 45, costPerConversion: 13.78, results: 1425, costPerResult: 0.44, dailyMetrics: generateDailyMetrics(29, 4524, 68, 2, { days: 21 }) },

  // Clínica Saúde+ — 2 campaigns
  // camp4: objective=messages → WhatsApp agendamentos
  { id: "camp4", accountId: "aa2", clientId: "c2", clientName: "Clínica Saúde+", name: "Agendamentos WhatsApp", objective: "messages", status: "active", dailyBudget: 70, totalBudget: 2100, startDate: "2026-03-01", spend: 1540.20, impressions: 98000, reach: 55000, clicks: 2940, ctr: 3.0, cpc: 0.52, cpm: 15.72, conversions: 210, costPerConversion: 7.33, messages: 210, costPerMessage: 7.33, results: 210, costPerResult: 7.33, dailyMetrics: generateDailyMetrics(51, 3267, 98, 7, { baseMessages: 7 }) },
  // camp5: objective=leads
  { id: "camp5", accountId: "aa2", clientId: "c2", clientName: "Clínica Saúde+", name: "Campanha Checkup Março", objective: "leads", status: "active", dailyBudget: 60, totalBudget: 1800, startDate: "2026-03-05", spend: 1050.00, impressions: 72000, reach: 42000, clicks: 2160, ctr: 3.0, cpc: 0.49, cpm: 14.58, conversions: 156, costPerConversion: 6.73, leads: 156, costPerLead: 6.73, results: 156, costPerResult: 6.73, dailyMetrics: generateDailyMetrics(40, 2769, 83, 6, { baseLeads: 6, days: 26 }) },

  // LuxHome — 3 campaigns (highest budget)
  // camp6: objective=leads → imóveis alto padrão (CPL alto)
  { id: "camp6", accountId: "aa3", clientId: "c3", clientName: "LuxHome Imóveis", name: "Captação Leads - Imóveis Alto Padrão", objective: "leads", status: "active", dailyBudget: 200, totalBudget: 6000, startDate: "2026-03-01", spend: 4320.00, impressions: 210000, reach: 105000, clicks: 5250, ctr: 2.5, cpc: 0.82, cpm: 20.57, conversions: 180, costPerConversion: 24.00, leads: 180, costPerLead: 24.00, results: 180, costPerResult: 24.00, dailyMetrics: generateDailyMetrics(144, 7000, 175, 6, { baseLeads: 6 }) },
  // camp7: objective=traffic
  { id: "camp7", accountId: "aa3", clientId: "c3", clientName: "LuxHome Imóveis", name: "Tour Virtual 360° - Jardins", objective: "traffic", status: "active", dailyBudget: 120, totalBudget: 3600, startDate: "2026-03-01", spend: 2580.00, impressions: 145000, reach: 82000, clicks: 4350, ctr: 3.0, cpc: 0.59, cpm: 17.79, conversions: 95, costPerConversion: 27.16, results: 4350, costPerResult: 0.59, dailyMetrics: generateDailyMetrics(86, 4833, 145, 3) },
  // camp8: paused — no daily data
  { id: "camp8", accountId: "aa3", clientId: "c3", clientName: "LuxHome Imóveis", name: "Remarketing - Interesse Compra", objective: "conversions", status: "paused", dailyBudget: 80, totalBudget: 2400, startDate: "2026-03-01", endDate: "2026-03-15", spend: 1120.00, impressions: 68000, reach: 22000, clicks: 2040, ctr: 3.0, cpc: 0.55, cpm: 16.47, conversions: 68, costPerConversion: 16.47, results: 68, costPerResult: 16.47, dailyMetrics: generateDailyMetrics(75, 4533, 136, 5, { days: 15 }) },

  // Fitness Power — 2 campaigns (low budget, at_risk client)
  // camp9: objective=messages
  { id: "camp9", accountId: "aa4", clientId: "c4", clientName: "Fitness Power Academia", name: "Matrícula Março - Promoção", objective: "messages", status: "active", dailyBudget: 50, totalBudget: 1500, startDate: "2026-03-01", spend: 1125.00, impressions: 62000, reach: 38000, clicks: 1860, ctr: 3.0, cpc: 0.60, cpm: 18.15, conversions: 78, costPerConversion: 14.42, messages: 78, costPerMessage: 14.42, results: 78, costPerResult: 14.42, dailyMetrics: generateDailyMetrics(38, 2067, 62, 3, { baseMessages: 3 }) },
  // camp10: error status — leads
  { id: "camp10", accountId: "aa4", clientId: "c4", clientName: "Fitness Power Academia", name: "Personal Trainer Online", objective: "leads", status: "error", dailyBudget: 40, totalBudget: 1200, startDate: "2026-03-10", spend: 280.00, impressions: 15000, reach: 9500, clicks: 375, ctr: 2.5, cpc: 0.75, cpm: 18.67, conversions: 12, costPerConversion: 23.33, leads: 12, costPerLead: 23.33, results: 12, costPerResult: 23.33, dailyMetrics: generateDailyMetrics(13, 714, 18, 1, { baseLeads: 1, days: 21 }) },

  // Restaurante Bella Vista — 2 campaigns
  // camp11: objective=messages (WhatsApp delivery)
  { id: "camp11", accountId: "aa5", clientId: "c5", clientName: "Restaurante Bella Vista", name: "Delivery iFood + WhatsApp", objective: "messages", status: "active", dailyBudget: 45, totalBudget: 1350, startDate: "2026-03-01", spend: 990.00, impressions: 78000, reach: 48000, clicks: 2340, ctr: 3.0, cpc: 0.42, cpm: 12.69, conversions: 195, costPerConversion: 5.08, messages: 195, costPerMessage: 5.08, results: 195, costPerResult: 5.08, dailyMetrics: generateDailyMetrics(33, 2600, 78, 7, { baseMessages: 7 }) },
  // camp12: completed — no active daily data
  { id: "camp12", accountId: "aa5", clientId: "c5", clientName: "Restaurante Bella Vista", name: "Almoço Executivo - Região", objective: "reach", status: "completed", dailyBudget: 30, totalBudget: 450, startDate: "2026-03-01", endDate: "2026-03-15", spend: 450.00, impressions: 55000, reach: 35000, clicks: 1100, ctr: 2.0, cpc: 0.41, cpm: 8.18, conversions: 65, costPerConversion: 6.92, results: 1100, costPerResult: 0.41, dailyMetrics: generateDailyMetrics(30, 3667, 73, 4, { days: 15 }) },

  // EduPro — 2 campaigns
  // camp13: objective=conversions (curso)
  { id: "camp13", accountId: "aa6", clientId: "c6", clientName: "EduPro Cursos Online", name: "Lançamento Curso Investimentos", objective: "conversions", status: "active", dailyBudget: 100, totalBudget: 3000, startDate: "2026-03-01", spend: 2180.00, impressions: 155000, reach: 88000, clicks: 4650, ctr: 3.0, cpc: 0.47, cpm: 14.06, conversions: 280, costPerConversion: 7.79, results: 280, costPerResult: 7.79, dailyMetrics: generateDailyMetrics(73, 5167, 155, 9) },
  // camp14: objective=conversions (remarketing)
  { id: "camp14", accountId: "aa6", clientId: "c6", clientName: "EduPro Cursos Online", name: "Remarketing - Carrinho Abandonado", objective: "conversions", status: "active", dailyBudget: 60, totalBudget: 1800, startDate: "2026-03-05", spend: 1020.00, impressions: 82000, reach: 28000, clicks: 2460, ctr: 3.0, cpc: 0.41, cpm: 12.44, conversions: 165, costPerConversion: 6.18, results: 165, costPerResult: 6.18, dailyMetrics: generateDailyMetrics(39, 3154, 95, 6, { days: 26 }) },
];
