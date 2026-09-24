// lib/navegacao/menu.ts — o menu do Lone OS numa definição só.
//
// POR QUE ISTO EXISTE (Leva 3, set/2026). O rail lateral tinha 24 ícones do mesmo peso: quem abria o
// sistema via uma parede de ícones e decorava posição em vez de entender onde as coisas moram. Agora
// são 9 áreas; cada tela antiga continua existindo como SUBTELA da área dela, no painel secundário.
//
// Quem lê daqui: a barra lateral (components/Sidebar.tsx), a barra inferior do celular
// (components/MobileBottomNav.tsx) e a busca ⌘K (components/GlobalSearch.tsx). Mudou um nome, um papel
// ou uma rota? Muda AQUI e os três acompanham — e os testes em tests/navegacao-menu.test.ts conferem
// que nenhum papel ganhou nem perdeu tela.
//
// Módulo puro: sem React, sem store, sem window. Só dados e funções.

import {
  LayoutDashboard, Inbox, TrendingUp, Clapperboard, Users, Handshake, Bot, Briefcase, Settings,
  Sun, ClipboardCheck, Calendar, BookOpen,
  Activity, HeartPulse, ShieldAlert, MessageCircle, Plug, Users2, Megaphone, Wallet,
  Instagram, CalendarClock, Palette, Layers, Columns3, UserCheck, History, BarChart2, ShieldCheck,
  AlertTriangle, Target, Thermometer, FileSignature,
  Radar, ListOrdered, Building2, MessageSquare, Settings2, BarChart3,
  Lock, Zap, Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/lib/types";

// ─── Tipos ─────────────────────────────────────────────────────────────────

/** Contadores que a barra lateral calcula a partir dos stores e pendura nos itens. */
export type ChaveBadge =
  | "atRisk" | "socialClients" | "socialPending" | "socialApproval" | "socialOnboarding"
  | "designQueued" | "trafficRotina";

export interface ItemMenu {
  /** Chave estável (React key, ⌘K, testes). Única no menu inteiro. */
  id: string;
  rotulo: string;
  icone: LucideIcon;
  /** Para onde ir. Pode ter query (`/my-work?view=tarefas`). */
  href: string;
  /** Aba DENTRO da página (consumida via NavContext.pendingTab). */
  aba?: string;
  /** Quem vê. Em item de seção, ausente = herda da subtela dona. */
  papeis?: readonly Role[];
  badge?: ChaveBadge;
  /** Subtítulo na busca ⌘K. */
  descricao?: string;
  /** Sinônimos para a busca (quem procura "calendário" acha a Agenda). */
  termos?: readonly string[];
  /** Endereços antigos que contam como esta tela (redirecionam pra cá) — acendem o item e a área. */
  tambemEm?: readonly string[];
  /** Abas/filtros internos da tela — aparecem no painel quando você ESTÁ nela. */
  secoes?: readonly SecaoMenu[];
}

export interface SecaoMenu {
  titulo?: string;
  itens: readonly ItemMenu[];
}

export interface GrupoMenu {
  id: string;
  rotulo: string;
  icone: LucideIcon;
  itens: readonly ItemMenu[];
}

// ─── Papéis ────────────────────────────────────────────────────────────────

export const TODOS: readonly Role[] = ["admin", "manager", "traffic", "social", "designer", "comercial"];
/** Quem trabalha na operação (todo mundo menos o comercial). */
export const OPERACAO: readonly Role[] = ["admin", "manager", "traffic", "social", "designer"];
export const GESTAO: readonly Role[] = ["admin", "manager"];
const TRAFEGO: readonly Role[] = ["admin", "manager", "traffic"];
const CONTEUDO: readonly Role[] = ["admin", "manager", "social", "designer"];

// ─── O menu ────────────────────────────────────────────────────────────────
// Ordem do rail: Início, Meu Trabalho, Tráfego, Conteúdo, Clientes, Comercial, Agente Lone, Gestão,
// Sistema. Dentro de cada área, o PRIMEIRO item visível pro papel é para onde o clique no rail leva.

export const MENU: readonly GrupoMenu[] = [
  {
    id: "inicio", rotulo: "Início", icone: LayoutDashboard,
    itens: [
      { id: "inicio", rotulo: "Início", icone: LayoutDashboard, href: "/", papeis: [...OPERACAO, "comercial"],
        descricao: "Visão geral do dia", termos: ["dashboard", "painel", "home"] },
    ],
  },
  {
    id: "meu-trabalho", rotulo: "Meu Trabalho", icone: Inbox,
    itens: [
      { id: "meu-trabalho-hoje", rotulo: "Hoje", icone: Sun, href: "/my-work", papeis: OPERACAO,
        descricao: "O que está com você agora", termos: ["meu trabalho", "pendências"] },
      // /tarefas e /calendar viraram VISTAS do Meu Trabalho: eram três lugares para as mesmas tarefas.
      // As rotas antigas continuam de pé e redirecionam pra cá (links de notificação e WhatsApp).
      { id: "meu-trabalho-tarefas", rotulo: "Tarefas", icone: ClipboardCheck, href: "/my-work?view=tarefas",
        papeis: OPERACAO, tambemEm: ["/tarefas"],
        descricao: "Tarefas do time, prazos e conclusão", termos: ["to-do", "pendências"] },
      // O comercial não tem Meu Trabalho: para ele, Tarefas continua sendo a tela própria.
      { id: "tarefas-comercial", rotulo: "Tarefas", icone: ClipboardCheck, href: "/tarefas", papeis: ["comercial"],
        descricao: "Tarefas do time, prazos e conclusão" },
      { id: "meu-trabalho-agenda", rotulo: "Agenda", icone: Calendar, href: "/my-work?view=agenda",
        papeis: OPERACAO, tambemEm: ["/calendar"],
        descricao: "Calendário de posts, tarefas, reuniões e lembretes", termos: ["calendário", "calendario"] },
      { id: "processos", rotulo: "Processos", icone: BookOpen, href: "/processos", papeis: TODOS,
        descricao: "Como cada coisa é feita aqui", termos: ["manual", "procedimento"] },
    ],
  },
  {
    id: "trafego", rotulo: "Tráfego", icone: TrendingUp,
    itens: [
      { id: "trafego-pago", rotulo: "Tráfego Pago", icone: TrendingUp, href: "/traffic", papeis: TRAFEGO,
        descricao: "Rotina, status dos clientes, anúncios e investimento", termos: ["meta ads", "campanhas"],
        secoes: [
          { titulo: "Tráfego Pago", itens: [
            { id: "trafego-rotina", rotulo: "Rotina Diária", icone: ClipboardCheck, href: "/traffic", aba: "rotina", badge: "trafficRotina" },
            { id: "trafego-status", rotulo: "Status dos Clientes", icone: Users2, href: "/traffic", aba: "status" },
            { id: "trafego-anuncios", rotulo: "Anúncios Meta", icone: Megaphone, href: "/traffic", aba: "anuncios" },
            { id: "trafego-investimento", rotulo: "Investimento", icone: Wallet, href: "/traffic", aba: "investimento" },
          ] },
        ] },
      { id: "trafego-saldos", rotulo: "Saldos, Verba & Alertas", icone: Activity, href: "/traffic/budgets", papeis: TRAFEGO,
        descricao: "Saldo das contas de anúncio e alertas de verba", termos: ["saldo", "budget"] },
      { id: "trafego-criativos", rotulo: "Saúde dos Criativos", icone: HeartPulse, href: "/traffic/criativos", papeis: TRAFEGO,
        descricao: "Criativos cansados e o que replicar", termos: ["criativo", "fadiga"] },
      { id: "defesa", rotulo: "Defesa Ativa", icone: ShieldAlert, href: "/defesa", papeis: TRAFEGO,
        descricao: "Anomalias em Meta Ads", termos: ["anomalia"] },
      { id: "grupos-clientes", rotulo: "Grupos dos Clientes", icone: MessageCircle, href: "/settings/grupos", papeis: TRAFEGO,
        descricao: "Grupos de WhatsApp e envio de relatórios", termos: ["whatsapp"] },
      { id: "conexao-meta", rotulo: "Conexão Meta", icone: Plug, href: "/integrations", papeis: TRAFEGO,
        descricao: "Token e contas de anúncio", termos: ["integração", "token", "facebook"] },
    ],
  },
  {
    id: "conteudo", rotulo: "Conteúdo", icone: Clapperboard,
    itens: [
      { id: "social", rotulo: "Social Media", icone: Instagram, href: "/social", papeis: CONTEUDO,
        descricao: "Carteira, board de produção e aprovação", termos: ["kanban", "posts", "instagram"],
        secoes: [
          { titulo: "Social Media", itens: [
            { id: "social-carteira", rotulo: "Carteira", icone: Users2, href: "/social", aba: "carteira", badge: "socialClients" },
            { id: "social-board", rotulo: "Board de Produção", icone: Layers, href: "/social", aba: "kanban", badge: "socialPending" },
            { id: "social-aprovacao", rotulo: "Inbox de Aprovação", icone: Inbox, href: "/social", aba: "aprovacao", badge: "socialApproval" },
          ] },
          { titulo: "Análise", itens: [
            { id: "social-metricas", rotulo: "Métricas", icone: BarChart2, href: "/social", aba: "metricas" },
            { id: "social-entregas", rotulo: "Entregas Mensais", icone: Activity, href: "/social", aba: "entregas" },
          ] },
          { titulo: "Arquivos", itens: [
            { id: "social-onboarding", rotulo: "Onboarding", icone: ClipboardCheck, href: "/social", aba: "onboarding", badge: "socialOnboarding" },
            { id: "social-acessos", rotulo: "Acessos & Senhas", icone: ShieldCheck, href: "/social", aba: "acessos" },
          ] },
        ] },
      // O Radar mora DENTRO do Planejamento (/radar redireciona pra cá).
      { id: "planejamento", rotulo: "Planejamento", icone: CalendarClock, href: "/planejamento", papeis: CONTEUDO,
        descricao: "Radar de referências e calendário estratégico", termos: ["radar", "pauta"] },
      { id: "designer", rotulo: "Designer", icone: Palette, href: "/design", papeis: CONTEUDO, badge: "designQueued",
        descricao: "Fila de artes e quadros dos designers", termos: ["design", "arte"],
        secoes: [
          { titulo: "Designer", itens: [
            { id: "design-kanbans", rotulo: "Kanbans Social Media", icone: Columns3, href: "/design", aba: "kanbans" },
            { id: "design-quadro", rotulo: "Quadro de Tarefas", icone: Layers, href: "/design", aba: "requests", badge: "designQueued" },
            { id: "design-clientes", rotulo: "Clientes do Quadro", icone: UserCheck, href: "/design", aba: "clientes" },
            { id: "design-performance", rotulo: "Performance", icone: Activity, href: "/design", aba: "performance" },
            { id: "design-historico", rotulo: "Histórico", icone: History, href: "/design", aba: "history" },
          ] },
        ] },
    ],
  },
  {
    id: "clientes", rotulo: "Clientes", icone: Users,
    itens: [
      { id: "clientes", rotulo: "Clientes", icone: Users, href: "/clients", papeis: GESTAO,
        descricao: "Base completa de clientes", termos: ["cadastro"],
        secoes: [
          { titulo: "Filtros", itens: [
            { id: "clientes-risco", rotulo: "Em Risco", icone: AlertTriangle, href: "/clients?filter=at_risk", badge: "atRisk" },
            { id: "clientes-objetivos", rotulo: "Objetivos", icone: Target, href: "/clients?filter=goals" },
          ] },
        ] },
      // A carteira de quem EXECUTA (tráfego, social, designer). A gestão não vê: tem /clients.
      { id: "meus-clientes", rotulo: "Meus Clientes", icone: UserCheck, href: "/meus-clientes", papeis: ["traffic", "social", "designer"],
        descricao: "Sua carteira e o briefing de cada cliente", termos: ["briefing", "carteira"] },
      { id: "churn", rotulo: "Termômetro de Churn", icone: Thermometer, href: "/churn", papeis: GESTAO,
        descricao: "Score preditivo de risco", termos: ["risco", "termômetro"] },
      { id: "jornada", rotulo: "Jornada CS", icone: HeartPulse, href: "/jornada", papeis: ["admin", "manager", "social"],
        descricao: "Saúde e próxima ação de cada cliente", termos: ["cs", "sucesso do cliente"] },
      { id: "carteira", rotulo: "Carteira", icone: Layers, href: "/carteira", papeis: GESTAO,
        descricao: "Distribuição de clientes por pessoa" },
      { id: "contratos", rotulo: "Contratos", icone: FileSignature, href: "/contratos", papeis: GESTAO,
        descricao: "Lista global de contratos" },
    ],
  },
  {
    id: "comercial", rotulo: "Comercial", icone: Handshake,
    itens: [
      { id: "crm", rotulo: "Comercial", icone: Handshake, href: "/crm", papeis: ["admin", "manager", "comercial"],
        descricao: "Funil de vendas, agenda e relatórios", termos: ["crm", "leads", "vendas"],
        secoes: [
          { titulo: "Resultados", itens: [
            { id: "crm-hoje", rotulo: "Hoje", icone: Sun, href: "/crm", aba: "hoje" },
            { id: "crm-dashboard", rotulo: "Dashboard", icone: LayoutDashboard, href: "/crm", aba: "dashboard" },
          ] },
          { titulo: "Operação", itens: [
            { id: "crm-funil", rotulo: "Funil", icone: Layers, href: "/crm", aba: "funil" },
            { id: "crm-agenda", rotulo: "Agenda", icone: Calendar, href: "/crm", aba: "agenda" },
          ] },
          { titulo: "Análise", itens: [
            { id: "crm-relatorios", rotulo: "Relatórios", icone: BarChart2, href: "/crm", aba: "relatorios" },
          ] },
        ] },
      { id: "prospeccao", rotulo: "Prospecção", icone: Radar, href: "/prospeccao", papeis: GESTAO,
        descricao: "Piloto SDR e fila do dia", termos: ["sdr", "prospect"],
        secoes: [
          { titulo: "Piloto", itens: [
            { id: "prosp-visao", rotulo: "Visão geral", icone: LayoutDashboard, href: "/prospeccao", aba: "visao" },
            { id: "prosp-fila", rotulo: "Fila do dia", icone: ListOrdered, href: "/prospeccao", aba: "fila" },
          ] },
          { titulo: "Operação", itens: [
            { id: "prosp-prospects", rotulo: "Prospects", icone: Building2, href: "/prospeccao", aba: "prospects" },
            { id: "prosp-conversas", rotulo: "Conversas", icone: MessageSquare, href: "/prospeccao", aba: "conversas" },
            { id: "prosp-agenda", rotulo: "Agenda", icone: Calendar, href: "/prospeccao", aba: "agenda" },
          ] },
          { titulo: "Gestão", itens: [
            { id: "prosp-configuracao", rotulo: "Configuração", icone: Settings2, href: "/prospeccao", aba: "configuracao" },
            { id: "prosp-relatorios", rotulo: "Relatórios", icone: BarChart3, href: "/prospeccao", aba: "relatorios" },
          ] },
        ] },
    ],
  },
  {
    id: "agente", rotulo: "Agente Lone", icone: Bot,
    itens: [
      { id: "agente", rotulo: "Agente Lone", icone: Bot, href: "/agente", papeis: GESTAO,
        descricao: "Prioridades e decisões do agente", termos: ["ia", "prioridades"] },
    ],
  },
  {
    id: "gestao", rotulo: "Gestão", icone: Briefcase,
    itens: [
      { id: "metas", rotulo: "Metas & OKRs", icone: Target, href: "/goals", papeis: GESTAO,
        descricao: "Objetivos do time", termos: ["okr", "objetivos"] },
      { id: "area-ceo", rotulo: "Área CEO", icone: Lock, href: "/ceo", papeis: ["admin"],
        descricao: "Visão da diretoria", termos: ["diretoria"] },
      { id: "comunicados", rotulo: "Comunicados", icone: Megaphone, href: "/broadcasts", papeis: GESTAO,
        descricao: "Envio em massa para clientes", termos: ["broadcast", "aviso"] },
    ],
  },
  {
    id: "sistema", rotulo: "Sistema", icone: Settings,
    itens: [
      { id: "automacoes", rotulo: "Central de Automações", icone: Zap, href: "/automations", papeis: GESTAO,
        descricao: "Rotinas agendadas do servidor", termos: ["automações", "cron"] },
      { id: "sobre", rotulo: "Sobre o Sistema", icone: Info, href: "/sobre", papeis: OPERACAO,
        descricao: "Manual vivo do Lone OS", termos: ["ajuda", "documentação"] },
      // Já abria pra todo papel pelo ícone de engrenagem da barra do topo.
      { id: "configuracoes", rotulo: "Configurações", icone: Settings, href: "/settings", papeis: TODOS,
        descricao: "Perfil, senha e preferências", termos: ["perfil", "senha", "conta"] },
    ],
  },
];

// ─── Painel ancorado ───────────────────────────────────────────────────────
// Telas em que o painel secundário fica ABERTO ao lado do conteúdo (o AppShell reserva 240px para ele).
// Nas outras, o painel abre por cima, como menu flutuante, e fecha ao escolher — assim nenhuma tela
// perde largura só por pertencer a uma área. Espelha SECONDARY_ROUTES de components/AppShell.tsx:
// se um mudar, o outro precisa mudar junto (o ideal é o AppShell importar esta lista).
export const ROTAS_COM_PAINEL_FIXO: readonly string[] = ["/traffic", "/social", "/design", "/clients", "/crm", "/prospeccao"];

export function temPainelFixo(pathname: string): boolean {
  return ROTAS_COM_PAINEL_FIXO.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

// ─── Funções ───────────────────────────────────────────────────────────────

function podeVerItem(item: ItemMenu, role: Role, herdado?: readonly Role[]): boolean {
  const papeis = item.papeis ?? herdado;
  return !papeis || papeis.includes(role);
}

/** O menu que ESTE papel vê: itens filtrados, seções filtradas, áreas vazias somem. */
export function menuDoPapel(role: Role, menu: readonly GrupoMenu[] = MENU): GrupoMenu[] {
  return menu
    .map((g) => ({
      ...g,
      itens: g.itens
        .filter((it) => podeVerItem(it, role))
        .map((it) => it.secoes
          ? {
              ...it,
              secoes: it.secoes
                .map((s) => ({ ...s, itens: s.itens.filter((sub) => podeVerItem(sub, role, it.papeis)) }))
                .filter((s) => s.itens.length > 0),
            }
          : it),
    }))
    .filter((g) => g.itens.length > 0);
}

/** A área tem o que mostrar no painel secundário (mais de uma tela, ou abas internas)? */
export function grupoTemPainel(g: GrupoMenu): boolean {
  return g.itens.length > 1 || g.itens.some((it) => (it.secoes?.length ?? 0) > 0);
}

function separar(href: string): { path: string; query: URLSearchParams } {
  const [path, q = ""] = href.split("?");
  return { path, query: new URLSearchParams(q) };
}

/**
 * Quanto `href` casa com a URL atual. -1 = não casa. Caminho mais comprido ganha (/traffic/budgets
 * vence /traffic; /settings/grupos vence /settings); empate é decidido pela query (?view=agenda vence
 * o /my-work puro).
 */
export function pontuarHref(href: string, pathname: string, busca: string | URLSearchParams = ""): number {
  const { path, query } = separar(href);
  const exato = pathname === path;
  const casaCaminho = path === "/" ? pathname === "/" : exato || pathname.startsWith(path + "/");
  if (!casaCaminho) return -1;
  const params = typeof busca === "string" ? new URLSearchParams(busca.replace(/^\?/, "")) : busca;
  let extras = 0;
  for (const [k, v] of query.entries()) {
    if (params.get(k) !== v) return -1;
    extras++;
  }
  return path.length * 10 + (exato ? 5 : 0) + extras;
}

export interface Casamento {
  grupo: GrupoMenu;
  item: ItemMenu;
}

/** Qual área e qual subtela correspondem à URL atual (entre as que o papel vê). */
export function casarRota(grupos: readonly GrupoMenu[], pathname: string, busca: string | URLSearchParams = ""): Casamento | null {
  let melhor: Casamento | null = null;
  let melhorNota = -1;
  for (const grupo of grupos) {
    for (const item of grupo.itens) {
      for (const href of [item.href, ...(item.tambemEm ?? [])]) {
        const nota = pontuarHref(href, pathname, busca);
        if (nota > melhorNota) { melhorNota = nota; melhor = { grupo, item }; }
      }
    }
  }
  return melhor;
}

/** Todas as rotas (href + endereços antigos) que o papel alcança pelo menu. */
export function rotasDoPapel(role: Role, menu: readonly GrupoMenu[] = MENU): Set<string> {
  const rotas = new Set<string>();
  for (const g of menuDoPapel(role, menu)) {
    for (const it of g.itens) {
      rotas.add(it.href);
      it.tambemEm?.forEach((r) => rotas.add(r));
      it.secoes?.forEach((s) => s.itens.forEach((sub) => { if (!sub.aba) rotas.add(sub.href); }));
    }
  }
  return rotas;
}

/** O papel alcança essa rota pelo menu? (Usado pra decidir redirecionamentos, ex.: /tarefas.) */
export function papelVe(role: Role, rota: string): boolean {
  return rotasDoPapel(role).has(rota);
}

// ─── Busca ⌘K ──────────────────────────────────────────────────────────────

export interface TelaBusca {
  id: string;
  titulo: string;
  /** Onde fica (ex.: "Conteúdo · Social Media") + descrição. */
  subtitulo: string;
  href: string;
  aba?: string;
  icone: LucideIcon;
  /** Texto normalizado usado no casamento (título, área, descrição, sinônimos). */
  texto: string;
}

export function normalizar(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Telas e abas que o papel pode abrir, achatadas para a busca. */
export function telasParaBusca(role: Role, menu: readonly GrupoMenu[] = MENU): TelaBusca[] {
  const out: TelaBusca[] = [];
  for (const g of menuDoPapel(role, menu)) {
    for (const it of g.itens) {
      const onde = it.rotulo === g.rotulo ? g.rotulo : `${g.rotulo} · ${it.rotulo}`;
      out.push({
        id: `tela-${it.id}`,
        titulo: it.rotulo === "Hoje" ? "Meu Trabalho — Hoje" : it.rotulo,
        subtitulo: [it.rotulo === g.rotulo ? null : g.rotulo, it.descricao].filter(Boolean).join(" · "),
        href: it.href,
        aba: it.aba,
        icone: it.icone,
        texto: normalizar([it.rotulo, g.rotulo, it.descricao, ...(it.termos ?? [])].join(" ")),
      });
      for (const s of it.secoes ?? []) {
        for (const sub of s.itens) {
          out.push({
            id: `tela-${sub.id}`,
            titulo: sub.rotulo,
            subtitulo: onde,
            href: sub.href,
            aba: sub.aba,
            icone: sub.icone,
            texto: normalizar([sub.rotulo, it.rotulo, g.rotulo, s.titulo, ...(sub.termos ?? [])].join(" ")),
          });
        }
      }
    }
  }
  return out;
}

// ─── Barra inferior do celular ─────────────────────────────────────────────

/** O que cada papel mais abre no celular (até 4; o 5º botão é "Mais", que abre o menu inteiro). */
const PRIORIDADE_MOBILE: Record<Role, readonly string[]> = {
  admin:     ["inicio", "trafego-pago", "social", "clientes"],
  manager:   ["inicio", "trafego-pago", "social", "clientes"],
  traffic:   ["inicio", "trafego-pago", "meu-trabalho-hoje", "meus-clientes"],
  social:    ["inicio", "social", "meu-trabalho-agenda", "meu-trabalho-hoje"],
  designer:  ["inicio", "designer", "meu-trabalho-hoje", "meu-trabalho-agenda"],
  comercial: ["crm", "tarefas-comercial", "processos"],
};

/** Rótulos curtos pro espaço apertado do celular. */
const ROTULO_CURTO: Record<string, string> = {
  "meu-trabalho-hoje": "Trabalho",
  "trafego-pago": "Tráfego",
  "social": "Social",
  "meus-clientes": "Clientes",
  "meu-trabalho-agenda": "Agenda",
};

export interface AtalhoMobile {
  id: string;
  rotulo: string;
  href: string;
  icone: LucideIcon;
}

export function atalhosMobile(role: Role, menu: readonly GrupoMenu[] = MENU): AtalhoMobile[] {
  const itens = menuDoPapel(role, menu).flatMap((g) => g.itens);
  const escolhidos = (PRIORIDADE_MOBILE[role] ?? [])
    .map((id) => itens.find((it) => it.id === id))
    .filter((it): it is ItemMenu => !!it);
  return (escolhidos.length > 0 ? escolhidos : itens).slice(0, 4).map((it) => ({
    id: it.id,
    rotulo: ROTULO_CURTO[it.id] ?? it.rotulo,
    href: it.href,
    icone: it.icone,
  }));
}
