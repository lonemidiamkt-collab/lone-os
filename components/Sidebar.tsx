"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, TrendingUp, Instagram, Palette, Users, Lock,
  MessageCircle, Calendar, LogOut, Sun,
  ClipboardCheck, BarChart2, Megaphone, FileSignature, Info, UserCheck, History,
  ChevronLeft, Activity, Layers, AlertTriangle, Settings,
  Users2, Target, Inbox, ShieldCheck, ShieldAlert, Zap, PanelLeftClose, PanelLeft, Thermometer, Bot, Handshake, CalendarClock, HeartPulse,  BookOpen,
  Radar, ListOrdered, Building2, MessageSquare, Settings2, BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/context/RoleContext";
import MedievalAvatar, { getUserAvatar } from "@/components/MedievalAvatars";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { ehDoQuadro } from "@/lib/design/dono";
import { useNav, SIDEBAR_W, SIDEBAR_W_EXPANDED } from "@/lib/context/NavContext";
import { useState, useEffect, useMemo } from "react";

// ─── Primary nav config ────────────────────────────────────────
// Grupos do rail primário: os 5 mais usados ficam sem grupo (fixos no topo, sem embaralhar
// quem já decorou a posição); o resto ganha seção pra não ser 24 ícones do mesmo peso visual.
type PrimaryGroupKey = "operacao" | "clientes" | "time" | "ceo";

interface PrimaryItem {
  href: string;
  icon: LucideIcon;
  label: string;
  roles: string[];
  hasSecondary?: boolean;
  group?: PrimaryGroupKey;
}

const PRIMARY_GROUPS: { key: PrimaryGroupKey; label: string }[] = [
  { key: "operacao", label: "Operação" },
  { key: "clientes", label: "Clientes & Comercial" },
  { key: "time",     label: "Time & Sistema" },
  { key: "ceo",      label: "CEO" },
];

export const PRIMARY_NAV: PrimaryItem[] = [
  { href: "/",              icon: LayoutDashboard, label: "Dashboard",  roles: ["admin","manager","traffic","social","designer"] },
  { href: "/my-work",       icon: Inbox,           label: "Meu Trabalho", roles: ["admin","manager","traffic","social","designer"] },
  { href: "/tarefas",       icon: ClipboardCheck,  label: "Tarefas",    roles: ["admin","manager","traffic","social","designer","comercial"] },
  { href: "/processos",     icon: BookOpen,        label: "Processos",  roles: ["admin","manager","traffic","social","designer","comercial"] },
  { href: "/calendar",      icon: Calendar,        label: "Calendário", roles: ["admin","manager","traffic","social","designer"] },
  { href: "/traffic",       icon: TrendingUp,      label: "Tráfego",    roles: ["admin","manager","traffic"],                    hasSecondary: true, group: "operacao" },
  { href: "/social",        icon: Instagram,       label: "Social",     roles: ["admin","manager","social","designer"],          hasSecondary: true, group: "operacao" },
  { href: "/meus-clientes", icon: UserCheck,       label: "Meus Clientes", roles: ["traffic","social","designer"],               group: "operacao" },
  // O Radar mora DENTRO daqui: olhar o que o mercado mostra faz parte de planejar a semana, não é
  // outra área. Uma aba a menos pra quem já trabalha com Social, Design e Tarefas abertas.
  { href: "/planejamento",  icon: CalendarClock,   label: "Planejamento", roles: ["admin","manager","social","designer"],        group: "operacao" },
  { href: "/design",        icon: Palette,         label: "Designer",   roles: ["admin","manager","designer","social"],          hasSecondary: true, group: "operacao" },
  { href: "/defesa",        icon: ShieldAlert,     label: "Defesa Ativa",roles: ["admin","manager","traffic"],                   group: "operacao" },
  { href: "/clients",       icon: Users,           label: "Clientes",   roles: ["admin","manager"],                              hasSecondary: true, group: "clientes" },
  { href: "/crm",           icon: Handshake,       label: "Comercial",  roles: ["admin","manager","comercial"], hasSecondary: true, group: "clientes" },
  { href: "/prospeccao",    icon: Radar,           label: "Prospecção", roles: ["admin","manager"], hasSecondary: true,           group: "clientes" },
  { href: "/contratos",     icon: FileSignature,   label: "Contratos",  roles: ["admin","manager"],                              group: "clientes" },
  { href: "/churn",         icon: Thermometer,     label: "Termômetro",  roles: ["admin","manager"],                             group: "clientes" },
  { href: "/jornada",       icon: HeartPulse,      label: "Jornada CS",  roles: ["admin","manager","social"],                    group: "clientes" },
  { href: "/carteira",      icon: Layers,          label: "Carteira",    roles: ["admin","manager"],                             group: "clientes" },
  { href: "/sobre",         icon: Info,            label: "Sobre o Sistema", roles: ["admin","manager","traffic","social","designer"], group: "time" },
  { href: "/automations",   icon: Zap,             label: "Automações", roles: ["admin","manager"],                              group: "time" },
  { href: "/agente",        icon: Bot,             label: "Agente Lone", roles: ["admin","manager"],                             group: "time" },
  { href: "/goals",         icon: Target,          label: "Metas & OKRs", roles: ["admin","manager"],                            group: "ceo" },
  { href: "/ceo",           icon: Lock,            label: "Área CEO",   roles: ["admin"],                                        group: "ceo" },
];

// ─── Secondary nav config ──────────────────────────────────────
interface SecondaryItem {
  label: string;
  icon: LucideIcon;
  tab?: string;      // in-page tab (for pages with tab navigation)
  href?: string;     // direct route (overrides primary href)
  badgeKey?: string; // key in the badges map
}

interface SecondarySection {
  title?: string;
  items: SecondaryItem[];
}

const SECONDARY_NAV: Record<string, { title: string; sections: SecondarySection[] }> = {
  "/traffic": {
    title: "Tráfego Pago",
    sections: [
      {
        items: [
          { label: "Rotina Diária",    icon: ClipboardCheck, tab: "rotina" },
          { label: "Status Clientes",  icon: Users2,         tab: "status" },
        ],
      },
      {
        title: "Verba",
        items: [
          { label: "Anúncios Meta",            icon: Megaphone,   tab: "anuncios" },
          { label: "Saldos, Verba & Alertas",  icon: Activity,    href: "/traffic/budgets" },
          { label: "Saúde dos Criativos",      icon: HeartPulse,  href: "/traffic/criativos" },
        ],
      },
      {
        title: "Relatórios",
        items: [
          { label: "Grupos dos Clientes", icon: MessageCircle, href: "/settings/grupos" },
        ],
      },
    ],
  },
  "/social": {
    title: "Social Media",
    sections: [
      {
        items: [
          { label: "Clientes",           icon: Users2,        tab: "carteira",   badgeKey: "socialClients" },
          { label: "Board de Produção",  icon: Layers,        tab: "kanban",     badgeKey: "socialPending" },
          { label: "Inbox de Aprovação", icon: Inbox,         tab: "aprovacao",  badgeKey: "socialApproval" },
        ],
      },
      {
        title: "Análise",
        items: [
          { label: "Métricas",           icon: BarChart2,     tab: "metricas" },
          { label: "Entregas Mensais",   icon: Activity,      tab: "entregas" },
        ],
      },
      {
        title: "Arquivos",
        items: [
          { label: "Onboarding",         icon: ClipboardCheck,tab: "onboarding", badgeKey: "socialOnboarding" },
          { label: "Acessos & Senhas",   icon: ShieldCheck,   tab: "acessos" },
        ],
      },
    ],
  },
  "/design": {
    title: "Designer",
    sections: [
      {
        items: [
          { label: "Kanbans Social Media", icon: Instagram,      tab: "kanbans" },
          { label: "Quadro de Tarefas",    icon: Layers,         tab: "requests", badgeKey: "designQueued" },
          { label: "Meus Clientes",        icon: UserCheck,      tab: "clientes" },
          { label: "Performance",          icon: Activity,       tab: "performance" },
          { label: "Histórico",            icon: History,        tab: "history" },
        ],
      },
    ],
  },
  "/clients": {
    title: "Clientes",
    sections: [
      {
        items: [
          { label: "Todos os Clientes", icon: Users,         href: "/clients" },
          { label: "Em Risco",          icon: AlertTriangle, href: "/clients?filter=at_risk", badgeKey: "atRisk" },
          { label: "Objetivos",         icon: Target,        href: "/clients?filter=goals" },
        ],
      },
    ],
  },
  "/prospeccao": {
    title: "Prospecção",
    sections: [
      {
        title: "Piloto",
        items: [
          { label: "Visão geral", icon: LayoutDashboard, tab: "visao" },
          { label: "Fila do dia",  icon: ListOrdered,     tab: "fila" },
        ],
      },
      {
        title: "Operação",
        items: [
          { label: "Prospects", icon: Building2,     tab: "prospects" },
          { label: "Conversas", icon: MessageSquare, tab: "conversas" },
          { label: "Agenda",    icon: Calendar,      tab: "agenda" },
        ],
      },
      {
        title: "Gestão",
        items: [
          { label: "Configuração", icon: Settings2, tab: "configuracao" },
          { label: "Relatórios",   icon: BarChart3, tab: "relatorios" },
        ],
      },
    ],
  },
  "/crm": {
    title: "Comercial",
    sections: [
      {
        title: "Resultados",
        items: [
          { label: "Hoje",       icon: Sun,             tab: "hoje" },
          { label: "Dashboard",  icon: LayoutDashboard, tab: "dashboard" },
        ],
      },
      {
        title: "Operação",
        items: [
          { label: "Funil",   icon: Layers,   tab: "funil" },
          { label: "Agenda",  icon: Calendar, tab: "agenda" },
        ],
      },
      {
        title: "Análise",
        items: [
          { label: "Relatórios", icon: BarChart2, tab: "relatorios" },
        ],
      },
    ],
  },
};

// ─── Component ─────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { role, currentUser, currentProfile, roleLabel, logout } = useRole();
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const onboarding = useOperationalStore((s) => s.onboarding);
  const { secondaryOpen, setSecondaryOpen, sidebarExpanded: expanded, setSidebarExpanded: setExpanded, setPendingTab, currentTab, mobileOpen, setMobileOpen } = useNav();

  const visibleItems = useMemo(
    () => PRIMARY_NAV.filter((item) => item.roles.includes(role)),
    [role]
  );

  // Itens sem grupo (os 5 mais usados) ficam soltos no topo; o resto entra nas seções de
  // PRIMARY_GROUPS, na ordem declarada ali — só aparece o divisor de um grupo que tiver item.
  const groupedNav = useMemo(() => {
    const ungrouped = visibleItems.filter((item) => !item.group);
    const groups = PRIMARY_GROUPS
      .map((g) => ({ ...g, items: visibleItems.filter((item) => item.group === g.key) }))
      .filter((g) => g.items.length > 0);
    return { ungrouped, groups };
  }, [visibleItems]);

  // Which primary item matches the current route
  const matchedHref = useMemo(
    () =>
      visibleItems.find((item) =>
        item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
      )?.href ?? null,
    [pathname, visibleItems]
  );

  // Track which section is "active" in the secondary sidebar
  const [activePrimary, setActivePrimary] = useState<string | null>(null);
  // `expanded` mora no NavContext: o painel secundário e o conteúdo da página precisam saber a
  // largura da barra pra não ficarem por baixo dela (era o bug do menu com subitens).

  // Auto-open/close secondary based on current route
  useEffect(() => {
    if (matchedHref && SECONDARY_NAV[matchedHref]) {
      setActivePrimary(matchedHref);
      setSecondaryOpen(true);
    } else {
      setActivePrimary(matchedHref);
      setSecondaryOpen(false);
    }
  }, [matchedHref]); // eslint-disable-line react-hooks/exhaustive-deps

  const secondaryConfig = activePrimary ? SECONDARY_NAV[activePrimary] : null;

  // ── Badge values ──────────────────────────────────────────────
  const atRisk         = clients.filter((c) => c.status === "at_risk").length;

  // Social badges
  const socialClients     = clients.filter((c) => c.assignedSocial).length;
  const socialPending     = contentCards.filter(
    (c) => !["scheduled", "published"].includes(c.status)
  ).length;
  // Card já aprovado pelo cliente continua em client_approval até alguém agendar — não é pendência.
  const socialApproval    = contentCards.filter(
    (c) => c.status === "approval" || (c.status === "client_approval" && !c.clientApprovedAt)
  ).length;
  const socialOnboarding  = Object.values(onboarding).reduce(
    (sum, items) => sum + items.filter((it) => !it.completed).length, 0
  );

  // Design badges
  // Designer vê a fila do próprio quadro (mesma regra de dono do /design), não a da agência inteira.
  const designQueued = designRequests.filter(
    (r) => r.status === "queued" && (role !== "designer" || ehDoQuadro(r, clients, currentUser))
  ).length;

  const badges: Record<string, number> = {
    atRisk,
    socialClients,
    socialPending,
    socialApproval,
    socialOnboarding,
    designQueued,
  };

  // ── Interaction handlers ──────────────────────────────────────
  function handlePrimaryClick(item: PrimaryItem) {
    if (item.hasSecondary && SECONDARY_NAV[item.href]) {
      if (activePrimary === item.href) {
        // Em sub-rota (ex: /traffic/budgets): navega pra rota base
        // Na rota base exata: apenas toggle do secondary
        if (pathname !== item.href) {
          router.push(item.href);
        } else {
          setSecondaryOpen(!secondaryOpen);
        }
      } else {
        setActivePrimary(item.href);
        setSecondaryOpen(true);
        if (!pathname.startsWith(item.href)) {
          router.push(item.href);
        }
      }
    } else {
      setActivePrimary(item.href);
      setSecondaryOpen(false);
      router.push(item.href);
    }
    setMobileOpen(false);
  }

  function handleSecondaryItemClick(item: SecondaryItem) {
    const targetHref = item.href ?? activePrimary ?? "/";
    const targetPath = targetHref.split("?")[0];
    if (item.tab) {
      setPendingTab(item.tab);
      // Usa match exato: /traffic/budgets !== /traffic → navega
      // startsWith causava freeze ao ficar em sub-rotas como /traffic/budgets
      if (pathname !== targetPath) {
        router.push(targetHref);
      }
    } else {
      router.push(targetHref);
    }
    setMobileOpen(false);
  }

  // ── Nav item button (compartilhado entre itens soltos e agrupados) ────────────
  function renderNavItem(item: PrimaryItem) {
    const isPage    = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    const isSection = activePrimary === item.href && secondaryOpen;
    const Icon      = item.icon;
    return (
      <button
        key={item.href}
        onClick={() => handlePrimaryClick(item)}
        title={expanded ? undefined : item.label}
        className={cn(
          "relative shrink-0 rounded-xl flex items-center transition-all duration-200 ease-out group",
          expanded ? "w-full gap-3 px-3 h-10" : "w-10 h-10 justify-center",
          isPage
            ? "text-primary bg-lone-brand-bg-soft"
            : isSection
            ? "text-primary bg-lone-brand-bg-soft"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <Icon size={17} strokeWidth={isPage ? 2.3 : 1.7} className="shrink-0" />
        {expanded && (
          <span className={`text-xs font-medium truncate ${isPage ? "text-primary" : "text-muted-foreground"}`}>
            {item.label}
          </span>
        )}

        {/* Active page: blue pill on right edge */}
        {isPage && (
          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary -mr-px" />
        )}

        {/* Pulse dot for Design when there are queued requests */}
        {item.href === "/design" && designQueued > 0 && !isPage && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        )}
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          PRIMARY SIDEBAR — 72 px, pitch-black, icons only
      ═══════════════════════════════════════════════════════════ */}
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-overlay backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed left-0 top-0 bottom-0 z-50 flex flex-col justify-between py-5 bg-sidebar border-r border-sidebar-border transition-all duration-[400ms]",
        "ease-[cubic-bezier(0.16,1,0.3,1)]",
        expanded ? "w-[200px] items-start px-3" : "w-[72px] items-center",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo — o tailwind.config não tem darkMode:"class", então `dark:` seguiria o SO e não o tema escolhido. */}
        <Link href="/" className="group shrink-0 w-10 h-10 flex items-center justify-center" aria-label="Lone Mídia — início">
          <img src="/brand/logo-mark-on-light.png" alt="Lone Mídia" width={192} height={239}
            className="w-7 h-auto [.dark_&]:hidden group-hover:scale-[1.04] transition-transform duration-300" />
          <img src="/brand/logo-mark-on-dark.png" alt="" aria-hidden width={192} height={239}
            className="w-7 h-auto hidden [.dark_&]:block group-hover:scale-[1.04] transition-transform duration-300" />
        </Link>

        {/* Expand/Collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all mt-2 mb-1 shrink-0"
          title={expanded ? "Recolher menu" : "Expandir menu"}
        >
          {expanded ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
        </button>

        {/* Nav icons */}
        {/* `min-h-0` + `overflow-y-auto`: sem isso o flex-1 estica a nav além da tela e os últimos
            itens (Área CEO, Metas) ficavam inalcançáveis — a roda do mouse não pegava em nada. */}
        <nav className={cn(
          "flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar justify-start pt-1 pb-1 shrink",
          expanded ? "w-full" : "items-center"
        )}>
          {groupedNav.ungrouped.map(renderNavItem)}

          {groupedNav.groups.map((g) => (
            <div key={g.key} className={cn("flex flex-col gap-0.5 pt-1", expanded ? "w-full" : "items-center")}>
              {expanded ? (
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em] px-3 pt-2 pb-1">
                  {g.label}
                </p>
              ) : (
                <div className="w-6 h-px bg-border my-1" />
              )}
              {g.items.map(renderNavItem)}
            </div>
          ))}
        </nav>

        {/* Controles da conta: no computador moram na barra do topo (TopActions); aqui só no mobile,
            onde a gaveta lateral é o único lugar deles. */}
        <div className="flex flex-col items-center gap-1 shrink-0 lg:hidden">
          <ThemeToggle variant={expanded ? "pill" : "icon"} className={expanded ? "mb-1" : undefined} />

          <button
            onClick={() => { router.push("/settings"); setMobileOpen(false); }}
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
              pathname === "/settings"
                ? "text-primary bg-lone-brand-bg-soft"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            title="Configurações"
          >
            <Settings size={15} />
          </button>

          <button
            onClick={logout}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-lone-danger-bg transition-all"
            title="Sair"
          >
            <LogOut size={15} />
          </button>

          {/* Avatar */}
          <MedievalAvatar type={getUserAvatar(currentProfile.id)} size={36} className="mt-1" />
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════
          SECONDARY SIDEBAR — 240 px, graphite, contextual nav
      ═══════════════════════════════════════════════════════════ */}
      <aside
        style={{ left: expanded ? SIDEBAR_W_EXPANDED : SIDEBAR_W }}
        className={cn(
          // O `left` acompanha a barra principal. Fixo em 72px, ao expandir o menu (200px) este
          // painel ficava POR BAIXO dela: os rótulos dos subitens apareciam cortados pela metade.
          "fixed top-0 bottom-0 z-40 w-[240px] bg-sidebar border-r border-sidebar-border flex flex-col",
          "transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
          secondaryOpen && secondaryConfig
            ? "translate-x-0 opacity-100"
            : "-translate-x-full opacity-0 pointer-events-none",
          !mobileOpen && "max-lg:-translate-x-full max-lg:opacity-0 max-lg:pointer-events-none"
        )}
      >
        {/* Top micro-glow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent pointer-events-none" />

        {secondaryConfig && (
          <>
            {/* Secondary header */}
            <div className="flex items-center justify-between px-4 pt-6 pb-4">
              <span className="text-[11px] font-semibold text-foreground tracking-tight">
                {secondaryConfig.title}
              </span>
              <button
                onClick={() => setSecondaryOpen(false)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                title="Fechar painel"
              >
                <ChevronLeft size={13} />
              </button>
            </div>

            {/* Separator */}
            <div className="h-px bg-border mx-3 mb-3" />

            {/* Sections */}
            <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
              {secondaryConfig.sections.map((section, si) => (
                <div key={si} className={si > 0 ? "pt-4" : ""}>
                  {section.title && (
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] px-2 pb-2">
                      {section.title}
                    </p>
                  )}
                  {section.items.map((item, ii) => {
                    const Icon    = item.icon;
                    const badge   = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
                    const itemPath = item.href?.split("?")[0];
                    const isActive = item.tab
                      ? currentTab === item.tab
                      : itemPath
                      ? pathname === itemPath
                      : false;

                    return (
                      <button
                        key={ii}
                        onClick={() => handleSecondaryItemClick(item)}
                        className={cn(
                          "relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ease-out group",
                          isActive
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                      >
                        {/* Active left accent */}
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-full bg-primary" />
                        )}

                        <Icon
                          size={13}
                          strokeWidth={1.8}
                          className={cn(
                            "shrink-0 transition-colors",
                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />

                        <span className="text-[13px] font-medium flex-1 leading-none truncate">
                          {item.label}
                        </span>

                        {badge > 0 && (
                          <span
                            className={cn(
                              "text-[10px] font-semibold rounded-md px-1.5 py-0.5 min-w-[20px] text-center tabular-nums shrink-0",
                              isActive
                                ? "bg-lone-brand-bg-soft text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Footer — user info */}
            <div className="px-3 py-3 border-t border-border">
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent transition-colors cursor-default">
                <MedievalAvatar type={getUserAvatar(currentProfile.id)} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-foreground truncate leading-none">{currentProfile.name}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{roleLabel}</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Right micro-glow */}
        <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-border to-transparent pointer-events-none" />
      </aside>
    </>
  );
}
