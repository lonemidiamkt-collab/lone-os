"use client";

import { useState } from "react";
import {
  Zap, Plus, Trash2, X, Save, Power, PowerOff, Settings2,
  Bell, UserPlus, RefreshCw, MessageSquare,
  AlertTriangle, Clock, FileCheck, Wallet, Users,
  ChevronDown, Activity, ShieldAlert, CreditCard,
  ChevronRight, Milestone,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import type { AutomationTrigger, AutomationAction, AutomationRule } from "@/lib/types";

// ─── Business-friendly trigger labels ───────────────────────────────────────
const TRIGGER_CONFIG: Record<AutomationTrigger, { label: string; icon: typeof Bell; description: string }> = {
  client_status_change: { label: "Risco de Cliente", icon: ShieldAlert, description: "Quando um cliente entra em risco de churn ou inadimplencia" },
  task_overdue: { label: "Tarefa Vencida", icon: Clock, description: "Quando uma tarefa passa do prazo de entrega" },
  content_approval_pending: { label: "Aprovacao Parada", icon: FileCheck, description: "Conteudo aguardando aprovacao alem do SLA" },
  budget_threshold: { label: "Limite de Verba", icon: Wallet, description: "Investimento atinge percentual critico do orcamento" },
  onboarding_stalled: { label: "SLA de Onboarding", icon: Milestone, description: "Fases do onboarding ultrapassam limites de tempo" },
};

const STATUS_OPTIONS = [
  { value: "at_risk", label: "Risco de Churn (Cancelamento)" },
  { value: "at_risk_financial", label: "Risco Financeiro (Inadimplencia)" },
  { value: "average", label: "Resultado Medio (Atencao)" },
  { value: "onboarding", label: "Em Onboarding" },
];

const ACTION_CONFIG: Record<AutomationAction, { label: string; icon: typeof Bell }> = {
  send_notification: { label: "Enviar Notificacao", icon: Bell },
  assign_task: { label: "Criar Tarefa", icon: UserPlus },
  change_status: { label: "Mudar Status", icon: RefreshCw },
  send_chat_message: { label: "Enviar Mensagem", icon: MessageSquare },
};

const TARGET_OPTIONS = [
  { value: "manager", label: "Gerente" },
  { value: "cs,manager", label: "CS + Gerente" },
  { value: "assignee", label: "Responsavel" },
  { value: "traffic", label: "Time de Trafego" },
  { value: "social", label: "Time Social" },
  { value: "all", label: "Todos" },
];

// ─── Onboarding SLA phases ──────────────────────────────────────────────────
const ONBOARDING_PHASES = [
  { id: "phase1", label: "Fase 1: Assinatura e Setup", description: "Contrato assinado, acesso criado", defaultHours: "24", icon: "📋" },
  { id: "phase2", label: "Fase 2: Coleta de Dados", description: "Acessos de redes sociais, Drive, briefing", defaultHours: "72", icon: "📁" },
  { id: "phase3", label: "Fase 3: Kickoff Operacional", description: "Primeira estrategia, primeiros posts", defaultHours: "168", icon: "🚀" },
];

// ─── Helper to format trigger params for display ────────────────────────────
function formatTriggerParams(rule: AutomationRule): string {
  switch (rule.trigger) {
    case "client_status_change":
      return STATUS_OPTIONS.find((s) => s.value === rule.triggerConfig.status)?.label || rule.triggerConfig.status || "";
    case "task_overdue":
      return "Prazo excedido";
    case "content_approval_pending": {
      const h = rule.triggerConfig.hours || "48";
      return `SLA: ${h}h sem aprovacao`;
    }
    case "budget_threshold":
      return `Limite: ${rule.triggerConfig.percent || "90"}%`;
    case "onboarding_stalled": {
      const phases = [];
      if (rule.triggerConfig.phase1) phases.push(`F1: ${rule.triggerConfig.phase1}h`);
      if (rule.triggerConfig.phase2) phases.push(`F2: ${rule.triggerConfig.phase2}h`);
      if (rule.triggerConfig.phase3) phases.push(`F3: ${rule.triggerConfig.phase3}h`);
      return phases.length > 0 ? phases.join(" · ") : `${rule.triggerConfig.days || "7"} dias`;
    }
    default:
      return "";
  }
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function AutomationsPage() {
  const { automationRules, addAutomationRule, updateAutomationRule, toggleAutomationRule, deleteAutomationRule } = useAppState();

  const [showCreate, setShowCreate] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form state (shared between create and edit)
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>("client_status_change");
  const [action, setAction] = useState<AutomationAction>("send_notification");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>({});
  const [actionConfig, setActionConfig] = useState<Record<string, string>>({ target: "manager", message: "" });

  const activeCount = automationRules.filter((r) => r.enabled).length;
  const totalTriggers = automationRules.reduce((sum, r) => sum + r.triggerCount, 0);

  const resetForm = () => {
    setName(""); setDescription(""); setTrigger("client_status_change");
    setAction("send_notification"); setTriggerConfig({}); setActionConfig({ target: "manager", message: "" });
  };

  const openCreate = () => { resetForm(); setEditingRule(null); setShowCreate(true); };

  const openEdit = (rule: AutomationRule) => {
    setName(rule.name); setDescription(rule.description); setTrigger(rule.trigger);
    setAction(rule.action); setTriggerConfig({ ...rule.triggerConfig }); setActionConfig({ ...rule.actionConfig });
    setEditingRule(rule); setShowCreate(true);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editingRule) {
      updateAutomationRule(editingRule.id, {
        name: name.trim(), description: description.trim(), trigger, action, triggerConfig, actionConfig,
      });
    } else {
      addAutomationRule({ name: name.trim(), description: description.trim(), trigger, triggerConfig, action, actionConfig, enabled: true });
    }
    resetForm(); setEditingRule(null); setShowCreate(false);
  };

  const handleDelete = (id: string) => { deleteAutomationRule(id); setConfirmDelete(null); };

  // ─── Trigger Config UI ──────────────────────────────────────
  const renderTriggerConfig = () => {
    switch (trigger) {
      case "client_status_change":
        return (
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo de Risco</label>
            <select
              value={triggerConfig.status || "at_risk"}
              onChange={(e) => setTriggerConfig({ status: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none"
            >
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        );

      case "content_approval_pending":
        return (
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA de Aprovacao (horas)</label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={triggerConfig.hours || "48"}
                onChange={(e) => setTriggerConfig({ hours: e.target.value })}
                className="w-24 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none" />
              <span className="text-xs text-muted-foreground">horas sem aprovacao</span>
            </div>
          </div>
        );

      case "budget_threshold":
        return (
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Percentual Critico (%)</label>
            <div className="flex items-center gap-2">
              <input type="number" min="50" max="100" value={triggerConfig.percent || "90"}
                onChange={(e) => setTriggerConfig({ percent: e.target.value })}
                className="w-24 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none" />
              <span className="text-xs text-muted-foreground">% do orcamento mensal</span>
            </div>
          </div>
        );

      case "onboarding_stalled":
        return (
          <div className="space-y-3">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA por Fase do Onboarding</label>
            {ONBOARDING_PHASES.map((phase) => (
              <div key={phase.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a]">
                <span className="text-lg shrink-0">{phase.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{phase.label}</p>
                  <p className="text-[9px] text-zinc-600">{phase.description}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input type="number" min="1"
                    value={triggerConfig[phase.id] || phase.defaultHours}
                    onChange={(e) => setTriggerConfig((prev) => ({ ...prev, [phase.id]: e.target.value }))}
                    className="w-16 bg-black border border-[#1a1a1a] rounded-lg px-2 py-1.5 text-xs text-foreground text-center focus:border-[#0d4af5]/50 outline-none" />
                  <span className="text-[10px] text-zinc-600">h</span>
                </div>
              </div>
            ))}
            <p className="text-[9px] text-zinc-600 px-1">
              Notificacao enviada ao CS + Manager quando qualquer fase ultrapassar o limite.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-3">
            <Zap size={22} className="text-[#0d4af5]" />
            Automacoes & SLAs
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Regras de negocio automaticas com SLAs editaveis
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0d4af5] text-white text-sm font-medium hover:bg-[#0c3cff] transition-all">
          <Plus size={16} /> Nova Regra
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: automationRules.length, label: "Total de regras", icon: Zap, color: "text-[#0d4af5]", bg: "bg-[#0d4af5]/10" },
          { value: activeCount, label: "Regras ativas", icon: Power, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { value: totalTriggers, label: "Vezes disparadas", icon: Activity, color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card flex items-center gap-3 p-4">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <Icon size={18} className={stat.color} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${stat.color} tabular-nums`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity size={14} className="text-[#0d4af5]" />
          Regras Configuradas
        </h2>

        {automationRules.length === 0 ? (
          <div className="card text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900/50 flex items-center justify-center mx-auto mb-4">
              <Zap size={24} strokeWidth={1.2} className="text-zinc-700" />
            </div>
            <p className="text-sm text-zinc-500">Nenhuma regra configurada</p>
            <p className="text-xs text-zinc-700 mt-1">O silencio antes da automacao.</p>
            <button onClick={openCreate} className="mt-4 text-xs text-[#0d4af5] hover:underline">
              Criar primeira regra
            </button>
          </div>
        ) : (
          automationRules.map((rule) => {
            const triggerInfo = TRIGGER_CONFIG[rule.trigger];
            const actionInfo = ACTION_CONFIG[rule.action];
            const TriggerIcon = triggerInfo?.icon ?? Zap;
            const ActionIcon = actionInfo?.icon ?? Bell;
            const params = formatTriggerParams(rule);

            return (
              <div key={rule.id}
                className={`card p-4 transition-all ${rule.enabled ? "" : "opacity-50"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      rule.enabled ? "bg-[#0d4af5]/10" : "bg-zinc-900"
                    }`}>
                      <TriggerIcon size={18} className={rule.enabled ? "text-[#0d4af5]" : "text-zinc-600"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground text-sm">{rule.name}</h3>
                        {rule.enabled ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Ativa</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">Inativa</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>

                      {/* Params display */}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <TriggerIcon size={10} className="text-zinc-600" />
                          <span className="text-muted-foreground">Gatilho:</span>
                          <span className="text-foreground font-medium">{triggerInfo?.label ?? rule.trigger}</span>
                        </div>
                        {params && (
                          <>
                            <ChevronRight size={10} className="text-zinc-800" />
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#0d4af5]/5 text-[#3b6ff5] border border-[#0d4af5]/10 font-medium">
                              {params}
                            </span>
                          </>
                        )}
                        <ChevronRight size={10} className="text-zinc-800" />
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <ActionIcon size={10} className="text-zinc-600" />
                          <span className="text-foreground">{actionInfo?.label ?? rule.action}</span>
                        </div>
                        {rule.triggerCount > 0 && (
                          <>
                            <div className="h-3 w-px bg-zinc-800" />
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {rule.triggerCount}x disparada
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(rule)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-[#0d4af5] hover:bg-[#0d4af5]/10 transition-all"
                      title="Editar parametros">
                      <Settings2 size={14} />
                    </button>
                    <button onClick={() => toggleAutomationRule(rule.id)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        rule.enabled ? "text-emerald-400 hover:bg-emerald-500/10" : "text-zinc-600 hover:bg-zinc-800"
                      }`}
                      title={rule.enabled ? "Desativar" : "Ativar"}>
                      {rule.enabled ? <Power size={15} /> : <PowerOff size={15} />}
                    </button>
                    {confirmDelete === rule.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(rule.id)}
                          className="px-2 py-1 rounded-lg text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">
                          Sim
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 rounded-lg text-[10px] text-zinc-500 hover:text-foreground">
                          Nao
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(rule.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-700 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Excluir">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowCreate(false); setEditingRule(null); }} />
          <div className="relative w-full max-w-lg mx-4 bg-black border border-[#1a1a1a] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[#0d4af5]/30 to-transparent shrink-0" />

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Zap size={18} className="text-[#0d4af5]" />
                    {editingRule ? "Editar Regra" : "Nova Regra"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {editingRule ? "Ajuste os parametros de SLA" : "Configure gatilho, SLA e acao"}
                  </p>
                </div>
                <button onClick={() => { setShowCreate(false); setEditingRule(null); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5">
                  <X size={16} />
                </button>
              </div>

              {/* Name + Description */}
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Nome da Regra</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: SLA de Onboarding (7 Dias)"
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-700 focus:border-[#0d4af5]/50 outline-none transition-all"
                    autoFocus />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Descricao</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="O que essa regra monitora?"
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-700 focus:border-[#0d4af5]/50 outline-none transition-all" />
                </div>
              </div>

              {/* Trigger selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Gatilho</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {(Object.entries(TRIGGER_CONFIG) as [AutomationTrigger, typeof TRIGGER_CONFIG[AutomationTrigger]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const active = trigger === key;
                    return (
                      <button key={key} onClick={() => setTrigger(key)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                          active ? "border-[#0d4af5]/40 bg-[#0d4af5]/[0.05]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"
                        }`}>
                        <Icon size={14} className={active ? "text-[#0d4af5]" : "text-zinc-600"} />
                        <div className="flex-1">
                          <p className={`text-xs font-medium ${active ? "text-foreground" : "text-zinc-500"}`}>{cfg.label}</p>
                          <p className="text-[9px] text-zinc-700">{cfg.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Trigger config (dynamic) */}
              {renderTriggerConfig()}

              {/* Action */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Acao</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.entries(ACTION_CONFIG) as [AutomationAction, typeof ACTION_CONFIG[AutomationAction]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const active = action === key;
                    return (
                      <button key={key} onClick={() => setAction(key)}
                        className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                          active ? "border-[#0d4af5]/40 bg-[#0d4af5]/[0.05]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"
                        }`}>
                        <Icon size={14} className={active ? "text-[#0d4af5]" : "text-zinc-600"} />
                        <p className={`text-xs font-medium ${active ? "text-foreground" : "text-zinc-500"}`}>{cfg.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action config */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Notificar quem</label>
                  <select value={actionConfig.target || "manager"}
                    onChange={(e) => setActionConfig((prev) => ({ ...prev, target: e.target.value }))}
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none">
                    {TARGET_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Mensagem</label>
                  <input value={actionConfig.message || ""} onChange={(e) => setActionConfig((prev) => ({ ...prev, message: e.target.value }))}
                    placeholder="Texto da notificacao"
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-zinc-700 focus:border-[#0d4af5]/50 outline-none" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#1a1a1a] shrink-0">
              <button onClick={() => { setShowCreate(false); setEditingRule(null); }}
                className="px-4 py-2 rounded-xl text-xs text-zinc-500 hover:text-foreground hover:bg-white/5 transition-all">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={!name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0d4af5] text-white text-xs font-medium hover:bg-[#0c3cff] transition-all disabled:opacity-30">
                <Save size={12} /> {editingRule ? "Salvar Alteracoes" : "Criar Regra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
