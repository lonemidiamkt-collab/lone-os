"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plug, CheckCircle, XCircle, AlertTriangle, ExternalLink,
  Facebook, RefreshCw, Clock, X, Loader2, ChevronDown, ChevronUp,
  Copy, Check, Trash2, BarChart3, MessageSquare, FolderSync,
  Calendar, FileText, Hash, Zap, Globe, Smartphone, TrendingUp,
  Settings2, Shield, Eye,
} from "lucide-react";
import { useMetaConnection } from "@/lib/meta/useMetaAds";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

type IntegrationStatus = "connected" | "disconnected" | "expired" | "coming_soon";
type SyncFrequency = "manual" | "15min" | "1h" | "6h" | "24h";
type CategoryKey = "ads" | "social" | "produtividade" | "automacao";

interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: CategoryKey;
  permissions: string[];
  isMeta?: boolean;
}

interface ConnectionData {
  connectedAt: string;
  lastSync: string;
  syncFrequency: SyncFrequency;
  webhookUrl: string;
}

interface WebhookEvent {
  id: string;
  integrationId: string;
  integrationName: string;
  message: string;
  timestamp: string;
  status: "success" | "failed";
  details: string;
}

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const STORAGE_PREFIX = "lone_integration_";
const WEBHOOK_LOG_KEY = "lone_webhook_log";

const CATEGORIES: { key: CategoryKey; label: string; icon: typeof BarChart3 }[] = [
  { key: "ads", label: "Ads & Analytics", icon: TrendingUp },
  { key: "social", label: "Social", icon: MessageSquare },
  { key: "produtividade", label: "Produtividade", icon: FolderSync },
  { key: "automacao", label: "Automação", icon: Zap },
];

const INTEGRATIONS: IntegrationDef[] = [
  // Ads & Analytics
  {
    id: "meta",
    name: "Meta Ads (Facebook/Instagram)",
    description: "Campanhas, métricas e insights em tempo real",
    icon: "📘",
    category: "ads",
    permissions: ["Leitura de campanhas e métricas", "Gerenciamento de contas de anúncios", "Acesso a insights de performance"],
    isMeta: true,
  },
  {
    id: "google-ads",
    name: "Google Ads",
    description: "Campanhas de Search, Display e YouTube",
    icon: "🔍",
    category: "ads",
    permissions: ["Leitura de campanhas ativas", "Acesso a métricas de custo e conversão", "Gerenciamento de públicos"],
  },
  {
    id: "google-analytics",
    name: "Google Analytics",
    description: "Tráfego do site e conversões",
    icon: "📊",
    category: "ads",
    permissions: ["Leitura de dados de tráfego", "Acesso a relatórios de conversão", "Dados de audiência e comportamento"],
  },
  // Social
  {
    id: "instagram-api",
    name: "Instagram Graph API",
    description: "Métricas de perfil e posts orgânicos",
    icon: "📸",
    category: "social",
    permissions: ["Leitura de métricas do perfil", "Acesso a insights de posts", "Dados de engajamento orgânico"],
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "Campanhas e métricas TikTok",
    icon: "🎵",
    category: "social",
    permissions: ["Leitura de campanhas TikTok", "Acesso a métricas de vídeo", "Dados de audiência"],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business API",
    description: "Enviar e receber mensagens de clientes",
    icon: "💬",
    category: "social",
    permissions: ["Envio de mensagens via template", "Recebimento de mensagens de clientes", "Acesso ao catálogo de produtos", "Gerenciamento de contatos"],
  },
  // Produtividade
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Sincronizar pastas de clientes automaticamente",
    icon: "📁",
    category: "produtividade",
    permissions: ["Criar e gerenciar pastas", "Upload e download de arquivos", "Compartilhamento de documentos", "Acesso a Google Docs e Sheets"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Sincronizar eventos e deadlines",
    icon: "📅",
    category: "produtividade",
    permissions: ["Criar e editar eventos", "Leitura de calendários", "Notificações de deadlines", "Sincronização bidirecional"],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Importar/exportar tarefas e docs",
    icon: "📝",
    category: "produtividade",
    permissions: ["Leitura de databases e páginas", "Criação de tarefas", "Sincronização de documentos", "Acesso a templates"],
  },
  {
    id: "slack",
    name: "Slack / Discord",
    description: "Notificações em canais de equipe",
    icon: "💬",
    category: "produtividade",
    permissions: ["Envio de notificações", "Criação de canais", "Acesso a mensagens", "Integração com bots"],
  },
  // Automação
  {
    id: "zapier",
    name: "Zapier / Webhooks",
    description: "Automações e integrações customizadas",
    icon: "⚡",
    category: "automacao",
    permissions: ["Disparo de webhooks", "Recebimento de triggers", "Acesso a dados de clientes", "Automação de workflows"],
  },
];

const SYNC_LABELS: Record<SyncFrequency, string> = {
  manual: "Manual",
  "15min": "A cada 15 min",
  "1h": "A cada 1 hora",
  "6h": "A cada 6 horas",
  "24h": "A cada 24 horas",
};

const MOCK_WEBHOOK_MESSAGES: Record<string, string[]> = {
  meta: ["Meta Ads sync completed — 12 campanhas atualizadas", "Meta Ads: nova campanha detectada", "Meta Ads: alerta de orçamento excedido"],
  "google-ads": ["Google Ads sync completed — 8 campanhas", "Google Ads: conversão registrada", "Google Ads: orçamento diário atingido"],
  "google-analytics": ["GA4 sync completed — dados de 7 dias", "GA4: pico de tráfego detectado", "GA4: meta de conversão atingida"],
  "instagram-api": ["Instagram insights atualizados", "Instagram: novo pico de engajamento", "Instagram: relatório semanal pronto"],
  tiktok: ["TikTok Ads sync completed", "TikTok: vídeo viral detectado", "TikTok: métricas atualizadas"],
  whatsapp: ["WhatsApp: mensagem recebida de cliente", "WhatsApp: template aprovado", "WhatsApp: 15 mensagens enviadas hoje"],
  "google-drive": ["Google Drive sync — 24 arquivos sincronizados", "Google Drive: nova pasta criada", "Google Drive: arquivo compartilhado"],
  "google-calendar": ["Google Calendar sync — 6 eventos importados", "Google Calendar: deadline amanhã", "Google Calendar: reunião reagendada"],
  notion: ["Notion sync — 18 tarefas importadas", "Notion: página atualizada", "Notion: database sincronizada"],
  slack: ["Slack: notificação enviada #marketing", "Slack: alerta de deadline enviado", "Slack: resumo diário postado"],
  zapier: ["Webhook disparado: novo cliente", "Webhook recebido: form submission", "Zapier: automação executada com sucesso"],
};

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function generateWebhookUrl(integrationId: string): string {
  const hash = Math.random().toString(36).substring(2, 10);
  return `https://api.lone-os.app/webhooks/${integrationId}/${hash}`;
}

function loadConnection(id: string): ConnectionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveConnection(id: string, data: ConnectionData) {
  localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(data));
}

function removeConnection(id: string) {
  localStorage.removeItem(STORAGE_PREFIX + id);
}

function loadWebhookLog(): WebhookEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WEBHOOK_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveWebhookLog(events: WebhookEvent[]) {
  localStorage.setItem(WEBHOOK_LOG_KEY, JSON.stringify(events.slice(0, 50)));
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function IntegrationsPage() {
  const meta = useMetaConnection();

  const [connections, setConnections] = useState<Record<string, ConnectionData | null>>({});
  const [webhookLog, setWebhookLog] = useState<WebhookEvent[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryKey | "all">("all");
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const [connectModal, setConnectModal] = useState<IntegrationDef | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  const [disconnectConfirm, setDisconnectConfirm] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const conns: Record<string, ConnectionData | null> = {};
    for (const integ of INTEGRATIONS) {
      conns[integ.id] = loadConnection(integ.id);
    }
    setConnections(conns);
    setWebhookLog(loadWebhookLog());
  }, []);

  // Seed mock webhook events for connected integrations
  useEffect(() => {
    if (webhookLog.length > 0) return;
    const connectedIds = Object.entries(connections).filter(([, v]) => v !== null).map(([k]) => k);
    if (connectedIds.length === 0) return;
    const events: WebhookEvent[] = [];
    for (const id of connectedIds) {
      const integ = INTEGRATIONS.find((i) => i.id === id);
      const msgs = MOCK_WEBHOOK_MESSAGES[id] ?? [];
      if (!integ || msgs.length === 0) continue;
      events.push({
        id: `${id}-seed-${Date.now()}`,
        integrationId: id,
        integrationName: integ.name,
        message: msgs[0],
        timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        status: "success",
        details: "200 OK",
      });
    }
    if (events.length > 0) {
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setWebhookLog(events);
      saveWebhookLog(events);
    }
  }, [connections, webhookLog.length]);

  const getStatus = useCallback((id: string): IntegrationStatus => {
    if (id === "meta") {
      return meta.connected ? (meta.tokenExpired ? "expired" : "connected") : "disconnected";
    }
    return connections[id] ? "connected" : "disconnected";
  }, [meta.connected, meta.tokenExpired, connections]);

  const handleConnect = useCallback((integ: IntegrationDef) => {
    if (integ.isMeta) {
      meta.connect();
      return;
    }
    setConnectModal(integ);
  }, [meta]);

  const handleAuthorize = useCallback(() => {
    if (!connectModal) return;
    setConnectLoading(true);
    setTimeout(() => {
      const now = new Date().toISOString();
      const data: ConnectionData = {
        connectedAt: now,
        lastSync: now,
        syncFrequency: "1h",
        webhookUrl: generateWebhookUrl(connectModal.id),
      };
      saveConnection(connectModal.id, data);
      setConnections((prev) => ({ ...prev, [connectModal.id]: data }));

      const msgs = MOCK_WEBHOOK_MESSAGES[connectModal.id] ?? [];
      const newEvent: WebhookEvent = {
        id: `${connectModal.id}-${Date.now()}`,
        integrationId: connectModal.id,
        integrationName: connectModal.name,
        message: msgs[0] ?? `${connectModal.name} conectado com sucesso`,
        timestamp: now,
        status: "success",
        details: "200 OK — conexão estabelecida",
      };
      const updated = [newEvent, ...webhookLog].slice(0, 50);
      setWebhookLog(updated);
      saveWebhookLog(updated);

      setConnectLoading(false);
      setConnectModal(null);
    }, 1500);
  }, [connectModal, webhookLog]);

  const handleDisconnect = useCallback((id: string) => {
    if (id === "meta") {
      meta.disconnect();
      setDisconnectConfirm(null);
      return;
    }
    removeConnection(id);
    setConnections((prev) => ({ ...prev, [id]: null }));
    setDisconnectConfirm(null);
    if (expandedId === id) setExpandedId(null);

    const integ = INTEGRATIONS.find((i) => i.id === id);
    const now = new Date().toISOString();
    const newEvent: WebhookEvent = {
      id: `${id}-disc-${Date.now()}`,
      integrationId: id,
      integrationName: integ?.name ?? id,
      message: `${integ?.name ?? id} desconectado`,
      timestamp: now,
      status: "failed",
      details: "Desconexão manual pelo usuário",
    };
    const updated = [newEvent, ...webhookLog].slice(0, 50);
    setWebhookLog(updated);
    saveWebhookLog(updated);
  }, [meta, webhookLog, expandedId]);

  const handleSyncFrequencyChange = useCallback((id: string, freq: SyncFrequency) => {
    setConnections((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const updated = { ...existing, syncFrequency: freq };
      saveConnection(id, updated);
      return { ...prev, [id]: updated };
    });
  }, []);

  const handleManualSync = useCallback((id: string) => {
    const now = new Date().toISOString();
    setConnections((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const updated = { ...existing, lastSync: now };
      saveConnection(id, updated);
      return { ...prev, [id]: updated };
    });

    const integ = INTEGRATIONS.find((i) => i.id === id);
    const msgs = MOCK_WEBHOOK_MESSAGES[id] ?? [];
    const msg = msgs[Math.floor(Math.random() * msgs.length)] ?? `${integ?.name} sync completed`;
    const isSuccess = Math.random() > 0.15;
    const newEvent: WebhookEvent = {
      id: `${id}-sync-${Date.now()}`,
      integrationId: id,
      integrationName: integ?.name ?? id,
      message: msg,
      timestamp: now,
      status: isSuccess ? "success" : "failed",
      details: isSuccess ? "200 OK" : "503 Service Unavailable — retry scheduled",
    };
    const updated = [newEvent, ...webhookLog].slice(0, 50);
    setWebhookLog(updated);
    saveWebhookLog(updated);
  }, [webhookLog]);

  const handleCopyUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }, []);

  const filteredIntegrations = activeCategory === "all"
    ? INTEGRATIONS
    : INTEGRATIONS.filter((i) => i.category === activeCategory);

  const connectedCount = INTEGRATIONS.filter((i) => getStatus(i.id) === "connected").length;

  const STATUS_CONFIG = {
    connected:    { label: "Conectado",    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
    disconnected: { label: "Desconectado", color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20", icon: XCircle },
    expired:      { label: "Expirado",     color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: AlertTriangle },
    coming_soon:  { label: "Em breve",     color: "text-zinc-700 bg-zinc-800/50 border-zinc-800", icon: Clock },
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Plug size={24} className="text-[#0d4af5]" />
          Integrações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie conexões com plataformas externas
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle size={12} className="text-emerald-400" />
          <span className="text-xs text-emerald-400 font-medium">{connectedCount} ativa(s)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-500/10 border border-zinc-500/20">
          <Plug size={12} className="text-zinc-500" />
          <span className="text-xs text-zinc-500 font-medium">{INTEGRATIONS.length} disponíveis</span>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeCategory === "all"
              ? "bg-[#0d4af5] text-white"
              : "bg-muted text-muted-foreground hover:text-foreground hover:bg-hover"
          }`}
        >
          Todas ({INTEGRATIONS.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = INTEGRATIONS.filter((i) => i.category === cat.key).length;
          const CatIcon = cat.icon;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeCategory === cat.key
                  ? "bg-[#0d4af5] text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-hover"
              }`}
            >
              <CatIcon size={12} />
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Integration cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredIntegrations.map((integration) => {
          const status = getStatus(integration.id);
          const config = STATUS_CONFIG[status];
          const StatusIcon = config.icon;
          const isMeta = integration.isMeta;
          const conn = connections[integration.id];
          const isExpanded = expandedId === integration.id && status === "connected";

          return (
            <div
              key={integration.id}
              className={`card border transition-all ${
                status === "connected"
                  ? "border-[#0d4af5]/20 hover:border-[#0d4af5]/40 hover:shadow-[0_0_20px_rgba(10,52,245,0.08)]"
                  : "border-border hover:border-zinc-600"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0">
                  {integration.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{integration.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${config.color}`}>
                      <StatusIcon size={9} /> {config.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{integration.description}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {/* Meta-specific OAuth */}
                    {isMeta && !meta.connected && (
                      <button
                        onClick={() => meta.connect()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1877F2] text-white text-xs font-medium hover:bg-[#1877F2]/80 transition-all"
                      >
                        <Facebook size={12} /> Conectar ao Facebook
                      </button>
                    )}
                    {isMeta && meta.connected && meta.tokenExpired && (
                      <button
                        onClick={() => meta.connect()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium border border-amber-500/20 hover:bg-amber-500/20 transition-all"
                      >
                        <RefreshCw size={12} /> Reconectar
                      </button>
                    )}
                    {isMeta && meta.connected && !meta.tokenExpired && (
                      <button
                        onClick={() => setDisconnectConfirm("meta")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 transition-all"
                      >
                        <XCircle size={12} /> Desconectar
                      </button>
                    )}

                    {/* Non-Meta integrations */}
                    {!isMeta && status === "disconnected" && (
                      <button
                        onClick={() => handleConnect(integration)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d4af5] text-white text-xs font-medium hover:bg-[#0d4af5]/80 transition-all"
                      >
                        <Plug size={12} /> Conectar
                      </button>
                    )}
                    {!isMeta && status === "connected" && (
                      <>
                        <button
                          onClick={() => handleManualSync(integration.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d4af5]/10 text-[#0d4af5] text-xs font-medium border border-[#0d4af5]/20 hover:bg-[#0d4af5]/20 transition-all"
                        >
                          <RefreshCw size={12} /> Sincronizar
                        </button>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : integration.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:text-foreground hover:bg-hover transition-all"
                        >
                          <Settings2 size={12} />
                          Detalhes
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                        <button
                          onClick={() => setDisconnectConfirm(integration.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 transition-all"
                        >
                          <XCircle size={12} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Last sync info */}
                  {status === "connected" && conn && (
                    <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                      <Clock size={9} /> Último sync: {formatRelative(conn.lastSync)}
                    </p>
                  )}
                </div>
              </div>

              {/* Expanded details panel */}
              {isExpanded && conn && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Conectado em</label>
                      <p className="text-xs text-foreground mt-0.5">
                        {new Date(conn.connectedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Último sync</label>
                      <p className="text-xs text-foreground mt-0.5">
                        {new Date(conn.lastSync).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>

                  {/* Sync frequency */}
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Frequência de sync</label>
                    <select
                      value={conn.syncFrequency}
                      onChange={(e) => handleSyncFrequencyChange(integration.id, e.target.value as SyncFrequency)}
                      className="mt-1 w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#0d4af5]/40"
                    >
                      {Object.entries(SYNC_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Webhook URL */}
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Webhook URL</label>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-[10px] text-muted-foreground font-mono truncate">
                        {conn.webhookUrl}
                      </code>
                      <button
                        onClick={() => handleCopyUrl(conn.webhookUrl)}
                        className="shrink-0 p-1.5 rounded-lg bg-muted hover:bg-hover text-muted-foreground hover:text-foreground transition-all"
                        title="Copiar URL"
                      >
                        {copiedUrl === conn.webhookUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Disconnect button */}
                  <button
                    onClick={() => setDisconnectConfirm(integration.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 transition-all w-full justify-center"
                  >
                    <Trash2 size={12} /> Desconectar integração
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Webhook log */}
      {webhookLog.length > 0 && (
        <div className="card border border-border">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} className="text-[#0d4af5]" />
            <h2 className="text-sm font-semibold text-foreground">Webhook Log</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">Últimos {Math.min(webhookLog.length, 10)} eventos</span>
          </div>

          <div className="space-y-2">
            {webhookLog.slice(0, 10).map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-all">
                <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${event.status === "success" ? "bg-emerald-400" : "bg-red-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-foreground font-medium">{event.message}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      event.status === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {event.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{event.integrationName}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{formatRelative(event.timestamp)}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{event.details}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connect Modal */}
      {connectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#16161D] border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl">
                  {connectModal.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{connectModal.name}</h3>
                  <p className="text-[10px] text-muted-foreground">{connectModal.description}</p>
                </div>
              </div>
              <button
                onClick={() => { setConnectModal(null); setConnectLoading(false); }}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                  <Shield size={12} className="text-[#0d4af5]" />
                  Permissões necessárias
                </h4>
                <ul className="space-y-1.5">
                  {connectModal.permissions.map((perm, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Eye size={11} className="mt-0.5 shrink-0 text-zinc-600" />
                      {perm}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 border border-border">
                <p className="text-[10px] text-muted-foreground">
                  Ao autorizar, o Lone OS terá acesso de leitura e escrita conforme as permissões listadas acima.
                  Você pode revogar o acesso a qualquer momento.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-5 pt-0">
              <button
                onClick={() => { setConnectModal(null); setConnectLoading(false); }}
                disabled={connectLoading}
                className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:text-foreground hover:bg-hover transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleAuthorize}
                disabled={connectLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0d4af5] text-white text-xs font-medium hover:bg-[#0d4af5]/80 transition-all disabled:opacity-70"
              >
                {connectLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Autorizando...
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    Autorizar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {disconnectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#16161D] border border-border rounded-2xl w-full max-w-sm mx-4 shadow-2xl animate-slide-up p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Desconectar integração?</h3>
                <p className="text-[10px] text-muted-foreground">
                  {INTEGRATIONS.find((i) => i.id === disconnectConfirm)?.name ?? disconnectConfirm}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A sincronização será interrompida e os webhooks deixarão de funcionar.
              Você pode reconectar a qualquer momento.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDisconnectConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:text-foreground hover:bg-hover transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDisconnect(disconnectConfirm)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 transition-all"
              >
                <Trash2 size={12} /> Desconectar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
