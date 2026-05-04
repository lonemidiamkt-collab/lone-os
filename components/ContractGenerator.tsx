"use client";

import { useState, useEffect, useRef } from "react";
import { pdf } from "@react-pdf/renderer";
import { ContractPDF } from "@/lib/contracts/templates";
import { SERVICE_LABELS, LONE_MIDIA } from "@/lib/contracts/types";
import type { ContractData, ContractRecord } from "@/lib/contracts/types";
import type { Client } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import {
  FileText, Plus, Download, Eye, Loader2, Check, X,
  Calendar, DollarSign, Clock, AlertTriangle,
  CheckCircle, Mail, RefreshCw, History,
  ArrowRight, PenLine, Upload, FileCheck2,
} from "lucide-react";
import LegacyContractModal from "@/components/LegacyContractModal";

interface Props { client: Client; currentUser: string; }

interface ContractFull extends ContractRecord {
  paymentDay?: number;
  previousContractId?: string;
  hasRenewal?: boolean;
  renewalValue?: number | null;
  signedPdfPath?: string | null;
  signedAt?: string | null;
  signedUploadedBy?: string | null;
  signatureMethod?: string | null;
}

interface AuditEntry { id: string; action: string; actor: string; details: string; createdAt: string; }
interface Addendum { id: string; changeType: string; description: string; oldValue: string; newValue: string; effectiveDate: string; generatedBy: string; createdAt: string; }

function addMonths(date: string, months: number): string {
  const d = new Date(date); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10);
}
function formatCurrency(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}
function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export default function ContractGenerator({ client, currentUser }: Props) {
  const [contracts, setContracts] = useState<ContractFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  // Nicho preenchido via prompt() quando falta no cadastro — evita perguntar de novo no mesmo ciclo.
  const [nichoOverride, setNichoOverride] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [showAddendum, setShowAddendum] = useState<string | null>(null);
  const [addendums, setAddendums] = useState<Addendum[]>([]);
  const [addendumForm, setAddendumForm] = useState({ changeType: "valor", description: "", oldValue: "", newValue: "", effectiveDate: new Date().toISOString().slice(0, 10) });
  const [renewFrom, setRenewFrom] = useState<ContractFull | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showLegacyModal, setShowLegacyModal] = useState(false);

  const [serviceType, setServiceType] = useState(client.serviceType || "lone_growth");
  const [valor, setValor] = useState("");
  const [hasRenewal, setHasRenewal] = useState(false);
  const [renewalValue, setRenewalValue] = useState("");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [duracao, setDuracao] = useState(3);
  const [templateClauses, setTemplateClauses] = useState<Record<string, { clauses: { id: string; title: string; body: string }[]; conditionalClauses: { id: string; title: string; body: string; enabled: boolean }[] }>>({});
  const [paymentDay, setPaymentDay] = useState(10);
  const [signerEmail, setSignerEmail] = useState(client.email || client.emailCorporativo || "");
  const [agency, setAgency] = useState(LONE_MIDIA);

  useEffect(() => {
    let mounted = true;
    loadContracts();
    supabase.from("agency_settings").select("*").eq("key", "main").maybeSingle().then(({ data }) => {
      if (!mounted || !data) return;
      setAgency({
        nome: data.razao_social || LONE_MIDIA.nome, cnpj: data.cnpj || LONE_MIDIA.cnpj,
        endereco: data.endereco || LONE_MIDIA.endereco, responsavel: data.signatario_nome || LONE_MIDIA.responsavel,
      });
    });
    supabase.from("contract_templates").select("service_type, clauses, conditional_clauses").then(({ data }) => {
      if (!mounted || !data) return;
      const map: typeof templateClauses = {};
      for (const t of data) {
        map[t.service_type as string] = {
          clauses: (t.clauses as { id: string; title: string; body: string }[]) || [],
          conditionalClauses: (t.conditional_clauses as { id: string; title: string; body: string; enabled: boolean }[]) || [],
        };
      }
      setTemplateClauses(map);
    });
    return () => { mounted = false; };
  }, [client.id]);

  const loadContracts = async () => {
    const { data } = await supabase.from("contracts").select("*").eq("client_id", client.id).order("created_at", { ascending: false });
    if (data) setContracts(data.map((r) => ({
      id: r.id as string, clientId: r.client_id as string, version: r.version as number,
      serviceType: r.service_type as string, monthlyValue: Number(r.monthly_value),
      startDate: r.start_date as string, endDate: r.end_date as string,
      durationMonths: r.duration_months as number, status: r.status as ContractRecord["status"],
      pdfUrl: r.pdf_url as string | null, generatedBy: r.generated_by as string, generatedAt: r.generated_at as string,
      paymentDay: (r.payment_day as number) || 10, previousContractId: (r.previous_contract_id as string) || undefined,
      hasRenewal: Boolean(r.has_renewal), renewalValue: r.renewal_value != null ? Number(r.renewal_value) : null,
      signedPdfPath: (r.signed_pdf_path as string) || null,
      signedAt: (r.signed_at as string) || null,
      signedUploadedBy: (r.signed_uploaded_by as string) || null,
      signatureMethod: (r.signature_method as string) || null,
    })));
    setLoading(false);
  };

  const loadAudit = async (contractId: string) => {
    const { data } = await supabase.from("contract_audit_log").select("*").eq("contract_id", contractId).order("created_at", { ascending: false });
    setAuditEntries((data || []).map((r) => ({ id: r.id, action: r.action, actor: r.actor, details: r.details || "", createdAt: r.created_at })));
  };

  const loadAddendums = async (contractId: string) => {
    const { data, error } = await supabase.from("contract_addendums").select("*").eq("contract_id", contractId).order("created_at", { ascending: false });
    if (error) { console.error("[Addendums]", error); return; }
    setAddendums((data || []).map((r) => ({ id: r.id, changeType: r.change_type, description: r.description, oldValue: r.old_value || "", newValue: r.new_value || "", effectiveDate: r.effective_date, generatedBy: r.generated_by, createdAt: r.created_at })));
  };

  const logAudit = async (contractId: string, action: string, details: string) => {
    await supabase.from("contract_audit_log").insert({ contract_id: contractId, action, actor: currentUser, details });
  };

  const validateClientData = (): string[] => {
    const errs: string[] = [];
    if (!client.nomeFantasia && !client.name) errs.push("Nome da empresa");
    if (!client.contactName) errs.push("Nome do responsavel");
    if (!client.cnpj) errs.push("CNPJ");
    if (!client.phone) errs.push("Telefone/WhatsApp");
    if (!signerEmail) errs.push("E-mail do signatario");
    return errs;
  };

  const openForm = (from?: ContractFull) => {
    if (from) {
      setRenewFrom(from);
      setServiceType(from.serviceType as typeof serviceType);
      setValor(String(from.monthlyValue));
      setDuracao(from.durationMonths);
      setPaymentDay(from.paymentDay || 10);
    } else {
      setRenewFrom(null);
    }
    const errs = validateClientData();
    setValidationErrors(errs);
    setShowForm(true);
    setPreviewUrl(null);
  };

  const buildContractData = (): ContractData => ({
    empresa: {
      nome: client.name, nomeFantasia: client.nomeFantasia || client.name,
      cnpj: client.cnpj || "", telefone: client.phone || "",
      endereco: [client.enderecoRua, client.enderecoBairro, client.enderecoCidade, client.enderecoEstado, client.enderecoCep].filter(Boolean).join(", ") || "",
      responsavel: client.contactName || "", cpf: client.cpfCnpj || "",
    },
    contratada: agency,
    contrato: { serviceType: serviceType as ContractData["contrato"]["serviceType"], valorMensal: Number(valor) || 0, dataInicio, dataFim: addMonths(dataInicio, duracao), duracaoMeses: duracao, paymentDay },
    clauses: templateClauses[serviceType]?.clauses || [],
    conditionalClauses: templateClauses[serviceType]?.conditionalClauses || [],
  });

  const handlePreview = async () => {
    const blob = await pdf(<ContractPDF data={buildContractData()} />).toBlob();
    setPreviewUrl(URL.createObjectURL(blob));
  };

  const handleGenerate = async () => {
    if (!valor || Number(valor) <= 0) return;
    setGenerating(true);
    try {
      const blob = await pdf(<ContractPDF data={buildContractData()} />).toBlob();
      const version = contracts.length + 1;
      const fileName = `${client.id}/contrato-v${version}-${Date.now()}.pdf`;
      await supabase.storage.from("contracts").upload(fileName, await blob.arrayBuffer(), { contentType: "application/pdf", upsert: true });
      const pdfUrl = `/storage/v1/object/public/contracts/${fileName}`;

      const { data: inserted } = await supabase.from("contracts").insert({
        client_id: client.id, version, service_type: serviceType,
        monthly_value: Number(valor), start_date: dataInicio,
        end_date: addMonths(dataInicio, duracao), duration_months: duracao,
        status: "draft", pdf_url: pdfUrl, generated_by: currentUser,
        payment_day: paymentDay,
        previous_contract_id: renewFrom?.id || null,
        has_renewal: hasRenewal,
        renewal_value: hasRenewal && renewalValue ? Number(renewalValue) : null,
      }).select("id").single();

      if (inserted) {
        await logAudit(inserted.id, "generated", `Contrato V${version} gerado — ${SERVICE_LABELS[serviceType]} — ${formatCurrency(Number(valor))}/mes`);
        if (renewFrom) {
          await logAudit(inserted.id, "renewal", `Renovacao do Contrato V${renewFrom.version}`);
        }
      }

      await supabase.from("timeline_entries").insert({
        client_id: client.id, type: "manual", actor: currentUser,
        description: `Contrato V${version} (${SERVICE_LABELS[serviceType]}) ${renewFrom ? "renovado" : "gerado"} — ${formatCurrency(Number(valor))}/mes`,
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });

      setShowForm(false); setPreviewUrl(null); setRenewFrom(null);
      await loadContracts();
    } catch (err) { console.error(err); } finally { setGenerating(false); }
  };

  const handleDownloadDocx = async (c: ContractFull) => {
    const errs = validateClientData();
    if (errs.length > 0) { setDownloadError(`Dados incompletos: ${errs.join(", ")}`); return; }
    // Pra Tráfego/Lone Growth, nicho é obrigatório. Se o cliente não preencheu, pede inline.
    const needsNicho = c.serviceType === "assessoria_trafego" || c.serviceType === "lone_growth";
    const currentNicho = (nichoOverride ?? client.nicho ?? "").trim();
    if (needsNicho && !currentNicho) {
      const entered = window.prompt("Qual o nicho/ramo da empresa? (aparece na cláusula 1.1 do contrato)\nEx: varejo de moda, odontologia, restaurante");
      if (!entered?.trim()) { setDownloadError("Nicho é obrigatório para contratos de Tráfego e Lone Growth."); return; }
      const nichoValue = entered.trim();
      await supabase.from("clients").update({ nicho: nichoValue }).eq("id", client.id);
      setNichoOverride(nichoValue); // evita re-prompt no mesmo ciclo; parent vai sincronizar no próximo fetch
    }
    setDownloadingDocx(c.id); setDownloadError("");
    try {
      const res = await fetch("/api/contracts/download-docx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          serviceType: c.serviceType,
          valorMensal: c.monthlyValue,
          duracaoMeses: c.durationMonths,
          diaPagamento: c.paymentDay || 10,
          version: c.version,
          hasRenewal: c.hasRenewal ?? false,
          renewalValue: c.renewalValue ?? null,
          signerEmail: signerEmail || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        setDownloadError(data.error || "Erro ao gerar DOCX");
        return;
      }
      const blob = await res.blob();
      // Prefer RFC 5987 `filename*=UTF-8''...` (tem acentos); cai pra `filename="..."` se nao tiver.
      const cd = res.headers.get("Content-Disposition") || "";
      const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/);
      const asciiMatch = cd.match(/filename="([^"]+)"/);
      const filename = utf8Match
        ? decodeURIComponent(utf8Match[1])
        : asciiMatch?.[1] || `Contrato-${client.nomeFantasia || client.name}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Small delay pra garantir que o Chrome iniciou o download antes de liberar a URL.
      setTimeout(() => URL.revokeObjectURL(url), 200);
      await logAudit(c.id, "downloaded_docx", `DOCX oficial baixado para upload manual no D4Sign`);
    } catch { setDownloadError("Falha ao gerar DOCX"); } finally { setDownloadingDocx(null); }
  };

  // Upload do PDF assinado (de volta do D4Sign, após cliente assinar).
  // Fecha o ciclo: admin clica → file picker → envia pra /api/contracts/upload-signed →
  // status vira 'active' + timestamp de assinatura + PDF armazenado no cofre do cliente.
  const uploadingSignedRef = useRef<string | null>(null);
  const [uploadingSignedId, setUploadingSignedId] = useState<string | null>(null);
  const handleUploadSigned = (contractId: string) => {
    if (uploadingSignedRef.current) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        setDownloadError("PDF muito grande. Máximo 20MB.");
        return;
      }
      uploadingSignedRef.current = contractId;
      setUploadingSignedId(contractId);
      setDownloadError("");
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("contractId", contractId);
        fd.append("method", "d4sign_manual");
        const res = await fetch("/api/contracts/upload-signed", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Falha no upload" }));
          setDownloadError(data.error || "Falha no upload");
          return;
        }
        await logAudit(contractId, "signed_uploaded", "PDF assinado recebido e armazenado no cofre");
        await loadContracts();
      } catch {
        setDownloadError("Falha de conexão no upload");
      } finally {
        uploadingSignedRef.current = null;
        setUploadingSignedId(null);
      }
    };
    input.click();
  };

  // Abre o PDF assinado via signed URL (5 min TTL). Cada acesso gera linha em vault_access_log.
  const handleViewSigned = async (signedPath: string) => {
    try {
      const res = await fetch("/api/storage/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: signedPath, download: false }),
      });
      if (!res.ok) {
        setDownloadError("Não foi possível abrir o PDF assinado");
        return;
      }
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setDownloadError("Falha ao abrir PDF assinado");
    }
  };

  const handleAddendum = async (contractId: string) => {
    if (!addendumForm.description) return;
    await supabase.from("contract_addendums").insert({
      contract_id: contractId, change_type: addendumForm.changeType,
      description: addendumForm.description, old_value: addendumForm.oldValue,
      new_value: addendumForm.newValue, effective_date: addendumForm.effectiveDate,
      generated_by: currentUser,
    });
    await logAudit(contractId, "addendum", `Adendo: ${addendumForm.changeType} — ${addendumForm.description}`);
    setAddendumForm({ changeType: "valor", description: "", oldValue: "", newValue: "", effectiveDate: new Date().toISOString().slice(0, 10) });
    setShowAddendum(null);
    await loadAddendums(contractId);
  };

  // Find expiring contracts (within 30 days)
  const expiringContracts = contracts.filter((c) => c.status === "active" && daysUntil(c.endDate) <= 30 && daysUntil(c.endDate) > 0);
  const expiredContracts = contracts.filter((c) => c.status === "active" && daysUntil(c.endDate) <= 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">Gestao de contratos</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLegacyModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted text-xs text-foreground transition-colors"
            title="Anexar contrato já assinado fora do sistema"
          >
            <FileCheck2 size={12} /> Anexar existente
          </button>
          <button onClick={() => openForm()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#0d4af5]/80 text-white text-xs font-medium transition-colors">
            <Plus size={12} /> Novo Contrato
          </button>
        </div>
      </div>

      <LegacyContractModal
        clientId={client.id}
        clientName={client.nomeFantasia || client.name}
        open={showLegacyModal}
        onClose={() => setShowLegacyModal(false)}
        onSuccess={() => loadContracts()}
      />


      {/* Expiration alerts */}
      {expiringContracts.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 space-y-2">
          <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5"><AlertTriangle size={12} /> Contratos proximos do vencimento</p>
          {expiringContracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between">
              <p className="text-xs text-zinc-300">V{c.version} — vence em <span className="text-amber-400 font-medium">{daysUntil(c.endDate)} dias</span> ({c.endDate})</p>
              <button onClick={() => openForm(c)} className="text-[10px] px-2.5 py-1 rounded-lg bg-[#0d4af5]/10 text-[#0d4af5] border border-[#0d4af5]/20 hover:bg-[#0d4af5]/20 flex items-center gap-1">
                <RefreshCw size={10} /> Renovar
              </button>
            </div>
          ))}
        </div>
      )}

      {expiredContracts.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4 space-y-2">
          <p className="text-xs font-medium text-red-400 flex items-center gap-1.5"><AlertTriangle size={12} /> Contratos vencidos</p>
          {expiredContracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between">
              <p className="text-xs text-zinc-300">V{c.version} — venceu em {c.endDate}</p>
              <button onClick={() => openForm(c)} className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 flex items-center gap-1">
                <RefreshCw size={10} /> Renovar
              </button>
            </div>
          ))}
        </div>
      )}

      {downloadError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-400">{downloadError}</p>
          <button onClick={() => setDownloadError("")} className="ml-auto text-red-400/50 hover:text-red-400"><X size={12} /></button>
        </div>
      )}

      {/* Contract list */}
      {loading ? <div className="flex justify-center py-10"><Loader2 size={20} className="text-[#0d4af5] animate-spin" /></div> : contracts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText size={32} className="text-zinc-700 mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhum contrato gerado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => {
            const isSending = downloadingDocx === c.id;
            const days = daysUntil(c.endDate);
            const prevContract = c.previousContractId ? contracts.find((x) => x.id === c.previousContractId) : null;
            const statusBadge = c.status === "active"
              ? { label: "Ativo", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" }
              : c.status === "expired"
                ? { label: "Vencido", cls: "bg-red-500/10 text-red-400 border-red-500/20" }
                : { label: "Rascunho", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" };

            return (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-3 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.status === "active" ? "bg-emerald-500/15" : "bg-[#0d4af5]/10"}`}>
                      {c.status === "active" ? <CheckCircle size={18} className="text-emerald-500" /> : <FileText size={18} className="text-[#0d4af5]" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        Contrato V{c.version} — {SERVICE_LABELS[c.serviceType] || c.serviceType}
                        {prevContract && <span className="text-[10px] text-zinc-500 flex items-center gap-0.5"><ArrowRight size={8} /> Renovacao V{prevContract.version}</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.monthlyValue > 0 ? `${formatCurrency(c.monthlyValue)}/mes` : "Valor no PDF"} x {c.durationMonths}m | {c.startDate} a {c.endDate} | Pgto dia {c.paymentDay || 10}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2.5 py-1 rounded-lg ${statusBadge.cls} border font-medium`}>{statusBadge.label}</span>
                    {days > 0 && days <= 30 && c.status === "active" && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Vence em {days}d</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {c.pdfUrl && (
                    <>
                      <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-[#0d4af5]/30 hover:text-[#0d4af5]"><Eye size={11} /> PDF</a>
                      <a href={c.pdfUrl} download target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-[#0d4af5]/30 hover:text-[#0d4af5]"><Download size={11} /></a>
                    </>
                  )}
                  <button onClick={() => { setShowAudit(showAudit === c.id ? null : c.id); if (showAudit !== c.id) loadAudit(c.id); }}
                    className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-zinc-600"><History size={11} /> Historico</button>
                  <button onClick={() => { setShowAddendum(showAddendum === c.id ? null : c.id); if (showAddendum !== c.id) loadAddendums(c.id); }}
                    className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-zinc-600"><PenLine size={11} /> Adendo</button>

                  <button onClick={() => handleDownloadDocx(c)} disabled={isSending}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 border border-emerald-500/20 disabled:opacity-50"
                    title="Baixa o contrato oficial preenchido (.docx) para você subir manualmente no D4Sign e enviar pra assinatura">
                    {isSending ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                    {isSending ? "Gerando..." : "Baixar DOCX Oficial"}
                  </button>

                  {/* Upload do PDF assinado (pós D4Sign) OU ver o assinado se já subiu */}
                  {c.signedPdfPath ? (
                    <button onClick={() => handleViewSigned(c.signedPdfPath!)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d4af5]/10 text-[#0d4af5] text-xs font-medium hover:bg-[#0d4af5]/20 border border-[#0d4af5]/20"
                      title={`Assinado em ${c.signedAt ? new Date(c.signedAt).toLocaleDateString("pt-BR") : ""}${c.signedUploadedBy ? ` por ${c.signedUploadedBy}` : ""}`}>
                      <FileCheck2 size={11} /> Ver Assinado
                    </button>
                  ) : (
                    <button onClick={() => handleUploadSigned(c.id)} disabled={uploadingSignedId === c.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d4af5]/10 text-[#0d4af5] text-xs font-medium hover:bg-[#0d4af5]/20 border border-[#0d4af5]/20 disabled:opacity-50"
                      title="Upload do PDF assinado pelo cliente (D4Sign) para fechar o contrato.">
                      {uploadingSignedId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                      {uploadingSignedId === c.id ? "Enviando..." : "Upload Assinado"}
                    </button>
                  )}

                  {c.signedAt && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400" title={`Assinado em ${new Date(c.signedAt).toLocaleDateString("pt-BR")}`}>
                      <CheckCircle size={11} /> Assinado
                    </span>
                  )}
                </div>

                {/* Audit log */}
                {showAudit === c.id && (
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-[10px] text-zinc-500 font-medium uppercase">Historico de Acoes</p>
                    {auditEntries.length === 0 ? <p className="text-[10px] text-zinc-600">Nenhum registro</p> : auditEntries.map((a) => (
                      <div key={a.id} className="flex items-start gap-2 text-[10px]">
                        <span className="text-zinc-600 shrink-0">{new Date(a.createdAt).toLocaleDateString("pt-BR")}</span>
                        <span className="text-zinc-400">{a.actor}</span>
                        <span className="text-foreground">{a.details}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Addendum section */}
                {showAddendum === c.id && (
                  <div className="border-t border-border pt-3 space-y-3">
                    <p className="text-[10px] text-zinc-500 font-medium uppercase">Adendos Contratuais</p>
                    {addendums.map((a) => (
                      <div key={a.id} className="rounded-lg border border-border bg-surface p-3 space-y-1">
                        <div className="flex justify-between">
                          <p className="text-xs font-medium text-foreground">{a.changeType === "valor" ? "Alteracao de Valor" : a.changeType === "servico" ? "Inclusao de Servico" : "Outro"}</p>
                          <span className="text-[10px] text-zinc-500">{new Date(a.createdAt).toLocaleDateString("pt-BR")} por {a.generatedBy}</span>
                        </div>
                        <p className="text-[11px] text-zinc-300">{a.description}</p>
                        {(a.oldValue || a.newValue) && (
                          <p className="text-[10px] text-zinc-500"><span className="line-through text-red-400">{a.oldValue}</span> <ArrowRight size={8} className="inline" /> <span className="text-emerald-400">{a.newValue}</span></p>
                        )}
                      </div>
                    ))}
                    {/* New addendum form */}
                    <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
                      <p className="text-[10px] text-zinc-500">Novo Adendo</p>
                      <select value={addendumForm.changeType} onChange={(e) => setAddendumForm((p) => ({ ...p, changeType: e.target.value }))}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none">
                        <option value="valor">Alteracao de Valor</option>
                        <option value="servico">Inclusao de Servico</option>
                        <option value="prazo">Alteracao de Prazo</option>
                        <option value="outro">Outro</option>
                      </select>
                      <textarea value={addendumForm.description} onChange={(e) => setAddendumForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Descricao da alteracao..." rows={2}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none resize-none" />
                      <div className="grid grid-cols-3 gap-2">
                        <input value={addendumForm.oldValue} onChange={(e) => setAddendumForm((p) => ({ ...p, oldValue: e.target.value }))} placeholder="Valor anterior"
                          className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none" />
                        <input value={addendumForm.newValue} onChange={(e) => setAddendumForm((p) => ({ ...p, newValue: e.target.value }))} placeholder="Novo valor"
                          className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none" />
                        <input type="date" value={addendumForm.effectiveDate} onChange={(e) => setAddendumForm((p) => ({ ...p, effectiveDate: e.target.value }))}
                          className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none" />
                      </div>
                      <button onClick={() => handleAddendum(c.id)} disabled={!addendumForm.description}
                        className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-[#0d4af5]/10 text-[#0d4af5] text-xs hover:bg-[#0d4af5]/20 border border-[#0d4af5]/20 disabled:opacity-50">
                        <Plus size={11} /> Registrar Adendo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Generator Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowForm(false); setPreviewUrl(null); setRenewFrom(null); }}>
          <div className="bg-card border border-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">{renewFrom ? `Renovar Contrato V${renewFrom.version}` : "Gerar Contrato"}</h3>
              <button onClick={() => { setShowForm(false); setPreviewUrl(null); setRenewFrom(null); }} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3 space-y-1">
                  <p className="text-xs font-medium text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> Dados incompletos no cadastro</p>
                  <p className="text-[10px] text-amber-400/80">Preencha na aba Dados antes de enviar: {validationErrors.join(", ")}</p>
                </div>
              )}

              {renewFrom && (
                <div className="rounded-xl border border-[#0d4af5]/20 bg-[#0d4af5]/[0.03] p-3">
                  <p className="text-xs text-[#0d4af5] flex items-center gap-1"><RefreshCw size={11} /> Renovacao do Contrato V{renewFrom.version} ({formatCurrency(renewFrom.monthlyValue)}/mes)</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Servico</label>
                <div className="grid grid-cols-3 gap-2">
                  {([{ v: "assessoria_trafego", l: "Trafego", i: "🎯" }, { v: "assessoria_social", l: "Social", i: "📱" }, { v: "lone_growth", l: "Growth", i: "🚀" }]).map((o) => (
                    <button key={o.v} onClick={() => setServiceType(o.v as typeof serviceType)}
                      className={`p-2.5 rounded-lg border text-xs text-center transition-all ${serviceType === o.v ? "border-[#0d4af5]/50 bg-[#0d4af5]/10 text-white" : "border-border text-zinc-500"}`}>{o.i} {o.l}</button>
                  ))}
                </div>
                {(serviceType === "assessoria_trafego" || serviceType === "lone_growth") && !(nichoOverride ?? client.nicho)?.trim() && (
                  <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-1">
                    <AlertTriangle size={10} /> Nicho do cliente vazio — sera pedido na hora de baixar o DOCX oficial.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-medium flex items-center gap-1"><DollarSign size={10} /> Valor (R$)</label>
                  <input type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.00"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-medium flex items-center gap-1"><Calendar size={10} /> Inicio</label>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-medium">Dia Pgto</label>
                  <input type="number" min={1} max={31} value={paymentDay} onChange={(e) => setPaymentDay(Number(e.target.value) || 10)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1"><Clock size={10} /> Duracao</label>
                <div className="flex gap-2">
                  {[3, 6, 12].map((m) => (
                    <button key={m} onClick={() => setDuracao(m)} className={`flex-1 py-2 rounded-lg border text-xs transition-all ${duracao === m ? "border-[#0d4af5]/50 bg-[#0d4af5]/10 text-white" : "border-border text-zinc-500"}`}>{m}m</button>
                  ))}
                  <button
                    onClick={() => { if ([3, 6, 12].includes(duracao)) setDuracao(5); }}
                    className={`flex-1 py-2 rounded-lg border text-xs transition-all ${![3, 6, 12].includes(duracao) ? "border-[#0d4af5]/50 bg-[#0d4af5]/10 text-white" : "border-border text-zinc-500"}`}
                  >
                    Personalizado
                  </button>
                </div>
                {![3, 6, 12].includes(duracao) && (
                  <div className="pt-2">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Meses (1 a 36)</label>
                    <input
                      type="number"
                      min={1}
                      max={36}
                      value={duracao}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!isNaN(n) && n >= 1 && n <= 36) setDuracao(n);
                      }}
                      placeholder="Ex: 5"
                      className="mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Ex: cliente com primeiro mes cortesia → coloque 5 (a cobranca comeca no mes 2 ate o mes 6).
                    </p>
                  </div>
                )}
              </div>

              {/* Reajuste apos periodo inicial */}
              <div className="rounded-xl border border-border bg-surface p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasRenewal}
                    onChange={(e) => setHasRenewal(e.target.checked)}
                    className="w-4 h-4 accent-[#0d4af5]"
                  />
                  <span className="text-xs font-medium text-foreground">Tera reajuste apos os {duracao} meses iniciais?</span>
                </label>
                {hasRenewal ? (
                  <div className="space-y-1.5 pl-6">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Novo valor mensal (pos-reajuste)</label>
                    <input
                      type="number"
                      value={renewalValue}
                      onChange={(e) => setRenewalValue(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
                    />
                    {renewalValue && Number(renewalValue) > 0 && Number(valor) > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Reajuste: {formatCurrency(Number(valor))} → {formatCurrency(Number(renewalValue))} ({Number(renewalValue) > Number(valor) ? "+" : ""}{(((Number(renewalValue) - Number(valor)) / Number(valor)) * 100).toFixed(1)}%)
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground pl-6">Sem reajuste — contrato inclui clausula de valor mantido durante todo o periodo.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1"><Mail size={10} /> E-mail Signatario</label>
                <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="email@cliente.com"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
              </div>

              {valor && Number(valor) > 0 && (
                <div className="rounded-xl border border-[#0d4af5]/20 bg-[#0d4af5]/[0.03] p-4 space-y-1">
                  <p className="text-sm text-foreground"><span className="font-medium">{client.nomeFantasia || client.name}</span></p>
                  <p className="text-sm text-[#0d4af5] font-semibold">{formatCurrency(Number(valor))}/mes x {duracao}m = {formatCurrency(Number(valor) * duracao)}</p>
                  <p className="text-[10px] text-zinc-500">{dataInicio} a {addMonths(dataInicio, duracao)} | Pagamento dia {paymentDay}</p>
                </div>
              )}

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3 flex items-start gap-2">
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-400/90 leading-relaxed">
                  <span className="font-medium">PDF abaixo é apenas preview/rascunho.</span> O documento oficial com template Lone Midia (e cláusula de reajuste se habilitada) é gerado no botão <span className="font-medium">&quot;Baixar DOCX Oficial&quot;</span> na lista de contratos.
                </p>
              </div>
            </div>

            {previewUrl && <div className="px-5 pb-3"><iframe src={previewUrl} className="w-full h-[400px] rounded-lg border border-border bg-white" /></div>}

            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => { setShowForm(false); setPreviewUrl(null); setRenewFrom(null); }} className="btn-ghost flex-1 text-sm border border-border">Cancelar</button>
              <button onClick={handlePreview} disabled={!valor || Number(valor) <= 0}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-[#0d4af5]/20 text-[#0d4af5] text-sm hover:bg-[#0d4af5]/10 disabled:opacity-50 py-2.5"><Eye size={13} /> Preview</button>
              <button onClick={handleGenerate} disabled={generating || !valor || Number(valor) <= 0}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#0d4af5] hover:bg-[#0d4af5]/80 text-white text-sm disabled:opacity-50 py-2.5">
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {generating ? "Gerando..." : renewFrom ? "Gerar Renovacao" : "Gerar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
