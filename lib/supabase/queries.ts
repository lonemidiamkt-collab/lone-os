/**
 * DÉBITO TÉCNICO — Service role bypass via typeof window
 *
 * Esta solução é TEMPORÁRIA. queries.ts usa supabaseAdmin (que
 * bypassa RLS) quando rodando server-side, e supabase (browser
 * client com session) quando rodando client-side.
 *
 * Riscos atuais:
 * - RLS deixa de ser defesa em profundidade nas 9 API routes que
 *   usam essas funções
 * - API routes precisam fazer filtro de role/auth manualmente
 * - typeof window é frágil em SSR/edge runtimes
 *
 * Plano de remoção: refatorar para receber SupabaseClient como
 * parâmetro explícito em cada função. Ver BACKLOG.
 *
 * Histórico:
 * - Implementado em hotfix/queries-server-context (27/Mai/2026)
 * - Causa: remoção da senha-mestra expôs que API routes nunca
 *   passaram contexto de auth pro Supabase. Sistema antigo com
 *   LocalSession mascarava esse problema.
 */
import { supabase } from "./client";
import { supabaseAdmin } from "./server";
import type {
  Client, Task, ContentCard, DesignRequest, AppNotification,
  TimelineEntry, ChatMessage, GlobalChatMessage, OnboardingItem,
  MoodEntry, MoodType, CreativeAsset, SocialProofEntry, CrisisNote,
  Notice, QuinzReport, ClientAccess, TrafficMonthlyReport,
  TrafficRoutineCheck, SocialMonthlyReport, ContentApproval,
  Role, CardAttachment, CsClientRule, CrmLead, CrmEstagio, CrmLeadActivity, CrmAtividadeTipo, CrmMeta,
} from "@/lib/types";

// No servidor (API routes), supabase browser client não tem session → RLS bloqueia tudo.
// supabaseAdmin usa service_role e bypassa RLS — correto para chamadas server-side.
// No browser, usa supabase normal com a session do usuário.
const db = typeof window !== "undefined" ? supabase : supabaseAdmin;

// SENHAS DE PLATAFORMA (facebookPassword, instagramPassword, googleAdsPassword)
// NÃO viajam mais pelo estado do Client. São lidas server-side via /api/client-vault/reveal
// quando admin clica em "mostrar senha". Isso previne:
//   - Senha ficar em memória do browser sem necessidade
//   - Supabase RLS leak hipotético (se RLS relaxar algum dia)
//   - Chance de vazamento via React DevTools / state inspection
// snakeToClient continua recebendo a coluna do banco mas DESCARTA o valor da senha.

// ═══════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════

function snakeToClient(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    name: row.name as string,
    logo: (row.logo as string) ?? undefined,
    industry: (row.industry as string) ?? "Outro",
    monthlyBudget: Number(row.monthly_budget ?? 0),
    dailyBudget: row.daily_budget != null ? Number(row.daily_budget) : undefined,
    status: (row.status as Client["status"]) ?? "onboarding",
    active: (row.active as boolean) ?? true,
    churnedAt: (row.churned_at as string) ?? undefined,
    churnReason: (row.churn_reason as string) ?? undefined,
    attentionLevel: (row.attention_level as Client["attentionLevel"]) ?? "medium",
    tags: (row.tags as string[]) ?? [],
    assignedTraffic: (row.assigned_traffic as string) ?? "",
    assignedSocial: (row.assigned_social as string) ?? "",
    assignedDesigner: (row.assigned_designer as string) ?? "",
    lastPostDate: (row.last_post_date as string) ?? undefined,
    joinDate: (row.join_date as string) ?? new Date().toISOString().slice(0, 10),
    createdAt: (row.created_at as string) ?? undefined,
    paymentMethod: (row.payment_method as Client["paymentMethod"]) ?? "pix",
    notes: (row.notes as string) ?? undefined,
    contractEnd: (row.contract_end as string) ?? undefined,
    toneOfVoice: (row.tone_of_voice as Client["toneOfVoice"]) ?? undefined,
    driveLink: (row.drive_link as string) ?? undefined,
    instagramUser: (row.instagram_user as string) ?? undefined,
    postsThisMonth: (row.posts_this_month as number) ?? 0,
    postsGoal: (row.posts_goal as number) ?? 12,
    serviceType: (row.service_type as Client["serviceType"]) ?? "lone_growth",
    perfilConteudo: (row.perfil_conteudo as Client["perfilConteudo"]) ?? undefined,
    draftStatus: (row.draft_status as Client["draftStatus"]) ?? null,
    contactName: (row.contact_name as string) ?? undefined,
    contactRole: (row.contact_role as string) ?? undefined,
    idade: (row.idade as string) ?? undefined,
    nicho: (row.nicho as string) ?? undefined,
    razaoSocial: (row.razao_social as string) ?? undefined,
    nomeFantasia: (row.nome_fantasia as string) ?? undefined,
    cnpj: (row.cnpj as string) ?? undefined,
    endereco: (row.endereco as string) ?? undefined,
    enderecoRua: (row.endereco_rua as string) ?? undefined,
    enderecoNumero: (row.endereco_numero as string) ?? undefined,
    enderecoBairro: (row.endereco_bairro as string) ?? undefined,
    enderecoCidade: (row.endereco_cidade as string) ?? undefined,
    enderecoEstado: (row.endereco_estado as string) ?? undefined,
    enderecoCep: (row.endereco_cep as string) ?? undefined,
    emailCorporativo: (row.email_corporativo as string) ?? undefined,
    docContratoSocial: (row.doc_contrato_social as string) ?? undefined,
    docIdentidade: (row.doc_identidade as string) ?? undefined,
    docLogo: (row.doc_logo as string) ?? undefined,
    lastKanbanActivity: (row.last_kanban_activity as string) ?? undefined,
    campaignBriefing: (row.campaign_briefing as string) ?? undefined,
    fixedBriefing: (row.fixed_briefing as string) ?? undefined,
    agenteAtivo: (row.agente_ativo as boolean) ?? true,
    metaAdAccountId: (row.meta_ad_account_id as string) ?? undefined,
    metaAdAccountName: (row.meta_ad_account_name as string) ?? undefined,
    cpfCnpj: (row.cpf_cnpj as string) ?? undefined,
    birthDate: (row.birth_date as string) ?? undefined,
    phone: (row.phone as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    leadSource: (row.lead_source as Client["leadSource"]) ?? undefined,
    facebookLogin: (row.facebook_login as string) ?? undefined,
    // Senhas NÃO saem do banco pelo caminho do estado. Admin chama /api/client-vault/reveal quando precisar.
    facebookPassword: undefined,
    googleAdsLogin: (row.google_ads_login as string) ?? undefined,
    googleAdsPassword: undefined,
    instagramLogin: (row.instagram_login as string) ?? undefined,
    instagramPassword: undefined,
    budgetAlertPct: (row.budget_alert_pct as number) ?? undefined,
    npsScore: (row.nps_score as number) ?? undefined,
    firstValueDeliveredAt: (row.first_value_delivered_at as string) ?? undefined,
    activatedAt: (row.activated_at as string) ?? undefined,
    ttvDays: (row.ttv_days as number) ?? undefined,
    // Portal público
    publicReportToken: (row.public_report_token as string) ?? undefined,
    publicReportTokenCreatedAt: (row.public_report_token_created_at as string) ?? undefined,
    publicReportTokenRevokedAt: (row.public_report_token_revoked_at as string) ?? undefined,
    publicReportEnabled: (row.public_report_enabled as boolean) ?? false,
    whatsappTeamPhone: (row.whatsapp_team_phone as string) ?? undefined,
    // Ficha Viva (link do cliente)
    fichaVivaToken: (row.ficha_viva_token as string) ?? undefined,
    fichaVivaRaioxToken: (row.ficha_viva_raiox_token as string) ?? undefined,
    fichaVivaTokenCreatedAt: (row.ficha_viva_token_created_at as string) ?? undefined,
    fichaVivaTokenRevokedAt: (row.ficha_viva_token_revoked_at as string) ?? undefined,
    fichaVivaEnabled: (row.ficha_viva_enabled as boolean) ?? false,
  };
}

function clientToSnake(c: Partial<Client>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.logo !== undefined) row.logo = c.logo;
  if (c.industry !== undefined) row.industry = c.industry;
  if (c.monthlyBudget !== undefined) row.monthly_budget = c.monthlyBudget;
  if (c.status !== undefined) row.status = c.status;
  if (c.active !== undefined) row.active = c.active;
  if (c.churnedAt !== undefined) row.churned_at = c.churnedAt;
  if (c.churnReason !== undefined) row.churn_reason = c.churnReason;
  if (c.attentionLevel !== undefined) row.attention_level = c.attentionLevel;
  if (c.tags !== undefined) row.tags = c.tags;
  if (c.paymentMethod !== undefined) row.payment_method = c.paymentMethod;
  if (c.joinDate !== undefined) row.join_date = c.joinDate;
  if (c.contractEnd !== undefined) row.contract_end = c.contractEnd;
  if (c.lastPostDate !== undefined) row.last_post_date = c.lastPostDate;
  if (c.notes !== undefined) row.notes = c.notes;
  if (c.assignedTraffic !== undefined) row.assigned_traffic = c.assignedTraffic;
  if (c.assignedSocial !== undefined) row.assigned_social = c.assignedSocial;
  if (c.assignedDesigner !== undefined) row.assigned_designer = c.assignedDesigner;
  if (c.toneOfVoice !== undefined) row.tone_of_voice = c.toneOfVoice;
  if (c.driveLink !== undefined) row.drive_link = c.driveLink;
  if (c.instagramUser !== undefined) row.instagram_user = c.instagramUser;
  if (c.postsThisMonth !== undefined) row.posts_this_month = c.postsThisMonth;
  if (c.postsGoal !== undefined) row.posts_goal = c.postsGoal;
  if (c.serviceType !== undefined) row.service_type = c.serviceType;
  if (c.perfilConteudo !== undefined) row.perfil_conteudo = c.perfilConteudo;
  if (c.draftStatus !== undefined) row.draft_status = c.draftStatus;
  if (c.contactName !== undefined) row.contact_name = c.contactName;
  if (c.contactRole !== undefined) row.contact_role = c.contactRole;
  if (c.idade !== undefined) row.idade = c.idade;
  if (c.nicho !== undefined) row.nicho = c.nicho;
  if (c.razaoSocial !== undefined) row.razao_social = c.razaoSocial;
  if (c.nomeFantasia !== undefined) row.nome_fantasia = c.nomeFantasia;
  if (c.cnpj !== undefined) row.cnpj = c.cnpj;
  if (c.endereco !== undefined) row.endereco = c.endereco;
  if (c.enderecoRua !== undefined) row.endereco_rua = c.enderecoRua;
  if (c.enderecoNumero !== undefined) row.endereco_numero = c.enderecoNumero;
  if (c.enderecoBairro !== undefined) row.endereco_bairro = c.enderecoBairro;
  if (c.enderecoCidade !== undefined) row.endereco_cidade = c.enderecoCidade;
  if (c.enderecoEstado !== undefined) row.endereco_estado = c.enderecoEstado;
  if (c.enderecoCep !== undefined) row.endereco_cep = c.enderecoCep;
  if (c.emailCorporativo !== undefined) row.email_corporativo = c.emailCorporativo;
  if (c.docContratoSocial !== undefined) row.doc_contrato_social = c.docContratoSocial;
  if (c.docIdentidade !== undefined) row.doc_identidade = c.docIdentidade;
  if (c.docLogo !== undefined) row.doc_logo = c.docLogo;
  if (c.lastKanbanActivity !== undefined) row.last_kanban_activity = c.lastKanbanActivity;
  if (c.campaignBriefing !== undefined) row.campaign_briefing = c.campaignBriefing;
  if (c.fixedBriefing !== undefined) row.fixed_briefing = c.fixedBriefing;
  if (c.metaAdAccountId !== undefined) row.meta_ad_account_id = c.metaAdAccountId;
  if (c.metaAdAccountName !== undefined) row.meta_ad_account_name = c.metaAdAccountName;
  if (c.cpfCnpj !== undefined) row.cpf_cnpj = c.cpfCnpj;
  if (c.birthDate !== undefined) row.birth_date = c.birthDate;
  if (c.phone !== undefined) row.phone = c.phone;
  if (c.email !== undefined) row.email = c.email;
  if (c.leadSource !== undefined) row.lead_source = c.leadSource;
  if (c.facebookLogin !== undefined) row.facebook_login = c.facebookLogin;
  // Senhas NÃO são escritas via updateClientDb (que roda no browser sem o VAULT_KEY).
  // Admin edita via /api/client-vault/update que faz encrypt server-side antes de persistir.
  // Se alguém tentar burlar passando facebookPassword, é ignorado (defense in depth).
  if (c.googleAdsLogin !== undefined) row.google_ads_login = c.googleAdsLogin;
  // google_ads_password: via /api/client-vault/update
  if (c.instagramLogin !== undefined) row.instagram_login = c.instagramLogin;
  // instagram_password: via /api/client-vault/update
  return row;
}

// SEGURANÇA — colunas que NÃO vão nas LISTAS (carregadas em massa em TODO browser logado).
// Tirar daqui: tokens de acesso público (dão acesso sem login à ficha/portal do cliente),
// logins/senhas de plataforma, e PII sensível (cpf, endereço, docs, nascimento, pix, telefone
// financeiro). Quem precisa desses campos (tela de detalhe do cliente, aprovação de cadastro)
// puxa o registro COMPLETO, 1 cliente por vez, por rota gated no servidor (fetchClientById /
// fetchDraftClientsFull → /api/clients/[id]). Allowlist é fail-safe: coluna nova só aparece na
// lista se for adicionada aqui de propósito.
const CLIENT_LEAN_COLS = [
  "id", "name", "logo", "logo_url", "doc_logo", "industry", "nicho", "monthly_budget", "daily_budget",
  "status", "active", "churned_at", "churn_reason", "attention_level", "tags",
  "assigned_traffic", "assigned_social", "assigned_designer", "last_post_date", "join_date", "created_at",
  "updated_at", "payment_method", "notes", "contract_end", "tone_of_voice", "drive_link", "instagram_user",
  "posts_this_month", "posts_goal", "service_type", "perfil_conteudo", "draft_status", "contact_name",
  "contact_role", "razao_social", "nome_fantasia", "cnpj", "email", "email_corporativo", "phone",
  "last_kanban_activity", "campaign_briefing", "fixed_briefing", "agente_ativo", "meta_ad_account_id",
  "meta_ad_account_name", "lead_source", "budget_alert_pct", "nps_score", "first_value_delivered_at",
  "activated_at", "ttv_days", "public_report_enabled", "ficha_viva_enabled", "whatsapp_team_phone",
  "whatsapp_group_jid", "whatsapp_group_name", "portal_welcome_message", "brand_color", "fb_page_id",
  "ig_business_account_id", "ig_public_username", "ig_username_cache", "current_health_level",
  "current_health_score", "health_computed_at", "last_client_msg_at",
].join(",");

// Clientes ATIVOS (carteira atual). Ex-clientes (active=false) ficam de fora de
// toda a operação — listagens, /social, automação que lê o estado do app.
// Arquivados são carregados sob demanda por fetchChurnedClients (view de arquivados / métricas).
export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await db.from("clients").select(CLIENT_LEAN_COLS).is("draft_status", null).neq("active", false).order("name");
  if (error) { console.error("[DB] fetchClients:", error); return []; }
  return (data ?? []).map((r) => snakeToClient(r as unknown as Record<string, unknown>));
}

// Ex-clientes (churned). Para a aba "Arquivados" e métricas de carteira.
export async function fetchChurnedClients(): Promise<Client[]> {
  const { data, error } = await db.from("clients").select(CLIENT_LEAN_COLS).is("draft_status", null).eq("active", false).order("churned_at", { ascending: false });
  if (error) { console.error("[DB] fetchChurnedClients:", error); return []; }
  return (data ?? []).map((r) => snakeToClient(r as unknown as Record<string, unknown>));
}

// Rascunhos (cadastros em onboarding, pré-aprovação). Lista fica MAGRA; a tela de aprovação
// puxa os campos completos via fetchDraftClientsFull (gated, server).
export async function fetchDraftClients(): Promise<Client[]> {
  const { data, error } = await db.from("clients").select(CLIENT_LEAN_COLS).not("draft_status", "is", null).order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchDraftClients:", error); return []; }
  return (data ?? []).map((r) => snakeToClient(r as unknown as Record<string, unknown>));
}

// COMPLETO — 1 cliente. SÓ server (service_role). Usado pela rota gated /api/clients/[id] pra
// alimentar a tela de detalhe (form Dados, cards de link público). Senhas continuam fora (snakeToClient
// as descarta; admin revela via /api/client-vault/reveal).
export async function fetchClientById(id: string): Promise<Client | null> {
  const { data, error } = await supabaseAdmin.from("clients").select("*").eq("id", id).maybeSingle();
  if (error) { console.error("[DB] fetchClientById:", error); return null; }
  return data ? snakeToClient(data) : null;
}

// COMPLETO — rascunhos. SÓ server (service_role). Alimenta a tela de aprovação de cadastro.
export async function fetchDraftClientsFull(): Promise<Client[]> {
  const { data, error } = await supabaseAdmin.from("clients").select("*").not("draft_status", "is", null).order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchDraftClientsFull:", error); return []; }
  return (data ?? []).map(snakeToClient);
}

export async function insertClient(client: Omit<Client, "id"> & { id?: string }): Promise<{ id: string }> {
  const row = clientToSnake(client as Partial<Client>);
  row.join_date = client.joinDate ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await db.from("clients").insert(row).select("id").single();
  if (error) { console.error("[DB] insertClient:", error); throw error; }
  return { id: data.id as string };
}

export async function updateClientDb(id: string, updates: Partial<Client>): Promise<void> {
  const { authedFetch } = await import("@/lib/supabase/authed-fetch");
  const res = await authedFetch("/api/clients/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...updates }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error("[DB] updateClient:", data.error ?? `HTTP ${res.status}`);
    throw new Error(data.error || `Falha ao salvar cliente (HTTP ${res.status})`);
  }
}

// ═══════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════

function snakeToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    clientId: (row.client_id as string) ?? "",
    clientName: (row.client_name as string) ?? "",
    assignedTo: row.assigned_to as string,
    role: row.role as Task["role"],
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    startDate: (row.start_date as string) ?? undefined,
    dueDate: (row.due_date as string) ?? undefined,
    description: (row.description as string) ?? undefined,
    createdBy: (row.created_by as string) ?? undefined,
    workStartedAt: (row.work_started_at as string) ?? undefined,
    totalTimeSpentMs: (row.total_time_spent_ms as number) ?? 0,
  };
}

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await db.from("tasks").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchTasks:", error); return []; }
  return (data ?? []).map(snakeToTask);
}

export async function insertTask(task: Omit<Task, "id">): Promise<{ id: string }> {
  const { authedFetch } = await import("@/lib/supabase/authed-fetch");
  const res = await authedFetch("/api/tasks/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) { console.error("[DB] insertTask:", data); throw new Error(data.error || "Falha ao criar tarefa"); }
  return { id: data.id as string };
}

export async function updateTaskDb(id: string, updates: Partial<Task>): Promise<void> {
  const { authedFetch } = await import("@/lib/supabase/authed-fetch");
  const res = await authedFetch("/api/tasks/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...updates }),
  });
  if (!res.ok) console.error("[DB] updateTask: HTTP", res.status);
}

// ═══════════════════════════════════════════════════════════
// CONTENT CARDS
// ═══════════════════════════════════════════════════════════

export function snakeToContentCard(row: Record<string, unknown>): ContentCard {
  return {
    id: row.id as string,
    title: row.title as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    socialMedia: (row.social_media as string) ?? "",
    status: (row.status as ContentCard["status"]) ?? "ideas",
    priority: (row.priority as ContentCard["priority"]) ?? "medium",
    format: (row.format as string) ?? "",
    platform: (row.platform as ContentCard["platform"]) ?? undefined,
    dueDate: (row.due_date as string) ?? undefined,
    dueTime: (row.due_time as string) ?? undefined,
    briefing: (row.briefing as string) ?? undefined,
    caption: (row.caption as string) ?? undefined,
    hashtags: (row.hashtags as string) ?? undefined,
    imageUrl: (row.image_url as string) ?? undefined,
    archivedAt: (row.archived_at as string) ?? undefined,
    observations: (row.observations as string) ?? undefined,
    statusChangedAt: (row.status_changed_at as string) ?? undefined,
    columnEnteredAt: (row.column_entered_at as Record<string, string>) ?? undefined,
    designRequestId: (row.design_request_id as string) ?? undefined,
    designerDeliveredAt: (row.designer_delivered_at as string) ?? undefined,
    designerDeliveredBy: (row.designer_delivered_by as string) ?? undefined,
    socialConfirmedAt: (row.social_confirmed_at as string) ?? undefined,
    socialConfirmedBy: (row.social_confirmed_by as string) ?? undefined,
    clientApprovedAt: (row.client_approved_at as string) ?? undefined,
    nonDeliveryReason: (row.non_delivery_reason as string) ?? undefined,
    nonDeliveryReportedBy: (row.non_delivery_reported_by as string) ?? undefined,
    nonDeliveryReportedAt: (row.non_delivery_reported_at as string) ?? undefined,
    workStartedAt: (row.work_started_at as string) ?? undefined,
    totalTimeSpentMs: (row.total_time_spent_ms as number) ?? 0,
    publishVerifiedAt: (row.publish_verified_at as string) ?? undefined,
    publishVerifiedBy: (row.publish_verified_by as string) ?? undefined,
    requestedByTraffic: (row.requested_by_traffic as string) ?? undefined,
    trafficSuggestion: (row.traffic_suggestion as string) ?? undefined,
  };
}

export async function fetchContentCards(filter?: { socialMedia?: string; archived?: boolean }): Promise<ContentCard[]> {
  // A LISTA DE ARQUIVADAS ORDENA POR QUANDO FOI ARQUIVADA, não por quando o card nasceu.
  // Ordenar por created_at fazia um card antigo arquivado HOJE aparecer embaixo de um card novo
  // arquivado semana passada — e quem arquivou sem querer procura o item no topo, não no meio de
  // uma lista de 200. Foi o "aparece um arquivado semana passada na frente dos recentes".
  const campoOrdem = filter?.archived ? "archived_at" : "created_at";
  let query = db.from("content_cards").select("*").order(campoOrdem, { ascending: false });
  if (filter?.socialMedia) query = query.eq("social_media", filter.socialMedia);
  // Por padrão o board mostra só demandas ativas. archived=true traz só as arquivadas (tela "Arquivadas").
  query = filter?.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query;
  if (error) { console.error("[DB] fetchContentCards:", error); return []; }
  // Also load comments for each card
  const cards = (data ?? []).map(snakeToContentCard);
  if (cards.length > 0) {
    const { data: comments } = await db.from("card_comments").select("*").order("created_at");
    if (comments) {
      const commentMap = new Map<string, Array<{ id: string; author: string; role: Role; text: string; createdAt: string }>>();
      for (const c of comments) {
        const cardId = c.card_id as string;
        if (!commentMap.has(cardId)) commentMap.set(cardId, []);
        commentMap.get(cardId)!.push({
          id: c.id as string,
          author: c.author as string,
          role: (c.role as Role) ?? "social",
          text: c.text as string,
          createdAt: c.created_at as string,
        });
      }
      for (const card of cards) {
        if (commentMap.has(card.id)) {
          card.comments = commentMap.get(card.id);
        }
      }
    }

    // Multi-arte: carrega os anexos de todos os cards em lote e define a capa.
    // Resiliente: se a tabela ainda não existe (migration 044 não aplicada),
    // o board continua funcionando com o image_url legado.
    const cardIds = cards.map((c) => c.id);
    const { data: atts, error: attErr } = await db
      .from("card_attachments")
      .select("id, card_id, url, path, position, created_at")
      .in("card_id", cardIds)
      .order("position", { ascending: true });
    if (attErr) {
      console.error("[DB] fetchContentCards attachments:", attErr.message);
    } else if (atts) {
      const attMap = new Map<string, CardAttachment[]>();
      for (const a of atts) {
        const cid = a.card_id as string;
        if (!attMap.has(cid)) attMap.set(cid, []);
        attMap.get(cid)!.push(a as unknown as CardAttachment);
      }
      for (const card of cards) {
        const list = attMap.get(card.id);
        if (list && list.length > 0) {
          card.cardAttachments = list;
          // Capa = 1ª arte (position 0). Mantém todos os leitores de imageUrl
          // funcionando mesmo após a migração silenciosa zerar image_url.
          if (!card.imageUrl) card.imageUrl = list[0].url;
        }
      }
    }
  }
  return cards;
}

export async function insertContentCard(card: Omit<ContentCard, "id">): Promise<{ id: string }> {
  const { authedFetch } = await import("@/lib/supabase/authed-fetch");
  const res = await authedFetch("/api/content-cards/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) { console.error("[DB] insertContentCard:", data); throw new Error(data.error || "Falha ao criar card"); }
  return { id: data.id as string };
}

export async function updateContentCardDb(id: string, updates: Record<string, unknown>): Promise<{ error: Error | null }> {
  if (Object.keys(updates).length === 0) return { error: null };
  const { authedFetch } = await import("@/lib/supabase/authed-fetch");
  const res = await authedFetch("/api/content-cards/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...updates }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `HTTP ${res.status}`);
    console.error("[DB] updateContentCard:", err.message);
    return { error: err };
  }
  return { error: null };
}

// ═══════════════════════════════════════════════════════════
// DESIGN REQUESTS
// ═══════════════════════════════════════════════════════════

export function snakeToDesignRequest(row: Record<string, unknown>): DesignRequest {
  return {
    id: row.id as string,
    title: row.title as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    requestedBy: row.requested_by as string,
    priority: (row.priority as DesignRequest["priority"]) ?? "medium",
    status: (row.status as DesignRequest["status"]) ?? "queued",
    format: (row.format as string) ?? "",
    briefing: (row.briefing as string) ?? "",
    attachments: (row.attachments as string[]) ?? [],
    contentCardId: (row.content_card_id as string) ?? undefined,
    deadline: (row.deadline as string) ?? undefined,
    createdAt: (row.created_at as string) ?? undefined,
    designerNote: (row.designer_note as string) ?? undefined,
    briefingIa: (row.briefing_ia as string) ?? undefined,
  };
}

export async function fetchDesignRequests(filter?: { assignedSocialClients?: string[] }): Promise<DesignRequest[]> {
  let query = db.from("design_requests").select("*").order("created_at", { ascending: false });
  if (filter?.assignedSocialClients?.length) query = query.in("client_id", filter.assignedSocialClients);
  const { data, error } = await query;
  if (error) { console.error("[DB] fetchDesignRequests:", error); return []; }
  return (data ?? []).map(snakeToDesignRequest);
}

export async function insertDesignRequest(req: Omit<DesignRequest, "id">): Promise<{ id: string }> {
  const { authedFetch } = await import("@/lib/supabase/authed-fetch");
  const res = await authedFetch("/api/design-requests/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) { console.error("[DB] insertDesignRequest:", data); throw new Error(data.error || "Falha ao criar demanda"); }
  return { id: data.id as string };
}

export async function updateDesignRequestDb(id: string, updates: Partial<DesignRequest>): Promise<{ error: Error | null }> {
  const { authedFetch } = await import("@/lib/supabase/authed-fetch");
  const res = await authedFetch("/api/design-requests/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...updates }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `HTTP ${res.status}`);
    console.error("[DB] updateDesignRequest:", err.message);
    return { error: err };
  }
  return { error: null };
}

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

// forUser = nome do colaborador logado. Retorna as GLOBAIS (target_user null) + as direcionadas A ELE.
// Sem forUser (compat) → todas. Assim uma notificação de "nova tarefa pro Pedro" só chega ao Pedro.
export async function fetchNotifications(forUser?: string): Promise<AppNotification[]> {
  let q = db.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
  if (forUser) q = q.or(`target_user.is.null,target_user.eq.${forUser}`);
  const { data, error } = await q;
  if (error) { console.error("[DB] fetchNotifications:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    type: (row.type as AppNotification["type"]) ?? "system",
    title: row.title as string,
    body: (row.body as string) ?? "",
    clientId: (row.client_id as string) ?? undefined,
    cardId: (row.card_id as string) ?? undefined,
    read: (row.read as boolean) ?? false,
    createdAt: row.created_at as string,
  }));
}

/** Devolve a linha criada — a tela precisa dela pra TROCAR o item otimista pelo real. Sem isso o
 *  temporário (id "temp-…") nunca casa com o id do banco: fica preso no topo da lista pra sempre
 *  e ainda duplica o aviso que volta na próxima leitura. */
export async function insertNotification(n: { type: string; title: string; body?: string; clientId?: string; cardId?: string; read?: boolean }): Promise<AppNotification | null> {
  const { data, error } = await db.from("notifications").insert({
    type: n.type, title: n.title, body: n.body,
    client_id: n.clientId, card_id: n.cardId ?? null, read: false,
  }).select("*").maybeSingle();
  if (error) { console.error("[DB] insertNotification:", error); return null; }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    type: (row.type as AppNotification["type"]) ?? "system",
    title: row.title as string,
    body: (row.body as string) ?? "",
    clientId: (row.client_id as string) ?? undefined,
    cardId: (row.card_id as string) ?? undefined,
    read: (row.read as boolean) ?? false,
    createdAt: row.created_at as string,
  };
}

export async function markNotificationReadDb(id: string): Promise<void> {
  const { error } = await db.from("notifications").update({ read: true }).eq("id", id);
  if (error) console.error("[DB] markNotificationRead:", error);
}

export async function markAllNotificationsReadDb(): Promise<void> {
  const { error } = await db.from("notifications").update({ read: true }).eq("read", false);
  if (error) console.error("[DB] markAllNotificationsRead:", error);
}

// ═══════════════════════════════════════════════════════════
// TIMELINE ENTRIES
// ═══════════════════════════════════════════════════════════

export async function fetchTimeline(): Promise<Record<string, TimelineEntry[]>> {
  const { data, error } = await db.from("timeline_entries").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) { console.error("[DB] fetchTimeline:", error); return {}; }
  const result: Record<string, TimelineEntry[]> = {};
  for (const row of data ?? []) {
    const entry: TimelineEntry = {
      id: row.id as string,
      clientId: row.client_id as string,
      type: row.type as TimelineEntry["type"],
      actor: row.actor as string,
      description: row.description as string,
      timestamp: row.timestamp as string,
    };
    if (!result[entry.clientId]) result[entry.clientId] = [];
    result[entry.clientId].push(entry);
  }
  return result;
}

export async function insertTimelineEntry(entry: Omit<TimelineEntry, "id">): Promise<void> {
  const { error } = await db.from("timeline_entries").insert({
    client_id: entry.clientId,
    type: entry.type,
    actor: entry.actor,
    description: entry.description,
    timestamp: entry.timestamp,
  });
  if (error) console.error("[DB] insertTimelineEntry:", error);
}

// ═══════════════════════════════════════════════════════════
// CLIENT CHATS
// ═══════════════════════════════════════════════════════════

export async function fetchClientChats(): Promise<Record<string, ChatMessage[]>> {
  const { data, error } = await db.from("client_chats").select("*").order("created_at");
  if (error) { console.error("[DB] fetchClientChats:", error); return {}; }
  const result: Record<string, ChatMessage[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      user: row.user as string,
      text: row.text as string,
      timestamp: row.timestamp as string,
    });
  }
  return result;
}

export async function insertClientChatMessage(clientId: string, user: string, text: string): Promise<void> {
  // timeZone SP explícito: sem isso, se rodar no servidor (VPS UTC) o horário sai 3h adiantado.
  const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const { error } = await db.from("client_chats").insert({
    client_id: clientId, user, text, timestamp,
  });
  if (error) console.error("[DB] insertClientChat:", error);
}

// ═══════════════════════════════════════════════════════════
// GLOBAL CHAT
// ═══════════════════════════════════════════════════════════

export async function fetchGlobalChat(): Promise<GlobalChatMessage[]> {
  const { data, error } = await db.from("global_chat").select("*").order("created_at");
  if (error) { console.error("[DB] fetchGlobalChat:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user: row.user as string,
    role: row.role as Role,
    text: row.text as string,
    timestamp: row.timestamp as string,
  }));
}

export async function insertGlobalChatMessage(user: string, role: Role, text: string): Promise<void> {
  const timestamp = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const { error } = await db.from("global_chat").insert({
    user, role, text, timestamp,
  });
  if (error) console.error("[DB] insertGlobalChat:", error);
}

// ═══════════════════════════════════════════════════════════
// ONBOARDING ITEMS
// ═══════════════════════════════════════════════════════════

export async function fetchOnboardingItems(): Promise<Record<string, OnboardingItem[]>> {
  const { data, error } = await db.from("onboarding_items").select("*").order("sort_order");
  if (error) { console.error("[DB] fetchOnboardingItems:", error); return {}; }
  const result: Record<string, OnboardingItem[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      label: row.label as string,
      completed: (row.completed as boolean) ?? false,
      completedBy: (row.completed_by as string) ?? undefined,
      completedAt: (row.completed_at as string) ?? undefined,
      department: (row.department as OnboardingItem["department"]) ?? undefined,
    });
  }
  return result;
}

export async function insertOnboardingItems(clientId: string, items: Array<{ label: string; sortOrder: number; department?: string }>): Promise<void> {
  const rows = items.map((item) => ({
    client_id: clientId,
    label: item.label,
    sort_order: item.sortOrder,
    department: item.department,
  }));
  const { error } = await db.from("onboarding_items").insert(rows);
  if (error) console.error("[DB] insertOnboardingItems:", error);
}

export async function updateOnboardingItemDb(itemId: string, completed: boolean, actor: string): Promise<void> {
  const { error } = await db.from("onboarding_items").update({
    completed,
    completed_by: completed ? actor : null,
    completed_at: completed ? new Date().toISOString() : null,
  }).eq("id", itemId);
  if (error) console.error("[DB] updateOnboardingItem:", error);
}

// ═══════════════════════════════════════════════════════════
// MOOD ENTRIES
// ═══════════════════════════════════════════════════════════

export async function fetchMoodEntries(): Promise<Record<string, MoodEntry[]>> {
  const { data, error } = await db.from("mood_entries").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchMoodEntries:", error); return {}; }
  const result: Record<string, MoodEntry[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      mood: row.mood as MoodType,
      note: (row.note as string) ?? undefined,
      recordedBy: row.recorded_by as string,
      date: row.date as string,
    });
  }
  return result;
}

export async function insertMoodEntry(clientId: string, mood: MoodType, note: string, actor: string): Promise<void> {
  const { error } = await db.from("mood_entries").insert({
    client_id: clientId,
    mood,
    note: note || null,
    recorded_by: actor,
    date: new Date().toISOString().split("T")[0],
  });
  if (error) console.error("[DB] insertMoodEntry:", error);
}

// ═══════════════════════════════════════════════════════════
// CREATIVE ASSETS
// ═══════════════════════════════════════════════════════════

export async function fetchCreativeAssets(): Promise<Record<string, CreativeAsset[]>> {
  const { data, error } = await db.from("creative_assets").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchCreativeAssets:", error); return {}; }
  const result: Record<string, CreativeAsset[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      clientId,
      type: row.type as CreativeAsset["type"],
      url: row.url as string,
      label: (row.label as string) ?? undefined,
      uploadedBy: row.uploaded_by as string,
      uploadedAt: row.uploaded_at as string,
    });
  }
  return result;
}

export async function insertCreativeAsset(asset: Omit<CreativeAsset, "id">): Promise<void> {
  const { error } = await db.from("creative_assets").insert({
    client_id: asset.clientId,
    type: asset.type,
    url: asset.url,
    label: asset.label,
    uploaded_by: asset.uploadedBy,
    uploaded_at: asset.uploadedAt,
  });
  if (error) console.error("[DB] insertCreativeAsset:", error);
}

// ═══════════════════════════════════════════════════════════
// SOCIAL PROOFS
// ═══════════════════════════════════════════════════════════

export async function fetchSocialProofs(): Promise<Record<string, SocialProofEntry[]>> {
  const { data, error } = await db.from("social_proofs").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchSocialProofs:", error); return {}; }
  const result: Record<string, SocialProofEntry[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      clientId,
      metric1Label: row.metric1_label as string,
      metric1Value: row.metric1_value as string,
      metric2Label: row.metric2_label as string,
      metric2Value: row.metric2_value as string,
      metric3Label: row.metric3_label as string,
      metric3Value: row.metric3_value as string,
      period: row.period as string,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
    });
  }
  return result;
}

export async function insertSocialProof(entry: Omit<SocialProofEntry, "id" | "createdAt">): Promise<void> {
  const { error } = await db.from("social_proofs").insert({
    client_id: entry.clientId,
    metric1_label: entry.metric1Label,
    metric1_value: entry.metric1Value,
    metric2_label: entry.metric2Label,
    metric2_value: entry.metric2Value,
    metric3_label: entry.metric3Label,
    metric3_value: entry.metric3Value,
    period: entry.period,
    created_by: entry.createdBy,
  });
  if (error) console.error("[DB] insertSocialProof:", error);
}

// ═══════════════════════════════════════════════════════════
// CRISIS NOTES
// ═══════════════════════════════════════════════════════════

export async function fetchCrisisNotes(): Promise<Record<string, CrisisNote[]>> {
  const { data, error } = await db.from("crisis_notes").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchCrisisNotes:", error); return {}; }
  const result: Record<string, CrisisNote[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      clientId,
      note: row.note as string,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
    });
  }
  return result;
}

export async function insertCrisisNote(clientId: string, note: string, actor: string): Promise<void> {
  const { error } = await db.from("crisis_notes").insert({
    client_id: clientId, note, created_by: actor,
  });
  if (error) console.error("[DB] insertCrisisNote:", error);
}

// ═══════════════════════════════════════════════════════════
// NOTICES
// ═══════════════════════════════════════════════════════════

export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await db.from("notices").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchNotices:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as string) ?? "",
    urgent: (row.urgent as boolean) ?? false,
    scheduledAt: (row.scheduled_at as string) ?? undefined,
    category: (row.category as Notice["category"]) ?? "general",
  }));
}

export async function insertNotice(data: { title: string; body: string; urgent: boolean; createdBy: string; scheduledAt?: string; category?: string }): Promise<void> {
  const { error } = await db.from("notices").insert({
    title: data.title,
    body: data.body,
    created_by: data.createdBy,
    urgent: data.urgent,
    scheduled_at: data.scheduledAt,
    category: data.category ?? "general",
  });
  if (error) console.error("[DB] insertNotice:", error);
}

export async function deleteNoticeDb(id: string): Promise<void> {
  const { error } = await db.from("notices").delete().eq("id", id);
  if (error) console.error("[DB] deleteNotice:", error);
}

// ═══════════════════════════════════════════════════════════
// QUINZENNIAL REPORTS
// ═══════════════════════════════════════════════════════════

export async function fetchQuinzReports(): Promise<QuinzReport[]> {
  const { data, error } = await db.from("quinz_reports").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchQuinzReports:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    period: row.period as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as string) ?? "",
    communicationHealth: (row.communication_health as number) ?? 3,
    clientEngagement: (row.client_engagement as number) ?? 3,
    highlights: (row.highlights as string) ?? "",
    challenges: (row.challenges as string) ?? "",
    nextSteps: (row.next_steps as string) ?? "",
  }));
}

export async function insertQuinzReport(report: Omit<QuinzReport, "id" | "createdAt">): Promise<void> {
  const { error } = await db.from("quinz_reports").insert({
    client_id: report.clientId,
    client_name: report.clientName,
    period: report.period,
    created_by: report.createdBy,
    communication_health: report.communicationHealth,
    client_engagement: report.clientEngagement,
    highlights: report.highlights,
    challenges: report.challenges,
    next_steps: report.nextSteps,
  });
  if (error) console.error("[DB] insertQuinzReport:", error);
}

// ═══════════════════════════════════════════════════════════
// CLIENT ACCESS (Credentials Vault)
// ═══════════════════════════════════════════════════════════

/**
 * SENHA SAI DO BANCO CIFRADA e é aberta aqui, no servidor.
 *
 * O cofre do admin (`clients`) já guardava cifrado desde junho; este, que é o que o social e o
 * gestor enxergam, ficou pra trás — 46 de 47 linhas em texto puro. Quem tivesse um dump do banco
 * tinha a senha do Instagram e do Facebook de 46 clientes, prontas pra usar. A chave (VAULT_KEY)
 * mora no ambiente do servidor, nunca no banco: dump sem chave não abre nada.
 *
 * `decifrar` aceita valor antigo em texto puro sem quebrar — a migração é gradual e ninguém fica
 * sem acesso enquanto ela acontece.
 */
export async function fetchClientAccess(): Promise<Record<string, ClientAccess>> {
  const { data, error } = await db.from("client_access").select("*");
  if (error) { console.error("[DB] fetchClientAccess:", error); return {}; }
  // NÃO DECIFRA AQUI. Este arquivo é importado por página de cliente (app/clients/page.tsx), então
  // qualquer referência a node:crypto vai parar no pacote do navegador — o build quebra, e se
  // passasse seria pior: a chave do cofre indo pro lado de fora. Quem decifra é a rota de servidor
  // (app/api/data/operational), que é onde a chave existe e nunca sai.
  const decifrar = (v: unknown): string | undefined => ((v as string) || undefined);
  const result: Record<string, ClientAccess> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    result[clientId] = {
      clientId,
      instagramLogin: (row.instagram_login as string) ?? undefined,
      instagramPassword: decifrar(row.instagram_password),
      facebookLogin: (row.facebook_login as string) ?? undefined,
      facebookPassword: decifrar(row.facebook_password),
      tiktokLogin: (row.tiktok_login as string) ?? undefined,
      tiktokPassword: decifrar(row.tiktok_password),
      linkedinLogin: (row.linkedin_login as string) ?? undefined,
      linkedinPassword: decifrar(row.linkedin_password),
      youtubeLogin: (row.youtube_login as string) ?? undefined,
      youtubePassword: decifrar(row.youtube_password),
      mlabsLogin: (row.mlabs_login as string) ?? undefined,
      mlabsPassword: decifrar(row.mlabs_password),
      canvaLink: (row.canva_link as string) ?? undefined,
      driveLink: (row.drive_link as string) ?? undefined,
      otherNotes: (row.other_notes as string) ?? undefined,
      updatedBy: (row.updated_by as string) ?? undefined,
      updatedAt: (row.updated_at as string) ?? undefined,
    };
  }
  return result;
}

export async function upsertClientAccess(clientId: string, access: Partial<ClientAccess>, actor: string): Promise<void> {
  // NO NAVEGADOR, NÃO ESCREVE DIRETO. A chave é do servidor; gravar daqui produziria texto puro
  // de novo, desfazendo a cifra a cada edição. Vai pela rota, que cifra lá.
  if (typeof window !== "undefined") {
    const { authedFetch } = await import("@/lib/supabase/authed-fetch");
    const r = await authedFetch("/api/data/operational/mutations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsertClientAccess", clientId, access, actor }),
    }).catch(() => null);
    if (!r?.ok) console.error("[DB] upsertClientAccess: rota recusou");
    return;
  }

  // Quem chama do servidor já manda o valor CIFRADO (a rota de mutations cuida disso). Este
  // arquivo não importa cripto: ele é compartilhado com o navegador.
  const cifrar = (v: string | undefined) => v;
  const row: Record<string, unknown> = { client_id: clientId, updated_by: actor, updated_at: new Date().toISOString() };
  if (access.instagramLogin !== undefined) row.instagram_login = access.instagramLogin;
  if (access.instagramPassword !== undefined) row.instagram_password = cifrar(access.instagramPassword);
  if (access.facebookLogin !== undefined) row.facebook_login = access.facebookLogin;
  if (access.facebookPassword !== undefined) row.facebook_password = cifrar(access.facebookPassword);
  if (access.tiktokLogin !== undefined) row.tiktok_login = access.tiktokLogin;
  if (access.tiktokPassword !== undefined) row.tiktok_password = cifrar(access.tiktokPassword);
  if (access.linkedinLogin !== undefined) row.linkedin_login = access.linkedinLogin;
  if (access.linkedinPassword !== undefined) row.linkedin_password = cifrar(access.linkedinPassword);
  if (access.youtubeLogin !== undefined) row.youtube_login = access.youtubeLogin;
  if (access.youtubePassword !== undefined) row.youtube_password = cifrar(access.youtubePassword);
  if (access.mlabsLogin !== undefined) row.mlabs_login = access.mlabsLogin;
  if (access.mlabsPassword !== undefined) row.mlabs_password = cifrar(access.mlabsPassword);
  if (access.canvaLink !== undefined) row.canva_link = access.canvaLink;
  if (access.driveLink !== undefined) row.drive_link = access.driveLink;
  if (access.otherNotes !== undefined) row.other_notes = access.otherNotes;

  const { error } = await db.from("client_access").upsert(row, { onConflict: "client_id" });
  if (error) console.error("[DB] upsertClientAccess:", error);
}

// ═══════════════════════════════════════════════════════════
// CARD COMMENTS
// ═══════════════════════════════════════════════════════════

export async function insertCardComment(cardId: string, author: string, text: string, role?: string): Promise<void> {
  const { error } = await db.from("card_comments").insert({
    card_id: cardId, author, role: role ?? null, text,
  });
  // NÃO engolir o erro: o comentário sumia em silêncio (API retornava ok, front achava que salvou,
  // mas nada ia pro banco — designer nunca via). Propaga pra API devolver 500 e o front reverter/avisar.
  if (error) { console.error("[DB] insertCardComment falhou:", error.message, { cardId, author }); throw new Error(error.message); }
}

// ═══════════════════════════════════════════════════════════
// CRM COMERCIAL (SDR)
// ═══════════════════════════════════════════════════════════
function snakeToCrmLead(r: Record<string, unknown>): CrmLead {
  return {
    id: r.id as string,
    contatoNome: (r.contato_nome as string) ?? "",
    empresa: (r.empresa as string) ?? null,
    telefone: (r.telefone as string) ?? null,
    email: (r.email as string) ?? null,
    valorOrcamento: r.valor_orcamento != null ? Number(r.valor_orcamento) : null,
    estagio: (r.estagio as CrmEstagio) ?? "lead",
    origem: (r.origem as string) ?? null,
    responsavel: (r.responsavel as string) ?? null,
    reuniaoData: (r.reuniao_data as string) ?? null,
    propostaEnviadaEm: (r.proposta_enviada_em as string) ?? null,
    proximoContato: (r.proximo_contato as string) ?? null,
    fechadoEm: (r.fechado_em as string) ?? null,
    motivoPerda: (r.motivo_perda as string) ?? null,
    observacoes: (r.observacoes as string) ?? null,
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  };
}

// Campos editáveis → coluna do banco (camel→snake), pra insert/update sem repetição.
const CRM_FIELD_MAP: Record<string, string> = {
  contatoNome: "contato_nome", empresa: "empresa", telefone: "telefone", email: "email",
  valorOrcamento: "valor_orcamento", estagio: "estagio", origem: "origem", responsavel: "responsavel",
  reuniaoData: "reuniao_data", propostaEnviadaEm: "proposta_enviada_em", motivoPerda: "motivo_perda",
  observacoes: "observacoes", proximoContato: "proximo_contato", fechadoEm: "fechado_em",
};

export async function fetchCrmLeadById(id: string): Promise<CrmLead | null> {
  const { data, error } = await db.from("crm_leads").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return snakeToCrmLead(data);
}

function crmToRow(patch: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(CRM_FIELD_MAP)) {
    if (k in patch) row[col] = patch[k] === "" ? null : patch[k];
  }
  return row;
}

export async function fetchCrmLeads(): Promise<CrmLead[]> {
  const { data, error } = await db.from("crm_leads").select("*").order("updated_at", { ascending: false });
  if (error) { console.error("[DB] fetchCrmLeads:", error.message); return []; }
  return (data ?? []).map(snakeToCrmLead);
}

export async function insertCrmLead(patch: Record<string, unknown>): Promise<CrmLead> {
  const row = crmToRow(patch);
  if (!row.contato_nome) throw new Error("contato_nome obrigatório");
  const { data, error } = await db.from("crm_leads").insert(row).select("*").single();
  if (error) { console.error("[DB] insertCrmLead falhou:", error.message); throw new Error(error.message); }
  return snakeToCrmLead(data);
}

export async function updateCrmLead(id: string, patch: Record<string, unknown>): Promise<CrmLead> {
  const row = crmToRow(patch);
  row.updated_at = new Date().toISOString();
  const { data, error } = await db.from("crm_leads").update(row).eq("id", id).select("*").single();
  if (error) { console.error("[DB] updateCrmLead falhou:", error.message); throw new Error(error.message); }
  return snakeToCrmLead(data);
}

export async function deleteCrmLead(id: string): Promise<void> {
  const { error } = await db.from("crm_leads").delete().eq("id", id);
  if (error) { console.error("[DB] deleteCrmLead falhou:", error.message); throw new Error(error.message); }
}

// ── Atividades do lead (timeline do SDR) ──
function snakeToCrmActivity(r: Record<string, unknown>): CrmLeadActivity {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    tipo: (r.tipo as CrmAtividadeTipo) ?? "nota",
    texto: (r.texto as string) ?? "",
    autor: (r.autor as string) ?? null,
    createdAt: (r.created_at as string) ?? "",
  };
}

export async function fetchLeadActivities(leadId: string): Promise<CrmLeadActivity[]> {
  const { data, error } = await db.from("crm_lead_activities")
    .select("*").eq("lead_id", leadId).order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchLeadActivities:", error.message); return []; }
  return (data ?? []).map(snakeToCrmActivity);
}

export async function insertLeadActivity(a: { leadId: string; tipo: string; texto: string; autor?: string | null }): Promise<CrmLeadActivity> {
  const { data, error } = await db.from("crm_lead_activities")
    .insert({ lead_id: a.leadId, tipo: a.tipo, texto: a.texto, autor: a.autor ?? null })
    .select("*").single();
  if (error) { console.error("[DB] insertLeadActivity falhou:", error.message); throw new Error(error.message); }
  return snakeToCrmActivity(data);
}

// ── Meta mensal do comercial ──
function snakeToCrmMeta(r: Record<string, unknown>): CrmMeta {
  return {
    mes: r.mes as string,
    metaValor: (r.meta_valor as number) ?? null,
    metaLeads: (r.meta_leads as number) ?? null,
    updatedAt: (r.updated_at as string) ?? "",
  };
}

export async function fetchCrmMeta(mes: string): Promise<CrmMeta | null> {
  const { data, error } = await db.from("crm_metas").select("*").eq("mes", mes).maybeSingle();
  if (error || !data) return null;
  return snakeToCrmMeta(data);
}

export async function upsertCrmMeta(mes: string, metaValor: number | null, metaLeads: number | null): Promise<CrmMeta> {
  const { data, error } = await db.from("crm_metas")
    .upsert({ mes, meta_valor: metaValor, meta_leads: metaLeads, updated_at: new Date().toISOString() }, { onConflict: "mes" })
    .select("*").single();
  if (error) { console.error("[DB] upsertCrmMeta falhou:", error.message); throw new Error(error.message); }
  return snakeToCrmMeta(data);
}

// ═══════════════════════════════════════════════════════════
// TRAFFIC REPORTS
// ═══════════════════════════════════════════════════════════

export async function fetchTrafficReports(): Promise<TrafficMonthlyReport[]> {
  const { data, error } = await db.from("traffic_reports").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchTrafficReports:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    month: row.month as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as string) ?? "",
    messages: (row.messages as number) ?? 0,
    messageCost: Number(row.message_cost ?? 0),
    impressions: (row.impressions as number) ?? 0,
    observations: (row.observations as string) ?? undefined,
  }));
}

export async function insertTrafficReport(report: Omit<TrafficMonthlyReport, "id" | "createdAt">): Promise<void> {
  const { error } = await db.from("traffic_reports").insert({
    client_id: report.clientId,
    client_name: report.clientName,
    month: report.month,
    created_by: report.createdBy,
    messages: report.messages,
    message_cost: report.messageCost,
    impressions: report.impressions,
    observations: report.observations,
  });
  if (error) console.error("[DB] insertTrafficReport:", error);
}

export async function updateTrafficReportDb(id: string, updates: Partial<TrafficMonthlyReport>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.messages !== undefined) row.messages = updates.messages;
  if (updates.messageCost !== undefined) row.message_cost = updates.messageCost;
  if (updates.impressions !== undefined) row.impressions = updates.impressions;
  if (updates.observations !== undefined) row.observations = updates.observations;
  if (Object.keys(row).length === 0) return;
  const { error } = await db.from("traffic_reports").update(row).eq("id", id);
  if (error) console.error("[DB] updateTrafficReport:", error);
}

// ═══════════════════════════════════════════════════════════
// TRAFFIC ROUTINE CHECKS
// ═══════════════════════════════════════════════════════════

export async function fetchTrafficRoutineChecks(): Promise<TrafficRoutineCheck[]> {
  const { data, error } = await db.from("traffic_routine_checks").select("*").order("completed_at", { ascending: false });
  if (error) { console.error("[DB] fetchTrafficRoutineChecks:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    date: row.date as string,
    type: row.type as TrafficRoutineCheck["type"],
    completedBy: row.completed_by as string,
    completedAt: (row.completed_at as string) ?? "",
    note: (row.note as string) ?? undefined,
  }));
}

export async function insertTrafficRoutineCheck(check: Omit<TrafficRoutineCheck, "id" | "completedAt">): Promise<void> {
  const { error } = await db.from("traffic_routine_checks").insert({
    client_id: check.clientId,
    client_name: check.clientName,
    date: check.date,
    type: check.type,
    completed_by: check.completedBy,
    note: check.note,
  });
  if (error) console.error("[DB] insertTrafficRoutineCheck:", error);
}

export interface ClientGroupMessageLogRow {
  clientId: string;
  dateKey: string;
  kind: "report" | "support";
  status: "sent" | "failed" | "skipped";
}

/** Log de envios da automação de mensagens nos grupos (date_key >= sinceDateKey). RLS: leitura autenticada. */
export async function fetchClientGroupMessageLog(sinceDateKey: string): Promise<ClientGroupMessageLogRow[]> {
  const { data, error } = await db
    .from("client_group_message_log")
    .select("client_id, date_key, kind, status")
    .gte("date_key", sinceDateKey);
  if (error) { console.error("[DB] fetchClientGroupMessageLog:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    clientId: row.client_id as string,
    dateKey: row.date_key as string,
    kind: row.kind as "report" | "support",
    status: row.status as "sent" | "failed" | "skipped",
  }));
}

// ═══════════════════════════════════════════════════════════
// SOCIAL REPORTS
// ═══════════════════════════════════════════════════════════

export async function fetchSocialReports(): Promise<SocialMonthlyReport[]> {
  const { data, error } = await db.from("social_reports").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchSocialReports:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    month: row.month as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as string) ?? "",
    postsPublished: (row.posts_published as number) ?? 0,
    postsGoal: (row.posts_goal as number) ?? 12,
    reelsCount: (row.reels_count as number) ?? 0,
    storiesCount: (row.stories_count as number) ?? 0,
    reach: (row.reach as number) ?? 0,
    impressions: (row.impressions as number) ?? 0,
    engagement: (row.engagement as number) ?? 0,
    engagementRate: Number(row.engagement_rate ?? 0),
    followersGained: (row.followers_gained as number) ?? 0,
    followersLost: (row.followers_lost as number) ?? 0,
    topPost: (row.top_post as string) ?? undefined,
    observations: (row.observations as string) ?? undefined,
  }));
}

export async function insertSocialReport(report: Omit<SocialMonthlyReport, "id" | "createdAt">): Promise<void> {
  const { error } = await db.from("social_reports").insert({
    client_id: report.clientId,
    client_name: report.clientName,
    month: report.month,
    created_by: report.createdBy,
    posts_published: report.postsPublished,
    posts_goal: report.postsGoal,
    reels_count: report.reelsCount,
    stories_count: report.storiesCount,
    reach: report.reach,
    impressions: report.impressions,
    engagement: report.engagement,
    engagement_rate: report.engagementRate,
    followers_gained: report.followersGained,
    followers_lost: report.followersLost,
    top_post: report.topPost,
    observations: report.observations,
  });
  if (error) console.error("[DB] insertSocialReport:", error);
}

export async function updateSocialReportDb(id: string, updates: Partial<SocialMonthlyReport>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.postsPublished !== undefined) row.posts_published = updates.postsPublished;
  if (updates.postsGoal !== undefined) row.posts_goal = updates.postsGoal;
  if (updates.reelsCount !== undefined) row.reels_count = updates.reelsCount;
  if (updates.storiesCount !== undefined) row.stories_count = updates.storiesCount;
  if (updates.reach !== undefined) row.reach = updates.reach;
  if (updates.impressions !== undefined) row.impressions = updates.impressions;
  if (updates.engagement !== undefined) row.engagement = updates.engagement;
  if (updates.engagementRate !== undefined) row.engagement_rate = updates.engagementRate;
  if (updates.followersGained !== undefined) row.followers_gained = updates.followersGained;
  if (updates.followersLost !== undefined) row.followers_lost = updates.followersLost;
  if (updates.topPost !== undefined) row.top_post = updates.topPost;
  if (updates.observations !== undefined) row.observations = updates.observations;
  if (Object.keys(row).length === 0) return;
  const { error } = await db.from("social_reports").update(row).eq("id", id);
  if (error) console.error("[DB] updateSocialReport:", error);
}

// ═══════════════════════════════════════════════════════════
// CONTENT APPROVALS
// ═══════════════════════════════════════════════════════════

export async function fetchContentApprovals(): Promise<ContentApproval[]> {
  const { data, error } = await db.from("content_approvals").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchContentApprovals:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    cardId: row.card_id as string,
    status: (row.status as ContentApproval["status"]) ?? "pending",
    reviewedBy: (row.reviewed_by as string) ?? undefined,
    reviewedAt: (row.reviewed_at as string) ?? undefined,
    reason: (row.reason as string) ?? undefined,
  }));
}

export async function upsertContentApproval(approval: Omit<ContentApproval, "id">): Promise<void> {
  const { error } = await db.from("content_approvals").insert({
    card_id: approval.cardId,
    status: approval.status,
    reviewed_by: approval.reviewedBy,
    reviewed_at: approval.reviewedAt,
    reason: approval.reason,
  });
  if (error) console.error("[DB] upsertContentApproval:", error);
}

// ═══════════════════════════════════════════════════════════
// CS — DO'S & DON'TS ESTRUTURADOS (cs_client_rules)
// ═══════════════════════════════════════════════════════════

function snakeToCsRule(row: Record<string, unknown>): CsClientRule {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    texto: row.texto as string,
    escopo: (row.escopo as CsClientRule["escopo"]) ?? "sempre",
    origem: (row.origem as CsClientRule["origem"]) ?? "manual",
    ativo: (row.ativo as boolean) ?? true,
    createdAt: row.created_at as string,
  };
}

/** Regras ativas do cliente (do's & don'ts). Resiliente: se a tabela não existe ainda, retorna []. */
export async function fetchClientCsRules(clientId: string): Promise<CsClientRule[]> {
  const { data, error } = await db
    .from("cs_client_rules")
    .select("*")
    .eq("client_id", clientId)
    .eq("ativo", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`) // ignora regras expiradas (KB: validade)
    .order("created_at", { ascending: true });
  if (error) { console.error("[DB] fetchClientCsRules:", error.message); return []; }
  return (data ?? []).map(snakeToCsRule);
}

// ═══════════════════════════════════════════════════════════
// TEAM MEMBERS
// ═══════════════════════════════════════════════════════════

export async function fetchTeamMembers() {
  const { data, error } = await db.from("team_members").select("*").eq("is_active", true).order("name");
  if (error) { console.error("[DB] fetchTeamMembers:", error); return []; }
  return data ?? [];
}

export async function insertTeamMember(member: { name: string; email: string; role: string; initials: string }) {
  const { error } = await db.from("team_members").insert(member);
  if (error) console.error("[DB] insertTeamMember:", error);
}

// ═══════════════════════════════════════════════════════════
// SNAPSHOTS
// ═══════════════════════════════════════════════════════════

export async function insertSnapshot(snapshot: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("snapshots").insert(snapshot);
  if (error) console.error("[DB] insertSnapshot:", error);
}

export async function fetchSnapshots() {
  const { data, error } = await db.from("snapshots").select("*").order("period", { ascending: false }).limit(24);
  if (error) { console.error("[DB] fetchSnapshots:", error); return []; }
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════
// DB availability check
// ═══════════════════════════════════════════════════════════

export async function isDbAvailable(): Promise<boolean> {
  try {
    const { error } = await db.from("clients").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Acha o card de um aviso a partir do título citado entre aspas no corpo.
 *
 * Existe porque a notificação precisa levar à ARTE, e o cardId nem sempre chega: aba antiga do
 * time roda o JS de antes do conserto e manda o aviso sem vínculo. Resolver no servidor tira essa
 * dependência — funciona com qualquer versão da tela.
 *
 * Tenta duas rotas porque o título citado varia: nos avisos do DESIGNER é o da demanda
 * ("Arte: TER 28"), nos do SOCIAL é o do card ("TER 28").
 *
 * Devolve null quando há mais de um candidato: abrir o card errado é pior que abrir o cadastro.
 */
export async function resolverCardPorTitulo(clientId: string, titulo: string): Promise<string | null> {
  const t = (titulo || "").trim();
  if (!t || !clientId) return null;
  try {
    const porCard = await db.from("content_cards").select("id")
      .eq("client_id", clientId).eq("title", t).is("archived_at", null).limit(2);
    if (porCard.data?.length === 1) return porCard.data[0].id as string;

    const dr = await db.from("design_requests").select("id, content_card_id")
      .eq("client_id", clientId).eq("title", t).limit(2);
    if (dr.data?.length !== 1) return null;
    const d = dr.data[0] as { id: string; content_card_id: string | null };
    if (d.content_card_id) return d.content_card_id;

    const porDr = await db.from("content_cards").select("id")
      .eq("design_request_id", d.id).is("archived_at", null).limit(2);
    return porDr.data?.length === 1 ? (porDr.data[0].id as string) : null;
  } catch {
    return null; // sem vínculo é pior que nada, mas quebrar o aviso é pior ainda
  }
}
