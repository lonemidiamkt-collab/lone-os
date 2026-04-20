"use client";

import { useState, useEffect, useRef } from "react";
import {
  UserPlus, Building2, Users, Check, Loader2,
  ExternalLink, Phone, Mail, Upload, Camera,
  CreditCard, Eye, EyeOff, Shield, Briefcase, MapPin,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import type { Client, LeadSource } from "@/lib/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";

const INDUSTRIES = [
  "Tecnologia", "Saude", "Imobiliario", "Fitness", "Gastronomia",
  "Educacao", "E-commerce", "Moda", "Beleza", "Juridico",
  "Financeiro", "Construcao", "Varejo", "Servicos", "Outro",
];

type Phase = "pf" | "pj" | "servico";

interface Props {
  onClose: () => void;
  onSuccess: (clientId: string) => void;
}

// ─── File Upload (inline) ──────────────────────────────────
function DocUpload({ label, onUploaded, uploaded }: { label: string; onUploaded: (url: string) => void; uploaded?: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setError("Maximo 10MB."); return; }
    setError(""); setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", `manual-${Date.now()}`);
      fd.append("docType", label.toLowerCase().replace(/\s/g, "_"));
      const res = await fetch("/api/onboarding/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onUploaded(data.url);
    } catch { setError("Falha no envio."); }
    finally { setUploading(false); }
  };

  if (uploaded) {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03]">
        <Check size={12} className="text-emerald-500 shrink-0" />
        <span className="text-xs text-emerald-400 truncate">{label} enviado</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-[#1e1e2a] bg-[#111113] hover:border-[#0d4af5]/30 text-zinc-500 hover:text-white transition-all text-[11px]">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? "Enviando..." : label}
        </button>
        <button type="button" disabled={uploading} onClick={() => {
          const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.capture = "environment";
          input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f); }; input.click();
        }} className="px-3 py-2 rounded-lg border border-dashed border-[#1e1e2a] bg-[#111113] hover:border-[#0d4af5]/30 text-zinc-500 hover:text-white transition-all text-[11px]">
          <Camera size={12} />
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*,.pdf,.heic,.heif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────
export default function NewClientModal({ onClose, onSuccess }: Props) {
  const { addClient, addTask, pushNotification } = useAppState();
  const { role, currentUser } = useRole();
  const team = useTeamMembers();
  const isAdmin = role === "admin" || role === "manager";

  const [phase, setPhase] = useState<Phase>("pf");
  const [error, setError] = useState("");
  const [successState, setSuccessState] = useState(false);
  const [linkGenerated, setLinkGenerated] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  // ─── Form ─────────────────────────────────────
  const [form, setForm] = useState({
    // PF
    contactName: "",
    cpfCnpj: "",
    idade: "",
    phone: "",
    // PJ
    razaoSocial: "",
    nomeFantasia: "",
    cnpj: "",
    endereco: "",
    emailCorporativo: "",
    industry: "Tecnologia",
    leadSource: "indicacao" as LeadSource,
    notes: "",
    // Docs
    docContratoSocial: "",
    docIdentidade: "",
    // Servico
    serviceType: "lone_growth" as import("@/lib/types").ServiceType,
    paymentMethod: "pix" as Client["paymentMethod"],
    assignedTraffic: "",
    assignedSocial: "",
    assignedDesigner: "",
  });

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const SERVICE_OPTIONS = [
    { value: "lone_growth", label: "Lone Growth", icon: "\u{1F680}", desc: "Trafego + Social + Design" },
    { value: "assessoria_trafego", label: "Assessoria de Trafego", icon: "\u{1F3AF}", desc: "Apenas Trafego" },
    { value: "assessoria_social", label: "Assessoria de Social", icon: "\u{1F4F1}", desc: "Apenas Social" },
    { value: "assessoria_design", label: "Assessoria de Design", icon: "\u{1F3A8}", desc: "Apenas Design" },
  ] as const;

  const needsTraffic = form.serviceType === "lone_growth" || form.serviceType === "assessoria_trafego";
  const needsSocial = form.serviceType === "lone_growth" || form.serviceType === "assessoria_social";
  const needsDesigner = form.serviceType === "lone_growth" || form.serviceType === "assessoria_design";

  useEffect(() => {
    if (!team.loading && team.members.length > 0) {
      setForm((prev) => ({
        ...prev,
        assignedTraffic: prev.assignedTraffic || team.forField("assignedTraffic")[0]?.name || "",
        assignedSocial: prev.assignedSocial || team.forField("assignedSocial")[0]?.name || "",
        assignedDesigner: prev.assignedDesigner || team.forField("assignedDesigner")[0]?.name || "",
      }));
    }
  }, [team.loading, team.members]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Quick Link ───────────────────────────────
  const handleGenerateLink = async () => {
    const name = form.nomeFantasia.trim() || form.razaoSocial.trim() || form.contactName.trim();
    if (!name) { setError("Preencha o nome da empresa ou contato."); return; }
    setGeneratingLink(true); setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_link_with_draft", name, contactName: form.contactName.trim(), industry: form.industry, serviceType: form.serviceType }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      if (data.url) {
        const fullUrl = `${window.location.origin}${data.url}`;
        setLinkGenerated(fullUrl);
        navigator.clipboard.writeText(fullUrl).catch(() => {});
        pushNotification("system", "Link de onboarding gerado", `Link para ${name} copiado. Envie ao cliente via WhatsApp.`);
      }
    } catch { setError("Falha ao gerar link."); }
    setGeneratingLink(false);
  };

  // ─── Manual Submit ────────────────────────────
  const handleSubmit = () => {
    const name = form.nomeFantasia.trim() || form.razaoSocial.trim();
    if (!name) { setError("Nome Fantasia ou Razao Social e obrigatorio."); return; }

    const newClient = addClient({
      name,
      industry: form.industry,
      serviceType: form.serviceType,
      contactName: form.contactName.trim() || undefined,
      contactRole: undefined,
      idade: form.idade || undefined,
      razaoSocial: form.razaoSocial.trim() || undefined,
      nomeFantasia: form.nomeFantasia.trim() || undefined,
      cnpj: form.cnpj.trim() || undefined,
      endereco: form.endereco.trim() || undefined,
      emailCorporativo: form.emailCorporativo.trim() || undefined,
      cpfCnpj: form.cpfCnpj.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.emailCorporativo.trim() || undefined,
      monthlyBudget: 0,
      paymentMethod: form.paymentMethod,
      leadSource: form.leadSource,
      assignedTraffic: needsTraffic ? form.assignedTraffic : "",
      assignedSocial: needsSocial ? form.assignedSocial : "",
      assignedDesigner: needsDesigner ? form.assignedDesigner : "",
      notes: form.notes || undefined,
      docContratoSocial: form.docContratoSocial || undefined,
      docIdentidade: form.docIdentidade || undefined,
    });

    // Auto-generate tasks
    const today = new Date().toISOString().slice(0, 10);
    const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    if (needsDesigner && form.assignedDesigner) {
      addTask({ title: `[Setup] Identidade Visual — ${name}`, clientId: newClient.id, clientName: name, assignedTo: form.assignedDesigner, role: "designer", status: "pending", priority: "high", startDate: today, dueDate: weekFromNow });
    }
    if (needsSocial && form.assignedSocial) {
      addTask({ title: `[Setup] Grade Editorial — ${name}`, clientId: newClient.id, clientName: name, assignedTo: form.assignedSocial, role: "social", status: "pending", priority: "high", startDate: today, dueDate: weekFromNow });
    }
    if (needsTraffic && form.assignedTraffic) {
      addTask({ title: `[Setup] Auditoria de Contas — ${name}`, clientId: newClient.id, clientName: name, assignedTo: form.assignedTraffic, role: "traffic", status: "pending", priority: "high", startDate: today, dueDate: weekFromNow });
    }

    pushNotification("system", "Novo cliente", `${name} cadastrado. Tasks de setup criadas.`);
    setSuccessState(true);
    setTimeout(() => onSuccess(newClient.id), 2000);
  };

  // ─── Phases ───────────────────────────────────
  const PHASES: { key: Phase; label: string; icon: typeof UserPlus }[] = [
    { key: "pf", label: "Pessoa Fisica", icon: UserPlus },
    { key: "pj", label: "Empresa", icon: Building2 },
    { key: "servico", label: "Servico & Equipe", icon: Briefcase },
  ];
  const currentIdx = PHASES.findIndex((p) => p.key === phase);
  const goNext = () => { if (currentIdx < PHASES.length - 1) setPhase(PHASES[currentIdx + 1].key); };
  const goPrev = () => { if (currentIdx > 0) setPhase(PHASES[currentIdx - 1].key); };

  // ─── Link Generated State ────────────────────
  if (linkGenerated) {
    return (
      <Dialog open onOpenChange={() => { setLinkGenerated(null); onClose(); }}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center justify-center py-10 gap-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-[#0d4af5]/15 flex items-center justify-center">
              <ExternalLink size={28} className="text-[#0d4af5]" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Link gerado!</h2>
            <p className="text-sm text-muted-foreground text-center">Envie para o cliente preencher dados e documentos.</p>
            <div className="w-full bg-[#111113] border border-[#1e1e2a] rounded-lg px-4 py-3 flex items-center gap-2">
              <input type="text" value={linkGenerated} readOnly className="flex-1 bg-transparent text-xs text-zinc-300 outline-none truncate" onClick={(e) => (e.target as HTMLInputElement).select()} />
              <button onClick={() => navigator.clipboard.writeText(linkGenerated)} className="text-xs text-[#0d4af5] hover:text-white transition-colors shrink-0 font-medium">Copiar</button>
            </div>
            <div className="flex gap-2 w-full mt-2">
              <Button variant="ghost" onClick={() => { setLinkGenerated(null); onClose(); }} className="flex-1">Fechar</Button>
              <Button onClick={() => { setLinkGenerated(null); onClose(); window.location.href = "/clients"; }} className="flex-1">Ver Clientes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Success State ───────────────────────────
  if (successState) {
    return (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center justify-center py-12 gap-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center"><Check size={32} className="text-emerald-500" /></div>
            <h2 className="text-lg font-semibold text-foreground">Cliente cadastrado!</h2>
            <p className="text-sm text-muted-foreground text-center">Preparando workspace e checklist de onboarding...</p>
            <div className="flex items-center gap-2 mt-2"><Loader2 size={14} className="text-[#0d4af5] animate-spin" /><span className="text-xs text-muted-foreground">Redirecionando...</span></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Main Render ─────────────────────────────
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0d4af5]/15 flex items-center justify-center"><UserPlus size={18} className="text-[#0d4af5]" /></div>
            <div>
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>Cadastro em 3 fases + onboarding automatico</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Phase stepper */}
        <div className="flex items-center gap-2">
          {PHASES.map((p, i) => (
            <div key={p.key} className="flex items-center gap-2 flex-1">
              <button onClick={() => setPhase(p.key)} className={`flex items-center gap-1.5 text-[11px] font-medium transition-all ${currentIdx > i ? "text-emerald-400" : currentIdx === i ? "text-foreground" : "text-zinc-600"}`}>
                <p.icon size={12} /> {p.label}
              </button>
              {i < PHASES.length - 1 && <div className={`flex-1 h-px ${currentIdx > i ? "bg-emerald-500/30" : "bg-zinc-800"}`} />}
            </div>
          ))}
        </div>

        <div className="space-y-4 py-1 min-h-[300px]">
          {error && <p className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2.5">{error}</p>}

          {/* ═══ FASE 1: PESSOA FISICA ═══ */}
          {phase === "pf" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Shield size={10} className="text-[#0d4af5]" /> Dados do Responsavel (PF)</p>

              <div className="space-y-1.5">
                <Label>Nome da Empresa <span className="text-muted-foreground font-normal">(para o link)</span></Label>
                <Input value={form.nomeFantasia} onChange={(e) => { set("nomeFantasia", e.target.value); setError(""); }}
                  placeholder="Ex: Contele Energia Solar" />
              </div>

              {/* Quick Link button */}
              {(form.nomeFantasia.trim().length >= 2 || form.contactName.trim().length >= 2) && (
                <button type="button" onClick={handleGenerateLink} disabled={generatingLink}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-[#0d4af5]/20 bg-[#0d4af5]/[0.03] hover:bg-[#0d4af5]/[0.06] hover:border-[#0d4af5]/40 transition-all text-left group">
                  <div className="w-8 h-8 rounded-lg bg-[#0d4af5]/10 flex items-center justify-center shrink-0">
                    {generatingLink ? <Loader2 size={14} className="text-[#0d4af5] animate-spin" /> : <ExternalLink size={14} className="text-[#0d4af5]" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-[#3b6ff5] font-medium group-hover:text-white transition-colors">Gerar Link para Cliente Preencher</p>
                    <p className="text-[9px] text-zinc-600">Cria rascunho + link de onboarding externo</p>
                  </div>
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome Completo <span className="text-destructive">*</span></Label>
                  <Input value={form.contactName} onChange={(e) => { set("contactName", e.target.value); setError(""); }} placeholder="Ex: Joao da Silva" />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF</Label>
                  <Input value={form.cpfCnpj} onChange={(e) => set("cpfCnpj", e.target.value)} placeholder="000.000.000-00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Phone size={10} /> WhatsApp</Label>
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" />
                </div>
                <div className="space-y-1.5">
                  <Label>Idade</Label>
                  <Input value={form.idade} onChange={(e) => set("idade", e.target.value)} placeholder="Ex: 35" />
                </div>
              </div>
            </div>
          )}

          {/* ═══ FASE 2: EMPRESA (PJ) ═══ */}
          {phase === "pj" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Building2 size={10} className="text-[#0d4af5]" /> Dados Empresariais (PJ)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Razao Social</Label>
                  <Input value={form.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} placeholder="Ex: Empresa X Ltda" />
                </div>
                <div className="space-y-1.5">
                  <Label>Nome Fantasia <span className="text-destructive">*</span></Label>
                  <Input value={form.nomeFantasia} onChange={(e) => { set("nomeFantasia", e.target.value); setError(""); }} placeholder="Ex: Empresa X" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>CNPJ</Label>
                  <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Segmento</Label>
                  <Select value={form.industry} onValueChange={(v) => set("industry", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><MapPin size={10} /> Endereco</Label>
                <Input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Rua, numero, bairro, cidade - UF" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Mail size={10} /> E-mail Corporativo</Label>
                  <Input type="email" value={form.emailCorporativo} onChange={(e) => set("emailCorporativo", e.target.value)} placeholder="contato@empresa.com" />
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

              {/* Document upload */}
              <div className="pt-2 border-t border-white/[0.04] space-y-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Documentos (opcional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <DocUpload label="Contrato Social" onUploaded={(url) => set("docContratoSocial", url)} uploaded={form.docContratoSocial} />
                  <DocUpload label="RG ou CNH" onUploaded={(url) => set("docIdentidade", url)} uploaded={form.docIdentidade} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Observacoes <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Contexto, expectativas..." />
              </div>
            </div>
          )}

          {/* ═══ FASE 3: SERVICO & EQUIPE ═══ */}
          {phase === "servico" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Briefcase size={10} className="text-[#0d4af5]" /> Servico Contratado & Equipe</p>

              <div className="grid grid-cols-2 gap-2">
                {SERVICE_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => set("serviceType", opt.value)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                      form.serviceType === opt.value ? "border-[#0d4af5]/50 bg-[#0d4af5]/[0.06]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                    }`}>
                    <span className="text-base">{opt.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium ${form.serviceType === opt.value ? "text-white" : "text-zinc-400"}`}>{opt.label}</p>
                      <p className="text-[9px] text-zinc-600 truncate">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><CreditCard size={10} /> Pagamento</Label>
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
              </div>

              <p className="text-[10px] text-zinc-500 uppercase tracking-wider pt-2">Equipe Responsavel</p>
              <div className="space-y-3">
                {([
                  { key: "assignedTraffic" as const, label: "Gestor de Trafego", members: team.forField("assignedTraffic"), show: needsTraffic },
                  { key: "assignedSocial" as const, label: "Social Media", members: team.forField("assignedSocial"), show: needsSocial },
                  { key: "assignedDesigner" as const, label: "Designer", members: team.forField("assignedDesigner"), show: needsDesigner },
                ]).filter((f) => f.show).map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Users size={12} /> {field.label}</Label>
                    <Select value={form[field.key]} onValueChange={(v) => set(field.key, v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{field.members.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <div>{currentIdx > 0 && <Button variant="ghost" onClick={goPrev} className="text-xs">Anterior</Button>}</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            {currentIdx < PHASES.length - 1 ? (
              <Button onClick={goNext}>Proximo</Button>
            ) : (
              <Button onClick={handleSubmit} className="flex items-center gap-2"><Check size={14} /> Cadastrar Cliente</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
