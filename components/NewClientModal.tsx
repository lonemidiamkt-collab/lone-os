"use client";

import { useState, useEffect } from "react";
import {
  UserPlus, Building2, Users, Facebook, Link2, ChevronDown, Check, Loader2,
  Unlink, ExternalLink, FolderOpen, Lock, Phone, Mail, Calendar,
  CreditCard, Eye, EyeOff, Shield,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { useMetaConnection, fetchAdAccounts } from "@/lib/meta/useMetaAds";
import type { Client, LeadSource } from "@/lib/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TEAM_MEMBERS = {
  traffic: ["Julio"],
  social: ["Carlos Augusto", "Pedro Henrique"],
  designer: ["Rodrigo"],
};

const INDUSTRIES = [
  "Tecnologia", "Saude", "Imobiliario", "Fitness", "Gastronomia",
  "Educacao", "E-commerce", "Moda", "Beleza", "Juridico",
  "Financeiro", "Construcao", "Varejo", "Servicos", "Outro",
];

type Section = "dados" | "equipe" | "cofre" | "meta";

interface Props {
  onClose: () => void;
  onSuccess: (clientId: string) => void;
}

export default function NewClientModal({ onClose, onSuccess }: Props) {
  const { addClient, addTask, pushNotification } = useAppState();
  const { role, currentUser } = useRole();
  const meta = useMetaConnection();
  const isAdmin = role === "admin" || role === "manager";

  const [activeSection, setActiveSection] = useState<Section>("dados");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    // Basic
    name: "",
    industry: "Tecnologia",
    paymentMethod: "pix" as Client["paymentMethod"],
    leadSource: "indicacao" as LeadSource,
    notes: "",
    // Personal (admin only)
    cpfCnpj: "",
    birthDate: "",
    phone: "",
    email: "",
    // Team
    assignedTraffic: TEAM_MEMBERS.traffic[0],
    assignedSocial: TEAM_MEMBERS.social[0],
    assignedDesigner: TEAM_MEMBERS.designer[0],
    // Access vault
    driveLink: "",
    facebookLogin: "",
    facebookPassword: "",
    googleAdsLogin: "",
    googleAdsPassword: "",
    instagramLogin: "",
    instagramPassword: "",
  });

  // Meta ad accounts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedAdAccount, setSelectedAdAccount] = useState<any>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");

  useEffect(() => {
    if (meta.connected && meta.token) {
      setLoadingAccounts(true);
      fetchAdAccounts(meta.token)
        .then((accounts: any[]) => setAdAccounts(accounts ?? []))
        .catch(() => setAdAccounts([]))
        .finally(() => setLoadingAccounts(false));
    }
  }, [meta.connected, meta.token]);

  const filteredAccounts = accountSearch
    ? adAccounts.filter((a) => a.name?.toLowerCase().includes(accountSearch.toLowerCase()) || a.account_id?.includes(accountSearch))
    : adAccounts;

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    if (!form.name.trim()) { setError("Nome do cliente e obrigatorio."); return; }

    const newClient = addClient({
      name: form.name.trim(),
      industry: form.industry,
      monthlyBudget: 0,
      paymentMethod: form.paymentMethod,
      assignedTraffic: form.assignedTraffic,
      assignedSocial: form.assignedSocial,
      assignedDesigner: form.assignedDesigner,
      driveLink: form.driveLink || undefined,
      notes: form.notes || undefined,
      metaAdAccountId: selectedAdAccount?.id,
      metaAdAccountName: selectedAdAccount?.name,
      // New fields
      leadSource: form.leadSource,
      cpfCnpj: form.cpfCnpj || undefined,
      birthDate: form.birthDate || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      facebookLogin: form.facebookLogin || undefined,
      facebookPassword: form.facebookPassword || undefined,
      googleAdsLogin: form.googleAdsLogin || undefined,
      googleAdsPassword: form.googleAdsPassword || undefined,
      instagramLogin: form.instagramLogin || undefined,
      instagramPassword: form.instagramPassword || undefined,
    });

    // Auto-generate setup tasks for the assigned team
    const today = new Date().toISOString().slice(0, 10);
    const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    if (form.assignedDesigner && form.assignedDesigner !== "(Nenhum)") {
      addTask({
        title: `[Setup] Estudo de Identidade Visual — ${form.name.trim()}`,
        clientId: newClient.id,
        clientName: newClient.name,
        assignedTo: form.assignedDesigner,
        role: "designer",
        status: "pending",
        priority: "high",
        startDate: today,
        dueDate: weekFromNow,
        description: "Organizar assets, estudar paleta de cores, fontes e estilo visual do cliente. Preparar pasta Drive com materiais.",
      });
    }

    if (form.assignedSocial && form.assignedSocial !== "(Nenhum)") {
      addTask({
        title: `[Setup] Planejamento de Grade Editorial — ${form.name.trim()}`,
        clientId: newClient.id,
        clientName: newClient.name,
        assignedTo: form.assignedSocial,
        role: "social",
        status: "pending",
        priority: "high",
        startDate: today,
        dueDate: weekFromNow,
        description: "Definir linha de conteudo, tom de voz, frequencia de posts e primeiros temas do calendario editorial.",
      });
    }

    if (form.assignedTraffic && form.assignedTraffic !== "(Nenhum)") {
      addTask({
        title: `[Setup] Auditoria de Contas e Pixel — ${form.name.trim()}`,
        clientId: newClient.id,
        clientName: newClient.name,
        assignedTo: form.assignedTraffic,
        role: "traffic",
        status: "pending",
        priority: "high",
        startDate: today,
        dueDate: weekFromNow,
        description: "Auditar contas de anuncio (Meta/Google), verificar pixel, configurar conversoes e definir estrategia inicial.",
      });
    }

    // Notify team
    pushNotification("system", "Novo cliente na base", `${form.name.trim()} foi cadastrado. Tasks de setup criadas para a equipe.`);

    onSuccess(newClient.id);
  };

  const SECTIONS: { key: Section; label: string; step: number; icon: typeof UserPlus }[] = [
    { key: "dados", label: "Identificacao", step: 1, icon: UserPlus },
    { key: "equipe", label: "Equipe", step: 2, icon: Users },
    { key: "cofre", label: "Acessos", step: 3, icon: Lock },
    { key: "meta", label: "Anuncios", step: 4, icon: Facebook },
  ];
  const currentStep = SECTIONS.findIndex((s) => s.key === activeSection) + 1;
  const canGoNext = activeSection !== "meta";
  const canGoPrev = activeSection !== "dados";
  const goNext = () => {
    const idx = SECTIONS.findIndex((s) => s.key === activeSection);
    if (idx < SECTIONS.length - 1) setActiveSection(SECTIONS[idx + 1].key);
  };
  const goPrev = () => {
    const idx = SECTIONS.findIndex((s) => s.key === activeSection);
    if (idx > 0) setActiveSection(SECTIONS[idx - 1].key);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0d4af5]/15 flex items-center justify-center">
              <UserPlus size={18} className="text-[#0d4af5]" />
            </div>
            <div>
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>Cadastro completo + onboarding automatico</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Stepper progress */}
        <div className="flex items-center gap-2">
          {SECTIONS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 flex-1">
              <button
                onClick={() => setActiveSection(s.key)}
                className={`flex items-center gap-1.5 text-[11px] font-medium transition-all ${
                  currentStep > s.step
                    ? "text-emerald-400"
                    : currentStep === s.step
                    ? "text-foreground"
                    : "text-zinc-600"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                  currentStep > s.step
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : currentStep === s.step
                    ? "bg-[#0d4af5]/15 border-[#0d4af5]/30 text-[#0d4af5]"
                    : "border-zinc-800 text-zinc-600"
                }`}>
                  {currentStep > s.step ? "✓" : s.step}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < SECTIONS.length - 1 && (
                <div className={`flex-1 h-px ${currentStep > s.step ? "bg-emerald-500/30" : "bg-zinc-800"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-4 py-1 min-h-[280px]">
          {error && (
            <p className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2.5">{error}</p>
          )}

          {/* ═══ SECTION: DADOS ═══ */}
          {activeSection === "dados" && (
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-1.5">
                <Label>Nome do Cliente <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={(e) => { set("name", e.target.value); setError(""); }}
                  placeholder="Ex: TechStart Solucoes Ltda" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Building2 size={12} /> Segmento</Label>
                  <Select value={form.industry} onValueChange={(v) => set("industry", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Como conheceu?</Label>
                  <Select value={form.leadSource} onValueChange={(v) => set("leadSource", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="indicacao">Indicacao</SelectItem>
                      <SelectItem value="trafego">Trafego Pago</SelectItem>
                      <SelectItem value="organico">Organico</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><CreditCard size={12} /> Pagamento Anuncios</Label>
                  <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">Pix</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="cartao">Cartao</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><FolderOpen size={12} /> Pasta Drive</Label>
                  <Input value={form.driveLink} onChange={(e) => set("driveLink", e.target.value)}
                    placeholder="https://drive.google.com/..." type="url" />
                </div>
              </div>

              {/* Personal data — admin only */}
              {isAdmin && (
                <div className="space-y-3 pt-2 border-t border-white/[0.04]">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield size={10} className="text-[#0d4af5]" /> Dados Pessoais (visivel apenas para ADM)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>CPF / CNPJ</Label>
                      <Input value={form.cpfCnpj} onChange={(e) => set("cpfCnpj", e.target.value)} placeholder="000.000.000-00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1"><Calendar size={10} /> Data de Nascimento</Label>
                      <Input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1"><Phone size={10} /> WhatsApp</Label>
                      <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1"><Mail size={10} /> Gmail de Contato</Label>
                      <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@gmail.com" />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Observacoes <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
                  placeholder="Contexto inicial, expectativas..." />
              </div>
            </div>
          )}

          {/* ═══ SECTION: EQUIPE ═══ */}
          {activeSection === "equipe" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-xs text-zinc-500">Defina os responsaveis por este cliente em cada area.</p>
              {([
                { key: "assignedTraffic", label: "Gestor de Trafego", members: TEAM_MEMBERS.traffic },
                { key: "assignedSocial", label: "Social Media", members: TEAM_MEMBERS.social },
                { key: "assignedDesigner", label: "Designer", members: TEAM_MEMBERS.designer },
              ] as const).map((team) => (
                <div key={team.key} className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Users size={12} /> {team.label}</Label>
                  <Select value={form[team.key]} onValueChange={(v) => set(team.key, v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {team.members.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {/* ═══ SECTION: COFRE DE ACESSOS ═══ */}
          {activeSection === "cofre" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <Lock size={10} className="text-[#0d4af5]" /> Logins e senhas das plataformas
                </p>
                <button onClick={() => setShowPasswords(!showPasswords)}
                  className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-foreground transition-all">
                  {showPasswords ? <EyeOff size={10} /> : <Eye size={10} />}
                  {showPasswords ? "Ocultar" : "Mostrar"} senhas
                </button>
              </div>

              {([
                { platform: "Facebook / Meta", loginKey: "facebookLogin", passKey: "facebookPassword", icon: "📘" },
                { platform: "Google Ads", loginKey: "googleAdsLogin", passKey: "googleAdsPassword", icon: "🔍" },
                { platform: "Instagram", loginKey: "instagramLogin", passKey: "instagramPassword", icon: "📸" },
              ] as const).map((p) => (
                <div key={p.platform} className="p-3 rounded-xl border border-white/[0.04] bg-white/[0.02] space-y-2">
                  <p className="text-xs font-medium text-foreground flex items-center gap-2">
                    <span>{p.icon}</span> {p.platform}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={form[p.loginKey]} onChange={(e) => set(p.loginKey, e.target.value)}
                      placeholder="Login / Email" className="text-xs" />
                    <div className="relative">
                      <Input
                        type={showPasswords ? "text" : "password"}
                        value={form[p.passKey]}
                        onChange={(e) => set(p.passKey, e.target.value)}
                        placeholder="Senha"
                        className="text-xs pr-8"
                      />
                      <Lock size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-700" />
                    </div>
                  </div>
                </div>
              ))}

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><FolderOpen size={12} /> Instagram @usuario</Label>
                <Input value={form.instagramLogin} onChange={(e) => set("instagramLogin", e.target.value)}
                  placeholder="@usuario_do_cliente" />
              </div>
            </div>
          )}

          {/* ═══ SECTION: META ADS ═══ */}
          {activeSection === "meta" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-xs text-zinc-500">Vincule a conta de anuncios do Meta Ads para acompanhamento.</p>

              {!meta.connected ? (
                <button type="button" onClick={meta.connect}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-dashed border-white/[0.06] bg-white/[0.02] hover:border-[#0d4af5]/30 transition-all text-left group">
                  <div className="w-9 h-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                    <Facebook size={16} className="text-[#1877F2]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-zinc-400 font-medium group-hover:text-white transition-colors">Conectar ao Facebook</p>
                    <p className="text-[10px] text-zinc-700">Vincule para acessar as campanhas</p>
                  </div>
                  <ExternalLink size={14} className="text-zinc-700 group-hover:text-[#0d4af5] transition-colors" />
                </button>
              ) : selectedAdAccount ? (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-[#0d4af5]/20 bg-[#0d4af5]/[0.03]">
                  <div className="w-9 h-9 rounded-lg bg-[#0d4af5]/10 border border-[#0d4af5]/20 flex items-center justify-center shrink-0">
                    <Link2 size={16} className="text-[#0d4af5]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{selectedAdAccount.name}</p>
                    <p className="text-[10px] text-zinc-500">ID: {selectedAdAccount.account_id}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedAdAccount(null)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                    title="Desvincular">
                    <Unlink size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <button type="button" onClick={() => setShowAccountPicker(!showAccountPicker)}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border bg-white/[0.02] text-left transition-all ${
                      showAccountPicker ? "border-[#0d4af5]" : "border-white/[0.06] hover:border-white/[0.1]"
                    }`}>
                    <div className="w-9 h-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                      {loadingAccounts ? <Loader2 size={16} className="text-[#1877F2] animate-spin" /> : <Facebook size={16} className="text-[#1877F2]" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-zinc-500">{loadingAccounts ? "Carregando..." : "Selecionar conta"}</p>
                      <p className="text-[10px] text-zinc-700">{adAccounts.length} conta(s)</p>
                    </div>
                    <ChevronDown size={16} className={`text-zinc-600 transition-transform ${showAccountPicker ? "rotate-180" : ""}`} />
                  </button>
                  {showAccountPicker && adAccounts.length > 0 && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-[#0a0a0e] border border-white/[0.06] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] z-50 animate-fade-in overflow-hidden">
                      {adAccounts.length > 5 && (
                        <div className="p-2 border-b border-white/[0.04]">
                          <input type="text" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)}
                            placeholder="Buscar conta..." className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-700 focus:border-[#0d4af5]/50" />
                        </div>
                      )}
                      <div className="max-h-52 overflow-y-auto py-1">
                        {filteredAccounts.map((account) => (
                          <button key={account.id} type="button" onClick={() => { setSelectedAdAccount(account); setShowAccountPicker(false); setAccountSearch(""); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-[#0d4af5]/5">
                            <Facebook size={12} className="text-[#1877F2] shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white truncate">{account.name}</p>
                              <p className="text-[10px] text-zinc-600">{account.account_id}</p>
                            </div>
                            {selectedAdAccount?.id === account.id && <Check size={14} className="text-[#0d4af5] shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info banner */}
        <div className="bg-[#0d4af5]/[0.05] border border-[#0d4af5]/[0.1] rounded-lg px-4 py-3 text-xs text-[#0d4af5]">
          Ao salvar, o checklist de onboarding (9 itens) e gerado automaticamente.
          {!isAdmin && " Dados pessoais (CPF, telefone, email) sao visiveis apenas para ADM."}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <div>
            {canGoPrev && (
              <Button variant="ghost" onClick={goPrev} className="text-xs">
                Anterior
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            {canGoNext ? (
              <Button onClick={goNext} className="flex items-center gap-2">
                Proximo
              </Button>
            ) : (
              <Button onClick={handleSubmit} className="flex items-center gap-2">
                <UserPlus size={14} /> Finalizar Onboarding
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
