"use client";

import { toast } from "sonner";
import Header from "@/components/Header";
import DefesaAlertBanner from "@/components/DefesaAlertBanner";
import SystemAlertBanner from "@/components/SystemAlertBanner";
import MetricCard from "@/components/MetricCard";
import KanbanBoard from "@/components/KanbanBoard";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useTrafficStore } from "@/stores/useTrafficStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import {
  TrendingUp, AlertTriangle, CheckCircle, Users,
  Calendar, Save,
  Plus, X, Filter, Search,
  ClipboardCheck, BarChart2,
  MessageCircle, FileText, Star, ArrowUpRight, ArrowDownRight, Minus,
  Check, Megaphone, Eye, MousePointerClick, DollarSign, Target,
  Pause, AlertCircle, Download, ChevronDown, ChevronUp,
  Settings2, Zap, Activity, TrendingDown,
  Brain, ShieldAlert, Sparkles, CircleDot, Bell, FolderDown, Loader2, Facebook, Send,
  Wallet, CreditCard, Banknote, AlertOctagon, Info, Palette,
} from "lucide-react";
import { getAttentionColor, getAttentionLabel, todaySP } from "@/lib/utils";
import { emOperacao } from "@/lib/clients/operacao";
import type { Client, AdCampaign } from "@/lib/types";
import { fetchClientGroupMessageLog, type ClientGroupMessageLogRow } from "@/lib/supabase/queries";
import AtalhoCriativos from "@/components/traffic/AtalhoCriativos";
// Leva 4: "Rotina Diária" virou "Hoje" (o cockpit do gestor) e a Defesa Ativa virou aba daqui.
import HojeTrafego from "@/components/trafego/hoje/HojeTrafego";
import DefesaAtiva from "@/components/trafego/defesa/DefesaAtiva";
// Leva 4: Anúncios Meta lê o que o servidor já buscou da Meta; a conexão mora em Sistema › Conexão Meta.
import AnunciosMeta from "@/components/trafego/AnunciosMeta";
import RetornoConexaoMeta from "@/components/trafego/RetornoConexaoMeta";
import { Sun } from "lucide-react";
import { segundaDaSemana } from "@/components/traffic/investimento";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const STATUS_COLUMNS = [
  { id: "onboarding", title: "Onboarding", color: "bg-muted" },
  { id: "good", title: "Bons Resultados", color: "bg-primary" },
  { id: "average", title: "Resultados Médios", color: "bg-muted" },
  // Resultado do ANÚNCIO (CPL x meta), não risco de churn — "Em risco" é só a saúde do cliente
  // (lib/saude/carteira.ts). Leva 6A: o rótulo antigo fazia esta coluna competir com a Saúde da carteira.
  { id: "at_risk", title: "Resultados Ruins", color: "bg-destructive" },
];

type TabType = "hoje" | "defesa" | "status" | "anuncios";

export default function TrafficPage() {
  const router = useRouter();
  // ── Zustand stores ────────────────────────────────────────────────────────
  const clients = useClientsStore((s) => s.clients);
  const updateClientStatus = useClientsStore((s) => s.updateClientStatus);
  const initClients = useClientsStore((s) => s.init);
  const subClients = useClientsStore((s) => s.subscribeRealtime);

  const addDesignRequest = useContentStore((s) => s.addDesignRequest);
  const initContent = useContentStore((s) => s.init);
  const subContent = useContentStore((s) => s.subscribeRealtime);

  const tasks = useOperationalStore((s) => s.tasks);
  const initOps = useOperationalStore((s) => s.init);
  const subOps = useOperationalStore((s) => s.subscribeRealtime);

  const trafficRoutineChecks = useTrafficStore((s) => s.trafficRoutineChecks);
  const addTrafficRoutineCheck = useTrafficStore((s) => s.addTrafficRoutineCheck);
  const initTraffic = useTrafficStore((s) => s.init);
  const trafficLoadError = useTrafficStore((s) => s.loadError);

  const pushNotification = useNotificationsStore((s) => s.push);

  const criarDemanda = async (req: Omit<import("@/lib/types").DesignRequest, "id">): Promise<boolean> => {
    try {
      await addDesignRequest(req);
      return true;
    } catch (err) {
      toast.error(`Não consegui criar a demanda${err instanceof Error && err.message ? ` (${err.message})` : ""}. O pedido continua aberto — tente de novo.`);
      return false;
    }
  };

  useEffect(() => {
    initClients();
    initContent();
    initOps();
    initTraffic();
    const u1 = subClients();
    const u2 = subContent();
    const u3 = subOps();
    return () => { u1(); u2(); u3(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Status REAL da automação de mensagens (suporte/relatório) nos grupos.
  // Lido do client_group_message_log p/ não precisar marcar à mão o que já foi enviado.
  const [messageLog, setMessageLog] = useState<ClientGroupMessageLogRow[]>([]);
  useEffect(() => {
    // segunda desta semana em SP (domingo NÃO pula p/ a próxima)
    fetchClientGroupMessageLog(segundaDaSemana(todaySP())).then(setMessageLog);
  }, []);

  // Creative request modal state
  const [creativeModal, setCreativeModal] = useState<{
    campaign: import("@/lib/types").AdCampaign;
    client: import("@/lib/types").Client;
  } | null>(null);
  const [showDesignModal, setShowDesignModal] = useState(false);
  // Pedido de arte aberto de uma linha do Hoje: já vem com o cliente (e o briefing, se for criativo).
  const [designModalPreset, setDesignModalPreset] = useState<{ clientId: string; briefing?: string } | null>(null);
  const { currentUser, role } = useRole();
  const isAdmin = role === "admin" || role === "manager";
  const { pendingTab, setPendingTab, setCurrentTab, secondaryOpen } = useNav();
  const [activeTab, setActiveTab] = useState<TabType>("hoje");

  // Aba pedida pelo painel lateral ou pela busca ⌘K. Só consome (e apaga) o pedido que é DESTA tela:
  // apagar o de outra página fazia a busca abrir a tela certa na aba errada.
  useEffect(() => {
    if (!pendingTab) return;
    const VALID: TabType[] = ["hoje","defesa","status","anuncios"];
    // A aba Investimento saiu (Leva 4): verba e ritmo do mês moram em Tráfego › Contas & Verba.
    if (pendingTab === "investimento") { setPendingTab(""); router.push("/traffic/budgets"); return; }
    // "rotina" é o nome antigo do Hoje (Leva 4): link, favorito ou ⌘K antigo cai no Hoje.
    const pedido = pendingTab === "rotina" ? "hoje" : pendingTab;
    if (VALID.includes(pedido as TabType)) {
      setActiveTab(pedido as TabType);
      setPendingTab("");
    }
  }, [pendingTab, setPendingTab]);

  // Aba pelo endereço: /traffic?aba=defesa (o /defesa antigo redireciona pra cá) ou #rotina.
  useEffect(() => {
    const aba = new URLSearchParams(window.location.search).get("aba")
      ?? (/^#[a-z]+$/.test(window.location.hash) ? window.location.hash.slice(1) : null);
    if (aba) setPendingTab(aba);
  }, [setPendingTab]);

  // Keep NavContext in sync so sidebar can highlight active item
  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab, setCurrentTab]);

  // Workspace filter
  const trafficManagers = [...new Set(clients.map((c) => c.assignedTraffic))];
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const effectiveFilter = role === "traffic" && workspaceFilter === "all" ? currentUser : workspaceFilter;
  const filteredClients = effectiveFilter === "all" ? clients : clients.filter((c) => c.assignedTraffic === effectiveFilter);

  // Metrics
  const atRiskCount = filteredClients.filter((c) => c.status === "at_risk").length;
  const goodCount = filteredClients.filter((c) => c.status === "good").length;

  // Kanban data
  const statusKanbanCols = STATUS_COLUMNS.map((col) => ({
    ...col,
    items: filteredClients.filter((c) => c.status === col.id),
  }));

  const trafficTasks = effectiveFilter === "all"
    ? tasks.filter((t) => t.role === "traffic")
    : tasks.filter((t) => t.role === "traffic" && t.assignedTo === effectiveFilter);

  // Mesmos nomes do painel lateral (lib/navegacao/menu.ts).
  const tabs: { key: TabType; label: string; icon?: React.ReactNode }[] = [
    { key: "hoje", label: "Hoje", icon: <Sun size={14} /> },
    { key: "defesa", label: "Defesa Ativa", icon: <ShieldAlert size={14} /> },
    { key: "status", label: "Status dos Clientes", icon: <Users size={14} /> },
    { key: "anuncios", label: "Anúncios Meta", icon: <Megaphone size={14} /> },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Tráfego Pago" subtitle="Gestão de performance e campanhas" />
      {/* O login da Meta volta pra cá (#access_token): repassa para Sistema › Conexão Meta. */}
      <RetornoConexaoMeta />

      <div className="p-6 space-y-6 animate-fade-in">
        {activeTab !== "defesa" && <DefesaAlertBanner onAbrir={() => setActiveTab("defesa")} />}
        {isAdmin && <SystemAlertBanner />}
        {trafficLoadError && (
          <div className="flex items-center gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-xs text-lone-danger">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="flex-1">Não consegui carregar a rotina e as contas de tráfego ({trafficLoadError}). O que aparece abaixo pode estar incompleto.</span>
            <button onClick={() => initTraffic()} className="font-medium underline hover:no-underline">Tentar de novo</button>
          </div>
        )}
        {/* Workspace Filter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Workspace:</span>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setWorkspaceFilter("all")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                (effectiveFilter === "all" || (role !== "traffic" && workspaceFilter === "all"))
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            {trafficManagers.map((name) => (
              <button
                key={name}
                onClick={() => setWorkspaceFilter(name)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  effectiveFilter === name
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredClients.length} cliente(s)
          </span>
          <button
            onClick={() => setShowDesignModal(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <Palette size={13} /> Solicitar Arte ao Designer
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard icon={Users} label="Clientes" value={filteredClients.length} sub="na carteira" iconColor="text-primary" iconBg="bg-primary/15" onClick={() => setActiveTab("status")} />
          <MetricCard icon={CheckCircle} label="Bons Resultados" value={goodCount} sub="clientes" iconColor="text-primary" iconBg="bg-primary/15" />
          <MetricCard icon={AlertTriangle} label="Resultado ruim" value={atRiskCount} sub="clientes · anúncio" iconColor="text-destructive" iconBg="bg-destructive/10" />
          <MetricCard icon={ClipboardCheck} label="Tarefas do tráfego" value={trafficTasks.filter(t => t.status !== "done").length} sub="abertas · ver em Meu Trabalho" iconColor="text-primary" iconBg="bg-primary/15" onClick={() => router.push("/my-work?view=tarefas&area=trafego")} />
        </div>

        {/* Inteligência Criativa — resumo do dia + atalho (a ação fica em /traffic/criativos) */}
        <AtalhoCriativos />

        {/* Abas: uma navegação por tela. Com o painel lateral aberto (computador), as abas moram lá;
            no celular, ou com o painel fechado, aparecem aqui. */}
        <div>
          <div className={`flex gap-1 mb-5 border-b border-border overflow-x-auto ${secondaryOpen ? "lg:hidden" : ""}`}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Hoje — o cockpit do gestor (era a Rotina Diária; o checklist da semana mora no fim dele) */}
          {activeTab === "hoje" && (
            <HojeTrafego
              clientes={filteredClients}
              routineChecks={trafficRoutineChecks}
              onCheck={addTrafficRoutineCheck}
              currentUser={currentUser}
              messageLog={messageLog}
              onPedirCriativo={(clientId, briefing) => { setDesignModalPreset({ clientId, briefing }); setShowDesignModal(true); }}
            />
          )}

          {/* Defesa Ativa — anomalias de Meta Ads (era a tela /defesa, que redireciona pra cá) */}
          {activeTab === "defesa" && <DefesaAtiva />}

          {/* Status Kanban */}
          {activeTab === "status" && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <p className="text-muted-foreground text-sm">Arraste os clientes entre colunas para atualizar o status de performance.</p>
                <div className="flex items-center gap-2 ml-auto">
                  {statusKanbanCols.map((col) => (
                    <span key={col.id} className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                      {col.title}: <span className="text-foreground font-medium">{col.items.length}</span>
                    </span>
                  ))}
                </div>
              </div>
              <KanbanBoard<Client>
                columns={statusKanbanCols}
                onMove={(clientId, _from, toStatus) => {
                  updateClientStatus(clientId, toStatus as Client["status"], currentUser);
                }}
                renderCard={(client) => (
                  <div
                    onClick={() => router.push(`/clients/${client.id}`)}
                    className={`bg-card border rounded-lg p-3 transition-colors cursor-pointer ${
                    client.status === "at_risk"
                      ? "border-destructive/30 hover:border-destructive/50"
                      : "border-border hover:border-primary/30"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold ${
                        client.status === "at_risk" ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"
                      }`}>
                        {client.name[0]}
                      </div>
                      <span className="font-medium text-foreground text-sm">{client.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{client.assignedTraffic}</p>
                    {/* O PORQUÊ do status. Sem isso o kanban era só uma coluna — ninguém sabia se
                        "em risco" era CPL, conta parada ou alguém que arrastou. */}
                    {client.statusMotivo && (
                      <p className={`text-[11px] mb-2 leading-snug ${client.status === "at_risk" ? "text-lone-danger" : client.status === "average" ? "text-lone-warning" : "text-muted-foreground"}`}>
                        {client.statusMotivo}
                        {client.statusOrigem === "manual" && <span className="opacity-70"> · manual</span>}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className={`badge border text-xs ${getAttentionColor(client.attentionLevel)}`}>
                        {getAttentionLabel(client.attentionLevel)}
                      </span>
                    </div>
                  </div>
                )}
              />
            </div>
          )}

          {/* Anúncios Meta — lidos pelo servidor (components/trafego/AnunciosMeta.tsx) */}
          {activeTab === "anuncios" && (
            <AnunciosMeta
              clients={filteredClients}
              currentUser={currentUser}
              onRequestCreative={(camp, cl) => setCreativeModal({ campaign: camp, client: cl })}
            />
          )}
        </div>
      </div>

      {/* Pedido de arte direto (sem campanha) */}
      {showDesignModal && (
        <TrafficDesignRequestModal
          // Vindo do Hoje, o cliente pode estar fora do filtro de workspace: a lista inteira garante que ele esteja lá.
          clients={designModalPreset && !filteredClients.some((c) => c.id === designModalPreset.clientId) ? clients : filteredClients}
          initialClientId={designModalPreset?.clientId}
          initialBriefing={designModalPreset?.briefing}
          currentUser={currentUser}
          onClose={() => { setShowDesignModal(false); setDesignModalPreset(null); }}
          onSubmit={async (req) => {
            // Som, aviso e fechar só depois que o servidor confirmou — antes o modal fechava e a falha sumia.
            if (!(await criarDemanda(req))) return false;
            pushNotification("content", "Arte solicitada ao Designer", `Pedido de arte para "${req.clientName}" enviado para a fila do Designer.`, req.clientId);
            import("@/lib/audio").then((m) => m.playNotificationSound()).catch(() => {});
            toast.success("Pedido enviado para a fila do Designer.");
            setShowDesignModal(false);
            setDesignModalPreset(null);
            return true;
          }}
        />
      )}

      {/* Creative Request Modal */}
      {creativeModal && (
        <CreativeRequestModal
          campaign={creativeModal.campaign}
          client={creativeModal.client}
          currentUser={currentUser}
          onClose={() => setCreativeModal(null)}
          onSubmit={async (req) => {
            if (!(await criarDemanda(req))) return false;
            pushNotification("content", "Criativo solicitado ao Design", `Pedido de criativo para campanha "${creativeModal.campaign.name}" enviado para a fila do Designer com prioridade ${req.priority === "critical" ? "crítica" : "alta"}.`, creativeModal.client.id);
            import("@/lib/audio").then((m) => m.playNotificationSound()).catch(() => {});
            toast.success("Pedido de criativo enviado para a fila do Designer.");
            setCreativeModal(null);
            return true;
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TRAFFIC DESIGN REQUEST MODAL (pedido direto sem campanha)
// ══════════════════════════════════════════════════════════════

const AD_FORMATS = [
  "Vídeo Selfie (9:16)", "Vídeo Demonstração (9:16)", "Reel Bastidores (9:16)",
  "Post Feed (1:1)", "Post Feed (4:5)", "Carrossel (1:1)", "Story (9:16)",
  "Banner Display", "Antes/Depois", "Outro",
];

function TrafficDesignRequestModal({
  clients, currentUser, onClose, onSubmit, initialClientId, initialBriefing,
}: {
  clients: import("@/lib/types").Client[];
  currentUser: string;
  onClose: () => void;
  onSubmit: (req: Omit<import("@/lib/types").DesignRequest, "id">) => Promise<boolean>;
  /** "Pedir criativo" no Hoje: o modal já abre no cliente da linha. */
  initialClientId?: string;
  initialBriefing?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const [clientId, setClientId] = useState(initialClientId ?? clients[0]?.id ?? "");
  const [format, setFormat] = useState("Post Feed (1:1)");
  const [briefing, setBriefing] = useState(initialBriefing ?? "");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [deadline, setDeadline] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);

  const handleSubmit = async () => {
    if (!selectedClient || !briefing.trim() || enviando) return;
    setEnviando(true);
    await onSubmit({
      title: `Arte Tráfego — ${selectedClient.name}`,
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      requestedBy: currentUser,
      priority,
      status: "queued",
      format,
      briefing: briefing.trim(),
      deadline: deadline || undefined,
    });
    setEnviando(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Palette size={16} className="text-primary" /> Solicitar Arte ao Designer
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pedido direto do Tráfego → fila do Designer</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Cliente */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Cliente</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Formato */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Formato</label>
          <div className="flex flex-wrap gap-1.5">
            {AD_FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  format === f
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Briefing */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Briefing / Objetivo do anúncio</label>
          <textarea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            rows={3}
            placeholder="Ex: Anuncio para campanha de mensagens. Produto: Camisetas. CTA: Chame no WhatsApp. Tom: descontraido..."
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none"
          />
        </div>

        {/* Prioridade + Prazo */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Prioridade</label>
            <div className="flex gap-1.5">
              {(["low","medium","high","critical"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                    priority === p
                      ? p === "critical" ? "bg-destructive/20 text-destructive border-destructive/30"
                      : p === "high" ? "bg-lone-warning-bg text-lone-warning border-lone-warning-border"
                      : p === "medium" ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-muted text-muted-foreground border-border"
                      : "bg-muted text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {p === "critical" ? "Urgente" : p === "high" ? "Alta" : p === "medium" ? "Média" : "Baixa"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Prazo (opcional)</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!briefing.trim() || !clientId || enviando}
            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Palette size={14} />} {enviando ? "Enviando…" : "Enviar para o Designer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CREATIVE REQUEST MODAL (Traffic → Design bridge)
// ══════════════════════════════════════════════════════════════

const OBJECTIVE_LABELS: Record<string, string> = {
  messages: "Mensagens (WhatsApp/DM)",
  traffic: "Visitas ao Perfil/Site",
  conversions: "Conversões",
  reach: "Alcance/Visibilidade",
  engagement: "Engajamento",
  leads: "Geração de Leads",
};

const SMART_SUGGESTIONS: Record<string, { format: string; description: string }[]> = {
  messages: [
    { format: "Vídeo Selfie (9:16)", description: "Dono do negócio falando direto com a câmera, CTA forte para WhatsApp" },
    { format: "Carrossel Prova Social", description: "4-5 slides com depoimentos reais + botão de mensagem no final" },
    { format: "Story Interativo", description: "Enquete/Quiz nos stories com link de contato no swipe up" },
  ],
  traffic: [
    { format: "Post Estático Premium", description: "Imagem de alto valor visual com curiosidade/gancho irresistível" },
    { format: "Reel Bastidores (9:16)", description: "Vídeo mostrando o dia a dia, autenticidade gera cliques" },
    { format: "Carrossel Educativo", description: "5 dicas rápidas com CTA de 'saiba mais no perfil'" },
  ],
  conversions: [
    { format: "Vídeo Demonstração", description: "Produto/serviço em ação com oferta limitada e CTA urgente" },
    { format: "Antes/Depois", description: "Transformação visual do resultado com prova social" },
    { format: "Reel Oferta Flash", description: "Contagem regressiva + benefício claro + link de compra" },
  ],
  reach: [
    { format: "Reel Viral (9:16)", description: "Conteúdo de entretenimento/educação com gancho nos 3 primeiros segundos" },
    { format: "Post Carrossel Valor", description: "Informação gratuita de alto valor que as pessoas compartilham" },
    { format: "Meme Contextual", description: "Humor relacionado ao nicho com branding sutil" },
  ],
  engagement: [
    { format: "Post Pergunta", description: "Imagem provocativa com pergunta que gera debate nos comentários" },
    { format: "Reel Tutorial Rápido", description: "Dica prática em 15 segundos que gera saves e shares" },
    { format: "Carrossel Controverso", description: "Opinião forte do nicho que polariza e gera engajamento" },
  ],
  leads: [
    { format: "Vídeo Isca Digital", description: "Preview de material gratuito (PDF, aula) com CTA para cadastro" },
    { format: "Carrossel Case Study", description: "Resultado de um cliente com formulário de 'quero igual'" },
    { format: "Story Urgência", description: "Vagas limitadas + timer + swipe para formulário" },
  ],
};

function CreativeRequestModal({
  campaign, client, currentUser, onClose, onSubmit,
}: {
  campaign: import("@/lib/types").AdCampaign;
  client: import("@/lib/types").Client;
  currentUser: string;
  onClose: () => void;
  onSubmit: (req: Omit<import("@/lib/types").DesignRequest, "id">) => Promise<boolean>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [customFormat, setCustomFormat] = useState("Post Feed (1:1)");
  const [observations, setObservations] = useState("");
  const [priority, setPriority] = useState<"high" | "critical">(
    campaign.ctr < 1 || campaign.cpc > 5 ? "critical" : "high"
  );

  const suggestions = SMART_SUGGESTIONS[campaign.objective] ?? SMART_SUGGESTIONS.engagement;
  const objectiveLabel = OBJECTIVE_LABELS[campaign.objective] ?? campaign.objective;

  const handleSubmit = async () => {
    if (enviando) return;
    const suggestion = selectedSuggestion !== null ? suggestions[selectedSuggestion] : null;
    const format = suggestion ? suggestion.format : customFormat;
    const briefingParts = [
      `[SOLICITACAO DE TRAFEGO]`,
      ``,
      `Origem: Modulo de Trafego`,
      `Campanha: ${campaign.name}`,
      `Objetivo: ${objectiveLabel}`,
      ``,
      `Métricas atuais:`,
      `  CTR: ${campaign.ctr.toFixed(2)}%  |  CPC: R$${campaign.cpc.toFixed(2)}  |  CPM: R$${campaign.cpm.toFixed(2)}`,
      campaign.costPerResult ? `  Custo/Resultado: R$${campaign.costPerResult.toFixed(2)}` : null,
      campaign.spend > 0 ? `  Investimento: R$${campaign.spend.toFixed(2)}` : null,
      ``,
      suggestion ? `Sugestão IA: ${suggestion.format} — ${suggestion.description}` : null,
      observations ? `\nObservações do Gestor:\n${observations}` : null,
    ].filter(Boolean).join("\n");

    setEnviando(true);
    await onSubmit({
      title: `[TRAFEGO] Criativo — ${campaign.name}`,
      clientId: client.id,
      clientName: client.name,
      requestedBy: currentUser,
      priority,
      status: "queued",
      format,
      briefing: briefingParts,
    });
    setEnviando(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-card border border-border rounded-2xl shadow-lg animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent shrink-0" />

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Sparkles size={18} className="text-primary" />
                Solicitar Reforço Criativo
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                O pedido irá direto para a fila do Designer com tag [TRAFEGO]
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/5">
              <X size={16} />
            </button>
          </div>

          {/* Campaign context */}
          <div className="p-4 rounded-xl bg-primary/[0.03] border border-primary/10 space-y-2">
            <p className="text-[10px] text-primary uppercase tracking-wider font-semibold">Contexto da Campanha</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Campanha", value: campaign.name },
                { label: "Cliente", value: client.name },
                { label: "Objetivo", value: objectiveLabel },
                { label: "Performance", value: `CTR ${campaign.ctr.toFixed(2)}% · CPC R$${campaign.cpc.toFixed(2)}` },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  <p className="text-xs font-medium text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
            {(campaign.ctr < 1 || campaign.cpc > 5) && (
              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-destructive">
                <AlertTriangle size={10} />
                Performance abaixo do esperado — criativo urgente
              </div>
            )}
          </div>

          {/* Smart Suggestions */}
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Brain size={10} className="text-primary" />
              Sugestões do Sistema — {objectiveLabel}
            </p>
            <div className="space-y-1.5">
              {suggestions.map((s, i) => {
                const active = selectedSuggestion === i;
                return (
                  <button key={i} onClick={() => setSelectedSuggestion(active ? null : i)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      active ? "border-primary/40 bg-primary/[0.05]" : "border-border hover:border-border"
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0 ${
                        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
                      }`}>{i + 1}</span>
                      <div>
                        <p className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.format}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedSuggestion === null && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Formato Manual</label>
              <select value={customFormat} onChange={(e) => setCustomFormat(e.target.value)}
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-primary/50 outline-none">
                {["Post Feed (1:1)", "Reel (9:16)", "Story (9:16)", "Carrossel", "Video", "Banner"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Prioridade</label>
            <div className="flex gap-2">
              {([
                { value: "high" as const, label: "Alta", color: "text-lone-warning border-lone-warning-border bg-lone-warning-bg" },
                { value: "critical" as const, label: "Crítica (Verba Rodando)", color: "text-destructive border-destructive/20 bg-destructive/5" },
              ]).map((p) => (
                <button key={p.value} onClick={() => setPriority(p.value)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                    priority === p.value ? p.color : "border-border text-muted-foreground"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Observações (opcional)</label>
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)}
              placeholder="Ex: CPA alto, precisamos de video mais agressivo com CTA direto..."
              rows={3}
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 outline-none resize-none" />
          </div>

          {/* Preview */}
          <div className="p-3 rounded-xl bg-card border border-border">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Preview no board do Designer</p>
            <div className="flex items-center gap-2">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/20 font-semibold">TRAFEGO</span>
              <span className="text-xs text-foreground font-medium">Criativo — {campaign.name}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {client.name} · {selectedSuggestion !== null ? suggestions[selectedSuggestion].format : customFormat} · {priority === "critical" ? "Crítica" : "Alta"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-card/5 transition-all">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={enviando}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary transition-all disabled:opacity-50">
            {enviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {enviando ? "Enviando…" : "Enviar para Produção"}
          </button>
        </div>
      </div>
    </div>
  );
}
