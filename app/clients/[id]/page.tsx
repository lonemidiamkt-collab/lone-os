"use client";

import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import MonthObservancesAlert from "@/components/MonthObservancesAlert";
import HolidaysPdfButton from "@/components/HolidaysPdfButton";
import { MarkdownEditor } from "@/components/Markdown";
import BriefingTab from "./BriefingTab";
import ClientCsRules from "@/components/cs/ClientCsRules";
import FeedbackCliente from "@/components/client-tabs/FeedbackCliente";
import InstagramOrganico from "@/components/client-tabs/InstagramOrganico";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useRole } from "@/lib/context/RoleContext";
import { mockAdAccounts } from "@/lib/mockData";
import { useMetaConnection, fetchAdAccounts } from "@/lib/meta/useMetaAds";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { toast } from "sonner";
import {
  getAttentionColor,
  getAttentionLabel,
  getStatusColor,
  getPriorityColor,
  getPriorityLabel,
  daysSince,
  calcHealthScore,
  todaySP,
} from "@/lib/utils";
import type { TimelineEntryType, ClientStatus, CreativeAsset, Client } from "@/lib/types";
import { saudeExibida, ROTULO_NIVEL_SAUDE, COR_NIVEL_SAUDE } from "@/lib/scores/health";
import { ROTULO_RESULTADO_ANUNCIO, TITULO_RESULTADO_ANUNCIO } from "@/lib/scores/resultado-anuncio";
import {
  ArrowLeft, MessageSquare, FileText, TrendingUp,
  Instagram, Calendar, AlertTriangle,
  CheckCircle, Clock, User, Send, Activity,
  CheckSquare, GitCommitHorizontal, MessageCircle,
  BarChart2, PenLine, Star, Upload, Image as ImageIcon,
  Link as LinkIcon, Mic, Palette, Award, Plus, Download, Pencil,
  Facebook, Settings, Link2, Unlink, Check, Loader2, ExternalLink,
  Archive, Smartphone,
} from "lucide-react";
import EditClientModal from "@/components/EditClientModal";
import dynamic from "next/dynamic";
import DadosTab from "@/components/client-tabs/DadosTab";
import BriefingEstrategico from "@/components/client-tabs/BriefingEstrategico";
import CalendarioEstrategico from "@/components/client-tabs/CalendarioEstrategico";
import CrescimentoTab from "@/components/fichaviva/CrescimentoTab";
import AIAuditsTab from "@/components/client-tabs/AIAuditsTab";
import WhatsAppTemplates from "@/components/WhatsAppTemplates";
import ReunioesCliente from "@/components/ReunioesCliente";
import EncerrarParceria from "@/components/EncerrarParceria";
const ContractGenerator = dynamic(() => import("@/components/ContractGenerator"), { ssr: false });
import PortalManagementCard from "@/components/PortalManagementCard";
import FichaViva360Tab from "@/components/fichaviva/FichaViva360Tab";
import Link from "next/link";
import { useState, useRef, useEffect, useMemo } from "react";
import InteligenciaCriativa from "@/components/client-tabs/InteligenciaCriativa";

// ── Timeline helpers ─────────────────────────────────────────────────────────
const TIMELINE_ICONS: Record<TimelineEntryType, { icon: React.ElementType; color: string; bg: string }> = {
  chat:       { icon: MessageCircle,       color: "text-primary",  bg: "bg-primary/15" },
  task:       { icon: CheckSquare,         color: "text-primary",   bg: "bg-primary/15" },
  status:     { icon: Activity,            color: "text-muted-foreground",  bg: "bg-card" },
  content:    { icon: Instagram,           color: "text-muted-foreground",    bg: "bg-card" },
  design:     { icon: Star,               color: "text-muted-foreground",  bg: "bg-card" },
  report:     { icon: BarChart2,           color: "text-primary",    bg: "bg-primary/15" },
  manual:     { icon: PenLine,             color: "text-muted-foreground",    bg: "bg-muted" },
  onboarding: { icon: GitCommitHorizontal, color: "text-primary",    bg: "bg-primary/15" },
  meeting:    { icon: User,               color: "text-muted-foreground",  bg: "bg-card" },
};

// Health score: uses shared calcHealthScore from lib/utils.ts
const calcHealth = calcHealthScore;

const TONE_LABELS: Record<string, string> = {
  formal: "Formal", funny: "Engraçado", authoritative: "Autoritário", casual: "Casual",
};

const ASSET_TYPE_CONFIG: Record<CreativeAsset["type"], { label: string; color: string; icon: React.ElementType }> = {
  reference:  { label: "Referência", color: "text-primary",   icon: ImageIcon },
  palette:    { label: "Paleta",     color: "text-muted-foreground",   icon: Palette },
  typography: { label: "Tipografia", color: "text-muted-foreground", icon: Mic },
  logo:       { label: "Logo",       color: "text-primary",  icon: Star },
};

const TABS = ["overview", "dados", "inteligencia", "resultados", "analise-ia", "briefing", "contratos", "chat", "historico", "tasks", "content", "onboarding", "wallet", "portal", "ficha-viva"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Visão Geral",
  dados: "Dados",
  inteligencia: "Inteligência Criativa",
  resultados: "Crescimento",
  "analise-ia": "Análise IA",
  briefing: "Briefing",
  contratos: "Contratos",
  chat: "Reuniões",
  historico: "Histórico Operacional",
  tasks: "Tarefas",
  content: "Conteúdo",
  onboarding: "Onboarding",
  wallet: "Creative Wallet",
  portal: "Portal",
  "ficha-viva": "Comercial",
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const { role, currentUser } = useRole();
  // ── Zustand stores (migrado de AppStateContext) ───────────────────────────
  const clients = useClientsStore((s) => s.clients);
  const updateClientStatus = useClientsStore((s) => s.updateClientStatus);
  const updateClientData = useClientsStore((s) => s.updateClient);
  const patchClientLocal = useClientsStore((s) => s.patchClientLocal);

  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const addDesignRequest = useContentStore((s) => s.addDesignRequest);

  const tasks = useOperationalStore((s) => s.tasks);
  const timeline = useOperationalStore((s) => s.timeline);
  const onboarding = useOperationalStore((s) => s.onboarding);
  const creativeAssets = useOperationalStore((s) => s.creativeAssets);
  const socialProofs = useOperationalStore((s) => s.socialProofs);
  const addCreativeAsset = useOperationalStore((s) => s.addCreativeAsset);
  const addTimelineEntry = useOperationalStore((s) => s.addTimelineEntry);
  const toggleOnboardingItem = useOperationalStore((s) => s.toggleOnboardingItem);
  const addSocialProof = useOperationalStore((s) => s.addSocialProof);

  const initClients = useClientsStore((s) => s.init);
  const subClients = useClientsStore((s) => s.subscribeRealtime);
  const initContent = useContentStore((s) => s.init);
  const subContent = useContentStore((s) => s.subscribeRealtime);
  const initOps = useOperationalStore((s) => s.init);
  const subOps = useOperationalStore((s) => s.subscribeRealtime);

  const baseClient = clients.find((c) => c.id === clientId);

  // A lista (useClientsStore) vem MAGRA por segurança — sem logins, tokens de link público
  // nem PII (cpf/endereço/docs). Esses campos são puxados 1x, gated, por /api/clients/[id],
  // e mesclados só nas chaves sensíveis (pra não sobrescrever updates realtime dos campos comuns).
  const [clientExtra, setClientExtra] = useState<Partial<Client>>({});
  // "ok" só quando os campos sensíveis chegaram: antes disso o form Dados não pode ser salvo.
  const [extraStatus, setExtraStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [encerrando, setEncerrando] = useState(false);
  useEffect(() => {
    let alive = true;
    setClientExtra({});
    setExtraStatus("carregando");
    chamar<{ client?: Client; completo?: boolean }>(`/api/clients/${clientId}`).then((r) => {
      if (!alive) return;
      if (!r.ok || !r.data?.client) {
        setExtraStatus("erro");
        toast.error(`Não consegui carregar os dados completos do cliente: ${r.erro ?? "resposta vazia"}`);
        return;
      }
      setClientExtra(r.data.client);
      setExtraStatus(r.data.completo === false ? "erro" : "ok");
    });
    return () => { alive = false; };
  }, [clientId]);
  const client = useMemo(() => {
    if (!baseClient) return undefined;
    const SENSITIVE: (keyof Client)[] = [
      "cpfCnpj", "birthDate", "idade", "docIdentidade", "docContratoSocial",
      "endereco", "enderecoRua", "enderecoNumero", "enderecoBairro", "enderecoCidade", "enderecoEstado", "enderecoCep",
      "facebookLogin", "googleAdsLogin", "instagramLogin",
      "publicReportToken", "publicReportTokenCreatedAt", "publicReportTokenRevokedAt",
      "fichaVivaToken", "fichaVivaRaioxToken", "fichaVivaTokenCreatedAt", "fichaVivaTokenRevokedAt",
    ];
    const merged = { ...baseClient };
    for (const k of SENSITIVE) {
      const v = (clientExtra as Record<string, unknown>)[k as string];
      if (v !== undefined) (merged as Record<string, unknown>)[k as string] = v;
    }
    return merged;
  }, [baseClient, clientExtra]);

  // Deep-link: ?tab=onboarding navigates directly to onboarding tab
  const initialTab = (() => {
    if (typeof window !== "undefined") {
      const urlTab = new URLSearchParams(window.location.search).get("tab");
      if (urlTab && (TABS as readonly string[]).includes(urlTab)) return urlTab as Tab;
    }
    return "overview" as Tab;
  })();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  // Dot indicator: true se o cliente tem briefing cadastrado
  const [hasBriefing, setHasBriefing] = useState(false);
  useEffect(() => {
    // Só o pontinho da aba: falha aqui não merece aviso — a própria aba Briefing mostra o erro.
    chamar<{ briefing?: unknown }>(`/api/clients/${clientId}/briefing`)
      .then((r) => { if (r.ok) setHasBriefing(!!r.data?.briefing); });
  }, [clientId]);
  const [manualNote, setManualNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showProofForm, setShowProofForm] = useState(false);
  const [proofForm, setProofForm] = useState({ m1l: "Novos Seguidores", m1v: "", m2l: "Leads no Direct", m2v: "", m3l: "Engajamento", m3v: "", period: "" });
  const [showDesignReqForm, setShowDesignReqForm] = useState(false);
  const [designReqForm, setDesignReqForm] = useState({ title: "", format: "Post Feed", briefing: "", priority: "medium" as "low" | "medium" | "high" | "critical", deadline: "" });
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    initClients();
    initContent();
    initOps();
    const u1 = subClients();
    const u2 = subContent();
    const u3 = subOps();
    return () => { u1(); u2(); u3(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [onboardingLink, setOnboardingLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  const generateOnboardingLink = async () => {
    setGeneratingLink(true);
    const r = await chamar<{ url?: string }>("/api/onboarding", { action: "generate_link", clientId });
    setGeneratingLink(false);
    if (!r.ok || !r.data?.url) { toast.error(r.erro ?? "Não consegui gerar o link."); return; }
    const fullUrl = `${window.location.origin}${r.data.url}`;
    setOnboardingLink(fullUrl);
    navigator.clipboard.writeText(fullUrl).catch(() => {});
  };

  // Inline Meta Ads account picker
  const meta = useMetaConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [showMetaPicker, setShowMetaPicker] = useState(false);
  const [metaSearch, setMetaSearch] = useState("");
  const [linkingAccount, setLinkingAccount] = useState(false);

  useEffect(() => {
    if (meta.connected && meta.token) {
      fetchAdAccounts(meta.token)
        .then((accounts: any[]) => setAdAccounts(accounts ?? []))
        .catch(() => setAdAccounts([]));
    } else {
      setAdAccounts(mockAdAccounts.map((a) => ({
        id: a.id,
        name: a.accountName,
        account_id: a.accountId,
        currency: a.currency,
      })));
    }
  }, [meta.connected, meta.token]);

  const filteredAdAccounts = metaSearch
    ? adAccounts.filter((a: any) =>
        a.name?.toLowerCase().includes(metaSearch.toLowerCase()) ||
        a.account_id?.includes(metaSearch)
      )
    : adAccounts;

  const entries = timeline[clientId] ?? [];
  const obItems = onboarding[clientId] ?? [];
  const clientTasks = tasks.filter((t) => t.clientId === clientId); // era mockTasks (vazio) → aba/tile sempre 0
  const clientContent = contentCards.filter((c) => c.clientId === clientId);
  const clientAssets = creativeAssets[clientId] ?? [];

  // Skeleton loading state — handles race condition after new client creation
  const [waitingForClient, setWaitingForClient] = useState(!client);
  useEffect(() => {
    if (client) { setWaitingForClient(false); return; }
    // Wait up to 5s for the client to appear (DB insert in progress)
    const timer = setTimeout(() => setWaitingForClient(false), 5000);
    return () => clearTimeout(timer);
  }, [client]);

  if (!client && waitingForClient) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Carregando..." subtitle="Preparando dados do cliente" />
        <div className="p-6 space-y-5 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            <div className="h-5 w-20 bg-muted rounded-full animate-pulse" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map((i) => (
              <div key={i} className="card border border-border p-4 space-y-3">
                <div className="h-3 w-28 bg-muted rounded animate-pulse" />
                <div className="h-6 w-16 bg-muted rounded animate-pulse" />
                <div className="h-2 w-full bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
          <div className="card border border-border p-6 space-y-3">
            {[1,2,3,4].map((i) => (
              <div key={i} className="h-3 bg-muted rounded animate-pulse" style={{ width: `${70 + i * 7}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Cliente não encontrado" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">Cliente não encontrado.</p>
            <Link href="/clients" className="btn-primary">Voltar</Link>
          </div>
        </div>
      </div>
    );
  }

  // Uma régua só (lib/scores/health.ts): a cor e o rótulo saem do MESMO nível — antes a cor usava
  // 70/40 e o texto 70/45, e o mesmo número aparecia amarelo com "Risco de churn" embaixo.
  const saude = saudeExibida(client as Client & { currentHealthScore?: number | null; currentHealthLevel?: string | null }, () => calcHealth(client));
  const corSaude = COR_NIVEL_SAUDE[saude.nivel];

  const daysWithUs = Math.floor((Date.now() - new Date(client.joinDate).getTime()) / 86400000);

  const obCompleted = obItems.filter((i) => i.completed).length;
  const obProgress = obItems.length > 0 ? Math.round((obCompleted / obItems.length) * 100) : 0;

  const isAdmin = role === "admin" || role === "manager";
  const visibleTabs = TABS.filter((tab) => {
    if (tab === "wallet" || tab === "contratos" || tab === "portal" || tab === "ficha-viva") return isAdmin;
    // Crescimento = faturamento/vendas/ticket do cliente. O designer não precisa desse dado de negócio.
    if (tab === "resultados") return role !== "designer";
    return true;
  });


  const handleWalletUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: CreativeAsset["type"]) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    // Faz upload REAL pro storage (bucket público) e persiste a URL definitiva. Antes gravava um
    // blob: efêmero (URL.createObjectURL) que só valia naquela aba — no reload/pra outro membro a
    // imagem quebrava, deixando o banco de referências inutilizável.
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      fd.append("docType", "wallet");
      const res = await authedFetch("/api/onboarding/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        await addCreativeAsset({ clientId, type, url: data.url, label: file.name.replace(/\.[^.]+$/, ""), uploadedBy: currentUser, uploadedAt: todaySP() });
        toast.success("Referência salva.");
      } else {
        toast.error(data.error || "Não foi possível subir o arquivo.");
      }
    } catch {
      toast.error("Falha no upload. Verifique a conexão.");
    }
  };

  const handleAddNote = async () => {
    if (!manualNote.trim()) return;
    try {
      await addTimelineEntry({
        clientId,
        type: "manual",
        actor: currentUser,
        description: manualNote.trim(),
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
      setManualNote("");
      setShowNoteInput(false);
    } catch (e) {
      // O texto fica no campo: falhou, não se perde.
      toast.error(`Nota não salva: ${e instanceof Error ? e.message : "erro"}`);
    }
  };

  const handleExportTimeline = () => {
    if (entries.length === 0) return;
    const TYPE_LABELS: Record<string, string> = {
      chat: "Chat", task: "Tarefa", status: "Status", content: "Conteúdo",
      design: "Design", report: "Relatório", onboarding: "Onboarding",
      meeting: "Reunião", manual: "Nota",
    };
    const header = "Data/Hora,Tipo,Responsável,Descrição";
    const rows = entries.map((e) => {
      const desc = e.description.replace(/"/g, '""');
      return `"${e.timestamp}","${TYPE_LABELS[e.type] ?? e.type}","${e.actor}","${desc}"`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${client.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusOptions: { value: ClientStatus; label: string }[] =
    (["onboarding", "good", "average", "at_risk"] as ClientStatus[]).map((value) => ({ value, label: ROTULO_RESULTADO_ANUNCIO[value] }));

  const companyName = client.nomeFantasia || client.razaoSocial || client.name;
  const companyInitial = companyName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      {/* Corporate Header */}
      <div className="border-b border-border bg-surface px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xl font-bold text-primary">{companyInitial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">{companyName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {[
                client.industry,
                `Cliente desde ${client.joinDate}`,
                client.contactName && `Contato: ${client.contactName}${client.contactRole ? ` (${client.contactRole})` : ""}`,
              ].filter(Boolean).join(" \u00B7 ")}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5 animate-fade-in">
        {/* Top bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/clients" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={15} /> Clientes
          </Link>
          <span className={`badge border ${getStatusColor(client.status)}`} title="Vem do CPL x meta (régua de sexta). Não é risco de churn — isso é a Saúde.">
            {TITULO_RESULTADO_ANUNCIO}: {ROTULO_RESULTADO_ANUNCIO[client.status] ?? client.status}
          </span>
          {client.serviceType && client.serviceType !== "lone_growth" && (
            <span className="badge border text-xs text-muted-foreground bg-muted border-border">
              {client.serviceType === "assessoria_trafego" ? "Assessoria Tráfego" :
               client.serviceType === "assessoria_social" ? "Assessoria Social" :
               client.serviceType === "assessoria_design" ? "Assessoria Design" : "Lone Growth"}
            </span>
          )}
          <span className={`badge border ${getAttentionColor(client.attentionLevel)}`}>
            Atenção: {getAttentionLabel(client.attentionLevel)}
          </span>
          {client.tags.map((tag) => (
            <span key={tag} className={`badge border text-xs ${tag === "Premium" ? "tag-premium" : tag === "Risco de Churn" ? "tag-risk" : "tag-matcon"}`}>
              {tag}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {(role === "admin" || role === "manager") && (
              <>
                {onboardingLink ? (
                  <div className="flex items-center gap-1.5 bg-lone-success-bg border border-lone-success-border rounded-lg px-3 py-1.5">
                    <Check size={12} className="text-lone-success" />
                    <span className="text-xs text-lone-success">Link copiado!</span>
                  </div>
                ) : (
                  <button
                    onClick={generateOnboardingLink}
                    disabled={generatingLink}
                    className="btn-ghost text-xs flex items-center gap-1.5 border border-primary/20 text-primary hover:bg-primary/10"
                  >
                    {generatingLink ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                    Link de Onboarding
                  </button>
                )}
                <button
                  onClick={() => setShowEditModal(true)}
                  className="btn-ghost text-xs flex items-center gap-1.5 border border-border hover:border-primary/30 hover:text-primary"
                >
                  <Pencil size={12} />
                  Editar
                </button>
                {/* ENCERRAR PARCERIA — aqui, e não no meio dos atalhos de board.
                    Eu tinha colocado lá embaixo, entre "Board Social" e "Demandas": o botão
                    renderizava e ninguém achava. Ação de ciclo de vida do cliente pertence à barra
                    de ações da ficha, ao lado de Editar e Excluir. */}
                {client.active !== false && (
                  <button
                    onClick={() => setEncerrando(true)}
                    className="btn-ghost text-xs flex items-center gap-1.5 border border-border hover:border-lone-warning-border hover:text-lone-warning"
                  >
                    <Archive size={12} />
                    Encerrar parceria
                  </button>
                )}
                {/* Excluir vive na aba Arquivados, decidido no servidor (admin + cliente arquivado). */}
                <select
                  value={client.status}
                  aria-label={TITULO_RESULTADO_ANUNCIO}
                  title={TITULO_RESULTADO_ANUNCIO}
                  onChange={(e) => { void updateClientStatus(clientId, e.target.value as ClientStatus, currentUser); }}
                  className="bg-card border border-border text-xs text-muted-foreground rounded-lg px-2 py-1.5 outline-none focus:border-primary"
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Calendar size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dias conosco</p>
              <p className="text-lg font-bold text-primary">{daysWithUs}d</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${client.status === "at_risk" ? "bg-destructive/10" : "bg-primary/15"}`}>
              {client.status === "at_risk"
                ? <AlertTriangle size={18} className="text-destructive" />
                : <CheckCircle size={18} className="text-primary" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Último post</p>
              <p className={`text-lg font-bold ${client.lastPostDate && daysSince(client.lastPostDate) > 7 ? "text-destructive" : "text-primary"}`}>
                {client.lastPostDate ? `${daysSince(client.lastPostDate)}d atrás` : "—"}
              </p>
            </div>
          </div>
          {/* Health Score */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Saúde</p>
              <span className={`text-lg font-bold ${corSaude.texto}`}>{saude.score ?? "—"}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${corSaude.barra}`} style={{ width: `${saude.score ?? 0}%` }} />
            </div>
            <p className={`text-xs mt-1.5 ${corSaude.texto}`}>
              {ROTULO_NIVEL_SAUDE[saude.nivel]}
              {!saude.doCache && <span className="text-muted-foreground"> · estimativa</span>}
            </p>
          </div>
        </div>

        {/* Banner de datas comemorativas + feriados regionais relevantes pro cliente + botão de PDF */}
        {(client.nicho || client.enderecoCidade || client.enderecoEstado) && (
          <div className="space-y-2">
            <MonthObservancesAlert
              title={`Datas e feriados${client.enderecoCidade ? ` — ${client.enderecoCidade}` : ""}`}
              nichos={client.nicho ? [client.nicho] : []}
              uf={client.enderecoEstado}
              city={client.enderecoCidade}
              compact
            />
            <HolidaysPdfButton
              nichos={client.nicho ? [client.nicho] : undefined}
              uf={client.enderecoEstado}
              city={client.enderecoCidade}
              clientName={client.name}
              label={`Baixar PDF do mês — ${client.name}`}
            />
          </div>
        )}

        {/* Tabs */}
        <div>
          <div className="flex gap-0.5 mb-5 border-b border-border overflow-x-auto">
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {TAB_LABELS[tab]}
                {tab === "briefing" && hasBriefing && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-primary align-middle" />
                )}
                {tab === "historico" && entries.length > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                    {entries.length}
                  </span>
                )}
                {tab === "onboarding" && client.status === "onboarding" && obItems.length > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                    {obProgress}%
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── DADOS ──────────────────────────────────────────────────────── */}
          {activeTab === "dados" && (
            <DadosTab client={client} role={role} currentUser={currentUser}
              updateClientData={updateClientData} onNavigateTab={(t) => setActiveTab(t as Tab)}
              generateOnboardingLink={generateOnboardingLink} generatingLink={generatingLink}
              onboardingLink={onboardingLink} dadosCompletos={extraStatus === "ok"} />
          )}


          {/* ── RESULTADOS ──────────────────────────────────────────────────── */}
          {activeTab === "inteligencia" && (
            <InteligenciaCriativa clientId={clientId} role={role} />
          )}

          {activeTab === "resultados" && role !== "designer" && (
            <div className="space-y-4">
              <FeedbackCliente clientId={clientId} />
              <CrescimentoTab client={client} currentUser={currentUser} />
            </div>
          )}

          {/* ── ANALISE IA ──────────────────────────────────────────────────── */}
          {activeTab === "analise-ia" && (
            <AIAuditsTab clientId={clientId} isAdmin={isAdmin} />
          )}

          {/* ── BRIEFING ─────────────────────────────────────────────────────── */}
          {activeTab === "briefing" && (
            <div className="space-y-4">
              {isAdmin && <BriefingEstrategico clientId={clientId} />}
              {(isAdmin || role === "social") && <CalendarioEstrategico clientId={clientId} />}
              <BriefingTab clientId={clientId} />
              <ClientCsRules clientId={clientId} />
            </div>
          )}

          {/* ── CONTRATOS ────────────────────────────────────────────────────── */}
          {activeTab === "contratos" && (
            <ContractGenerator client={client} currentUser={currentUser} />
          )}

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-5 animate-fade-in">
              {/* Dossier banner — always visible */}
              {(client.toneOfVoice || client.driveLink || client.instagramUser) && (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex flex-wrap gap-4 items-start">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Dossiê da Marca</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-lg font-medium">
                        Nicho: {client.industry}
                      </span>
                      {client.toneOfVoice && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-lg font-medium">
                          Tom: {TONE_LABELS[client.toneOfVoice]}
                        </span>
                      )}
                      {client.instagramUser && (
                        <span className="text-xs bg-card text-muted-foreground px-2 py-1 rounded-lg font-medium border border-border">
                          <Instagram size={10} className="inline mr-1" />
                          {client.instagramUser}
                        </span>
                      )}
                      {client.driveLink && (
                        <a href={client.driveLink} target="_blank" rel="noreferrer"
                          className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg font-medium border border-primary/20 flex items-center gap-1 hover:bg-primary/20 transition-colors">
                          <LinkIcon size={10} />
                          Drive / Canva
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Acesso rápido ao Briefing ─────────────────────────────────── */}
              <button
                onClick={() => setActiveTab("briefing")}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left group"
              >
                <div>
                  <p className="text-sm font-semibold text-primary">Briefing Estratégico</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Posicionamento, ICP, dores, ganchos e CTAs do cliente</p>
                </div>
                <span className="text-primary text-lg group-hover:translate-x-1 transition-transform">→</span>
              </button>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="card space-y-0">
                <h3 className="font-semibold text-foreground mb-4">Dados Cadastrais</h3>
                {[
                  { label: "Segmento", value: client.industry },
                  { label: "Forma de pagamento", value: client.paymentMethod },
                  { label: "Gestor de tráfego", value: client.assignedTraffic },
                  { label: "Social Media", value: client.assignedSocial },
                  { label: "Cliente desde", value: client.joinDate },
                  { label: "Último post", value: client.lastPostDate ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm text-foreground font-medium">{value}</span>
                  </div>
                ))}

                {/* Meta Ads Account — special row with inline edit */}
                <div className="relative flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Facebook size={12} className="text-[#1877F2]" />
                    Conta Meta Ads
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Cai no ID quando não há nome: a conta pode ter sido vinculada por fora da
                        UI (import, correção no banco) e aí só o ID existe. Antes, nesse caso a tela
                        dizia "Nenhuma vinculada" com a conta vinculada — e alguém ia vincular de novo. */}
                    {client.metaAdAccountName || client.metaAdAccountId ? (
                      <span className="text-sm text-foreground font-medium flex items-center gap-1.5">
                        <Link2 size={12} className="text-primary" />
                        {client.metaAdAccountName || client.metaAdAccountId}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">Nenhuma vinculada</span>
                    )}
                    <button
                      onClick={() => setShowMetaPicker(!showMetaPicker)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Alterar conta de anúncio"
                    >
                      <Settings size={13} />
                    </button>
                  </div>

                  {/* Inline popover */}
                  {showMetaPicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => { setShowMetaPicker(false); setMetaSearch(""); }} />
                      <div className="absolute right-0 top-full mt-1 w-72 bg-card border border-border rounded-xl shadow-lg z-50 animate-fade-in overflow-hidden">
                        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            {linkingAccount && <Loader2 size={10} className="animate-spin" />}
                            Vincular Conta de Anúncio
                          </span>
                          {client.metaAdAccountId && (
                            <button
                              onClick={async () => {
                                setShowMetaPicker(false);
                                setMetaSearch("");
                                // null apaga; undefined sumia no JSON e o "Desvincular" não fazia nada.
                                try {
                                  await updateClientData(clientId, { metaAdAccountId: null, metaAdAccountName: null });
                                  toast.success("Conta de anúncio desvinculada.");
                                } catch (e) {
                                  toast.error(`Não consegui desvincular: ${e instanceof Error ? e.message : "erro"}`);
                                }
                              }}
                              className="text-[10px] text-destructive hover:text-destructive flex items-center gap-1 transition-colors"
                            >
                              <Unlink size={10} />
                              Desvincular
                            </button>
                          )}
                        </div>
                        {adAccounts.length > 4 && (
                          <div className="px-2 py-2 border-b border-border">
                            <input
                              type="text"
                              value={metaSearch}
                              onChange={(e) => setMetaSearch(e.target.value)}
                              placeholder="Buscar conta..."
                              className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
                              autoFocus
                            />
                          </div>
                        )}
                        <div className="max-h-48 overflow-y-auto py-1">
                          {/* SEM ISTO O SELETOR ABRIA VAZIO, sem dizer nada: quando a Meta não está
                              conectada nesta sessão, a lista cai em mockAdAccounts — que é []. Quem
                              abria concluía que "não dá pra conectar a conta do cliente". */}
                          {filteredAdAccounts.length === 0 && (
                            <div className="px-3 py-4 text-center">
                              <p className="text-xs text-muted-foreground mb-1">
                                {metaSearch ? "Nenhuma conta com esse nome." : "Nenhuma conta de anúncio disponível."}
                              </p>
                              {!metaSearch && (
                                <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                                  Conecte a Meta em <span className="text-primary">Configurações → Integrações</span> pra
                                  listar as contas do Gerenciador aqui.
                                </p>
                              )}
                            </div>
                          )}
                          {filteredAdAccounts.map((account: any) => {
                            const isSelected = client.metaAdAccountId === account.id;
                            return (
                              <button
                                key={account.id}
                                disabled={linkingAccount}
                                onClick={async () => {
                                  setShowMetaPicker(false);
                                  setMetaSearch("");
                                  setLinkingAccount(true);
                                  try {
                                    // 1. clients (o gatilho espelha em ad_accounts)
                                    try {
                                      await updateClientData(clientId, { metaAdAccountId: account.id, metaAdAccountName: account.name });
                                    } catch (e) {
                                      toast.error(`Não consegui vincular a conta: ${e instanceof Error ? e.message : "erro"}`);
                                      return;
                                    }
                                    // 2. carteira de tráfego + saldo. 409 = já cadastrada, segue pro sync.
                                    const reg = await chamar("/api/traffic/ad-accounts", { clientId, metaAccountId: account.id, accountName: account.name });
                                    if (!reg.ok && reg.status !== 409) {
                                      toast.error(`Conta vinculada, mas não entrou na carteira de tráfego: ${reg.erro}`);
                                      return;
                                    }
                                    const sync = await chamar("/api/traffic/sync-balances", { accountIds: [account.id] });
                                    if (sync.ok) toast.success(`${account.name} vinculada e sincronizada.`);
                                    else toast.error(`Conta vinculada, mas o saldo não sincronizou: ${sync.erro}`);
                                  } finally { setLinkingAccount(false); }
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all hover:bg-primary/5 ${isSelected ? "bg-primary/10" : ""} disabled:opacity-50`}
                              >
                                <div className="w-6 h-6 rounded-md bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                                  <Facebook size={11} className="text-[#1877F2]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate">{account.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{account.account_id} {account.currency && `· ${account.currency}`}</p>
                                </div>
                                {isSelected && <Check size={13} className="text-primary shrink-0" />}
                              </button>
                            );
                          })}
                          {filteredAdAccounts.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma conta encontrada</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {client.notes && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Observações</p>
                    <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3 border-l-2 border-border">{client.notes}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="card">
                  <h3 className="font-semibold text-foreground mb-4">Equipe Responsável</h3>
                  <div className="space-y-3">
                    {[
                      { role: "Tráfego Pago", name: client.assignedTraffic, color: "text-primary", bg: "bg-primary/15", Icon: TrendingUp },
                      { role: "Social Media", name: client.assignedSocial, color: "text-muted-foreground", bg: "bg-card", Icon: Instagram },
                    ].map(({ role: r, name, color, bg, Icon }) => (
                      <div key={r} className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg} shrink-0`}>
                          <Icon size={16} className={color} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{r}</p>
                          <p className="text-sm font-medium text-foreground">{name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h3 className="font-semibold text-foreground mb-3">Resumo de Atividade</h3>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {([
                      { label: "Tarefas", value: clientTasks.length, tab: "tasks" as Tab },
                      { label: "Conteúdos", value: clientContent.length, tab: "content" as Tab },
                      { label: "No histórico", value: entries.length, tab: "historico" as Tab },
                    ]).map(({ label, value, tab }) => (
                      <button
                        key={label}
                        onClick={() => setActiveTab(tab)}
                        className="rounded-lg py-1 transition-colors hover:bg-muted/50"
                        title={`Ver ${label.toLowerCase()} deste cliente`}
                      >
                        <p className="text-xl font-bold text-foreground">{value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                      </button>
                    ))}
                  </div>
                  {/* Ações rápidas: abrir os boards já neste cliente */}
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    <button onClick={() => router.push(`/social?client=${clientId}`)} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40">
                      <Instagram size={12} /> Board Social
                    </button>
                    <button onClick={() => router.push(`/traffic`)} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40">
                      <TrendingUp size={12} /> Tráfego
                    </button>
                    <button onClick={() => setActiveTab("content")} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40">
                      <Palette size={12} /> Demandas
                    </button>
                  </div>
                </div>
              </div>
            </div>

              {/* Módulo Prova Social */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Award size={16} className="text-primary" />
                    <h3 className="font-semibold text-foreground text-sm">Prova Social</h3>
                  </div>
                  <button
                    onClick={() => setShowProofForm(!showProofForm)}
                    className="text-xs text-primary hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} />
                    Extrair Resultado
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Registre métricas rápidas para enviar ao cliente como prova de valor.</p>

                {showProofForm && (
                  <div className="mb-4 p-4 bg-primary/5 border border-primary/15 rounded-xl space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { lKey: "m1l", vKey: "m1v" },
                        { lKey: "m2l", vKey: "m2v" },
                        { lKey: "m3l", vKey: "m3v" },
                      ].map(({ lKey, vKey }) => (
                        <div key={lKey}>
                          <input
                            value={proofForm[lKey as keyof typeof proofForm]}
                            onChange={(e) => setProofForm((p) => ({ ...p, [lKey]: e.target.value }))}
                            placeholder="Métrica"
                            className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none mb-1"
                          />
                          <input
                            value={proofForm[vKey as keyof typeof proofForm]}
                            onChange={(e) => setProofForm((p) => ({ ...p, [vKey]: e.target.value }))}
                            placeholder="Valor (ex: +500)"
                            className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none font-bold"
                          />
                        </div>
                      ))}
                    </div>
                    <input
                      value={proofForm.period}
                      onChange={(e) => setProofForm((p) => ({ ...p, period: e.target.value }))}
                      placeholder="Período (ex: Março 2026)"
                      className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowProofForm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                      <button
                        onClick={async () => {
                          if (!proofForm.m1v && !proofForm.m2v && !proofForm.m3v) return;
                          try {
                          await addSocialProof({
                            clientId,
                            metric1Label: proofForm.m1l,
                            metric1Value: proofForm.m1v,
                            metric2Label: proofForm.m2l,
                            metric2Value: proofForm.m2v,
                            metric3Label: proofForm.m3l,
                            metric3Value: proofForm.m3v,
                            period: proofForm.period || "—",
                            createdBy: currentUser,
                          });
                          setProofForm({ m1l: "Novos Seguidores", m1v: "", m2l: "Leads no Direct", m2v: "", m3l: "Engajamento", m3v: "", period: "" });
                          setShowProofForm(false);
                          toast.success("Resultado registrado.");
                          } catch (e) {
                            toast.error(`Resultado não salvo: ${e instanceof Error ? e.message : "erro"}`);
                          }
                        }}
                        className="btn-primary text-xs"
                      >
                        Salvar Resultado
                      </button>
                    </div>
                  </div>
                )}

                {(socialProofs[clientId] ?? []).length === 0 && !showProofForm && (
                  <p className="text-xs text-muted-foreground/50 text-center py-4">Nenhum resultado registrado ainda.</p>
                )}

                <div className="space-y-3">
                  {(socialProofs[clientId] ?? []).map((sp) => (
                    <div key={sp.id} className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-primary">{sp.period}</span>
                        <span className="text-xs text-muted-foreground">por {sp.createdBy} · {sp.createdAt}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {[
                          { label: sp.metric1Label, value: sp.metric1Value },
                          { label: sp.metric2Label, value: sp.metric2Value },
                          { label: sp.metric3Label, value: sp.metric3Value },
                        ].filter((m) => m.value).map((m) => (
                          <div key={m.label} className="bg-card rounded-lg p-3 border border-border">
                            <p className="text-lg font-bold text-primary">{m.value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── CHAT ─────────────────────────────────────────────────────────── */}
          {activeTab === "chat" && (
            <div className="animate-fade-in max-w-2xl space-y-6">
              {/* Reuniões (o chat interno por cliente foi removido a pedido — só agendamento + templates) */}
              {/* UM componente para o ciclo inteiro: agendar, escrever ou gerar a pauta, anexar
                  material, registrar a transcrição depois e buscar no histórico.
                  Antes eram dois blocos ("Agendar" e "Reuniões cadastradas") fazendo partes do
                  mesmo trabalho — quem chegava não sabia em qual clicar. */}
              <ReunioesCliente clientId={client.id} clientName={client.nomeFantasia || client.name}
                               donos={{ social: client.assignedSocial || null, trafego: client.assignedTraffic || null, designer: client.assignedDesigner || null }} />
              <WhatsAppTemplates client={client} />
            </div>
          )}

          {/* ── HISTÓRICO OPERACIONAL ─────────────────────────────────────────── */}
          {activeTab === "historico" && (
            <div className="animate-fade-in max-w-2xl space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Registro automático de tudo que acontece com este cliente.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportTimeline}
                    disabled={entries.length === 0}
                    className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40"
                  >
                    <Download size={13} />
                    Exportar CSV
                  </button>
                  <button
                    onClick={() => setShowNoteInput(!showNoteInput)}
                    className="btn-ghost flex items-center gap-1.5 text-xs"
                  >
                    <PenLine size={13} />
                    Adicionar nota manual
                  </button>
                </div>
              </div>

              {showNoteInput && (
                <div className="card border border-primary/20 animate-fade-in">
                  <p className="text-xs text-muted-foreground mb-2">Nova nota manual no histórico</p>
                  <textarea
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    rows={2}
                    placeholder="Ex: Reunião com cliente — satisfeito com resultados, pediu ampliar budget..."
                    className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none mb-3"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddNote} className="btn-primary text-xs flex items-center gap-1.5">
                      <PenLine size={12} /> Salvar nota
                    </button>
                    <button onClick={() => { setShowNoteInput(false); setManualNote(""); }} className="btn-ghost text-xs">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {entries.length === 0 && (
                <div className="card text-center py-10 text-muted-foreground">
                  Nenhum registro ainda. Envie uma mensagem no chat ou atualize o status.
                </div>
              )}

              {/* Vertical timeline */}
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-muted" />
                <div className="space-y-4">
                  {entries.map((entry) => {
                    const cfg = TIMELINE_ICONS[entry.type] ?? TIMELINE_ICONS.manual;
                    const Icon = cfg.icon;
                    return (
                      <div key={entry.id} className="relative pl-14">
                        <div className={`absolute left-2 top-1 w-6 h-6 rounded-full flex items-center justify-center ${cfg.bg}`}>
                          <Icon size={12} className={cfg.color} />
                        </div>
                        <div className="card py-3 px-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-foreground leading-relaxed">{entry.description}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-xs font-medium ${cfg.color}`}>
                              {entry.type === "chat" ? "Chat" :
                               entry.type === "task" ? "Tarefa" :
                               entry.type === "status" ? "Status" :
                               entry.type === "content" ? "Conteúdo" :
                               entry.type === "design" ? "Design" :
                               entry.type === "report" ? "Relatório" :
                               entry.type === "onboarding" ? "Onboarding" :
                               entry.type === "meeting" ? "Reunião" : "Nota"}
                            </span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="text-xs text-muted-foreground">{entry.actor}</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="text-xs text-muted-foreground/50">{entry.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── TASKS ────────────────────────────────────────────────────────── */}
          {activeTab === "tasks" && (
            <div className="animate-fade-in space-y-3">
              {clientTasks.length === 0 && (
                <div className="card text-center py-10 text-muted-foreground">Nenhuma tarefa para este cliente.</div>
              )}
              {clientTasks.map((task) => (
                <div key={task.id} className="card flex items-start gap-4">
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${
                    task.priority === "critical" ? "bg-destructive" :
                    task.priority === "high" ? "bg-muted" :
                    task.priority === "medium" ? "bg-primary" : "bg-muted"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-foreground">{task.title}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`badge border text-xs ${getPriorityColor(task.priority)}`}>{getPriorityLabel(task.priority)}</span>
                        <span className={`badge text-xs ${
                          task.status === "done" ? "bg-primary/15 text-primary" :
                          task.status === "in_progress" ? "bg-primary/15 text-primary" :
                          task.status === "review" ? "bg-card text-muted-foreground" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {task.status === "done" ? "Concluído" : task.status === "in_progress" ? "Em Execução" : task.status === "review" ? "Validação" : "Pendente"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User size={11} /> {task.assignedTo}</span>
                      {task.dueDate && <span className="flex items-center gap-1"><Clock size={11} /> {task.dueDate}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── CONTENT ──────────────────────────────────────────────────────── */}
          {activeTab === "content" && (
            <div className="animate-fade-in space-y-3">
              {/* Crescimento nas redes (Instagram orgânico) — fica aqui, no espaço de conteúdo/social,
                  e não na aba Crescimento (que é faturamento/comercial). */}
              <InstagramOrganico clientId={clientId} />
              {clientContent.length === 0 && (
                <div className="card text-center py-10 text-muted-foreground">Nenhum conteúdo para este cliente.</div>
              )}
              {clientContent.map((card) => (
                <div key={card.id} className="card flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="font-medium text-foreground">{card.title}</p>
                      <span className={`badge border text-xs shrink-0 ${getPriorityColor(card.priority)}`}>{getPriorityLabel(card.priority)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="bg-muted px-2 py-0.5 rounded-full">{card.format}</span>
                      <span>SM: {card.socialMedia}</span>
                      {card.dueDate && <span className="flex items-center gap-1"><Calendar size={11} /> {card.dueDate}</span>}
                      <span className={`badge text-xs ${
                        card.status === "published" ? "bg-primary/15 text-primary" :
                        card.status === "scheduled" ? "bg-primary/15 text-primary" :
                        card.status === "approval" ? "bg-card text-muted-foreground" :
                        card.status === "in_production" ? "bg-primary/15 text-primary" :
                        card.status === "script" ? "bg-primary/15 text-primary" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {card.status === "published" ? "Publicado" : card.status === "scheduled" ? "Agendado" : card.status === "approval" ? "Aprovação" : card.status === "in_production" ? "Em Produção" : card.status === "script" ? "Roteiro" : "Ideia"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── ONBOARDING ───────────────────────────────────────────────────── */}
          {activeTab === "onboarding" && (
            <div className="animate-fade-in space-y-6">
              {obItems.length === 0 ? (
                <div className="card text-center py-10 text-muted-foreground">
                  {client.status === "onboarding"
                    ? "Checklist de onboarding não iniciado."
                    : "Este cliente já concluiu o onboarding."}
                </div>
              ) : (
                <>
                  {/* Global progress bar */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-foreground text-sm">Setup do Cliente</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Quartel General — {client.name}</p>
                      </div>
                      <span className="text-lg font-bold text-foreground tabular-nums">{obProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-card rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${obProgress}%` }} />
                    </div>
                  </div>

                  {/* 3 department blocks */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {([
                      { dept: "traffic", title: "Setup de Tráfego", icon: TrendingUp, member: client.assignedTraffic },
                      { dept: "design", title: "Setup de Design", icon: Palette, member: client.assignedDesigner },
                      { dept: "social", title: "Setup de Social", icon: Smartphone, member: client.assignedSocial },
                    ] as const).map((block) => {
                      const deptItems = obItems.filter((it) => (it as any).department === block.dept || (!((it as any).department) && block.dept === "social"));
                      const deptDone = deptItems.filter((it) => it.completed).length;
                      const deptTotal = deptItems.length;
                      const IconeDept = block.icon;
                      return (
                        <div key={block.dept} className="card space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <IconeDept size={16} className="text-muted-foreground shrink-0" />
                              <div>
                                <h4 className="text-xs font-semibold text-foreground">{block.title}</h4>
                                <p className="text-[10px] text-muted-foreground">{block.member || "Não atribuído"}</p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold tabular-nums ${deptDone === deptTotal && deptTotal > 0 ? "text-lone-success" : "text-muted-foreground"}`}>
                              {deptDone}/{deptTotal}
                            </span>
                          </div>

                          {/* Mini progress */}
                          <div className="h-1 bg-card rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${deptDone === deptTotal && deptTotal > 0 ? "bg-lone-success" : "bg-primary"}`}
                              style={{ width: deptTotal > 0 ? `${(deptDone / deptTotal) * 100}%` : "0%" }} />
                          </div>

                          {/* Items */}
                          <div className="space-y-1">
                            {deptItems.map((item) => (
                              <label key={item.id}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                                  item.completed ? "bg-card" : "hover:bg-card"
                                }`}>
                                <button
                                  onClick={() => toggleOnboardingItem(clientId, item.id, currentUser)}
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                    item.completed
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "border-border hover:border-primary"
                                  }`}>
                                  {item.completed && <CheckCircle size={10} />}
                                </button>
                                <span className={`text-xs flex-1 ${item.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                  {item.label}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── CREATIVE WALLET ──────────────────────────────────────────────── */}
          {activeTab === "wallet" && (
            <div className="animate-fade-in space-y-5 max-w-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Creative Wallet</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Banco de referências visuais, paleta de cores e tipografia da marca.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setShowDesignReqForm(true)}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    <Palette size={12} /> Solicitar Design
                  </button>
                  {(["reference", "palette", "typography", "logo"] as CreativeAsset["type"][]).map((type) => {
                    const cfg = ASSET_TYPE_CONFIG[type];
                    return (
                      <label key={type} className={`btn-ghost text-xs flex items-center gap-1.5 cursor-pointer ${cfg.color}`}>
                        <Upload size={12} />
                        {cfg.label}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => handleWalletUpload(e, type)} />
                      </label>
                    );
                  })}
                </div>
              </div>

              {clientAssets.length === 0 && (
                <div className="card text-center py-16 text-muted-foreground/50 border-2 border-dashed border-border">
                  <ImageIcon size={32} className="mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm">Nenhuma referência visual adicionada ainda.</p>
                  <p className="text-xs mt-1">Use os botões acima para fazer upload de imagens de inspiração, paletas e tipografias.</p>
                </div>
              )}

              {/* Group by type */}
              {(["reference", "palette", "typography", "logo"] as CreativeAsset["type"][]).map((type) => {
                const assets = clientAssets.filter((a) => a.type === type);
                if (assets.length === 0) return null;
                const cfg = ASSET_TYPE_CONFIG[type];
                const Icon = cfg.icon;
                return (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon size={14} className={cfg.color} />
                      <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}s</span>
                      <span className="text-xs text-muted-foreground/50">({assets.length})</span>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                      {assets.map((asset) => (
                        <div key={asset.id} className="group relative rounded-xl overflow-hidden border border-border hover:border-primary/30 transition-colors bg-card">
                          <div className="aspect-video w-full overflow-hidden bg-muted">
                            <img src={asset.url} alt={asset.label ?? type}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          </div>
                          <div className="p-2.5">
                            <p className="text-xs text-muted-foreground font-medium truncate">{asset.label ?? cfg.label}</p>
                            <p className="text-xs text-muted-foreground/50 mt-0.5">{asset.uploadedBy} · {asset.uploadedAt}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PORTAL ───────────────────────────────────────────────────── */}
          {activeTab === "portal" && isAdmin && (
            <div className="animate-fade-in max-w-xl">
              <PortalManagementCard
                client={client}
                onUpdate={(patch) => patchClientLocal(client.id, patch)}
              />
            </div>
          )}

          {activeTab === "ficha-viva" && isAdmin && (
            <FichaViva360Tab
              client={client}
              onUpdate={(patch) => patchClientLocal(client.id, patch)}
            />
          )}
        </div>
      </div>

      {/* ── SOLICITAR DESIGN MODAL ─────────────────────────────────────── */}
      {showDesignReqForm && client && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm" onClick={() => setShowDesignReqForm(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Solicitar Design</h3>
              <p className="text-xs text-primary mt-0.5">{client.name}</p>
            </div>
            <div className="p-5 space-y-3">
              <input
                value={designReqForm.title}
                onChange={(e) => setDesignReqForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Título (ex: Banner promoção de verão)"
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={designReqForm.format}
                  onChange={(e) => setDesignReqForm((f) => ({ ...f, format: e.target.value }))}
                  className="bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  <option>Post Feed</option>
                  <option>Story</option>
                  <option>Reels</option>
                  <option>Carrossel</option>
                  <option>Banner</option>
                  <option>Thumbnail</option>
                </select>
                <select
                  value={designReqForm.priority}
                  onChange={(e) => setDesignReqForm((f) => ({ ...f, priority: e.target.value as typeof designReqForm.priority }))}
                  className="bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="critical">Urgente</option>
                </select>
              </div>
              <input
                type="date"
                value={designReqForm.deadline}
                onChange={(e) => setDesignReqForm((f) => ({ ...f, deadline: e.target.value }))}
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              />
              <MarkdownEditor
                value={designReqForm.briefing}
                onChange={(v) => setDesignReqForm((f) => ({ ...f, briefing: v }))}
                placeholder="Briefing detalhado para o designer (markdown — **negrito**, listas, links)..."
                minHeight={120}
                className="bg-muted"
              />
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setShowDesignReqForm(false)} className="btn-ghost flex-1 text-sm">Cancelar</button>
              <button
                onClick={() => {
                  if (!designReqForm.title.trim() || !designReqForm.briefing.trim()) return;
                  addDesignRequest({
                    title: designReqForm.title.trim(),
                    clientId: client.id,
                    clientName: client.name,
                    requestedBy: currentUser,
                    priority: designReqForm.priority,
                    status: "queued",
                    format: designReqForm.format,
                    briefing: designReqForm.briefing.trim(),
                    deadline: designReqForm.deadline || undefined,
                  }).catch((err: unknown) => toast.error(`Não consegui criar a demanda${err instanceof Error && err.message ? ` (${err.message})` : ""}. Tenta de novo.`));
                  setDesignReqForm({ title: "", format: "Post Feed", briefing: "", priority: "medium", deadline: "" });
                  setShowDesignReqForm(false);
                }}
                disabled={!designReqForm.title.trim() || !designReqForm.briefing.trim()}
                className="btn-primary flex-1 text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Palette size={13} /> Enviar Solicitação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditModal && (
        <EditClientModal client={client} onClose={() => setShowEditModal(false)} />
      )}

      {encerrando && (
        <EncerrarParceria
          clientId={clientId}
          clientName={client.nomeFantasia || client.name}
          aoFechar={() => setEncerrando(false)}
          // Concluído, o cliente saiu da lista de ativos: voltar para /clients evita a ficha
          // ficar mostrando um cliente que o store já não tem.
          aoConcluir={() => router.push("/clients")}
        />
      )}
    </div>
  );
}
