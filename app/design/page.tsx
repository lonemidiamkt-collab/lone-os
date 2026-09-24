"use client";

// /design — a tela do Designer. Leva 5b: os "Kanbans Social Media" (quatro colunas com nomes
// próprios) e o "Quadro de Tarefas" (a fila de pedidos de arte, com outras três) viraram UM quadro,
// o mesmo do Social (components/conteudo/QuadroProducao.tsx), com as seis etapas de
// lib/conteudo/etapas.ts. O designer abre no "Meus" (a fila de arte dele); "Por designer" é o antigo
// Quadro de Tarefas, agora com os cards; o pedido de arte e a entrega moram no card.

import Header from "@/components/Header";
import SignedImage from "@/components/shared/SignedImage";
import CsAgentInbox from "@/components/cs/CsAgentInbox";
import ContentCardModal from "@/components/ContentCardModal";
import QuadroProducao from "@/components/conteudo/QuadroProducao";
import KanbanErrorBoundary from "@/components/KanbanErrorBoundary";
import MonthObservancesAlert from "@/components/MonthObservancesAlert";
import { MarkdownEditor } from "@/components/Markdown";
import { quadrosDisponiveis, contagemPorQuadro, SEM_DONO } from "@/lib/design/dono";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { trilha } from "@/lib/obs/trilha";
import { chamar } from "@/lib/api/chamar";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { spDateStr, todaySP } from "@/lib/utils";
import {
  Clock, CheckCircle, Loader, X, AlertTriangle, ImageIcon, ChevronDown, Plus, Calendar, RotateCcw, Palette,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { imagensDoPaste, imagensDoDrop } from "@/lib/upload/imagens-coladas";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import type { Client, ContentCard, DesignRequest } from "@/lib/types";
import { infoDoStatus, statusNaEtapa } from "@/lib/conteudo/etapas";
import { designerDeve } from "@/lib/conteudo/producao";
import { lerVista, montarItens, passaNoFiltro, compararItens, type Vista } from "@/lib/conteudo/quadro";
import { diasEntre, somarDias } from "@/lib/conteudo/no-ar";

// Abas: "producao" é o quadro; "kanbans" e "requests" são os nomes antigos (links, ⌘K, favoritos)
// e caem nele, na vista certa. "clientes" saiu na Leva 5a (a lista de clientes é uma só).
type TabView = "producao" | "performance" | "history";

function ddmm(ymd: string): string {
  return ymd.slice(0, 10).split("-").reverse().slice(0, 2).join("/");
}

// A arte ENTREGUE pelo designer. `imageUrl` sozinho não serve: é também onde cai a imagem de
// referência que o social anexa.
function arteEntregue(c: ContentCard): string | null {
  const entrega = c.cardAttachments?.find((a) => a.tipo === "entrega");
  if (entrega) return entrega.url;
  return c.designerDeliveredAt && c.imageUrl ? c.imageUrl : null;
}

export default function DesignPage() {
  const clients = useClientsStore((s) => s.clients);
  // Rodrigo (11/09/2026): "todas as demandas sumiram". O dono da arte é resolvido pela lista de
  // clientes; enquanto ela não chega, o quadro não pode afirmar que está vazio.
  const clientesCarregados = useClientsStore((s) => s.initialized);
  const clientesCarregando = useClientsStore((s) => s.loading);
  const initClients = useClientsStore((s) => s.init);
  const subClients = useClientsStore((s) => s.subscribeRealtime);

  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const addDesignRequest = useContentStore((s) => s.addDesignRequest);
  const initContent = useContentStore((s) => s.init);
  const subContent = useContentStore((s) => s.subscribeRealtime);
  const refreshContent = useContentStore((s) => s.refresh);

  const pushNotification = useNotificationsStore((s) => s.push);

  const { role, currentUser, hydrated } = useRole();

  useEffect(() => {
    initClients();
    initContent();
    const u1 = subClients();
    const u2 = subContent();
    return () => { u1(); u2(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling leve — realtime OFF no servidor (RAM). Sem isso, o designer fica congelado no snapshot do
  // load: uma alteração pedida DEPOIS pelo social nunca aparecia.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") refreshContent(); };
    const interval = setInterval(tick, 45000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, [refreshContent]);

  // ── QUADRO ATIVO (10/09/2026). Cada designer abre no PRÓPRIO quadro; o seletor existe pra quando
  // um precisa ajudar o outro — esconder o quadro do colega quebraria justamente esse pedido.
  const [quadro, setQuadroRaw] = useState<string | null>(null); // null = ainda não decidiu
  const setQuadro = (valor: string) => {
    setQuadroRaw(valor);
    void chamar("/api/preferences", { key: "design_workspace", value: valor });
  };
  const [tab, setTab] = useState<TabView>("producao");
  const [vista, setVista] = useState<Vista>("meus");
  const { pendingTab, setPendingTab, setCurrentTab, secondaryOpen } = useNav();

  // Aba pedida pelo painel lateral ou pela busca ⌘K (só consome o pedido que é desta tela).
  useEffect(() => {
    if (!pendingTab) return;
    if (pendingTab === "clientes") {
      setPendingTab("");
      window.location.assign("/clients?resp=mine");
      return;
    }
    if (pendingTab === "performance" || pendingTab === "history") {
      setTab(pendingTab);
      setPendingTab("");
      return;
    }
    // kanbans → Meus; requests (Quadro de Tarefas) → Por designer; producao → como estava.
    const v = pendingTab === "producao" ? null : lerVista(pendingTab);
    if (pendingTab === "producao" || v) {
      setTab("producao");
      if (v) setVista(v);
      setPendingTab("");
    }
  }, [pendingTab, setPendingTab]);

  useEffect(() => {
    setCurrentTab(tab);
  }, [tab, setCurrentTab]);

  const [detailCard, setDetailCard] = useState<ContentCard | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  // ?card=<id> (Meu Trabalho, avisos) abre o card; ?vista= escolhe a vista do quadro.
  const cardDoLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = lerVista(q.get("vista"));
    if (v) { setTab("producao"); setVista(v); }
    cardDoLinkRef.current = q.get("card");
  }, []);
  useEffect(() => {
    const id = cardDoLinkRef.current;
    if (!id || !contentCards.length) return;
    const card = contentCards.find((c) => c.id === id);
    cardDoLinkRef.current = null;
    if (card) setDetailCard(card);
    window.history.replaceState(null, "", window.location.pathname);
  }, [contentCards]);

  // ── Quadros que existem hoje, tirados do dado (ver lib/design/dono.ts).
  const quadros = useMemo(() => quadrosDisponiveis(designRequests, clients), [designRequests, clients]);
  const contagens = useMemo(() => contagemPorQuadro(designRequests, clients), [designRequests, clients]);

  // Preferência salva; na falta dela, o designer cai no próprio quadro e a gestão na visão geral.
  useEffect(() => {
    if (quadro !== null || !hydrated) return;
    let vivo = true;
    chamar<{ design_workspace?: unknown }>("/api/preferences?keys=design_workspace").then((r) => {
      if (!vivo) return;
      const salvo = typeof r.data?.design_workspace === "string" ? r.data.design_workspace : "";
      setQuadroRaw(salvo || (role === "designer" ? currentUser : "Todos"));
    });
    return () => { vivo = false; };
  }, [quadro, role, currentUser, hydrated]);

  const quadroAtivo = quadro ?? (role === "designer" ? currentUser : "Todos");
  // O valor ativo TEM que existir entre as opções: um <select> com value que não casa mostra a
  // primeira opção — a pessoa lê um nome e está vendo outro quadro.
  const opcoesQuadro = useMemo(
    () => (quadroAtivo !== "Todos" && !quadros.includes(quadroAtivo) ? [quadroAtivo, ...quadros] : quadros),
    [quadros, quadroAtivo],
  );
  const quadroDeOutro = role === "designer" && quadroAtivo !== currentUser;

  // Clientes da carteira do quadro ativo (para o alerta de datas e a Nova Tarefa).
  const myClientIds = useMemo(() => {
    if (quadroAtivo === "Todos") return null;
    return new Set(
      clients.filter((c) => {
        const dono = (c.assignedDesigner ?? "").trim();
        return quadroAtivo === SEM_DONO ? !dono : dono === quadroAtivo;
      }).map((c) => c.id),
    );
  }, [clients, quadroAtivo]);

  // Os cards do quadro ativo, já com a etapa de design resolvida (mesma conta do quadro).
  const itens = useMemo(() => {
    const todos = montarItens(contentCards, designRequests, clients.map((c) => ({ id: c.id, assignedDesigner: c.assignedDesigner })));
    return todos.filter((it) => passaNoFiltro(it, { pessoa: quadroAtivo, modo: "designer" }));
  }, [contentCards, designRequests, clients, quadroAtivo]);
  const myContentCards = useMemo(() => itens.map((it) => it.card), [itens]);
  const socialPeople = useMemo(() => [...new Set(myContentCards.map((c) => c.socialMedia).filter(Boolean))].sort(), [myContentCards]);
  const cardsBySocial = useMemo(() => {
    const map: Record<string, ContentCard[]> = {};
    for (const p of socialPeople) map[p] = myContentCards.filter((c) => c.socialMedia === p);
    return map;
  }, [myContentCards, socialPeople]);

  // ── Números do topo (a mesma leitura do quadro) ──
  const hoje = todaySP();
  const devendo = itens.filter((it) => it.etapa === "com_designer" && designerDeve(it.estado));
  const needsArt = devendo.length;
  const totalFazendo = itens.filter((it) => it.estado === "em_andamento").length;
  // Entregues nos últimos 30 dias, pela data da entrega no card (o updated_at do pedido muda por
  // outros motivos — renomear o card, ligar o pedido — e não é a hora da entrega).
  const desde30 = somarDias(hoje, -30);
  const totalDone = itens.filter((it) => it.card.designerDeliveredAt && spDateStr(it.card.designerDeliveredAt) >= desde30).length;
  // URGENTE PRO DESIGNER = arte que ELE ainda deve, com o prazo vencido ou hoje (10/09/2026: 61 dos 66
  // que o contador antigo mostrava já estavam entregues — número que não é dele vira número ignorado).
  const urgentCards = devendo.filter((it) => it.prazoArte && diasEntre(hoje, it.prazoArte) <= 0).length;
  const aguardandoTerceiro = itens.filter((it) =>
    it.estado === "entregue" && statusNaEtapa(it.card.status, "revisao", "com_cliente") && it.card.dueDate && diasEntre(hoje, it.card.dueDate) <= 0).length;
  const alteracoesPendentes = itens.filter((it) => it.estado === "alteracao").length;
  const proximos = [...devendo].filter((it) => it.prazoArte).sort(compararItens).slice(0, 6);

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Designer" subtitle="Fila de artes — o quadro de produção do lado de quem faz a arte" />

      <div className="p-6 space-y-6 animate-fade-in">
        <MonthObservancesAlert
          proximosDias={21}
          cidades={clients.filter((c) => !myClientIds || myClientIds.has(c.id)).map((c) => c.enderecoCidade ?? "").filter(Boolean)}
        />

        {/* Seletor de quadro. Cada designer abre no seu; trocar serve pra ajudar o outro. */}
        {opcoesQuadro.length > 1 && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Quadro de:</span>
            <div className="relative">
              <select
                value={quadroAtivo}
                onChange={(e) => setQuadro(e.target.value)}
                aria-label="Quadro de qual designer"
                className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer pr-8"
              >
                <option value="Todos">Visão geral (todos os designers)</option>
                {opcoesQuadro.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}{contagens[nome] ? ` — ${contagens[nome]} aberta${contagens[nome] > 1 ? "s" : ""}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            {quadroDeOutro && (
              <span className="text-[11px] text-lone-warning bg-lone-warning-bg border border-lone-warning-border px-2.5 py-1 rounded">
                Você está no quadro de {quadroAtivo} — o que mexer aqui é dele
              </span>
            )}
            {quadroAtivo === SEM_DONO && (
              <span className="text-[11px] text-muted-foreground border border-border px-2.5 py-1 rounded">
                Clientes sem designer no cadastro
              </span>
            )}
          </div>
        )}

        {/* Abas: com o painel lateral aberto (computador) elas moram lá; no celular, aparecem aqui. */}
        <div className={`flex items-center gap-3 flex-wrap ${secondaryOpen ? "lg:hidden" : ""}`}>
          <div role="tablist" aria-label="Abas do Designer" className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {([["producao", "Produção"], ["performance", "Performance"], ["history", "Histórico"]] as const).map(([id, rotulo]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${tab === id ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* Números */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Numero icone={<ImageIcon size={18} />} valor={needsArt} rotulo="Com você (arte a fazer)" destaque={needsArt > 0} />
          <Numero icone={<Palette size={18} />} valor={totalFazendo} rotulo="Fazendo agora" />
          <Numero icone={<CheckCircle size={18} />} valor={totalDone} rotulo="Entregues (30 dias)" />
          <Numero icone={<AlertTriangle size={18} />} valor={urgentCards} rotulo="Prazo vencido ou hoje" alerta={urgentCards > 0}
            extra={aguardandoTerceiro > 0 ? `+${aguardandoTerceiro} entregue${aguardandoTerceiro > 1 ? "s" : ""}, esperando aprovação` : undefined} />
          <Numero icone={<RotateCcw size={18} />} valor={alteracoesPendentes} rotulo="Alterações" alerta={alteracoesPendentes > 0} />
        </div>

        {/* ═══ PRODUÇÃO ═══ */}
        {tab === "producao" && !clientesCarregados && quadroAtivo !== "Todos" && (
          <div className="card text-center py-14 animate-fade-in">
            {clientesCarregando ? (
              <>
                <Loader size={18} className="mx-auto text-primary animate-spin mb-3" />
                <p className="text-sm text-muted-foreground">Carregando sua carteira para montar o quadro…</p>
              </>
            ) : (
              <>
                <p className="text-sm text-lone-danger">Não consegui carregar a lista de clientes — sem ela não dá pra saber quais artes são suas.</p>
                <button onClick={() => useClientsStore.getState().init()} className="btn-ghost text-xs mt-3">Tentar de novo</button>
              </>
            )}
          </div>
        )}
        {tab === "producao" && (clientesCarregados || quadroAtivo === "Todos") && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">O pedido de arte é uma etapa do card: pegue, entregue e responda alterações no próprio card.</p>
              <button
                onClick={() => setNewTaskOpen(true)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
              >
                <Plus size={12} /> Nova tarefa
              </button>
            </div>

            <CsAgentInbox cards={myContentCards} onOpen={setDetailCard} titulo="CS Agente — pra produzir" />

            {/* Próximos prazos de arte — o que o designer ainda deve, do prazo mais perto. */}
            {proximos.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-lone-eyebrow uppercase text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Clock size={11} aria-hidden="true" /> Próximos prazos de arte
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {proximos.map((it) => {
                    const d = diasEntre(hoje, it.prazoArte!);
                    return (
                      <button key={it.card.id} onClick={() => setDetailCard(it.card)}
                        className={`text-left flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors hover:border-primary/30 ${
                          d < 0 ? "bg-destructive/5 border-destructive/20" : d === 0 ? "bg-primary/5 border-primary/15" : "bg-muted/50 border-border"
                        }`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${d < 0 ? "bg-destructive" : d === 0 ? "bg-lone-warning" : "bg-muted-foreground"}`} aria-hidden="true" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs text-foreground font-medium truncate">{it.card.title}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">{it.card.clientName}{it.card.socialMedia ? ` · ${it.card.socialMedia}` : ""}</span>
                        </span>
                        <span className={`text-[11px] font-medium shrink-0 ${d < 0 ? "text-destructive" : d === 0 ? "text-primary" : "text-muted-foreground"}`}>
                          {d < 0 ? `venceu ${ddmm(it.prazoArte!)}` : d === 0 ? "hoje" : ddmm(it.prazoArte!)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <KanbanErrorBoundary context="Quadro de produção (Designer)">
              <QuadroProducao
                pessoa={quadroAtivo}
                modo="designer"
                vista={vista}
                onVista={setVista}
                onAbrirCard={setDetailCard}
                clientes={clients}
              />
            </KanbanErrorBoundary>
          </div>
        )}
      </div>

      {/* ═══ PERFORMANCE TAB ═══ */}
      {tab === "performance" && (
        <div className="px-6 pb-6 space-y-6 animate-fade-in">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Entregues</p>
              <p className="text-2xl font-semibold text-foreground">{myContentCards.filter((c) => c.designerDeliveredAt).length}</p>
              <p className="text-xs text-muted-foreground">artes finalizadas</p>
            </div>
            <div className="card">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">No Prazo</p>
              <p className="text-2xl font-semibold text-primary">
                {myContentCards.filter((c) => c.designerDeliveredAt && c.dueDate && spDateStr(c.designerDeliveredAt) <= c.dueDate).length}
              </p>
              <p className="text-xs text-muted-foreground">entregas antes do deadline</p>
            </div>
            <div className="card">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Atrasadas</p>
              <p className="text-2xl font-semibold text-destructive">
                {myContentCards.filter((c) => c.designerDeliveredAt && c.dueDate && spDateStr(c.designerDeliveredAt) > c.dueDate).length}
              </p>
              <p className="text-xs text-muted-foreground">entregas após deadline</p>
            </div>
            <div className="card">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pendentes</p>
              <p className="text-2xl font-semibold text-lone-warning">{needsArt}</p>
              <p className="text-xs text-muted-foreground">arte a fazer</p>
            </div>
          </div>

          {/* Delivery rate by social media person */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-4">Entregas por Social Media</h3>
            <div className="space-y-3">
              {socialPeople.map((person) => {
                const personCards = cardsBySocial[person] ?? [];
                const delivered = personCards.filter((c) => c.designerDeliveredAt).length;
                const total = personCards.filter((c) => !statusNaEtapa(c.status, "pauta")).length;
                const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
                return (
                  <div key={person}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-foreground">{person}</span>
                      <span className="text-xs text-muted-foreground">{delivered}/{total} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent deliveries */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-4">Entregas Recentes</h3>
            {myContentCards.filter((c) => c.designerDeliveredAt).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma entrega registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {myContentCards
                  .filter((c) => c.designerDeliveredAt)
                  .sort((a, b) => (b.designerDeliveredAt ?? "").localeCompare(a.designerDeliveredAt ?? ""))
                  .slice(0, 10)
                  .map((c) => {
                    const onTime = c.dueDate && c.designerDeliveredAt && spDateStr(c.designerDeliveredAt) <= c.dueDate;
                    return (
                      <div key={c.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${onTime ? "bg-primary" : "bg-destructive"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground truncate">{c.title}</p>
                          <p className="text-[10px] text-muted-foreground">{c.clientName} · {c.socialMedia}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${onTime ? "bg-primary/10 text-primary border border-primary/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                          {onTime ? "No prazo" : "Atrasado"}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === "history" && (
        <div className="px-6 pb-6 space-y-4 animate-fade-in">
          <p className="text-xs text-muted-foreground">Cards entregues e aprovados — histórico completo de produção.</p>
          <div className="space-y-2">
            {myContentCards
              .filter((c) => c.designerDeliveredAt || statusNaEtapa(c.status, "agendado", "no_ar"))
              .sort((a, b) => (b.designerDeliveredAt ?? b.statusChangedAt ?? "").localeCompare(a.designerDeliveredAt ?? a.statusChangedAt ?? ""))
              .map((card) => {
                const client = clients.find((cl) => cl.id === card.clientId);
                const onTime = card.dueDate && card.designerDeliveredAt && spDateStr(card.designerDeliveredAt) <= card.dueDate;
                return (
                  <div key={card.id} onClick={() => setDetailCard(card)}
                    className="card card-interactive p-4 flex items-center gap-4 cursor-pointer hover:border-primary/20">
                    {arteEntregue(card) ? (
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
                        <SignedImage src={arteEntregue(card)!} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon size={16} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{card.clientName}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">{card.format}</span>
                        {card.designerDeliveredAt && (
                          <>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">Entregue {spDateStr(card.designerDeliveredAt).split("-").reverse().join("/")}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                        statusNaEtapa(card.status, "no_ar") ? "text-primary bg-primary/10 border-primary/20" : "text-muted-foreground bg-muted border-border"
                      }`}>
                        {statusNaEtapa(card.status, "agendado", "no_ar") ? infoDoStatus(card.status).rotulo : "Entregue"}
                      </span>
                      {card.designerDeliveredAt && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                          onTime ? "text-lone-success bg-lone-success-bg" : "text-destructive bg-destructive/10"
                        }`}>
                          {onTime ? "No prazo" : "Atrasado"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            {myContentCards.filter((c) => c.designerDeliveredAt || statusNaEtapa(c.status, "agendado", "no_ar")).length === 0 && (
              <div className="text-center py-12">
                <Clock size={24} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">Nenhuma entrega no histórico ainda.</p>
              </div>
            )}
          </div>
        </div>
      )}


      {/* O card aberto: briefing, arte (pedido, entrega, alterações) e comentários — o mesmo do Social. */}
      {detailCard && <ContentCardModal card={detailCard} onClose={() => setDetailCard(null)} />}

      {/* ═══ NOVA TAREFA ═══ */}
      {newTaskOpen && (
        <NewTaskModal
          clients={clients.filter((c) => !myClientIds || myClientIds.has(c.id))}
          preselectedClient={null}
          requestedBy={currentUser}
          addDesignRequest={addDesignRequest}
          pushNotification={pushNotification}
          onClose={() => setNewTaskOpen(false)}
        />
      )}
    </div>
  );
}

function Numero({ icone, valor, rotulo, destaque, alerta, extra }: {
  icone: React.ReactNode; valor: number; rotulo: string; destaque?: boolean; alerta?: boolean; extra?: string;
}) {
  const cor = alerta ? "text-destructive" : destaque ? "text-primary" : "text-foreground";
  const fundo = alerta ? "bg-destructive/15 text-destructive" : destaque ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground";
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${fundo}`} aria-hidden="true">{icone}</div>
      <div className="min-w-0">
        <p className={`text-2xl font-semibold tabular-nums ${cor}`}>{valor}</p>
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        {extra && <p className="text-[10px] text-muted-foreground mt-0.5">{extra}</p>}
      </div>
    </div>
  );
}

// ── Modal Nova Tarefa (designer cria pra si mesmo) ──────────────────

function NewTaskModal({
  clients,
  preselectedClient,
  requestedBy,
  addDesignRequest,
  pushNotification,
  onClose,
}: {
  clients: Client[];
  preselectedClient: Client | null;
  requestedBy: string;
  addDesignRequest: (req: Omit<DesignRequest, "id">) => DesignRequest | Promise<DesignRequest>;
  pushNotification: (type: "sla" | "status" | "content" | "checkin" | "system", title: string, body: string, clientId?: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState(preselectedClient?.id ?? "");
  const [title, setTitle] = useState("");
  const [briefing, setBriefing] = useState("");
  const [format, setFormat] = useState("Post");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [deadline, setDeadline] = useState("");
  // REFERÊNCIA JÁ NA CRIAÇÃO (pedido do Roberto). Antes: criava a demanda, reabria e só então
  // anexava — e nesse meio-tempo o designer já podia ter puxado a tarefa sem a referência.
  // A referência da DEMANDA mora em design_requests.attachments (é o que o designer vê), por isso
  // sobe com o id da demanda, não o do card.
  const [refs, setRefs] = useState<File[]>([]);
  const [erroRef, setErroRef] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  // COLAR VALE EM TODO O MODAL, não só no campo. A pessoa copia a arte e dá Ctrl+V sem pensar
  // onde o cursor está — exigir foco num input seria uma regra invisível.
  // Só intercepta quando o que veio É imagem: senão quebraria colar texto no briefing.
  const aoColar = (e: React.ClipboardEvent) => {
    const imgs = imagensDoPaste(e);
    if (!imgs.length) return;
    e.preventDefault();
    setRefs((r) => [...r, ...imgs]); setErroRef(null);
  };
  // Ler `erroRef` logo após o await devolveria o valor ANTIGO — state não muda no meio da função.
  const erroRefRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);

  const client = clients.find((c) => c.id === clientId);
  // DATA OBRIGATÓRIA (Roberto, 03/08). Sem ela a demanda não entra em nenhum controle: o
  // Fechamento do dia se guia pela data escolhida, e card sem data é trabalho que ninguém cobra
  // e ninguém vê faltar. Era o único formulário que ainda deixava passar.
  const canSubmit = !!clientId && title.trim().length > 0 && !!deadline;

  // RETRY SEM DUPLICAR: se a demanda já foi criada e só a referência falhou, o segundo clique
  // retoma daqui — antes ele criava outra demanda igual.
  const criadaRef = useRef<DesignRequest | null>(null);
  const enviadasRef = useRef(new Map<File, string>());

  const handleSubmit = async () => {
    if (!canSubmit || !client || saving) return;
    setSaving(true); setErroRef(null); erroRefRef.current = null;
    trilha("nova-demanda:submit", { clientId: client.id, refs: refs.length, retomada: !!criadaRef.current });
    let criada = criadaRef.current;
    if (!criada) {
      try {
        criada = await addDesignRequest({
          title: title.trim(),
          clientId: client.id,
          clientName: client.nomeFantasia || client.name,
          requestedBy,
          priority,
          status: "queued",
          format,
          briefing: briefing.trim(),
          deadline: deadline || undefined,
        });
        criadaRef.current = criada;
      } catch (err) {
        const m = err instanceof Error ? err.message : "erro";
        trilha("nova-demanda:erro", { msg: m });
        setErroRef(`Não consegui criar a demanda (${m}). Nada foi salvo — tenta de novo.`);
        setSaving(false);
        return;
      }
    }

    // Sobe as referências DEPOIS de criar (o upload precisa do id). Leva 5b: a tarefa nasce com card,
    // e a referência vai pro CARD (card_attachments, tipo referência) — é onde o "Entregar arte"
    // mostra a referência. Sem card (servidor antigo), cai no pedido como antes. Se falhar, a tarefa
    // continua criada — perdê-la por causa de um anexo seria pior — e o aviso aparece.
    if (criada?.id && refs.length) {
      const alvo = criada.contentCardId ?? criada.id;
      for (const f of refs) {
        if (enviadasRef.current.has(f)) continue;
        const fd = new FormData();
        // Referência do pedido, não entrega — mesma regra do board social.
        fd.append("file", f); fd.append("cardId", alvo); fd.append("tipo", "referencia");
        const r = await chamar<{ url?: string; attachments?: { url: string }[] }>("/api/upload-art", fd);
        const url = r.data?.url ?? r.data?.attachments?.[r.data.attachments.length - 1]?.url;
        if (r.ok && url) enviadasRef.current.set(f, url);
        else {
          const m = `Tarefa criada, mas a referência "${f.name}" não subiu (${r.erro ?? "sem url"}). Clique de novo para tentar só ela.`;
          erroRefRef.current = m; setErroRef(m);
        }
      }
      const urls = refs.map((f) => enviadasRef.current.get(f)).filter((u): u is string => !!u);
      if (urls.length && !erroRefRef.current && !criada.contentCardId) {
        const r = await chamar("/api/design-requests/update", { id: criada.id, attachments: [...(criada.attachments ?? []), ...urls] });
        if (!r.ok) {
          const m = `A demanda foi criada, mas as referências não vincularam (${r.erro}). Clique de novo para tentar.`;
          erroRefRef.current = m; setErroRef(m);
        }
      }
      // Falhou algo: segura o modal aberto pra pessoa ver o aviso.
      if (erroRefRef.current) { setSaving(false); return; }
    }

    // Toast de confirmacao visivel na aba de notificacoes (sino)
    pushNotification(
      "content",
      "Tarefa auto-iniciada criada",
      `"${title.trim()}" — ${client.nomeFantasia || client.name}. O card já está em "Com o designer" no quadro de produção.`,
      client.id,
    );
    setTimeout(() => {
      setSaving(false);
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div
        onPaste={aoColar}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); const i = imagensDoDrop(e); if (i.length) { setRefs((r) => [...r, ...i]); setErroRef(null); } }}
        className="w-full max-w-lg bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Plus size={14} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Nova Tarefa</h2>
              <p className="text-[10px] text-muted-foreground">Tarefa auto-iniciada pelo designer</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Cliente */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Cliente *</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            >
              <option value="">Selecione um cliente...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.nomeFantasia || c.name}</option>
              ))}
            </select>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Rebranding de capa Instagram"
              className={`w-full bg-muted border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 ${
                deadline ? "border-border" : "border-destructive/40"
              }`}
            />
            {!deadline && (
              <p className="text-[10px] text-destructive mt-1">
                Sem data a demanda não entra no Fechamento do dia — ninguém vê que ela está faltando.
              </p>
            )}
          </div>

          {/* Formato + Prioridade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Formato</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option>Post</option>
                <option>Story</option>
                <option>Reels</option>
                <option>Carrossel</option>
                <option>Banner</option>
                <option>Outro</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>
          </div>

          {/* Prazo */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Calendar size={10} /> Data de entrega <span className="text-destructive">*</span>
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={`w-full bg-muted border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 ${
                deadline ? "border-border" : "border-destructive/40"
              }`}
            />
            {!deadline && (
              <p className="text-[10px] text-destructive mt-1">
                Sem data a demanda não entra no Fechamento do dia — ninguém vê que ela está faltando.
              </p>
            )}
          </div>

          {/* Briefing — Markdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Descrição / Briefing</label>
            <MarkdownEditor
              value={briefing}
              onChange={setBriefing}
              placeholder="O que precisa ser feito (markdown — **negrito**, listas, links, referências)..."
              minHeight={120}
              className="bg-muted"
            />
          </div>

          {/* Referência JÁ aqui — antes só dava pra anexar reabrindo a demanda depois de criada. */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Artes de referência <span className="font-normal">(opcional)</span>
            </label>
            <input
              type="file" accept="image/*" multiple
              onChange={(e) => { setRefs(Array.from(e.target.files ?? [])); setErroRef(null); }}
              className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
            />
            {refs.length > 0 && (
              <p className="text-[10px] text-primary mt-1">
                {refs.length} {refs.length === 1 ? "imagem" : "imagens"} — sobem junto com a demanda.
              </p>
            )}
            {erroRef && <p className="text-[10px] text-destructive mt-1">{erroRef}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">
              Pode <strong>colar (Ctrl+V)</strong> ou arrastar a imagem aqui.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary hover:bg-primary text-primary-foreground text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
            {saving ? "Criando..." : criadaRef.current ? "Tentar anexar de novo" : "Criar Tarefa"}
          </button>
        </div>
      </div>
    </div>
  );
}
