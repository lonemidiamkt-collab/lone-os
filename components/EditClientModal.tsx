"use client";

import { useState } from "react";
import {
  Pencil, Building2, Users, Instagram, FileText, Facebook,
  Check, Loader2, User, Shield, MapPin, Phone, Mail, CreditCard, Briefcase,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import type { Client } from "@/lib/types";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { useRole } from "@/lib/context/RoleContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const INDUSTRIES = [
  "Tecnologia", "Saude", "Imobiliario", "Fitness", "Gastronomia",
  "Educacao", "E-commerce", "Moda", "Beleza", "Juridico",
  "Financeiro", "Construcao", "Varejo", "Servicos", "Outro",
];

type Tab = "pf" | "pj" | "servico" | "acessos" | "social";

interface Props {
  client: Client;
  onClose: () => void;
}

export default function EditClientModal({ client, onClose }: Props) {
  const { updateClientData } = useAppState();
  const team = useTeamMembers();
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "manager";

  const [tab, setTab] = useState<Tab>("pf");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    // PF
    contactName: client.contactName ?? "",
    cpfCnpj: client.cpfCnpj ?? "",
    idade: client.idade ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    // PJ
    nomeFantasia: client.nomeFantasia ?? client.name ?? "",
    razaoSocial: client.razaoSocial ?? "",
    cnpj: client.cnpj ?? "",
    endereco: client.endereco ?? "",
    emailCorporativo: client.emailCorporativo ?? "",
    industry: client.industry ?? "Outro",
    leadSource: client.leadSource ?? "indicacao",
    notes: client.notes ?? "",
    // Servico
    serviceType: client.serviceType ?? "lone_growth",
    paymentMethod: client.paymentMethod ?? "pix",
    assignedTraffic: client.assignedTraffic ?? "",
    assignedSocial: client.assignedSocial ?? "",
    assignedDesigner: client.assignedDesigner ?? "",
    // Acessos (cofre)
    facebookLogin: client.facebookLogin ?? "",
    facebookPassword: client.facebookPassword ?? "",
    googleAdsLogin: client.googleAdsLogin ?? "",
    googleAdsPassword: client.googleAdsPassword ?? "",
    instagramLogin: client.instagramLogin ?? "",
    instagramPassword: client.instagramPassword ?? "",
    // Social dossier
    instagramUser: client.instagramUser ?? "",
    toneOfVoice: client.toneOfVoice ?? "",
    driveLink: client.driveLink ?? "",
    postsGoal: String(client.postsGoal ?? 12),
    contractEnd: client.contractEnd ?? "",
    campaignBriefing: client.campaignBriefing ?? "",
    fixedBriefing: client.fixedBriefing ?? "",
  });

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const needsTraffic = form.serviceType === "lone_growth" || form.serviceType === "assessoria_trafego";
  const needsSocial = form.serviceType === "lone_growth" || form.serviceType === "assessoria_social";
  const needsDesigner = form.serviceType === "lone_growth" || form.serviceType === "assessoria_design";

  const handleSave = () => {
    setSaving(true);
    const name = form.nomeFantasia.trim() || form.razaoSocial.trim() || client.name;
    updateClientData(client.id, {
      name,
      nomeFantasia: form.nomeFantasia.trim() || undefined,
      razaoSocial: form.razaoSocial.trim() || undefined,
      cnpj: form.cnpj.trim() || undefined,
      endereco: form.endereco.trim() || undefined,
      emailCorporativo: form.emailCorporativo.trim() || undefined,
      contactName: form.contactName.trim() || undefined,
      cpfCnpj: form.cpfCnpj.trim() || undefined,
      idade: form.idade.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      industry: form.industry,
      serviceType: form.serviceType as Client["serviceType"],
      paymentMethod: form.paymentMethod as Client["paymentMethod"],
      leadSource: form.leadSource as Client["leadSource"],
      assignedTraffic: needsTraffic ? form.assignedTraffic : "",
      assignedSocial: needsSocial ? form.assignedSocial : "",
      assignedDesigner: needsDesigner ? form.assignedDesigner : "",
      facebookLogin: form.facebookLogin || undefined,
      facebookPassword: form.facebookPassword || undefined,
      googleAdsLogin: form.googleAdsLogin || undefined,
      googleAdsPassword: form.googleAdsPassword || undefined,
      instagramLogin: form.instagramLogin || undefined,
      instagramPassword: form.instagramPassword || undefined,
      instagramUser: form.instagramUser || undefined,
      toneOfVoice: form.toneOfVoice as Client["toneOfVoice"] || undefined,
      driveLink: form.driveLink || undefined,
      postsGoal: parseInt(form.postsGoal) || 12,
      contractEnd: form.contractEnd || undefined,
      campaignBriefing: form.campaignBriefing || undefined,
      fixedBriefing: form.fixedBriefing || undefined,
      notes: form.notes || undefined,
    });
    setTimeout(() => { setSaving(false); onClose(); }, 300);
  };

  const TABS: { key: Tab; label: string; icon: typeof User }[] = [
    { key: "pf", label: "Pessoa Fisica", icon: User },
    { key: "pj", label: "Empresa", icon: Building2 },
    { key: "servico", label: "Servico", icon: Briefcase },
    { key: "acessos", label: "Acessos", icon: Shield },
    { key: "social", label: "Dossie", icon: Instagram },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0d4af5]/15 flex items-center justify-center">
              <Pencil size={16} className="text-[#0d4af5]" />
            </div>
            <div>
              <DialogTitle>Editar Cliente</DialogTitle>
              <DialogDescription>{form.nomeFantasia || client.name}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border pb-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                tab === t.key ? "bg-[#0d4af5]/10 text-[#0d4af5]" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              <t.icon size={12} /> {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-4 py-1 min-h-[250px]">
          {/* ═══ PF ═══ */}
          {tab === "pf" && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Nome Completo</Label><Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Ex: Joao Silva" /></div>
                <div className="space-y-1.5"><Label>CPF</Label><Input value={form.cpfCnpj} onChange={(e) => set("cpfCnpj", e.target.value)} placeholder="000.000.000-00" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="flex items-center gap-1"><Phone size={10} /> WhatsApp</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" /></div>
                <div className="space-y-1.5"><Label className="flex items-center gap-1"><Mail size={10} /> E-mail</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@gmail.com" /></div>
                <div className="space-y-1.5"><Label>Idade</Label><Input value={form.idade} onChange={(e) => set("idade", e.target.value)} placeholder="35" /></div>
              </div>
            </div>
          )}

          {/* ═══ PJ ═══ */}
          {tab === "pj" && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Nome Fantasia</Label><Input value={form.nomeFantasia} onChange={(e) => set("nomeFantasia", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Razao Social</Label><Input value={form.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" /></div>
                <div className="space-y-1.5">
                  <Label>Segmento</Label>
                  <Select value={form.industry} onValueChange={(v) => set("industry", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label className="flex items-center gap-1"><MapPin size={10} /> Endereco</Label><Input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Rua, numero, bairro, cidade" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="flex items-center gap-1"><Mail size={10} /> E-mail Corporativo</Label><Input type="email" value={form.emailCorporativo} onChange={(e) => set("emailCorporativo", e.target.value)} /></div>
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
              <div className="space-y-1.5"><Label>Observacoes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Contexto, expectativas..." /></div>
            </div>
          )}

          {/* ═══ SERVICO ═══ */}
          {tab === "servico" && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "lone_growth", label: "Lone Growth", icon: "\u{1F680}" },
                  { value: "assessoria_trafego", label: "Assessoria Trafego", icon: "\u{1F3AF}" },
                  { value: "assessoria_social", label: "Assessoria Social", icon: "\u{1F4F1}" },
                  { value: "assessoria_design", label: "Assessoria Design", icon: "\u{1F3A8}" },
                ]).map((opt) => (
                  <button key={opt.value} type="button" onClick={() => set("serviceType", opt.value)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all text-xs ${
                      form.serviceType === opt.value ? "border-[#0d4af5]/50 bg-[#0d4af5]/[0.06] text-white" : "border-white/[0.06] text-zinc-500 hover:border-white/[0.12]"
                    }`}>
                    <span>{opt.icon}</span> {opt.label}
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
                <div className="space-y-1.5"><Label>Fim do Contrato</Label><Input type="date" value={form.contractEnd} onChange={(e) => set("contractEnd", e.target.value)} /></div>
              </div>

              <p className="text-[10px] text-zinc-500 uppercase tracking-wider pt-2">Equipe Responsavel</p>
              {needsTraffic && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Users size={10} /> Gestor de Trafego</Label>
                  <Select value={form.assignedTraffic} onValueChange={(v) => set("assignedTraffic", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{team.forField("assignedTraffic").map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {needsSocial && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Users size={10} /> Social Media</Label>
                  <Select value={form.assignedSocial} onValueChange={(v) => set("assignedSocial", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{team.forField("assignedSocial").map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {needsDesigner && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Users size={10} /> Designer</Label>
                  <Select value={form.assignedDesigner} onValueChange={(v) => set("assignedDesigner", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{team.forField("assignedDesigner").map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* ═══ DOSSIE SOCIAL ═══ */}
          {/* ═══ ACESSOS ═══ */}
          {tab === "acessos" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Shield size={10} className="text-[#0d4af5]" /> Cofre de Acessos
              </p>
              {([
                { platform: "Facebook / Meta Ads", icon: "\u{1F4D8}", loginKey: "facebookLogin", passKey: "facebookPassword" },
                { platform: "Instagram", icon: "\u{1F4F7}", loginKey: "instagramLogin", passKey: "instagramPassword" },
                { platform: "Google Ads / Gmail", icon: "\u{1F50D}", loginKey: "googleAdsLogin", passKey: "googleAdsPassword" },
              ] as const).map((acc) => (
                <div key={acc.platform} className="rounded-lg border border-[#1e1e2a] bg-[#0f0f13] p-3 space-y-2">
                  <p className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">{acc.icon} {acc.platform}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={form[acc.loginKey]}
                      onChange={(e) => set(acc.loginKey, e.target.value)}
                      placeholder="Login / Email"
                      className="text-xs"
                    />
                    <Input
                      type="password"
                      value={form[acc.passKey]}
                      onChange={(e) => set(acc.passKey, e.target.value)}
                      placeholder="Senha"
                      className="text-xs"
                    />
                  </div>
                </div>
              ))}
              <p className="text-[9px] text-zinc-600">Senhas sao armazenadas de forma segura no banco de dados.</p>
            </div>
          )}

          {/* ═══ DOSSIE SOCIAL ═══ */}
          {tab === "social" && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="flex items-center gap-1"><Instagram size={10} /> Instagram</Label><Input value={form.instagramUser} onChange={(e) => set("instagramUser", e.target.value)} placeholder="@usuario" /></div>
                <div className="space-y-1.5">
                  <Label>Tom de Voz</Label>
                  <Select value={form.toneOfVoice || "_none"} onValueChange={(v) => set("toneOfVoice", v === "_none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="funny">Engracado</SelectItem>
                      <SelectItem value="authoritative">Autoritario</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="flex items-center gap-1"><FileText size={10} /> Drive / Canva</Label><Input value={form.driveLink} onChange={(e) => set("driveLink", e.target.value)} placeholder="https://..." /></div>
                <div className="space-y-1.5"><Label>Meta de Posts/Mes</Label><Input type="number" value={form.postsGoal} onChange={(e) => set("postsGoal", e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Briefing Fixo (cores, fontes, regras)</Label><Textarea value={form.fixedBriefing} onChange={(e) => set("fixedBriefing", e.target.value)} rows={2} placeholder="Cores de marca, fontes, regras de identidade visual..." /></div>
              <div className="space-y-1.5"><Label>Briefing de Campanha</Label><Textarea value={form.campaignBriefing} onChange={(e) => set("campaignBriefing", e.target.value)} rows={2} placeholder="Objetivo atual, publico-alvo, tom de comunicacao..." /></div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Salvar Alteracoes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
