"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { useRole } from "@/lib/context/RoleContext";
import { useAppState } from "@/lib/context/AppStateContext";
import { fetchDraftClients } from "@/lib/supabase/queries";
import { supabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";
import {
  Check, X, Loader2, Clock, Send, ArrowLeft, FileText, Download,
  Eye, User, Building2, Shield, ExternalLink, Users as UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";

const INDUSTRIES = [
  "Tecnologia", "Saude", "Imobiliario", "Fitness", "Gastronomia",
  "Educacao", "E-commerce", "Moda", "Beleza", "Juridico",
  "Financeiro", "Construcao", "Varejo", "Servicos", "Outro",
];

interface Submission {
  id: string;
  client_id: string;
  token: string;
  status: string;
  contact_name: string | null;
  contact_cpf: string | null;
  contact_whatsapp: string | null;
  meta_login: string | null;
  meta_password: string | null;
  meta_status: string | null;
  instagram_login: string | null;
  instagram_password: string | null;
  instagram_status: string | null;
  google_login: string | null;
  google_password: string | null;
  google_status: string | null;
  doc_contrato_social: string | null;
  doc_identidade: string | null;
  notes: string | null;
  submitted_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────
function getDisplayName(draft: Client, sub?: Submission | null): string {
  return draft.nomeFantasia || draft.razaoSocial || draft.name || sub?.contact_name || "Sem nome";
}

function getContactDisplay(draft: Client, sub?: Submission | null): string {
  return sub?.contact_name || draft.contactName || "";
}

function resolveDocUrl(url: string | null): string | null {
  if (!url) return null;
  // If relative path, make absolute
  if (url.startsWith("/")) return url;
  return url;
}

// ─── Main Page ────────────────────────────────────────────
export default function PendingClientsPage() {
  const { role } = useRole();
  const { pushNotification } = useAppState();
  const team = useTeamMembers();
  const isAdmin = role === "admin" || role === "manager";

  const [drafts, setDrafts] = useState<Client[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [selected, setSelected] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [reviewChecks, setReviewChecks] = useState({ docs: false, access: false, data: false });

  // Editable form
  const [editForm, setEditForm] = useState({
    nomeFantasia: "", razaoSocial: "", cnpj: "", industry: "Outro",
    contactName: "", cpfCnpj: "", phone: "", emailCorporativo: "", endereco: "",
    serviceType: "lone_growth", assignedTraffic: "", assignedSocial: "", assignedDesigner: "",
  });
  const setEdit = (k: string, v: string) => setEditForm((p) => ({ ...p, [k]: v }));

  // ─── Load data ────────────────────────────────
  const loadData = useCallback(async () => {
    const d = await fetchDraftClients();
    setDrafts(d);

    const subMap: Record<string, Submission> = {};
    if (d.length > 0) {
      const { data } = await supabase
        .from("client_onboarding_submissions")
        .select("*")
        .in("client_id", d.map((x) => x.id))
        .order("created_at", { ascending: false });

      if (data) {
        for (const row of data) {
          const cid = row.client_id as string;
          if (!subMap[cid]) subMap[cid] = row as Submission;
        }
      }
    }
    setSubmissions(subMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin, loadData]);

  // ─── Select draft ─────────────────────────────
  const selectDraft = (draft: Client) => {
    setSelected(draft);
    const sub = submissions[draft.id];
    setEditForm({
      nomeFantasia: draft.nomeFantasia || draft.name || "",
      razaoSocial: draft.razaoSocial || "",
      cnpj: draft.cnpj || draft.cpfCnpj || sub?.contact_cpf || "",
      industry: draft.industry || "Outro",
      contactName: sub?.contact_name || draft.contactName || "",
      cpfCnpj: sub?.contact_cpf || draft.cpfCnpj || "",
      phone: sub?.contact_whatsapp || draft.phone || "",
      emailCorporativo: draft.emailCorporativo || draft.email || "",
      endereco: draft.endereco || "",
      serviceType: draft.serviceType || "lone_growth",
      assignedTraffic: draft.assignedTraffic || team.forField("assignedTraffic")[0]?.name || "",
      assignedSocial: draft.assignedSocial || team.forField("assignedSocial")[0]?.name || "",
      assignedDesigner: draft.assignedDesigner || team.forField("assignedDesigner")[0]?.name || "",
    });
  };

  const needsTraffic = editForm.serviceType === "lone_growth" || editForm.serviceType === "assessoria_trafego";
  const needsSocial = editForm.serviceType === "lone_growth" || editForm.serviceType === "assessoria_social";
  const needsDesigner = editForm.serviceType === "lone_growth" || editForm.serviceType === "assessoria_design";

  // ─── Approve ──────────────────────────────────
  const handleApprove = async () => {
    if (!selected) return;
    setApproving(true);
    const clientName = editForm.nomeFantasia || editForm.razaoSocial || "Cliente";

    // Update client fields + clear draft_status
    await supabase.from("clients").update({
      name: clientName,
      nome_fantasia: editForm.nomeFantasia || null,
      razao_social: editForm.razaoSocial || null,
      cnpj: editForm.cnpj || null,
      industry: editForm.industry,
      contact_name: editForm.contactName || null,
      cpf_cnpj: editForm.cpfCnpj || null,
      phone: editForm.phone || null,
      email_corporativo: editForm.emailCorporativo || null,
      endereco: editForm.endereco || null,
      service_type: editForm.serviceType,
      assigned_traffic: needsTraffic ? editForm.assignedTraffic : "",
      assigned_social: needsSocial ? editForm.assignedSocial : "",
      assigned_designer: needsDesigner ? editForm.assignedDesigner : "",
      draft_status: null, // This makes the client visible in the main list
    }).eq("id", selected.id);

    pushNotification("system", "Cliente aprovado", `${clientName} foi ativado. Equipe pode iniciar o setup.`);

    // Remove from local list without reload
    setDrafts((prev) => prev.filter((d) => d.id !== selected.id));
    setSelected(null);
    setApproving(false);
  };

  // ─── Reject ───────────────────────────────────
  const handleReject = async () => {
    if (!selected || !confirm("Rejeitar este cadastro? Os dados serao removidos permanentemente.")) return;
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", clientId: selected.id }),
    });
    setDrafts((prev) => prev.filter((d) => d.id !== selected.id));
    setSelected(null);
  };

  if (!isAdmin) return <div className="p-6 text-muted-foreground">Acesso restrito a administradores.</div>;

  const sub = selected ? submissions[selected.id] : null;
  const docContrato = resolveDocUrl(sub?.doc_contrato_social || selected?.docContratoSocial || null);
  const docIdentidade = resolveDocUrl(sub?.doc_identidade || selected?.docIdentidade || null);

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Cadastros Pendentes" subtitle="Revise, edite e aprove clientes do onboarding externo" />

      <div className="flex flex-1 overflow-hidden">
        {/* ═══ LEFT: List ═══ */}
        <div className="w-80 border-r border-border overflow-auto p-4 space-y-2 shrink-0">
          <Link href="/clients" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors">
            <ArrowLeft size={12} /> Voltar para Clientes
          </Link>

          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="text-[#0d4af5] animate-spin" />
            </div>
          )}

          {!loading && drafts.length === 0 && (
            <div className="text-center py-10 space-y-2">
              <Check size={28} className="text-emerald-500 mx-auto" />
              <p className="text-sm text-zinc-400">Nenhum cadastro pendente</p>
              <p className="text-[10px] text-zinc-600">Todos os cadastros foram revisados</p>
            </div>
          )}

          {drafts.map((draft) => {
            const dSub = submissions[draft.id];
            const name = getDisplayName(draft, dSub);
            const contact = getContactDisplay(draft, dSub);
            const isSelected = selected?.id === draft.id;
            const submittedAt = dSub?.submitted_at ? new Date(dSub.submitted_at) : null;
            const hoursAgo = submittedAt ? Math.floor((Date.now() - submittedAt.getTime()) / 3600000) : null;
            const slaWarning = hoursAgo !== null && hoursAgo > 48;

            return (
              <button
                key={draft.id}
                onClick={() => { selectDraft(draft); setReviewChecks({ docs: false, access: false, data: false }); }}
                className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? "border-[#0d4af5]/50 bg-[#0d4af5]/[0.05]"
                    : slaWarning
                    ? "border-red-500/30 hover:border-red-500/50 bg-red-500/[0.02]"
                    : "border-border hover:border-primary/30 hover:bg-muted/30"
                }`}
              >
                <p className="text-sm font-medium text-foreground truncate">{name}</p>
                {contact && <p className="text-[10px] text-zinc-500 mt-0.5 truncate">Contato: {contact}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-zinc-600">{draft.industry}</span>
                  {draft.draftStatus === "pending_invite" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                      <Send size={8} /> Aguardando
                    </span>
                  )}
                  {draft.draftStatus === "awaiting_approval" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0d4af5]/10 text-[#3b6ff5] border border-[#0d4af5]/20 flex items-center gap-1">
                      <Check size={8} /> Recebido
                    </span>
                  )}
                  {hoursAgo !== null && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                      slaWarning ? "bg-red-500/10 text-red-400 border border-red-500/20" : "text-zinc-500"
                    }`}>
                      <Clock size={8} /> {hoursAgo < 24 ? `${hoursAgo}h` : `${Math.floor(hoursAgo / 24)}d`}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* ═══ RIGHT: Detail / Edit ═══ */}
        <div className="flex-1 overflow-auto p-6">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
              <FileText size={32} className="text-zinc-700" />
              <p className="text-muted-foreground text-sm">Selecione um cadastro para revisar</p>
              <p className="text-[10px] text-zinc-600">Clique em um item da lista ao lado</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
              {/* Header + Actions */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{getDisplayName(selected, sub)}</h2>
                  {getContactDisplay(selected, sub) && (
                    <p className="text-xs text-zinc-500 mt-0.5">Responsavel: {getContactDisplay(selected, sub)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleReject} className="btn-ghost text-xs text-zinc-500 hover:text-red-400 flex items-center gap-1 border border-border hover:border-red-500/30">
                    <X size={12} /> Rejeitar
                  </button>
                  <button onClick={handleApprove} disabled={approving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-sm font-medium hover:bg-emerald-500/25 transition-colors border border-emerald-500/20">
                    {approving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Confirmar e Ativar Cliente
                  </button>
                </div>
              </div>

              {/* ═══ DOCUMENTOS ═══ */}
              {(docContrato || docIdentidade) && (
                <div className="rounded-xl border border-[#1e1e2a] bg-[#0f0f13] p-4 space-y-3">
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={10} className="text-[#0d4af5]" /> Documentos Recebidos
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {docContrato && (
                      <div className="p-3 rounded-lg border border-[#1e1e2a] bg-[#111113] space-y-2">
                        <p className="text-xs text-zinc-400 font-medium">Contrato Social</p>
                        {docContrato.match(/\.(jpg|jpeg|png|webp|heic)$/i) && (
                          <div className="relative w-full h-24 rounded-lg overflow-hidden bg-[#0a0a0c] border border-[#1e1e2a]">
                            <img src={docContrato} alt="Contrato Social" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          <button onClick={() => setLightbox(docContrato)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#1e1e2a] text-[11px] text-zinc-400 hover:text-white hover:border-[#0d4af5]/30 transition-all">
                            <Eye size={10} /> Visualizar
                          </button>
                          <a href={docContrato} download target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#1e1e2a] text-[11px] text-zinc-400 hover:text-white hover:border-[#0d4af5]/30 transition-all">
                            <Download size={10} /> Baixar
                          </a>
                        </div>
                      </div>
                    )}
                    {docIdentidade && (
                      <div className="p-3 rounded-lg border border-[#1e1e2a] bg-[#111113] space-y-2">
                        <p className="text-xs text-zinc-400 font-medium">Documento c/ Foto (RG/CNH)</p>
                        {docIdentidade.match(/\.(jpg|jpeg|png|webp|heic)$/i) && (
                          <div className="relative w-full h-24 rounded-lg overflow-hidden bg-[#0a0a0c] border border-[#1e1e2a]">
                            <img src={docIdentidade} alt="Documento" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          <button onClick={() => setLightbox(docIdentidade)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#1e1e2a] text-[11px] text-zinc-400 hover:text-white hover:border-[#0d4af5]/30 transition-all">
                            <Eye size={10} /> Visualizar
                          </button>
                          <a href={docIdentidade} download target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#1e1e2a] text-[11px] text-zinc-400 hover:text-white hover:border-[#0d4af5]/30 transition-all">
                            <Download size={10} /> Baixar
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ═══ DADOS PESSOAIS (editavel) ═══ */}
              <div className="rounded-xl border border-[#1e1e2a] bg-[#0f0f13] p-4 space-y-4">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
                  <User size={10} className="text-[#0d4af5]" /> Dados Pessoais (PF)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Nome Completo</Label><Input value={editForm.contactName} onChange={(e) => setEdit("contactName", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>CPF</Label><Input value={editForm.cpfCnpj} onChange={(e) => setEdit("cpfCnpj", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>WhatsApp</Label><Input value={editForm.phone} onChange={(e) => setEdit("phone", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>E-mail</Label><Input value={editForm.emailCorporativo} onChange={(e) => setEdit("emailCorporativo", e.target.value)} /></div>
                </div>
              </div>

              {/* ═══ DADOS EMPRESARIAIS (editavel) ═══ */}
              <div className="rounded-xl border border-[#1e1e2a] bg-[#0f0f13] p-4 space-y-4">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={10} className="text-[#0d4af5]" /> Dados Empresariais (PJ)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Nome Fantasia</Label><Input value={editForm.nomeFantasia} onChange={(e) => setEdit("nomeFantasia", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Razao Social</Label><Input value={editForm.razaoSocial} onChange={(e) => setEdit("razaoSocial", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>CNPJ</Label><Input value={editForm.cnpj} onChange={(e) => setEdit("cnpj", e.target.value)} /></div>
                  <div className="space-y-1.5">
                    <Label>Segmento</Label>
                    <Select value={editForm.industry} onValueChange={(v) => setEdit("industry", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-2"><Label>Endereco</Label><Input value={editForm.endereco} onChange={(e) => setEdit("endereco", e.target.value)} /></div>
                </div>
              </div>

              {/* ═══ SERVICO & EQUIPE (editavel) ═══ */}
              <div className="rounded-xl border border-[#1e1e2a] bg-[#0f0f13] p-4 space-y-4">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={10} className="text-[#0d4af5]" /> Servico & Equipe
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "lone_growth", label: "Lone Growth", icon: "\u{1F680}" },
                    { value: "assessoria_trafego", label: "Assessoria Trafego", icon: "\u{1F3AF}" },
                    { value: "assessoria_social", label: "Assessoria Social", icon: "\u{1F4F1}" },
                    { value: "assessoria_design", label: "Assessoria Design", icon: "\u{1F3A8}" },
                  ]).map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setEdit("serviceType", opt.value)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all text-xs ${
                        editForm.serviceType === opt.value ? "border-[#0d4af5]/50 bg-[#0d4af5]/[0.06] text-white" : "border-[#1e1e2a] text-zinc-500 hover:border-zinc-700"
                      }`}>
                      <span>{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-3 pt-2">
                  {needsTraffic && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1"><UsersIcon size={10} /> Gestor de Trafego</Label>
                      <Select value={editForm.assignedTraffic} onValueChange={(v) => setEdit("assignedTraffic", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{team.forField("assignedTraffic").map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  {needsSocial && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1"><UsersIcon size={10} /> Social Media</Label>
                      <Select value={editForm.assignedSocial} onValueChange={(v) => setEdit("assignedSocial", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{team.forField("assignedSocial").map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  {needsDesigner && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1"><UsersIcon size={10} /> Designer</Label>
                      <Select value={editForm.assignedDesigner} onValueChange={(v) => setEdit("assignedDesigner", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{team.forField("assignedDesigner").map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ ACESSOS (read-only from submission) ═══ */}
              {sub && (sub.meta_login || sub.instagram_login || sub.google_login) && (
                <div className="rounded-xl border border-[#1e1e2a] bg-[#0f0f13] p-4 space-y-3">
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Acessos Informados pelo Cliente</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Meta Ads", login: sub.meta_login, status: sub.meta_status, icon: "📘" },
                      { label: "Instagram", login: sub.instagram_login, status: sub.instagram_status, icon: "📷" },
                      { label: "Google", login: sub.google_login, status: sub.google_status, icon: "🔍" },
                    ].filter((a) => a.login || (a.status && a.status !== "pending")).map((acc) => (
                      <div key={acc.label} className="p-3 rounded-lg bg-[#111113] border border-[#1e1e2a] space-y-1">
                        <p className="text-xs text-zinc-400 font-medium flex items-center gap-1">{acc.icon} {acc.label}</p>
                        {acc.login ? (
                          <p className="text-xs text-zinc-300 truncate">{acc.login}</p>
                        ) : (
                          <p className="text-[10px] text-amber-400">
                            {acc.status === "waiting_client" ? "Cliente nao tem" : acc.status === "partner_invite" ? "Convite Partner" : "Pendente"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observacoes */}
              {sub?.notes && (
                <div className="rounded-xl border border-[#1e1e2a] bg-[#0f0f13] p-4">
                  <p className="text-xs text-zinc-500 font-medium mb-2">Observacoes do Cliente</p>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{sub.notes}</p>
                </div>
              )}

              {/* Review Checklist */}
              <div className="rounded-xl border border-[#1e1e2a] bg-[#0f0f13] p-4 space-y-3">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Checklist de Revisao</p>
                {([
                  { key: "data" as const, label: "Dados pessoais e empresariais conferidos" },
                  { key: "access" as const, label: "Acessos das plataformas verificados" },
                  { key: "docs" as const, label: "Documentos analisados e validados" },
                ]).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      reviewChecks[key] ? "bg-[#0d4af5] border-[#0d4af5]" : "border-zinc-700 group-hover:border-zinc-500"
                    }`} onClick={() => setReviewChecks((p) => ({ ...p, [key]: !p[key] }))}>
                      {reviewChecks[key] && <Check size={12} className="text-white" />}
                    </div>
                    <span className={`text-xs ${reviewChecks[key] ? "text-zinc-300" : "text-zinc-500"}`}>{label}</span>
                  </label>
                ))}
              </div>

              {/* Bottom action bar */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1e1e2a]">
                <button onClick={handleReject} className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-3 py-2">
                  Rejeitar
                </button>
                <button onClick={handleApprove} disabled={approving || !reviewChecks.data || !reviewChecks.access || !reviewChecks.docs}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#0d4af5] hover:bg-[#0d4af5]/80 text-white text-sm font-medium transition-colors disabled:opacity-50">
                  {approving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Confirmar e Ativar Cliente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ LIGHTBOX ═══ */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="max-w-4xl max-h-[90vh] overflow-auto rounded-xl border border-border bg-[#0f0f13] p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-xs text-zinc-500">Documento</p>
              <div className="flex items-center gap-3">
                <a href={lightbox} download target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[#0d4af5] hover:text-white transition-colors flex items-center gap-1">
                  <Download size={10} /> Baixar
                </a>
                <a href={lightbox} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-white transition-colors flex items-center gap-1">
                  <ExternalLink size={10} /> Nova aba
                </a>
                <button onClick={() => setLightbox(null)} className="text-zinc-500 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>
            {lightbox.match(/\.pdf$/i) ? (
              <iframe src={lightbox} className="w-full h-[80vh] rounded-lg border border-[#1e1e2a]" />
            ) : (
              <img src={lightbox} alt="Documento" className="max-w-full max-h-[80vh] rounded-lg mx-auto" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

