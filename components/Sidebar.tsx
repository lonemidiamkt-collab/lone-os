"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LogOut, Settings, Search, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { cn, todaySP } from "@/lib/utils";
import { useRole } from "@/lib/context/RoleContext";
import { FotoPessoa } from "@/components/ui/FotoPessoa";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ABRIR_BUSCA } from "@/components/TopActions";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useTrafficStore } from "@/stores/useTrafficStore";
import { ehDoQuadro } from "@/lib/design/dono";
import { emOperacao } from "@/lib/clients/operacao";
import { useNav, SIDEBAR_W, SIDEBAR_W_EXPANDED } from "@/lib/context/NavContext";
import {
  menuDoPapel, casarRota, grupoTemPainel, temPainelFixo, pontuarHref,
  type ChaveBadge, type GrupoMenu, type ItemMenu,
} from "@/lib/navegacao/menu";
import { useIrPara } from "@/components/navegacao/useIrPara";
import LeitorDaBusca from "@/components/navegacao/LeitorDaBusca";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";

// O menu (áreas, subtelas, abas e papéis) mora em lib/navegacao/menu.ts. Aqui só o desenho e o
// comportamento: rail de 9 áreas + painel secundário com as subtelas da área.
//
// Painel secundário, dois jeitos:
//  - ANCORADO nas telas com abas internas (Tráfego Pago, Social, Designer, Clientes, Comercial,
//    Prospecção): abre sozinho ao lado do conteúdo, como sempre foi.
//  - FLUTUANTE nas demais: clicar de novo na área em que você está abre o painel por cima da tela;
//    escolher uma subtela, clicar fora ou apertar Esc fecha. Assim nenhuma tela perde 240px de
//    largura só por pertencer a uma área.

interface LinhaPainel {
  item: ItemMenu;
  /** Subtela dona da aba/filtro (só nos itens de seção). */
  dono?: ItemMenu;
}

export default function Sidebar() {
  const pathname = usePathname() || "/";
  const irPara = useIrPara();
  const { role, currentUser, currentProfile, roleLabel, logout } = useRole();
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const onboarding = useOperationalStore((s) => s.onboarding);
  const rotinaTrafego = useTrafficStore((s) => s.trafficRoutineChecks);
  const {
    secondaryOpen, setSecondaryOpen, sidebarExpanded: expanded, setSidebarExpanded: setExpanded,
    currentTab, mobileOpen, setMobileOpen,
  } = useNav();

  const [busca, setBusca] = useState("");
  const grupos = useMemo(() => menuDoPapel(role), [role]);
  const ativo = useMemo(() => casarRota(grupos, pathname, busca), [grupos, pathname, busca]);
  const grupoAtivoId = ativo?.grupo.id ?? null;
  const fixo = temPainelFixo(pathname);

  const [flutuanteId, setFlutuanteId] = useState<string | null>(null);
  const [hoverNav, setHoverNav] = useState<string | null>(null);

  // Painel ancorado abre/fecha conforme a área e o tipo de tela. Chave = área + tipo, não o caminho:
  // quem fechou o painel no /traffic e foi pro /traffic/budgets não quer vê-lo reabrir sozinho.
  useEffect(() => {
    const g = grupoAtivoId ? grupos.find((x) => x.id === grupoAtivoId) : null;
    setSecondaryOpen(!!(fixo && g && grupoTemPainel(g)));
  }, [grupoAtivoId, fixo]); // eslint-disable-line react-hooks/exhaustive-deps

  // O flutuante fecha em qualquer navegação, ao fechar a gaveta do celular e no Esc.
  useEffect(() => { setFlutuanteId(null); }, [pathname, busca]);
  useEffect(() => { if (!mobileOpen) setFlutuanteId(null); }, [mobileOpen]);
  useEffect(() => {
    if (!flutuanteId) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") setFlutuanteId(null); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [flutuanteId]);

  const grupoAtivo = grupoAtivoId ? grupos.find((g) => g.id === grupoAtivoId) ?? null : null;
  const painelAncorado = secondaryOpen && fixo && !!grupoAtivo && grupoTemPainel(grupoAtivo);
  const painelAtual: GrupoMenu | null = flutuanteId
    ? grupos.find((g) => g.id === flutuanteId) ?? null
    : painelAncorado ? grupoAtivo : null;
  // Mantém o conteúdo enquanto o painel desliza para fora (senão ele some antes da animação).
  const ultimoPainel = useRef<GrupoMenu | null>(null);
  if (painelAtual) ultimoPainel.current = painelAtual;
  const painel = painelAtual ?? ultimoPainel.current;
  const painelVisivel = !!painelAtual;

  // ── Contadores ────────────────────────────────────────────────
  // Social vê os números do PRÓPRIO quadro (é onde a tela dele abre); o resto vê a agência.
  const soDoSocial = role === "social";
  const cardsSocial = soDoSocial ? contentCards.filter((c) => c.socialMedia === currentUser) : contentCards;
  const hoje = todaySP();
  const carteiraTrafego = clients.filter((c) => emOperacao(c) && (role !== "traffic" || c.assignedTraffic === currentUser));
  const rotinaFeitaHoje = rotinaTrafego.filter(
    (c) => c.date === hoje && c.type === "support" && (role !== "traffic" || c.completedBy === currentUser),
  ).length;
  // Designer vê a fila do próprio quadro (mesma regra de dono do /design), não a da agência inteira.
  const designQueued = designRequests.filter(
    (r) => r.status === "queued" && (role !== "designer" || ehDoQuadro(r, clients, currentUser)),
  ).length;

  const badges: Record<ChaveBadge, number> = {
    atRisk: clients.filter((c) => c.status === "at_risk").length,
    socialPending: cardsSocial.filter((c) => !["scheduled", "published"].includes(c.status)).length,
    // Card já aprovado pelo cliente continua em client_approval até alguém agendar — não é pendência.
    socialApproval: cardsSocial.filter(
      (c) => c.status === "approval" || (c.status === "client_approval" && !c.clientApprovedAt),
    ).length,
    socialOnboarding: Object.values(onboarding).reduce((sum, items) => sum + items.filter((it) => !it.completed).length, 0),
    designQueued,
    trafficRotina: Math.max(0, carteiraTrafego.length - rotinaFeitaHoje),
  };

  // ── Cliques ───────────────────────────────────────────────────
  function clicarArea(g: GrupoMenu) {
    if (!grupoTemPainel(g)) {
      setFlutuanteId(null);
      irPara(g.itens[0]);
      setMobileOpen(false);
      return;
    }
    // Na gaveta do celular não há painel ao lado: tocar na área mostra as subtelas dela.
    if (mobileOpen) {
      setFlutuanteId((id) => (id === g.id ? null : g.id));
      return;
    }
    if (g.id === grupoAtivoId) {
      if (fixo) { setFlutuanteId(null); setSecondaryOpen(!secondaryOpen); }
      else setFlutuanteId((id) => (id === g.id ? null : g.id));
      return;
    }
    // Outra área: um clique leva direto à primeira tela dela (quem decorou o caminho não perde tempo).
    setFlutuanteId(null);
    irPara(g.itens[0]);
  }

  function clicarItem(item: ItemMenu) {
    irPara(item);
    setFlutuanteId(null);
    setMobileOpen(false);
  }

  function fecharPainel() {
    if (flutuanteId) setFlutuanteId(null);
    else setSecondaryOpen(false);
  }

  // ── Linhas do painel: subtelas da área + abas da tela em que você está ──
  const secoesPainel = useMemo(() => {
    if (!painel) return [] as { titulo?: string; linhas: LinhaPainel[] }[];
    const out: { titulo?: string; linhas: LinhaPainel[] }[] = [];
    if (painel.itens.length > 1) out.push({ linhas: painel.itens.map((item) => ({ item })) });
    if (ativo && ativo.grupo.id === painel.id) {
      for (const s of ativo.item.secoes ?? []) {
        out.push({ titulo: s.titulo, linhas: s.itens.map((sub) => ({ item: sub, dono: ativo.item })) });
      }
    }
    return out;
  }, [painel, ativo]);

  function linhaAtiva({ item, dono }: LinhaPainel): boolean {
    if (!dono) return ativo?.item.id === item.id;
    if (item.aba) return ativo?.item.id === dono.id && currentTab === item.aba;
    return item.href.includes("?") && pontuarHref(item.href, pathname, busca) >= 0;
  }

  // ── Botão de área no rail ─────────────────────────────────────
  function renderArea(g: GrupoMenu) {
    const naArea  = grupoAtivoId === g.id;
    const aberta  = flutuanteId === g.id || (painelAncorado && naArea);
    // Um realce só (layoutId único): com um painel flutuante aberto, acende a área dele.
    const destaque = flutuanteId ? flutuanteId === g.id : naArea;
    const comPainel = grupoTemPainel(g);
    const Icon    = g.icone;
    // Recolhido, o tooltip já conta o que tem dentro — a área não esconde as telas.
    const dica = comPainel ? `${g.rotulo}: ${g.itens.map((i) => i.rotulo).join(" · ")}` : g.rotulo;
    const pulsoDesign = g.id === "conteudo" && designQueued > 0 && ativo?.item.id !== "designer";
    return (
      <button
        key={g.id}
        onClick={() => clicarArea(g)}
        onMouseEnter={() => setHoverNav(g.id)}
        title={expanded ? (comPainel ? dica : undefined) : dica}
        aria-current={naArea ? "page" : undefined}
        aria-expanded={comPainel ? aberta : undefined}
        className={cn(
          "relative shrink-0 rounded-xl flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring group",
          expanded ? "w-full gap-3 px-3 h-10" : "w-10 h-10 justify-center",
          g.id === "sistema" && "mt-auto",
          destaque ? "text-sidebar-accent-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {/* Realce que DESLIZA: o do mouse acompanha o cursor; o ativo viaja de uma área à outra
            quando a página muda (layoutId compartilhado). */}
        {hoverNav === g.id && !destaque && (
          <motion.span layoutId="nav-hover" className="absolute inset-0 rounded-xl bg-accent"
            transition={{ type: "spring", bounce: 0, duration: 0.3 }} />
        )}
        {destaque && (
          <motion.span layoutId="nav-ativo" className="absolute inset-0 rounded-xl bg-lone-brand-bg-soft ring-1 ring-inset ring-primary/40"
            transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}>
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-lone-brand-soft" />
          </motion.span>
        )}
        <Icon size={17} strokeWidth={destaque ? 2.2 : 1.7}
          className={cn("relative shrink-0 transition-transform duration-200 group-hover:scale-110", destaque && "text-lone-brand-soft")} />
        {expanded && (
          <span className={cn("relative text-xs font-medium truncate", destaque ? "text-foreground" : "")}>
            {g.rotulo}
          </span>
        )}
        {expanded && comPainel && (
          <ChevronRight size={13} className={cn("relative ml-auto shrink-0 text-muted-foreground transition-transform", aberta && "rotate-180")} />
        )}

        {/* Pulso quando há arte na fila do Designer */}
        {pulsoDesign && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        )}
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      <LeitorDaBusca onChange={setBusca} />

      {/* Fundo da gaveta no celular */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-overlay backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Clicar fora fecha o painel flutuante (só no computador; no celular a gaveta cuida disso). */}
      {flutuanteId && !mobileOpen && (
        <div className="hidden lg:block fixed inset-0 z-30" onClick={() => setFlutuanteId(null)} aria-hidden="true" />
      )}

      {/* ═══════════════════════════════════════════════════════════
          RAIL PRINCIPAL — 72px (ícones) ou 200px (com nomes)
      ═══════════════════════════════════════════════════════════ */}
      <aside className={cn(
        // tema-escuro: a barra principal é grafite nos dois temas (decisão V1); só o conteúdo segue o tema.
        "tema-escuro fixed left-0 top-0 bottom-0 z-50 flex flex-col justify-between py-5 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-[400ms]",
        "ease-[cubic-bezier(0.16,1,0.3,1)]",
        expanded ? "w-[200px] items-start px-3" : "w-[72px] items-center",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo: a barra é sempre grafite, então sempre a versão de fundo escuro (L branco). */}
        <Link href="/" aria-label="Lone Mídia — início"
          className={cn("group shrink-0 flex items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", expanded && "px-1")}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent ring-1 ring-sidebar-border transition-all duration-300 group-hover:ring-primary/50 group-hover:-rotate-6">
            <img src="/brand/logo-mark-on-dark.png" alt="" width={192} height={239} className="h-auto w-[18px]" />
          </span>
          {expanded && <span className="text-sm font-semibold tracking-tight text-foreground">Lone OS</span>}
        </Link>

        {/* Expandir/recolher */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all mt-2 mb-1 shrink-0"
          title={expanded ? "Recolher menu" : "Expandir menu"}
        >
          {expanded ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
        </button>

        {/* Áreas. `min-h-0` + `overflow-y-auto`: sem isso, em tela baixa, os últimos itens ficavam
            inalcançáveis — a roda do mouse não pegava em nada. */}
        <nav aria-label="Menu principal" onMouseLeave={() => setHoverNav(null)} className={cn(
          "flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar justify-start pt-1 pb-1 shrink",
          expanded ? "w-full" : "items-center"
        )}>
          {grupos.map(renderArea)}
        </nav>

        {/* Controles da conta: no computador moram na barra do topo (TopActions); aqui só no celular,
            onde a gaveta lateral é o único lugar deles. */}
        <div className="flex flex-col items-center gap-1 shrink-0 lg:hidden">
          <button
            onClick={() => { setMobileOpen(false); window.dispatchEvent(new Event(ABRIR_BUSCA)); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            title="Buscar"
            aria-label="Buscar"
          >
            <Search size={15} />
          </button>

          <ThemeToggle variant={expanded ? "pill" : "icon"} className={expanded ? "mb-1" : undefined} />

          <button
            onClick={() => { irPara({ href: "/settings" }); setMobileOpen(false); }}
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

          <FotoPessoa perfil={currentProfile} size={36} className="mt-1" />
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════
          PAINEL SECUNDÁRIO — 240px, subtelas da área
      ═══════════════════════════════════════════════════════════ */}
      <aside
        style={{ left: expanded ? SIDEBAR_W_EXPANDED : SIDEBAR_W }}
        className={cn(
          // O `left` acompanha a barra principal. Fixo em 72px, ao expandir o menu (200px) este
          // painel ficava POR BAIXO dela: os rótulos dos subitens apareciam cortados pela metade.
          "fixed top-0 bottom-0 z-40 w-[240px] bg-sidebar border-r border-sidebar-border flex flex-col",
          "transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
          painelVisivel
            ? "translate-x-0 opacity-100"
            : "-translate-x-full opacity-0 pointer-events-none",
          flutuanteId && "shadow-sm",
          !mobileOpen && "max-lg:-translate-x-full max-lg:opacity-0 max-lg:pointer-events-none"
        )}
        aria-hidden={!painelVisivel}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent pointer-events-none" />

        {painel && (
          <>
            <div className="flex items-center justify-between px-4 pt-6 pb-4">
              <span className="text-[11px] font-semibold text-foreground tracking-tight">
                {painel.rotulo}
              </span>
              <button
                onClick={fecharPainel}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                title="Fechar painel"
              >
                <ChevronLeft size={13} />
              </button>
            </div>

            <div className="h-px bg-border mx-3 mb-3" />

            <nav aria-label={painel.rotulo} className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
              {secoesPainel.map((secao, si) => (
                <div key={si} className={si > 0 ? "pt-4" : ""}>
                  {secao.titulo && (
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] px-2 pb-2">
                      {secao.titulo}
                    </p>
                  )}
                  {secao.linhas.map((linha) => {
                    const { item } = linha;
                    const Icon     = item.icone;
                    const badge    = item.badge ? badges[item.badge] : 0;
                    const isActive = linhaAtiva(linha);

                    return (
                      <button
                        key={item.id}
                        onClick={() => clicarItem(item)}
                        aria-current={isActive ? "page" : undefined}
                        tabIndex={painelVisivel ? 0 : -1}
                        className={cn(
                          "relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ease-out group",
                          isActive
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                      >
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
                          {item.rotulo}
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

            <div className="px-3 py-3 border-t border-border">
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent transition-colors cursor-default">
                <FotoPessoa perfil={currentProfile} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-foreground truncate leading-none">{currentProfile.name}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{roleLabel}</p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-border to-transparent pointer-events-none" />
      </aside>
    </>
  );
}
