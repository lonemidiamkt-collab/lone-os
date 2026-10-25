"use client";

import { useState, useEffect, useRef } from "react";
import { pdf } from "@react-pdf/renderer";
import { ContractPDF } from "@/lib/contracts/templates";
import { SERVICE_LABELS, LONE_MIDIA } from "@/lib/contracts/types";
import type { ContractData, ContractRecord } from "@/lib/contracts/types";
import type { Client } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { somarMesesIso } from "@/lib/contracts/registro";
import { lerAnteriores, type PdfAnterior } from "@/lib/contracts/pdf-assinado";
import { toast } from "sonner";
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
  /** PDFs assinados que já valeram (trocados pela tela) — 24/10/2026, auditoria 3.13. */
  signedPdfAnteriores?: PdfAnterior[];
}

interface AuditEntry { id: string; action: string; actor: string; details: string; createdAt: string; }
interface Addendum { id: string; changeType: string; description: string; oldValue: string; newValue: string; effectiveDate: string; generatedBy: string; createdAt: string; }

// Mesmo cálculo da rota que grava (lib/contracts/registro.ts): o PDF e o registro mostram a mesma data final.
const addMonths = somarMesesIso;
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
  // Quem assina pela LM em cada contrato (escolhido na hora de baixar o DOCX oficial). Default: ambos.
  const [signatoryByContract, setSignatoryByContract] = useState<Record<string, "ambos" | "roberto" | "lucas">>({});
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
  // 21/10/2026 (auditoria 3.6): falha de leitura/gravação aparece como falha, no lugar onde nasceu.
  const [listaErro, setListaErro] = useState<string | null>(null);
  const [formErro, setFormErro] = useState<string | null>(null);
  const [auditErro, setAuditErro] = useState<string | null>(null);
  const [adendosErro, setAdendosErro] = useState<string | null>(null);
  const [adendoErro, setAdendoErro] = useState<string | null>(null);
  const [salvandoAdendo, setSalvandoAdendo] = useState(false);

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
    setLoading(true);
    const { data, error } = await supabase.from("contracts").select("*").eq("client_id", client.id).order("created_at", { ascending: false });
    // Erro NÃO vira "Nenhum contrato gerado": mantém o que já estava na tela e diz que não leu.
    if (error || !data) {
      setListaErro(`Não consegui carregar os contratos${error?.message ? ` (${error.message})` : ""}.`);
      setLoading(false);
      return;
    }
    setListaErro(null);
    setContracts(data.map((r) => ({
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
      signedPdfAnteriores: lerAnteriores(r.signed_pdf_anteriores),
    })));
    setLoading(false);
  };

  const loadAudit = async (contractId: string) => {
    setAuditErro(null);
    const { data, error } = await supabase.from("contract_audit_log").select("*").eq("contract_id", contractId).order("created_at", { ascending: false });
    if (error) { setAuditEntries([]); setAuditErro("Não consegui carregar o histórico deste contrato."); return; }
    setAuditEntries((data || []).map((r) => ({ id: r.id, action: r.action, actor: r.actor, details: r.details || "", createdAt: r.created_at })));
  };

  const loadAddendums = async (contractId: string) => {
    setAdendosErro(null);
    const { data, error } = await supabase.from("contract_addendums").select("*").eq("contract_id", contractId).order("created_at", { ascending: false });
    // Antes o erro só ia pro console e a lista ficava com os adendos de OUTRO contrato aberto antes.
    if (error) { setAddendums([]); setAdendosErro("Não consegui carregar os adendos deste contrato."); return; }
    setAddendums((data || []).map((r) => ({ id: r.id, changeType: r.change_type, description: r.description, oldValue: r.old_value || "", newValue: r.new_value || "", effectiveDate: r.effective_date, generatedBy: r.generated_by, createdAt: r.created_at })));
  };

  const logAudit = async (contractId: string, action: string, details: string) => {
    await supabase.from("contract_audit_log").insert({ contract_id: contractId, action, actor: currentUser, details });
  };

  const validateClientData = (): string[] => {
    const errs: string[] = [];
    if (!client.nomeFantasia && !client.name) errs.push("Nome da empresa");
    if (!client.contactName) errs.push("Nome do responsável");
    if (!client.cnpj) errs.push("CNPJ");
    if (!client.phone) errs.push("Telefone/WhatsApp");
    if (!signerEmail) errs.push("E-mail do signatário");
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
    setFormErro(null);
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

  // 21/10/2026 (auditoria 3.6): a gravação mora em /api/contracts/gerar (só gestão). A versão sai do
  // banco, não de `contracts.length` — lista que falhou ao carregar fazia o próximo sair V1 de novo.
  // A janela SÓ fecha com a gravação confirmada; erro fica dentro dela, com o que foi digitado.
  const handleGenerate = async () => {
    if (!valor || Number(valor) <= 0) { setFormErro("Informe o valor mensal."); return; }
    if (hasRenewal && !(Number(renewalValue) > 0)) { setFormErro("Informe o novo valor do reajuste ou desmarque o reajuste."); return; }
    setGenerating(true); setFormErro(null);
    try {
      let blob: Blob;
      try {
        blob = await pdf(<ContractPDF data={buildContractData()} />).toBlob();
      } catch {
        setFormErro("Não consegui montar o PDF do contrato. Confira os dados e tente de novo.");
        return;
      }
      const fd = new FormData();
      fd.append("file", new File([blob], "contrato.pdf", { type: "application/pdf" }));
      fd.append("clientId", client.id);
      fd.append("serviceType", serviceType);
      fd.append("monthlyValue", String(Number(valor)));
      fd.append("startDate", dataInicio);
      fd.append("durationMonths", String(duracao));
      fd.append("paymentDay", String(paymentDay));
      if (renewFrom?.id) fd.append("previousContractId", renewFrom.id);
      fd.append("hasRenewal", hasRenewal ? "true" : "false");
      if (hasRenewal) fd.append("renewalValue", String(Number(renewalValue)));

      const r = await chamar<{ ok: boolean; version: number; avisos?: string[] }>("/api/contracts/gerar", fd);
      if (!r.ok || !r.data) { setFormErro(r.erro ?? "Não consegui gravar o contrato. Nada foi salvo — tente de novo."); return; }

      setShowForm(false); setPreviewUrl(null); setRenewFrom(null);
      const avisos = r.data.avisos ?? [];
      if (avisos.length) toast.warning(`Contrato V${r.data.version} gravado, mas ${avisos.join(" e ")}.`);
      else toast.success(`Contrato V${r.data.version} gravado.`);
      await loadContracts();
    } finally { setGenerating(false); }
  };

  const fecharForm = () => {
    if (generating) return; // gravando: fechar agora esconderia o resultado
    setShowForm(false); setPreviewUrl(null); setRenewFrom(null); setFormErro(null);
  };

  const handleDownloadDocx = async (c: ContractFull) => {
    const errs = validateClientData();
    if (errs.length > 0) { setDownloadError(`Dados incompletos: ${errs.join(", ")}`); return; }
    // Pra Tráfego/Lone Growth, nicho é obrigatório. Se o cliente não preencheu, pede inline.
    const needsNicho = c.serviceType === "assessoria_trafego" || c.serviceType === "lone_growth" || c.serviceType === "trafego_social_site";
    const currentNicho = (nichoOverride ?? client.nicho ?? "").trim();
    if (needsNicho && !currentNicho) {
      const entered = window.prompt("Qual o nicho/ramo da empresa? (aparece na cláusula 1.1 do contrato)\nEx: varejo de moda, odontologia, restaurante");
      if (entered === null) return; // usuário cancelou — não mostra erro
      if (!entered.trim()) { setDownloadError("Nicho é obrigatório para contratos de Tráfego, Lone Growth e Tráfego+Social+Site."); return; }
      const nichoValue = entered.trim();
      await supabase.from("clients").update({ nicho: nichoValue }).eq("id", client.id);
      setNichoOverride(nichoValue); // evita re-prompt no mesmo ciclo; parent vai sincronizar no próximo fetch
    }
    setDownloadingDocx(c.id); setDownloadError("");
    try {
      const res = await authedFetch("/api/contracts/download-docx", {
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
          startDate: c.startDate || undefined,
          signatory: signatoryByContract[c.id] ?? "ambos",
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
  // `substituir`: "Trocar PDF assinado" (24/10/2026, auditoria 3.13) — a rota guarda o anterior em
  // contracts.signed_pdf_anteriores e não apaga o arquivo antigo do storage.
  const handleUploadSigned = (contractId: string, substituir = false) => {
    if (uploadingSignedRef.current) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setDownloadError(`"${file.name}" não é PDF — envie o contrato assinado em PDF.`);
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setDownloadError(`"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB — o limite é 20 MB.`);
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
        if (substituir) fd.append("substituir", "1");
        const r = await chamar<{ avisos?: string[] }>("/api/contracts/upload-signed", fd);
        if (!r.ok) { setDownloadError(r.erro ?? "Falha no upload"); return; }
        // Na troca o histórico é gravado pela rota (com a referência do anterior).
        if (!substituir) await logAudit(contractId, "signed_uploaded", "PDF assinado recebido e armazenado no cofre");
        if (r.data?.avisos?.length) toast.warning(`PDF assinado salvo, mas ${r.data.avisos.join("; ")}.`);
        else if (substituir) toast.success("PDF assinado trocado. O anterior ficou guardado em \"PDFs anteriores\".");
        await loadContracts();
      } finally {
        uploadingSignedRef.current = null;
        setUploadingSignedId(null);
      }
    };
    input.click();
  };

  const trocarAssinado = (c: ContractFull) => {
    const quando = c.signedAt ? new Date(c.signedAt).toLocaleDateString("pt-BR") : null;
    const ok = window.confirm(
      `Trocar o PDF assinado do Contrato V${c.version}?\n\n` +
      `O atual${quando ? ` (enviado em ${quando}${c.signedUploadedBy ? ` por ${c.signedUploadedBy}` : ""})` : ""} NÃO é apagado: ` +
      "fica guardado em \"PDFs anteriores\" e dá para abrir quando quiser.",
    );
    if (ok) handleUploadSigned(c.id, true);
  };

  // Abre o PDF assinado via signed URL (5 min TTL). Cada acesso gera linha em vault_access_log.
  const handleViewSigned = async (signedPath: string) => {
    try {
      const res = await authedFetch("/api/storage/signed-url", {
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

  // 21/10/2026 (auditoria 3.6): grava pela rota e SÓ limpa o texto quando gravou. Antes o insert
  // falhava calado e o formulário era zerado do mesmo jeito — o adendo e o texto sumiam juntos.
  const handleAddendum = async (contractId: string) => {
    if (!addendumForm.description.trim()) { setAdendoErro("Descreva a alteração do adendo."); return; }
    if (salvandoAdendo) return;
    setSalvandoAdendo(true); setAdendoErro(null);
    const r = await chamar<{ ok: boolean; avisos?: string[] }>("/api/contracts/adendo", { contractId, ...addendumForm });
    setSalvandoAdendo(false);
    if (!r.ok) { setAdendoErro(r.erro ?? "Não consegui gravar o adendo. Seu texto continua aqui — tente de novo."); return; }
    setAddendumForm({ changeType: "valor", description: "", oldValue: "", newValue: "", effectiveDate: new Date().toISOString().slice(0, 10) });
    const avisos = r.data?.avisos ?? [];
    if (avisos.length) toast.warning(`Adendo gravado, mas ${avisos.join(" e ")}.`);
    else toast.success("Adendo registrado.");
    await loadAddendums(contractId); // a seção fica aberta: dá para ver o adendo que acabou de entrar
  };

  // Find expiring contracts (within 30 days)
  const expiringContracts = contracts.filter((c) => c.status === "active" && daysUntil(c.endDate) <= 30 && daysUntil(c.endDate) > 0);
  const expiredContracts = contracts.filter((c) => c.status === "active" && daysUntil(c.endDate) <= 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">Gestão de contratos</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLegacyModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted text-xs text-foreground transition-colors"
            title="Anexar contrato já assinado fora do sistema"
          >
            <FileCheck2 size={12} /> Anexar existente
          </button>
          <button onClick={() => openForm()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-xs font-medium transition-colors">
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
        <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg p-4 space-y-2">
          <p className="text-xs font-medium text-lone-warning flex items-center gap-1.5"><AlertTriangle size={12} /> Contratos próximos do vencimento</p>
          {expiringContracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">V{c.version} — vence em <span className="text-lone-warning font-medium">{daysUntil(c.endDate)} dias</span> ({c.endDate})</p>
              <button onClick={() => openForm(c)} className="text-[10px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 flex items-center gap-1">
                <RefreshCw size={10} /> Renovar
              </button>
            </div>
          ))}
        </div>
      )}

      {expiredContracts.length > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-4 space-y-2">
          <p className="text-xs font-medium text-destructive flex items-center gap-1.5"><AlertTriangle size={12} /> Contratos vencidos</p>
          {expiredContracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">V{c.version} — venceu em {c.endDate}</p>
              <button onClick={() => openForm(c)} className="text-[10px] px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 flex items-center gap-1">
                <RefreshCw size={10} /> Renovar
              </button>
            </div>
          ))}
        </div>
      )}

      {downloadError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{downloadError}</p>
          <button onClick={() => setDownloadError("")} className="ml-auto text-destructive/50 hover:text-destructive"><X size={12} /></button>
        </div>
      )}

      {/* Falha ao listar: aparece como falha, com "tentar de novo" — nunca como "nenhum contrato". */}
      {listaErro && !loading && (
        <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg p-4 flex items-start gap-2">
          <AlertTriangle size={14} className="text-lone-warning mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-xs font-medium text-lone-warning">{listaErro}</p>
            <p className="text-[11px] text-muted-foreground">
              {contracts.length ? "A lista abaixo pode estar desatualizada." : "Isso não quer dizer que o cliente não tem contrato."}
            </p>
          </div>
          <button onClick={() => loadContracts()} className="text-[11px] px-2.5 py-1 rounded-lg border border-lone-warning-border text-lone-warning hover:bg-card flex items-center gap-1 shrink-0">
            <RefreshCw size={10} /> Tentar de novo
          </button>
        </div>
      )}

      {/* Contract list */}
      {loading && contracts.length === 0 ? <div className="flex justify-center py-10"><Loader2 size={20} className="text-primary animate-spin" /></div> : listaErro && contracts.length === 0 ? null : contracts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText size={32} className="text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhum contrato gerado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => {
            const isSending = downloadingDocx === c.id;
            const days = daysUntil(c.endDate);
            const prevContract = c.previousContractId ? contracts.find((x) => x.id === c.previousContractId) : null;
            const statusBadge = c.status === "active"
              ? { label: "Ativo", cls: "bg-lone-success-bg text-lone-success border-lone-success-border" }
              : c.status === "expired"
                ? { label: "Vencido", cls: "bg-destructive/10 text-destructive border-destructive/20" }
                : { label: "Rascunho", cls: "bg-muted text-muted-foreground border-border" };

            return (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-3 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.status === "active" ? "bg-lone-success-bg" : "bg-primary/10"}`}>
                      {c.status === "active" ? <CheckCircle size={18} className="text-lone-success" /> : <FileText size={18} className="text-primary" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        Contrato V{c.version} — {SERVICE_LABELS[c.serviceType] || c.serviceType}
                        {prevContract && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><ArrowRight size={8} /> Renovação V{prevContract.version}</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.monthlyValue > 0 ? `${formatCurrency(c.monthlyValue)}/mês` : "Valor no PDF"} x {c.durationMonths}m | {c.startDate} a {c.endDate} | Pgto dia {c.paymentDay || 10}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2.5 py-1 rounded-lg ${statusBadge.cls} border font-medium`}>{statusBadge.label}</span>
                    {days > 0 && days <= 30 && c.status === "active" && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-lone-warning-bg text-lone-warning border border-lone-warning-border">Vence em {days}d</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {c.pdfUrl && (
                    <>
                      <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-primary/30 hover:text-primary"><Eye size={11} /> PDF</a>
                      <a href={c.pdfUrl} download target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-primary/30 hover:text-primary"><Download size={11} /></a>
                    </>
                  )}
                  <button onClick={() => { setShowAudit(showAudit === c.id ? null : c.id); if (showAudit !== c.id) loadAudit(c.id); }}
                    className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-border"><History size={11} /> Histórico</button>
                  <button onClick={() => { setAdendoErro(null); setShowAddendum(showAddendum === c.id ? null : c.id); if (showAddendum !== c.id) loadAddendums(c.id); }}
                    className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-border"><PenLine size={11} /> Adendo</button>

                  <div className="ml-auto flex items-center gap-1.5">
                    <select
                      value={signatoryByContract[c.id] ?? "ambos"}
                      onChange={(e) => setSignatoryByContract((prev) => ({ ...prev, [c.id]: e.target.value as "ambos" | "roberto" | "lucas" }))}
                      title="Quem assina pela LM neste contrato"
                      className="bg-surface border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary/50">
                      <option value="ambos">Assina: Lucas e Roberto</option>
                      <option value="roberto">Assina: só Roberto</option>
                      <option value="lucas">Assina: só Lucas</option>
                    </select>
                    <button onClick={() => handleDownloadDocx(c)} disabled={isSending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lone-success-bg text-lone-success text-xs font-medium hover:bg-lone-success-bg border border-lone-success-border disabled:opacity-50"
                      title="Baixa o contrato oficial preenchido (.docx) para você subir manualmente no D4Sign e enviar pra assinatura">
                      {isSending ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                      {isSending ? "Gerando..." : "Baixar DOCX Oficial"}
                    </button>
                  </div>

                  {/* Upload do PDF assinado (pós D4Sign) OU ver o assinado se já subiu */}
                  {c.signedPdfPath ? (
                    <>
                      <button onClick={() => handleViewSigned(c.signedPdfPath!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 border border-primary/20"
                        title={`Assinado em ${c.signedAt ? new Date(c.signedAt).toLocaleDateString("pt-BR") : ""}${c.signedUploadedBy ? ` por ${c.signedUploadedBy}` : ""}`}>
                        <FileCheck2 size={11} /> Ver Assinado
                      </button>
                      {/* PDF errado tinha de ficar para sempre (24/10/2026, auditoria 3.13). */}
                      <button onClick={() => trocarAssinado(c)} disabled={uploadingSignedId === c.id}
                        className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-primary/30 hover:text-primary disabled:opacity-50"
                        title="Substitui o PDF assinado; o atual fica guardado em PDFs anteriores">
                        {uploadingSignedId === c.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                        {uploadingSignedId === c.id ? "Enviando..." : "Trocar PDF assinado"}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleUploadSigned(c.id)} disabled={uploadingSignedId === c.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 border border-primary/20 disabled:opacity-50"
                      title="Upload do PDF assinado pelo cliente (D4Sign) para fechar o contrato.">
                      {uploadingSignedId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                      {uploadingSignedId === c.id ? "Enviando..." : "Upload Assinado"}
                    </button>
                  )}

                  {c.signedAt && (
                    <span className="flex items-center gap-1 text-[10px] text-lone-success" title={`Assinado em ${new Date(c.signedAt).toLocaleDateString("pt-BR")}`}>
                      <CheckCircle size={11} /> Assinado
                    </span>
                  )}
                </div>

                {/* PDFs assinados que já valeram: trocar não apaga, e dá para abrir o anterior. */}
                {(c.signedPdfAnteriores?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="uppercase tracking-wider">PDFs anteriores:</span>
                    {c.signedPdfAnteriores!.map((a) => (
                      <button key={a.path} onClick={() => handleViewSigned(a.path)}
                        className="underline hover:text-primary"
                        title={`Trocado em ${new Date(a.substituidoEm).toLocaleString("pt-BR")} por ${a.substituidoPor}`}>
                        enviado {a.assinadoEm ? new Date(a.assinadoEm).toLocaleDateString("pt-BR") : "—"}{a.enviadoPor ? ` por ${a.enviadoPor}` : ""}
                      </button>
                    ))}
                  </div>
                )}

                {/* Audit log */}
                {showAudit === c.id && (
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase">Histórico de Ações</p>
                    {auditErro ? (
                      <p className="text-[10px] text-lone-warning flex items-center gap-1.5">
                        <AlertTriangle size={10} /> {auditErro}
                        <button onClick={() => loadAudit(c.id)} className="underline hover:text-foreground">Tentar de novo</button>
                      </p>
                    ) : auditEntries.length === 0 ? <p className="text-[10px] text-muted-foreground">Nenhum registro</p> : auditEntries.map((a) => (
                      <div key={a.id} className="flex items-start gap-2 text-[10px]">
                        <span className="text-muted-foreground shrink-0">{new Date(a.createdAt).toLocaleDateString("pt-BR")}</span>
                        <span className="text-muted-foreground">{a.actor}</span>
                        <span className="text-foreground">{a.details}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Addendum section */}
                {showAddendum === c.id && (
                  <div className="border-t border-border pt-3 space-y-3">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase">Adendos Contratuais</p>
                    {adendosErro && (
                      <p className="text-[10px] text-lone-warning flex items-center gap-1.5">
                        <AlertTriangle size={10} /> {adendosErro}
                        <button onClick={() => loadAddendums(c.id)} className="underline hover:text-foreground">Tentar de novo</button>
                      </p>
                    )}
                    {addendums.map((a) => (
                      <div key={a.id} className="rounded-lg border border-border bg-surface p-3 space-y-1">
                        <div className="flex justify-between">
                          <p className="text-xs font-medium text-foreground">{a.changeType === "valor" ? "Alteração de Valor" : a.changeType === "servico" ? "Inclusão de Serviço" : "Outro"}</p>
                          <span className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("pt-BR")} por {a.generatedBy}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{a.description}</p>
                        {(a.oldValue || a.newValue) && (
                          <p className="text-[10px] text-muted-foreground"><span className="line-through text-destructive">{a.oldValue}</span> <ArrowRight size={8} className="inline" /> <span className="text-lone-success">{a.newValue}</span></p>
                        )}
                      </div>
                    ))}
                    {/* New addendum form */}
                    <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
                      <p className="text-[10px] text-muted-foreground">Novo Adendo</p>
                      <select value={addendumForm.changeType} onChange={(e) => setAddendumForm((p) => ({ ...p, changeType: e.target.value }))}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none">
                        <option value="valor">Alteração de Valor</option>
                        <option value="servico">Inclusão de Serviço</option>
                        <option value="prazo">Alteração de Prazo</option>
                        <option value="outro">Outro</option>
                      </select>
                      <textarea value={addendumForm.description} onChange={(e) => setAddendumForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Descrição da alteração..." rows={2}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none resize-none" />
                      <div className="grid grid-cols-3 gap-2">
                        <input value={addendumForm.oldValue} onChange={(e) => setAddendumForm((p) => ({ ...p, oldValue: e.target.value }))} placeholder="Valor anterior"
                          className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none" />
                        <input value={addendumForm.newValue} onChange={(e) => setAddendumForm((p) => ({ ...p, newValue: e.target.value }))} placeholder="Novo valor"
                          className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none" />
                        <input type="date" value={addendumForm.effectiveDate} onChange={(e) => setAddendumForm((p) => ({ ...p, effectiveDate: e.target.value }))}
                          className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none" />
                      </div>
                      {adendoErro && (
                        <p className="text-[11px] text-destructive flex items-start gap-1.5"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {adendoErro}</p>
                      )}
                      <button onClick={() => handleAddendum(c.id)} disabled={!addendumForm.description.trim() || salvandoAdendo}
                        className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 border border-primary/20 disabled:opacity-50">
                        {salvandoAdendo ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} {salvandoAdendo ? "Registrando..." : "Registrar Adendo"}
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
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4" onClick={fecharForm}>
          <div className="bg-card border border-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">{renewFrom ? `Renovar Contrato V${renewFrom.version}` : "Gerar Contrato"}</h3>
              <button onClick={fecharForm} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg p-3 space-y-1">
                  <p className="text-xs font-medium text-lone-warning flex items-center gap-1"><AlertTriangle size={12} /> Dados incompletos no cadastro</p>
                  <p className="text-[10px] text-lone-warning">Preencha na aba Dados antes de enviar: {validationErrors.join(", ")}</p>
                </div>
              )}

              {renewFrom && (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
                  <p className="text-xs text-primary flex items-center gap-1"><RefreshCw size={11} /> Renovação do Contrato V{renewFrom.version} ({formatCurrency(renewFrom.monthlyValue)}/mês)</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Serviço</label>
                <div className="grid grid-cols-2 gap-2">
                  {([{ v: "assessoria_trafego", l: "Tráfego" }, { v: "assessoria_social", l: "Social" }, { v: "lone_growth", l: "Growth" }, { v: "trafego_social_site", l: "Tráfego+Social+Site" }]).map((o) => (
                    <button key={o.v} onClick={() => setServiceType(o.v as typeof serviceType)}
                      className={`p-2.5 rounded-lg border text-xs text-center transition-all ${serviceType === o.v ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{o.l}</button>
                  ))}
                </div>
                {(serviceType === "assessoria_trafego" || serviceType === "lone_growth" || serviceType === "trafego_social_site") && !(nichoOverride ?? client.nicho)?.trim() && (
                  <p className="text-[10px] text-lone-warning flex items-center gap-1 mt-1">
                    <AlertTriangle size={10} /> Nicho do cliente vazio — será pedido na hora de baixar o DOCX oficial.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1"><DollarSign size={10} /> Valor (R$)</label>
                  <input type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.00"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Calendar size={10} /> Início</label>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Dia Pgto</label>
                  <input type="number" min={1} max={31} value={paymentDay} onChange={(e) => setPaymentDay(Number(e.target.value) || 10)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Clock size={10} /> Duração</label>
                <div className="flex gap-2">
                  {[3, 6, 12].map((m) => (
                    <button key={m} onClick={() => setDuracao(m)} className={`flex-1 py-2 rounded-lg border text-xs transition-all ${duracao === m ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{m}m</button>
                  ))}
                  <button
                    onClick={() => { if ([3, 6, 12].includes(duracao)) setDuracao(5); }}
                    className={`flex-1 py-2 rounded-lg border text-xs transition-all ${![3, 6, 12].includes(duracao) ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
                  >
                    Personalizado
                  </button>
                </div>
                {![3, 6, 12].includes(duracao) && (
                  <div className="pt-2">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Meses (1 a 36)</label>
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
                      className="mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Ex: cliente com primeiro mês cortesia → coloque 5 (a cobrança começa no mês 2 até o mês 6).
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
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-xs font-medium text-foreground">Terá reajuste após os {duracao} meses iniciais?</span>
                </label>
                {hasRenewal ? (
                  <div className="space-y-1.5 pl-6">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Novo valor mensal (pos-reajuste)</label>
                    <input
                      type="number"
                      value={renewalValue}
                      onChange={(e) => setRenewalValue(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    />
                    {renewalValue && Number(renewalValue) > 0 && Number(valor) > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Reajuste: {formatCurrency(Number(valor))} → {formatCurrency(Number(renewalValue))} ({Number(renewalValue) > Number(valor) ? "+" : ""}{(((Number(renewalValue) - Number(valor)) / Number(valor)) * 100).toFixed(1)}%)
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground pl-6">Sem reajuste — contrato inclui cláusula de valor mantido durante todo o período.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Mail size={10} /> E-mail Signatário</label>
                <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="email@cliente.com"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>

              {valor && Number(valor) > 0 && (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-1">
                  <p className="text-sm text-foreground"><span className="font-medium">{client.nomeFantasia || client.name}</span></p>
                  <p className="text-sm text-primary font-semibold">{formatCurrency(Number(valor))}/mês x {duracao}m = {formatCurrency(Number(valor) * duracao)}</p>
                  <p className="text-[10px] text-muted-foreground">{dataInicio} a {addMonths(dataInicio, duracao)} | Pagamento dia {paymentDay}</p>
                </div>
              )}

              <div className="rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3 flex items-start gap-2">
                <AlertTriangle size={12} className="text-lone-warning mt-0.5 shrink-0" />
                <p className="text-[10px] text-lone-warning leading-relaxed">
                  <span className="font-medium">PDF abaixo é apenas preview/rascunho.</span> O documento oficial com template Lone Mídia (e cláusula de reajuste se habilitada) é gerado no botão <span className="font-medium">&quot;Baixar DOCX Oficial&quot;</span> na lista de contratos.
                </p>
              </div>
            </div>

            {previewUrl && <div className="px-5 pb-3"><iframe src={previewUrl} className="w-full h-[400px] rounded-lg border border-border bg-card" /></div>}

            {/* Erro de gravação junto do botão: a janela continua aberta com tudo que foi preenchido. */}
            {formErro && (
              <div className="mx-5 rounded-lg border border-lone-danger-border bg-lone-danger-bg p-3 flex items-start gap-2">
                <AlertTriangle size={13} className="text-lone-danger mt-0.5 shrink-0" />
                <p className="text-xs text-lone-danger">{formErro}</p>
              </div>
            )}

            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={fecharForm} disabled={generating} className="btn-ghost flex-1 text-sm border border-border disabled:opacity-50">Cancelar</button>
              <button onClick={handlePreview} disabled={!valor || Number(valor) <= 0}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-primary/20 text-primary text-sm hover:bg-primary/10 disabled:opacity-50 py-2.5"><Eye size={13} /> Preview</button>
              <button onClick={handleGenerate} disabled={generating || !valor || Number(valor) <= 0}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-sm disabled:opacity-50 py-2.5">
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {generating ? "Gerando..." : renewFrom ? "Gerar Renovação" : "Gerar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
