"use client";

import { useState, useEffect } from "react";
import type { Client, Role, ServiceType } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import {
  Building2, Shield, FileText, Eye, EyeOff, Download, Upload,
  Pencil, Check, Loader2, AlertTriangle, Send, ExternalLink,
  Link as LinkIcon, Clock, CheckCircle, Mail, Settings,
} from "lucide-react";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";

interface Props {
  client: Client;
  role: Role;
  currentUser: string;
  updateClientData: (id: string, data: Partial<Client>) => void;
  onNavigateTab: (tab: string) => void;
  generateOnboardingLink: () => void;
  generatingLink: boolean;
  onboardingLink?: string | null;
}

type Tab = "overview" | "dados" | "contratos" | "chat" | "historico" | "tasks" | "content" | "onboarding" | "wallet" | "reports";

export default function DadosTab({ client, role, currentUser, updateClientData, onNavigateTab, generateOnboardingLink, generatingLink, onboardingLink }: Props) {
  const isAdmin = role === "admin" || role === "manager";
  const team = useTeamMembers();

  const [logoPdfBusy, setLogoPdfBusy] = useState(false);
  const [logoPdfError, setLogoPdfError] = useState<string | null>(null);
  const downloadLogoPdf = async () => {
    setLogoPdfBusy(true);
    setLogoPdfError(null);
    try {
      const res = await authedFetch(`/api/clients/${client.id}/logo-pdf`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logo-${(client.nomeFantasia || client.name || "cliente").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setLogoPdfError(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setLogoPdfBusy(false);
    }
  };
  // Baixa a logo crua (imagem) — útil pro social/designer usar nas artes.
  const downloadLogo = async () => {
    setLogoPdfBusy(true);
    setLogoPdfError(null);
    try {
      const res = await authedFetch(`/api/clients/${client.id}/logo`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "png").replace("svg+xml", "svg").replace("jpeg", "jpg");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logo-${(client.nomeFantasia || client.name || "cliente").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setLogoPdfError(e instanceof Error ? e.message : "Erro ao baixar logo");
    } finally {
      setLogoPdfBusy(false);
    }
  };

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showPw, setShowPw] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [latestContract, setLatestContract] = useState<{ status: string; endDate: string; version: number } | null>(null);

  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sent" | "error">("idle");

  const handleResendWelcome = async () => {
    setEmailSending(true);
    setEmailStatus("idle");
    try {
      const res = await authedFetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_welcome", clientId: client.id, force: true }),
      });
      const data = await res.json();
      setEmailStatus(data.success || data.skipped ? "sent" : "error");
    } catch {
      setEmailStatus("error");
    }
    setEmailSending(false);
    setTimeout(() => setEmailStatus("idle"), 3000);
  };

  const companyName = client.nomeFantasia || client.razaoSocial || client.name;
  const companyInitial = companyName.charAt(0).toUpperCase();

  const initForm = () => ({
    nomeFantasia: client.nomeFantasia || "", razaoSocial: client.razaoSocial || "",
    cnpj: client.cnpj || "", nicho: client.nicho || "",
    contactName: client.contactName || "",
    cpfCnpj: client.cpfCnpj || "", phone: client.phone || "",
    emailCorporativo: client.emailCorporativo || "",
    enderecoRua: client.enderecoRua || "", enderecoNumero: client.enderecoNumero || "",
    enderecoBairro: client.enderecoBairro || "",
    enderecoCidade: client.enderecoCidade || "", enderecoEstado: client.enderecoEstado || "",
    enderecoCep: client.enderecoCep || "",
    facebookLogin: client.facebookLogin || "", facebookPassword: client.facebookPassword || "",
    instagramLogin: client.instagramLogin || "", instagramPassword: client.instagramPassword || "",
    googleAdsLogin: client.googleAdsLogin || "", googleAdsPassword: client.googleAdsPassword || "",
    serviceType: client.serviceType || "",
    assignedTraffic: client.assignedTraffic || "",
    assignedSocial: client.assignedSocial || "",
    assignedDesigner: client.assignedDesigner || "",
  });

  useEffect(() => { setForm(initForm()); }, [client.id]);

  useEffect(() => {
    let mounted = true;
    import("@/lib/supabase/client").then(({ supabase }) => {
      supabase.from("contracts").select("status, end_date, version")
        .eq("client_id", client.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
        .then(({ data, error }) => {
          if (!mounted || error) return;
          if (data) setLatestContract({ status: data.status as string, endDate: data.end_date as string, version: data.version as number });
        });
    });
    return () => { mounted = false; };
  }, [client.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Separamos campos não-sensíveis (via updateClientData, caminho normal)
      // de senhas (via /api/client-vault que criptografa server-side).
      updateClientData(client.id, {
        nomeFantasia: form.nomeFantasia || undefined, razaoSocial: form.razaoSocial || undefined,
        cnpj: form.cnpj || undefined, nicho: form.nicho || undefined,
        contactName: form.contactName || undefined,
        cpfCnpj: form.cpfCnpj || undefined, phone: form.phone || undefined,
        emailCorporativo: form.emailCorporativo || undefined,
        email: form.emailCorporativo || undefined,
        enderecoRua: form.enderecoRua || undefined, enderecoNumero: form.enderecoNumero || undefined,
        enderecoBairro: form.enderecoBairro || undefined,
        enderecoCidade: form.enderecoCidade || undefined, enderecoEstado: form.enderecoEstado || undefined,
        enderecoCep: form.enderecoCep || undefined,
        // Logins (não-sensível) ainda via path normal
        facebookLogin: form.facebookLogin || undefined,
        instagramLogin: form.instagramLogin || undefined,
        googleAdsLogin: form.googleAdsLogin || undefined,
        // Operational fields
        serviceType: (form.serviceType as ServiceType) || undefined,
        assignedTraffic: form.assignedTraffic || undefined,
        assignedSocial: form.assignedSocial || undefined,
        assignedDesigner: form.assignedDesigner || undefined,
      });

      // Senhas: só envia se foi editada (evita regravar blob criptografado com string vazia).
      const pwUpdates: { field: string; value: string }[] = [];
      if (form.facebookPassword && form.facebookPassword !== "••••••••") pwUpdates.push({ field: "facebook_password", value: form.facebookPassword });
      if (form.instagramPassword && form.instagramPassword !== "••••••••") pwUpdates.push({ field: "instagram_password", value: form.instagramPassword });
      if (form.googleAdsPassword && form.googleAdsPassword !== "••••••••") pwUpdates.push({ field: "google_ads_password", value: form.googleAdsPassword });

      for (const u of pwUpdates) {
        await authedFetch("/api/client-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: client.id, table: "clients", field: u.field, value: u.value }),
        }).catch((err) => console.error("[vault] save failed:", u.field, err));
      }

      setEditing(false);
    } finally { setSaving(false); }
  };

  // Fetch plaintext de uma senha (lazy, on-demand). Ao revelar, preenche form[pwKey]
  // pra admin copiar/ver. Cada call gera entrada em vault_access_log (audit LGPD).
  // Mapeamento: loginKey → coluna no DB
  const pwFieldMap: Record<string, string> = {
    facebookPassword: "facebook_password",
    instagramPassword: "instagram_password",
    googleAdsPassword: "google_ads_password",
  };

  const [revealingPw, setRevealingPw] = useState<string | null>(null);
  const revealPassword = async (pwKey: string): Promise<void> => {
    const field = pwFieldMap[pwKey];
    if (!field) return;
    setRevealingPw(pwKey);
    try {
      const res = await authedFetch(`/api/client-vault?clientId=${client.id}&table=clients&field=${field}`);
      if (!res.ok) {
        setForm((p) => ({ ...p, [pwKey]: "" }));
        return;
      }
      const data = await res.json();
      setForm((p) => ({ ...p, [pwKey]: data.value ?? "" }));
    } catch {
      setForm((p) => ({ ...p, [pwKey]: "" }));
    } finally {
      setRevealingPw(null);
    }
  };

  const handleDocUpload = async (file: File, docType: string) => {
    setUploading(docType);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("clientId", client.id); fd.append("docType", docType);
      const res = await authedFetch("/api/onboarding/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        const field = docType === "contrato_social" ? "docContratoSocial" : docType === "identidade" ? "docIdentidade" : "docLogo";
        updateClientData(client.id, { [field]: data.url });
      } else {
        setUploadError(data.error ?? "Falha no upload");
        setTimeout(() => setUploadError(null), 5000);
      }
    } catch {
      setUploadError("Erro de conexão no upload");
      setTimeout(() => setUploadError(null), 5000);
    } finally { setUploading(null); }
  };

  const copyToClip = (text: string) => { navigator.clipboard.writeText(text).catch(() => {}); };

  const accessCards = [
    { platform: "Meta / Facebook Ads", icon: "📘", loginKey: "facebookLogin", pwKey: "facebookPassword", testUrl: "https://business.facebook.com", roles: ["admin", "manager", "traffic"] },
    { platform: "Instagram", icon: "📷", loginKey: "instagramLogin", pwKey: "instagramPassword", testUrl: "https://www.instagram.com/accounts/login/", roles: ["admin", "manager", "social"] },
    { platform: "Google Ads", icon: "🔍", loginKey: "googleAdsLogin", pwKey: "googleAdsPassword", testUrl: "https://ads.google.com", roles: ["admin", "manager", "traffic"] },
  ].filter(({ roles }) => roles.includes(role));

  // Pendencies
  const missing: string[] = [];
  if (!form.nomeFantasia) missing.push("Nome Fantasia");
  if (!form.cnpj) missing.push("CNPJ");
  if (!form.phone) missing.push("WhatsApp");
  if (!form.emailCorporativo) missing.push("E-mail");
  if (!form.facebookLogin) missing.push("Acesso Meta/Facebook");
  if (!form.instagramLogin) missing.push("Acesso Instagram");
  if (!form.googleAdsLogin) missing.push("Acesso Google Ads");
  if (!client.docContratoSocial) missing.push("Contrato Social");
  if (!client.docIdentidade) missing.push("Documento RG/CNH");
  if (!client.docLogo) missing.push("Logo da Empresa");

  // Private docs (legal-docs bucket) are stored as "legal://<path>" and need a signed URL.
  // Legacy entries stored as "/storage/..." or full URLs open directly.
  const isPrivateRef = (ref: string) => ref.startsWith("legal://");

  const resolvePrivateUrl = async (ref: string, forDownload = false): Promise<string | null> => {
    try {
      const res = await authedFetch("/api/storage/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ref, download: forDownload }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        console.error("[signed-url]", data.error);
        return null;
      }
      return data.url as string;
    } catch (e) {
      console.error("[signed-url] fetch failed", e);
      return null;
    }
  };

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const handleSecureOpen = async (ref: string, docType: string, forDownload: boolean) => {
    setOpenError(null);
    if (!isPrivateRef(ref)) {
      window.open(ref, "_blank", "noopener,noreferrer");
      return;
    }
    setOpening(`${docType}-${forDownload ? "dl" : "view"}`);
    // Para download, pede URL com Content-Disposition: attachment
    // Para visualizar, pede URL normal (browser abre inline)
    const signed = await resolvePrivateUrl(ref, forDownload);
    setOpening(null);
    if (!signed) {
      setOpenError("Não foi possível gerar o link. Verifique sua sessão.");
      setTimeout(() => setOpenError(null), 5000);
      return;
    }
    // Abre em nova aba — browser faz download se Content-Disposition for attachment,
    // ou exibe inline (PDF/imagem) se for visualizar
    window.open(signed, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Logo + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {client.docLogo ? (
            <img src={client.docLogo} alt="Logo" className="w-12 h-12 rounded-xl object-contain border border-border bg-card" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">{companyInitial}</span>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-foreground">{companyName}</p>
            <p className="text-[10px] text-muted-foreground">QG de Informacoes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={generateOnboardingLink} disabled={generatingLink}
              className="btn-ghost text-xs flex items-center gap-1.5 border border-border hover:border-lone-warning-border hover:text-lone-warning">
              {generatingLink ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Link de Correcao
            </button>
          )}
          {isAdmin && editing ? (
            <>
              <button onClick={() => { setForm(initForm()); setEditing(false); }} className="btn-ghost text-xs border border-border">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-xs font-medium transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar Alteracoes
              </button>
            </>
          ) : isAdmin ? (
            <button onClick={() => setEditing(true)} className="btn-ghost text-xs flex items-center gap-1.5 border border-border hover:border-primary/30 hover:text-primary">
              <Pencil size={12} /> Editar Dados
            </button>
          ) : null}
        </div>
      </div>

      {/* Link de Correção gerado */}
      {onboardingLink && (
        <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg/[0.03] p-4 space-y-2">
          <p className="text-xs font-medium text-lone-warning flex items-center gap-1.5">
            <LinkIcon size={12} /> Link de Preenchimento Gerado
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={onboardingLink}
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none select-all"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={() => copyToClip(onboardingLink)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-lone-warning-bg text-lone-warning text-xs font-medium hover:bg-lone-warning-bg transition-colors border border-lone-warning-border whitespace-nowrap"
            >
              <LinkIcon size={11} /> Copiar
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent("Olá! Segue o link para preencher/corrigir seus dados: " + onboardingLink)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-lone-success-bg text-lone-success text-xs font-medium hover:bg-lone-success-bg transition-colors border border-lone-success-border whitespace-nowrap"
            >
              Enviar WA
            </a>
          </div>
        </div>
      )}

      {/* Pendencies */}
      {missing.length > 0 && (
        <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg/[0.03] p-4">
          <p className="text-xs font-medium text-lone-warning flex items-center gap-1.5 mb-2">
            <AlertTriangle size={12} /> {missing.length} {missing.length === 1 ? "pendencia" : "pendencias"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((m) => <span key={m} className="text-[10px] px-2 py-1 rounded-lg bg-lone-warning-bg text-lone-warning border border-lone-warning-border">{m}</span>)}
          </div>
        </div>
      )}

      {/* BLOCO 0: Identidade Visual — em destaque, visivel a todos (team precisa do logo) */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent p-5">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Identidade Visual
        </p>
        <div className="flex items-center gap-5">
          <div className="shrink-0">
            {client.docLogo ? (
              <div className="w-28 h-28 rounded-2xl border border-border bg-card flex items-center justify-center overflow-hidden p-2">
                <img src={client.docLogo} alt={`Logo ${companyName}`} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-lone-warning-border bg-lone-warning-bg/[0.02] flex flex-col items-center justify-center gap-1.5">
                <AlertTriangle size={18} className="text-lone-warning" />
                <span className="text-[10px] text-lone-warning text-center px-2">Logo pendente</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground truncate">{companyName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {client.docLogo ? "Disponivel para equipe social e design" : "Solicite ao cliente via link de correcao"}
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {client.docLogo && (
                <>
                  <button onClick={downloadLogo} disabled={logoPdfBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 transition-colors disabled:opacity-50">
                    {logoPdfBusy ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} Baixar Logo
                  </button>
                  <a href={client.docLogo} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-foreground text-xs font-medium border border-border hover:border-primary/30 transition-colors">
                    <Eye size={11} /> Visualizar
                  </a>
                  <button onClick={downloadLogoPdf} disabled={logoPdfBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-foreground text-xs font-medium border border-border hover:border-primary/30 transition-colors disabled:opacity-50">
                    {logoPdfBusy ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
                    {logoPdfBusy ? "Gerando..." : "Logo (PDF)"}
                  </button>
                </>
              )}
              {logoPdfError && <span className="text-[10px] text-destructive w-full">{logoPdfError}</span>}
              {/* Upload da logo liberado pra TODO o time (social/designer/admin) — logo não é sensível.
                  Mostra "Trocar Logo" quando já existe uma, pra permitir atualizar. */}
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-foreground text-xs font-medium border border-dashed border-border hover:border-primary/30 transition-colors cursor-pointer">
                {uploading === "logo" ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                {uploading === "logo" ? "Enviando..." : (client.docLogo ? "Trocar Logo" : "Enviar Logo")}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0]; if (f) handleDocUpload(f, "logo"); e.target.value = "";
                }} />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Contract status — RESTRITO a admin/manager (operadores não veem contrato/valor) */}
      {isAdmin && (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            !latestContract ? "bg-muted" : latestContract.status === "active" ? "bg-lone-success-bg" : latestContract.status === "expired" ? "bg-destructive/10" : "bg-muted"
          }`}>
            {!latestContract ? <FileText size={18} className="text-muted-foreground" /> :
             latestContract.status === "active" ? <CheckCircle size={18} className="text-lone-success" /> :
             latestContract.status === "expired" ? <Clock size={18} className="text-destructive" /> :
             <FileText size={18} className="text-muted-foreground" />}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status Juridico</p>
            <p className="text-sm font-medium text-foreground">
              {!latestContract ? "Nenhum contrato" :
               latestContract.status === "active" ? `Contrato Ativo (V${latestContract.version})` :
               latestContract.status === "expired" ? `Contrato Vencido (V${latestContract.version})` :
               `Rascunho (V${latestContract.version})`}
            </p>
          </div>
        </div>
        <button onClick={() => onNavigateTab("contratos")}
          className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-primary/30 hover:text-primary">
          <FileText size={11} /> {latestContract ? "Ver Contratos" : "Gerar Contrato"}
        </button>
      </div>
      )}

      {/* WhatsApp quick-link */}
      {form.phone && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-lone-success-bg flex items-center justify-center"><span className="text-lg">📱</span></div>
            <div>
              <p className="text-xs text-muted-foreground">WhatsApp do Cliente</p>
              <p className="text-sm font-medium text-foreground">{form.phone}</p>
            </div>
          </div>
          <a href={`https://wa.me/55${form.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-lone-success-bg text-lone-success text-xs font-medium hover:bg-lone-success-bg transition-colors border border-lone-success-border">
            <ExternalLink size={11} /> Abrir Conversa
          </a>
        </div>
      )}

      {/* BLOCO 1: Identificacao */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
          <Building2 size={11} className="text-primary" /> Identificacao Corporativa
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {([
            { key: "nomeFantasia", label: "Nome Fantasia" }, { key: "razaoSocial", label: "Razao Social" },
            { key: "cnpj", label: "CNPJ" }, { key: "nicho", label: "Ramo / Nicho" },
            { key: "contactName", label: "Responsavel" }, { key: "cpfCnpj", label: "CPF" },
            { key: "phone", label: "WhatsApp" }, { key: "emailCorporativo", label: "E-mail" },
            { key: "enderecoCep", label: "CEP" }, { key: "enderecoRua", label: "Rua / Logradouro" },
            { key: "enderecoNumero", label: "Número" }, { key: "enderecoBairro", label: "Bairro" },
            { key: "enderecoCidade", label: "Cidade" }, { key: "enderecoEstado", label: "Estado (UF)" },
          ]).filter(({ key }) => isAdmin || !["razaoSocial", "cnpj", "cpfCnpj"].includes(key)).map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
              {editing ? (
                <input value={form[key] || ""} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
              ) : (
                <p className="text-sm text-foreground">{form[key] || <span className="text-muted-foreground italic">Nao informado</span>}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* BLOCO 2: Cofre de Acessos */}
      {role !== "designer" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <Shield size={11} className="text-primary" /> Cofre de Acessos
            {!isAdmin && <span className="text-[10px] text-muted-foreground normal-case font-normal ml-2">Mostrando apenas plataformas do seu departamento</span>}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accessCards.map(({ platform, icon, loginKey, pwKey, testUrl }) => {
              const hasLogin = !!form[loginKey];
              const hasPw = !!form[pwKey];
              return (
                <div key={loginKey} className={`rounded-xl border p-4 space-y-3 ${hasLogin ? "border-border bg-surface" : "border-lone-warning-border bg-lone-warning-bg/[0.02]"}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground flex items-center gap-1.5"><span>{icon}</span> {platform}</p>
                    <div className="flex items-center gap-1.5">
                      {hasLogin && (
                        <a href={testUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1">
                          <ExternalLink size={8} /> Testar
                        </a>
                      )}
                      {!hasLogin && <span className="text-[10px] text-lone-warning flex items-center gap-1"><AlertTriangle size={10} /> Pendente</span>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Login</p>
                      {editing ? (
                        <input value={form[loginKey] || ""} onChange={(e) => setForm((p) => ({ ...p, [loginKey]: e.target.value }))}
                          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" placeholder="Login / Email" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-foreground flex-1">{form[loginKey] || <span className="text-muted-foreground italic">Nao informado</span>}</p>
                          {hasLogin && <button type="button" onClick={() => copyToClip(form[loginKey])} className="text-muted-foreground hover:text-primary transition-colors" title="Copiar"><LinkIcon size={11} /></button>}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                        Senha <Shield size={9} className="text-primary" />
                      </p>
                      {editing ? (
                        <div className="relative">
                          <input type={showPw[pwKey] ? "text" : "password"} value={form[pwKey] || ""}
                            onChange={(e) => setForm((p) => ({ ...p, [pwKey]: e.target.value }))}
                            className="w-full bg-card border border-border rounded-lg px-3 py-2 pr-9 text-sm text-foreground outline-none focus:border-primary/50"
                            placeholder="Deixe em branco pra manter a senha atual" />
                          <button type="button" onClick={() => setShowPw((p) => ({ ...p, [pwKey]: !p[pwKey] }))} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
                            {showPw[pwKey] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-foreground font-mono flex-1">
                            {form[pwKey] ? (
                              showPw[pwKey] ? form[pwKey] : "••••••••"
                            ) : (
                              <span className="text-muted-foreground italic font-sans text-[11px]">
                                {revealingPw === pwKey ? "Descriptografando..." : "🔒 Armazenada (clique pra revelar)"}
                              </span>
                            )}
                          </p>
                          {form[pwKey] ? (
                            <>
                              <button type="button" onClick={() => setShowPw((p) => ({ ...p, [pwKey]: !p[pwKey] }))} className="text-muted-foreground hover:text-muted-foreground transition-colors">
                                {showPw[pwKey] ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                              <button type="button" onClick={() => copyToClip(form[pwKey])} className="text-muted-foreground hover:text-primary transition-colors" title="Copiar"><LinkIcon size={11} /></button>
                            </>
                          ) : (
                            <button type="button" onClick={() => revealPassword(pwKey)} disabled={revealingPw === pwKey}
                              className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50" title="Revelar senha">
                              <Eye size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BLOCO 3: Documentos Legais — acesso RESTRITO a admin/manager (dados sensiveis) */}
      {isAdmin && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Shield size={11} className="text-lone-warning" /> Documentos Legais
              </p>
              <p className="text-[10px] text-lone-warning mt-1 flex items-center gap-1">
                <Shield size={9} /> Acesso restrito a administradores
              </p>
            </div>
          </div>
          {(uploadError || openError) && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle size={13} className="text-destructive shrink-0" />
              <span className="text-xs text-destructive">{uploadError ?? openError}</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { label: "Contrato Social", url: client.docContratoSocial, docType: "contrato_social" },
              { label: "Documento c/ Foto (RG/CNH)", url: client.docIdentidade, docType: "identidade" },
            ]).map(({ label, url, docType }) => (
              <div key={docType} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <p className="text-xs font-medium text-foreground">{label}</p>
                {url ? (
                  <>
                    {!isPrivateRef(url) && url.match(/\.(jpg|jpeg|png|webp|heic)$/i) && (
                      <div className="relative w-full h-28 rounded-lg overflow-hidden bg-card border border-border">
                        <img src={url} alt={label} className="w-full h-full object-cover" />
                      </div>
                    )}
                    {isPrivateRef(url) && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border">
                        <Shield size={16} className="text-lone-warning" />
                        <span className="text-xs text-muted-foreground">Arquivo privado — gere link para visualizar</span>
                      </div>
                    )}
                    {!isPrivateRef(url) && url.match(/\.pdf$/i) && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border">
                        <FileText size={18} className="text-primary" /><span className="text-xs text-muted-foreground">PDF</span>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <button onClick={() => handleSecureOpen(url, docType, false)}
                        disabled={opening === `${docType}-view`}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50">
                        {opening === `${docType}-view` ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />} Visualizar
                      </button>
                      <button onClick={() => handleSecureOpen(url, docType, true)}
                        disabled={opening === `${docType}-dl`}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50">
                        {opening === `${docType}-dl` ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Baixar
                      </button>
                    </div>
                    {/* Substituir — admin pode enviar versão recebida via WhatsApp */}
                    <label className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-border text-[10px] text-muted-foreground hover:text-muted-foreground hover:border-border transition-all cursor-pointer">
                      {uploading === docType ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                      {uploading === docType ? "Substituindo..." : "Substituir arquivo"}
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0]; if (f) handleDocUpload(f, docType); e.target.value = "";
                      }} />
                    </label>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-4 rounded-lg border border-dashed border-border bg-card">
                      <AlertTriangle size={14} className="text-lone-warning" /><span className="text-xs text-lone-warning">Pendente</span>
                    </div>
                    <label className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all cursor-pointer">
                      {uploading === docType ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      {uploading === docType ? "Enviando..." : "Enviar arquivo do WhatsApp"}
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0]; if (f) handleDocUpload(f, docType); e.target.value = "";
                      }} />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BLOCO: Configuração Operacional — admin only */}
      {isAdmin && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <Settings size={11} className="text-primary" /> Configuracao Operacional
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="space-y-1 col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo de Servico</p>
              {editing ? (
                <select value={form.serviceType || ""} onChange={(e) => setForm((p) => ({ ...p, serviceType: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Nao definido</option>
                  <option value="lone_growth">Lone Growth (Trafego + Social + Design)</option>
                  <option value="assessoria_trafego">Assessoria de Trafego</option>
                  <option value="assessoria_social">Assessoria de Social</option>
                  <option value="assessoria_design">Assessoria de Design</option>
                </select>
              ) : (
                <p className="text-sm text-foreground">
                  {form.serviceType === "lone_growth" ? "Lone Growth" :
                   form.serviceType === "assessoria_trafego" ? "Assessoria de Trafego" :
                   form.serviceType === "assessoria_social" ? "Assessoria de Social" :
                   form.serviceType === "assessoria_design" ? "Assessoria de Design" :
                   <span className="text-muted-foreground italic">Nao definido</span>}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsavel Trafego</p>
              {editing ? (
                <select value={form.assignedTraffic || ""} onChange={(e) => setForm((p) => ({ ...p, assignedTraffic: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Nenhum</option>
                  {team.forField("assignedTraffic").map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-foreground">{form.assignedTraffic || <span className="text-muted-foreground italic">Nao atribuido</span>}</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsavel Social</p>
              {editing ? (
                <select value={form.assignedSocial || ""} onChange={(e) => setForm((p) => ({ ...p, assignedSocial: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Nenhum</option>
                  {team.forField("assignedSocial").map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-foreground">{form.assignedSocial || <span className="text-muted-foreground italic">Nao atribuido</span>}</p>
              )}
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Designer Responsavel</p>
              {editing ? (
                <select value={form.assignedDesigner || ""} onChange={(e) => setForm((p) => ({ ...p, assignedDesigner: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Nenhum</option>
                  {team.forField("assignedDesigner").map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-foreground">{form.assignedDesigner || <span className="text-muted-foreground italic">Nao atribuido</span>}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Acoes do Sistema */}
      {isAdmin && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <Mail size={11} className="text-primary" /> Acoes do Sistema
          </p>
          <div className="flex items-center gap-3">
            <button onClick={handleResendWelcome} disabled={emailSending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface text-foreground text-xs font-medium hover:bg-muted/30 border border-border transition-colors disabled:opacity-50">
              {emailSending ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
              {emailSending ? "Enviando..." : "Reenviar Boas-Vindas"}
            </button>
            {emailStatus === "sent" && <span className="text-xs text-lone-success flex items-center gap-1"><Check size={12} /> Enviado</span>}
            {emailStatus === "error" && <span className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={12} /> Erro no envio</span>}
          </div>
          <p className="text-[10px] text-muted-foreground">Envia o e-mail de boas-vindas para {form.emailCorporativo || form.phone || "(sem e-mail)"}</p>

          {/* Toggle: Agente CS ligado/pausado p/ este cliente */}
          {(() => {
            const agenteAtivo = client.agenteAtivo !== false;
            return (
              <div className="flex items-center justify-between pt-3 border-t border-border/60">
                <div>
                  <p className="text-xs font-medium text-foreground">🤖 Agente CS</p>
                  <p className="text-[10px] text-muted-foreground">
                    {agenteAtivo ? "Ativo — capta demanda e vigia o fluxo deste cliente" : "Pausado — o agente ignora este cliente"}
                  </p>
                </div>
                <button
                  onClick={() => updateClientData(client.id, { agenteAtivo: !agenteAtivo })}
                  title={agenteAtivo ? "Pausar o agente p/ este cliente" : "Reativar o agente"}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${agenteAtivo ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${agenteAtivo ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}
