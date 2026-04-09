"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, TrendingUp, Instagram, Palette, Users, Lock,
  MessageCircle, Calendar, LogOut, Sun, Moon,
  ClipboardCheck, BarChart2, Wallet, Megaphone, Brain, FileText,
  ChevronLeft, Activity, Layers, AlertTriangle, Settings,
  Users2, Globe, Target, Inbox, ShieldCheck, Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/context/RoleContext";
import { useTheme } from "@/lib/context/ThemeContext";
import { useAppState } from "@/lib/context/AppStateContext";
import { useNav } from "@/lib/context/NavContext";
import { useState, useEffect, useMemo } from "react";

// ─── Primary nav config ────────────────────────────────────────
interface PrimaryItem {
  href: string;
  icon: LucideIcon;
  label: string;
  roles: string[];
  hasSecondary?: boolean;
}

const PRIMARY_NAV: PrimaryItem[] = [
  { href: "/",              icon: LayoutDashboard, label: "Dashboard",  roles: ["admin","manager","traffic","social","designer"] },
  { href: "/my-work",       icon: Inbox,           label: "Meu Trabalho", roles: ["admin","manager","traffic","social","designer"] },
  { href: "/traffic",       icon: TrendingUp,      label: "Tráfego",    roles: ["admin","manager","traffic"],                    hasSecondary: true },
  { href: "/social",        icon: Instagram,       label: "Social",     roles: ["admin","manager","social","designer"],          hasSecondary: true },
  { href: "/design",        icon: Palette,         label: "Designer",   roles: ["admin","manager","designer","social"],          hasSecondary: true },
  { href: "/clients",       icon: Users,           label: "Clientes",   roles: ["admin","manager"],                              hasSecondary: true },
  { href: "/calendar",      icon: Calendar,        label: "Calendário", roles: ["admin","manager","traffic","social","designer"] },
  { href: "/communications",icon: MessageCircle,   label: "Comunicação",roles: ["admin","manager","traffic","social","designer"] },
  { href: "/ceo",           icon: Lock,            label: "Área CEO",   roles: ["admin"] },
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
          { label: "Rotina Diária",    icon: ClipboardCheck, tab: "rotina",      badgeKey: "trafficPending" },
          { label: "Status Clientes",  icon: Users2,         tab: "status" },
          { label: "Kanban Tarefas",   icon: Layers,         tab: "kanban",      badgeKey: "trafficTasks" },
        ],
      },
      {
        title: "Verba",
        items: [
          { label: "Controle de Investimento", icon: Wallet,   tab: "investimento" },
          { label: "Anúncios Meta",            icon: Megaphone,tab: "anuncios",   badgeKey: "activeCampaigns" },
        ],
      },
      {
        title: "Relatórios",
        items: [
          { label: "Relatórios Mensais", icon: BarChart2, tab: "relatorios" },
          { label: "Análise AI",         icon: Brain,     tab: "report" },
        ],
      },
    ],
  },
  "/social": {
    title: "Social Media",
    sections: [
      {
        items: [
          { label: "Carteira",           icon: Users2,        tab: "carteira",   badgeKey: "socialClients" },
          { label: "Board de Produção",  icon: Layers,        tab: "kanban",     badgeKey: "socialPending" },
          { label: "Calendário Editorial",icon: Calendar,     tab: "calendar" },
          { label: "Inbox de Aprovação", icon: Inbox,         tab: "relatorios", badgeKey: "socialApproval" },
        ],
      },
      {
        title: "Análise",
        items: [
          { label: "Métricas",           icon: BarChart2,     tab: "metricas" },
          { label: "Entregas Mensais",   icon: Activity,      tab: "entregas" },
          { label: "Relatórios",         icon: FileText,      tab: "relatorios" },
        ],
      },
      {
        title: "Arquivos",
        items: [
          { label: "Onboarding",         icon: ClipboardCheck,tab: "onboarding", badgeKey: "socialOnboarding" },
          { label: "Acessos & Senhas",   icon: ShieldCheck,   tab: "acessos" },
          { label: "Chat Interno",       icon: MessageCircle, tab: "chat" },
        ],
      },
    ],
  },
  "/design": {
    title: "Designer",
    sections: [
      {
        items: [
          { label: "Fila de Pedidos",  icon: Layers,        tab: "requests" },
          { label: "Minhas Tarefas",   icon: ClipboardCheck, tab: "kanbans" },
          { label: "Performance",      icon: Activity,      tab: "performance" },
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
          { label: "Em Risco",          icon: AlertTriangle, href: "/clients", badgeKey: "atRisk" },
          { label: "Objetivos",         icon: Target,        href: "/clients" },
        ],
      },
    ],
  },
};

// ─── Component ─────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { role, currentProfile, roleLabel, logout } = useRole();
  const { theme, toggleTheme } = useTheme();
  const { clients, tasks, trafficRoutineChecks, contentCards, onboarding } = useAppState();
  const { secondaryOpen, setSecondaryOpen, setPendingTab, currentTab, mobileOpen, setMobileOpen } = useNav();

  const visibleItems = useMemo(
    () => PRIMARY_NAV.filter((item) => item.roles.includes(role)),
    [role]
  );

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
  const today          = new Date().toISOString().slice(0, 10);
  const activeClients  = clients.filter((c) => c.status !== "onboarding");
  const todayChecks    = trafficRoutineChecks.filter((c) => c.date === today);
  const trafficPending = activeClients.filter(
    (c) => !todayChecks.some((ch) => ch.clientId === c.id && ch.type === "support")
  ).length;
  const trafficTasks   = tasks.filter((t) => t.role === "traffic" && t.status !== "done").length;
  const atRisk         = clients.filter((c) => c.status === "at_risk").length;

  // Social badges
  const socialClients     = clients.filter((c) => c.assignedSocial).length;
  const socialPending     = contentCards.filter(
    (c) => !["scheduled", "published"].includes(c.status)
  ).length;
  const socialApproval    = contentCards.filter(
    (c) => c.status === "approval" || c.status === "client_approval"
  ).length;
  const socialOnboarding  = Object.values(onboarding).reduce(
    (sum, items) => sum + items.filter((it) => !it.completed).length, 0
  );

  const badges: Record<string, number> = {
    trafficPending,
    trafficTasks,
    atRisk,
    socialClients,
    socialPending,
    socialApproval,
    socialOnboarding,
  };

  // ── Interaction handlers ──────────────────────────────────────
  function handlePrimaryClick(item: PrimaryItem) {
    if (item.hasSecondary && SECONDARY_NAV[item.href]) {
      if (activePrimary === item.href) {
        setSecondaryOpen(!secondaryOpen);
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
    if (item.tab) {
      setPendingTab(item.tab);
      if (!pathname.startsWith(targetHref)) {
        router.push(targetHref);
      }
    } else {
      router.push(targetHref);
    }
    setMobileOpen(false);
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
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center justify-between py-5 w-[72px] bg-black transition-transform duration-300",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Right-edge glow */}
        <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#0a34f5]/20 to-transparent pointer-events-none" />

        {/* Logo */}
        <Link href="/" className="group shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-black flex items-center justify-center shadow-[0_0_18px_rgba(10,52,245,0.35)] group-hover:shadow-[0_0_28px_rgba(10,52,245,0.55)] group-hover:scale-105 transition-all duration-200 overflow-hidden">
            <img src="/logo.png" alt="Lone" width={24} height={24} className="object-contain" />
          </div>
        </Link>

        {/* Nav icons */}
        <nav className="flex flex-col items-center gap-0.5 flex-1 justify-center">
          {visibleItems.map((item) => {
            const isPage    = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const isSection = activePrimary === item.href && secondaryOpen;
            const Icon      = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => handlePrimaryClick(item)}
                title={item.label}
                className={cn(
                  "relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 group",
                  isPage
                    ? "text-white"
                    : isSection
                    ? "text-[#3b6ff5] bg-[#0a34f5]/8"
                    : "text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04]"
                )}
              >
                <Icon size={17} strokeWidth={isPage ? 2.3 : 1.7} />

                {/* Active page: blue pill on right edge */}
                {isPage && (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-[#0a34f5] shadow-[0_0_8px_rgba(10,52,245,0.7)] -mr-px" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-700 hover:text-zinc-300 hover:bg-white/[0.04] transition-all"
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            onClick={() => { router.push("/settings"); setMobileOpen(false); }}
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
              pathname === "/settings"
                ? "text-[#0a34f5] bg-[#0a34f5]/10"
                : "text-zinc-700 hover:text-zinc-300 hover:bg-white/[0.04]"
            )}
            title="Configurações"
          >
            <Settings size={15} />
          </button>

          <button
            onClick={logout}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-700 hover:text-red-400 hover:bg-red-500/5 transition-all"
            title="Sair"
          >
            <LogOut size={15} />
          </button>

          {/* Avatar */}
          <div className="w-9 h-9 rounded-xl bg-[#0a34f5]/12 flex items-center justify-center ring-1 ring-[#0a34f5]/20 mt-1">
            <span className="text-[10px] font-bold text-[#0a34f5]">{currentProfile.initials}</span>
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════
          SECONDARY SIDEBAR — 240 px, graphite, contextual nav
      ═══════════════════════════════════════════════════════════ */}
      <aside
        className={cn(
          "fixed left-[72px] top-0 bottom-0 z-40 w-[240px] bg-[#0c0c0c] border-r border-[#181818] flex flex-col",
          "transition-all duration-300 ease-in-out",
          secondaryOpen && secondaryConfig
            ? "translate-x-0 opacity-100"
            : "-translate-x-full opacity-0 pointer-events-none",
          !mobileOpen && "max-lg:-translate-x-full max-lg:opacity-0 max-lg:pointer-events-none"
        )}
      >
        {/* Top micro-glow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#0a34f5]/15 to-transparent pointer-events-none" />

        {secondaryConfig && (
          <>
            {/* Secondary header */}
            <div className="flex items-center justify-between px-4 pt-[22px] pb-4">
              <span className="text-[11px] font-semibold text-zinc-400 tracking-tight">
                {secondaryConfig.title}
              </span>
              <button
                onClick={() => setSecondaryOpen(false)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-700 hover:text-zinc-300 hover:bg-white/5 transition-all"
                title="Fechar painel"
              >
                <ChevronLeft size={13} />
              </button>
            </div>

            {/* Separator */}
            <div className="h-px bg-[#181818] mx-3 mb-3" />

            {/* Sections */}
            <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
              {secondaryConfig.sections.map((section, si) => (
                <div key={si} className={si > 0 ? "pt-4" : ""}>
                  {section.title && (
                    <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-[0.12em] px-2 pb-1.5">
                      {section.title}
                    </p>
                  )}
                  {section.items.map((item, ii) => {
                    const Icon    = item.icon;
                    const badge   = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
                    const isActive = item.tab
                      ? currentTab === item.tab
                      : item.href
                      ? pathname === item.href
                      : false;

                    return (
                      <button
                        key={ii}
                        onClick={() => handleSecondaryItemClick(item)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-left transition-all duration-100 group",
                          isActive
                            ? "bg-[#1a1a1a] text-white"
                            : "text-zinc-500 hover:text-zinc-200 hover:bg-[#151515]"
                        )}
                      >
                        {/* Active left accent */}
                        {isActive && (
                          <span className="absolute left-2 w-[2.5px] h-4 rounded-full bg-[#0a34f5] shadow-[0_0_6px_rgba(10,52,245,0.6)]" />
                        )}

                        <Icon
                          size={13}
                          strokeWidth={1.8}
                          className={cn(
                            "shrink-0 transition-colors",
                            isActive ? "text-[#3b6ff5]" : "text-zinc-700 group-hover:text-zinc-400"
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
                                ? "bg-[#0a34f5]/20 text-[#3b6ff5]"
                                : "bg-[#1a1a1a] text-zinc-600"
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
            <div className="px-3 py-3 border-t border-[#181818]">
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[#151515] transition-colors cursor-default">
                <div className="w-7 h-7 rounded-lg bg-[#0a34f5]/15 flex items-center justify-center ring-1 ring-[#0a34f5]/20 shrink-0">
                  <span className="text-[10px] font-bold text-[#0a34f5]">{currentProfile.initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-zinc-300 truncate leading-none">{currentProfile.name}</p>
                  <p className="text-[10px] text-zinc-700 uppercase tracking-wide mt-0.5">{roleLabel}</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Right micro-glow */}
        <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#0a34f5]/8 to-transparent pointer-events-none" />
      </aside>
    </>
  );
}
