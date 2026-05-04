"use client";

import { useState, useEffect } from "react";
import type { Client, Role } from "@/lib/types";
import {
  Building2, Shield, FileText, Eye, EyeOff, Download, Upload,
  Pencil, Check, Loader2, AlertTriangle, Send, ExternalLink,
  Link as LinkIcon, Clock, CheckCircle, Mail,
} from "lucide-react";

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
      const res = await fetch("/api/emails", {
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
    enderecoRua: client.enderecoRua || "", enderecoBairro: client.enderecoBairro || "",
    enderecoCidade: client.enderecoCidade || "", enderecoEstado: client.enderecoEstado || "",
    enderecoCep: client.enderecoCep || "",
    facebookLogin: client.facebookLogin || "", facebookPassword: client.facebookPassword || "",
    instagramLogin: client.instagramLogin || "", instagramPassword: client.instagramPassword || "",
    googleAdsLogin: client.googleAdsLogin || "", googleAdsPassword: client.googleAdsPassword || "",
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
        enderecoRua: form.enderecoRua || undefined, enderecoBairro: form.enderecoBairro || undefined,
        enderecoCidade: form.enderecoCidade || undefined, enderecoEstado: form.enderecoEstado || undefined,
        enderecoCep: form.enderecoCep || undefined,
        // Logins (não-sensível) ainda via path normal
        facebookLogin: form.facebookLogin || undefined,
        instagramLogin: form.instagramLogin || undefined,
        googleAdsLogin: form.googleAdsLogin || undefined,
      });

      // Senhas: só envia se foi editada (evita regravar blob criptografado com string vazia).
      const pwUpdates: { field: string; value: string }[] = [];
      if (form.facebookPassword && form.facebookPassword !== "••••••••") pwUpdates.push({ field: "facebook_password", value: form.facebookPassword });
      if (form.instagramPassword && form.instagramPassword !== "••••••••") pwUpdates.push({ field: "instagram_password", value: form.instagramPassword });
      if (form.googleAdsPassword && form.googleAdsPassword !== "••••••••") pwUpdates.push({ field: "google_ads_password", value: form.googleAdsPassword });

      for (const u of pwUpdates) {
        await fetch("/api/client-vault", {
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
      const res = await fetch(`/api/client-vault?clientId=${client.id}&table=clients&field=${field}`);
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
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("clientId", client.id); fd.append("docType", docType);
      const res = await fetch("/api/onboarding/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        updateClientData(client.id, { [docType === "contrato_social" ? "docContratoSocial" : docType === "identidade" ? "docIdentidade" : "docLogo"]: data.url });
      }
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

  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Private docs (legal-docs bucket) are stored as "legal://<path>" and need a signed URL.
  // Legacy entries stored as "/storage/..." or full URLs open directly.
  const isPrivateRef = (ref: string) => ref.startsWith("legal://");

  const resolvePrivateUrl = async (ref: string, download = false): Promise<string | null> => {
    try {
      const res = await fetch("/api/storage/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ref, download }),
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

  const [opening, setOpening] = useState<string | null>(null);

  const handleSecureOpen = async (ref: string, docType: string, download: boolean) => {
    if (!isPrivateRef(ref)) {
      // Legacy public URL — open/download directly
      if (download) downloadFile(ref, `${docType}-${companyName.replace(/\s+/g, "-").toLowerCase()}`);
      else window.open(ref, "_blank", "noopener,noreferrer");
      return;
    }
    setOpening(`${docType}-${download ? "dl" : "view"}`);
    const signed = await resolvePrivateUrl(ref, download);
    setOpening(null);
    if (!signed) return;
    if (download) downloadFile(signed, `${docType}-${companyName.replace(/\s+/g, "-").toLowerCase()}`);
    else window.open(signed, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Logo + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {client.docLogo ? (
            <img src={client.docLogo} alt="Logo" className="w-12 h-12 rounded-xl object-contain border border-border bg-card" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[#0d4af5]/15 border border-[#0d4af5]/20 flex items-center justify-center">
              <span className="text-lg font-bold text-[#0d4af5]">{companyInitial}</span>
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
              className="btn-ghost text-xs flex items-center gap-1.5 border border-border hover:border-amber-500/30 hover:text-amber-400">
              {generatingLink ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Link de Correcao
            </button>
          )}
          {isAdmin && editing ? (
            <>
              <button onClick={() => { setForm(initForm()); setEditing(false); }} className="btn-ghost text-xs border border-border">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#0d4af5]/80 text-white text-xs font-medium transition-colors disabled:opacity-50">
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
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 space-y-2">
          <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium hover:bg-amber-500/25 transition-colors border border-amber-500/20 whitespace-nowrap"
            >
              <LinkIcon size={11} /> Copiar
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent("Olá! Segue o link para preencher/corrigir seus dados: " + onboardingLink)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-colors border border-emerald-500/20 whitespace-nowrap"
            >
              Enviar WA
            </a>
          </div>
        </div>
      )}

      {/* Pendencies */}
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
          <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5 mb-2">
            <AlertTriangle size={12} /> {missing.length} {missing.length === 1 ? "pendencia" : "pendencias"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((m) => <span key={m} className="text-[10px] px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/15">{m}</span>)}
          </div>
        </div>
      )}

      {/* BLOCO 0: Identidade Visual — em destaque, visivel a todos (team precisa do logo) */}
      <div className="rounded-xl border border-[#0d4af5]/20 bg-gradient-to-br from-[#0d4af5]/[0.04] to-transparent p-5">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0d4af5]" /> Identidade Visual
        </p>
        <div className="flex items-center gap-5">
          <div className="shrink-0">
            {client.docLogo ? (
              <div className="w-28 h-28 rounded-2xl border border-border bg-card flex items-center justify-center overflow-hidden p-2">
                <img src={client.docLogo} alt={`Logo ${companyName}`} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-amber-500/30 bg-amber-500/[0.02] flex flex-col items-center justify-center gap-1.5">
                <AlertTriangle size={18} className="text-amber-400" />
                <span className="text-[10px] text-amber-400 text-center px-2">Logo pendente</span>
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
                  <button onClick={() => downloadFile(client.docLogo!, `logo-${companyName.replace(/\s+/g, "-").toLowerCase()}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d4af5] text-white text-xs font-medium hover:bg-[#0d4af5]/80 transition-colors">
                    <Download size={11} /> Baixar Logo
                  </button>
                  <a href={client.docLogo} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-foreground text-xs font-medium border border-border hover:border-[#0d4af5]/30 transition-colors">
                    <Eye size={11} /> Visualizar
                  </a>
                </>
              )}
              {!client.docLogo && isAdmin && (
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-foreground text-xs font-medium border border-dashed border-border hover:border-[#0d4af5]/30 transition-colors cursor-pointer">
                  {uploading === "logo" ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                  {uploading === "logo" ? "Enviando..." : "Enviar Logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0]; if (f) handleDocUpload(f, "logo"); e.target.value = "";
                  }} />
                </label>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contract status */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            !latestContract ? "bg-zinc-500/10" : latestContract.status === "active" ? "bg-emerald-500/15" : latestContract.status === "expired" ? "bg-red-500/10" : "bg-zinc-500/10"
          }`}>
            {!latestContract ? <FileText size={18} className="text-zinc-500" /> :
             latestContract.status === "active" ? <CheckCircle size={18} className="text-emerald-500" /> :
             latestContract.status === "expired" ? <Clock size={18} className="text-red-400" /> :
             <FileText size={18} className="text-zinc-400" />}
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
          className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-[#0d4af5]/30 hover:text-[#0d4af5]">
          <FileText size={11} /> {latestContract ? "Ver Contratos" : "Gerar Contrato"}
        </button>
      </div>

      {/* WhatsApp quick-link */}
      {form.phone && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center"><span className="text-lg">📱</span></div>
            <div>
              <p className="text-xs text-muted-foreground">WhatsApp do Cliente</p>
              <p className="text-sm font-medium text-foreground">{form.phone}</p>
            </div>
          </div>
          <a href={`https://wa.me/55${form.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-colors border border-emerald-500/20">
            <ExternalLink size={11} /> Abrir Conversa
          </a>
        </div>
      )}

      {/* BLOCO 1: Identificacao */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
          <Building2 size={11} className="text-[#0d4af5]" /> Identificacao Corporativa
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {([
            { key: "nomeFantasia", label: "Nome Fantasia" }, { key: "razaoSocial", label: "Razao Social" },
            { key: "cnpj", label: "CNPJ" }, { key: "nicho", label: "Ramo / Nicho" },
            { key: "contactName", label: "Responsavel" }, { key: "cpfCnpj", label: "CPF" },
            { key: "phone", label: "WhatsApp" }, { key: "emailCorporativo", label: "E-mail" },
            { key: "enderecoCep", label: "CEP" }, { key: "enderecoRua", label: "Rua / Logradouro" },
            { key: "enderecoBairro", label: "Bairro" }, { key: "enderecoCidade", label: "Cidade" },
            { key: "enderecoEstado", label: "Estado (UF)" },
          ]).map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
              {editing ? (
                <input value={form[key] || ""} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50 transition-colors" />
              ) : (
                <p className="text-sm text-foreground">{form[key] || <span className="text-zinc-600 italic">Nao informado</span>}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* BLOCO 2: Cofre de Acessos */}
      {role !== "designer" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <Shield size={11} className="text-[#0d4af5]" /> Cofre de Acessos
            {!isAdmin && <span className="text-[10px] text-zinc-600 normal-case font-normal ml-2">Mostrando apenas plataformas do seu departamento</span>}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accessCards.map(({ platform, icon, loginKey, pwKey, testUrl }) => {
              const hasLogin = !!form[loginKey];
              const hasPw = !!form[pwKey];
              return (
                <div key={loginKey} className={`rounded-xl border p-4 space-y-3 ${hasLogin ? "border-border bg-surface" : "border-amber-500/20 bg-amber-500/[0.02]"}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground flex items-center gap-1.5"><span>{icon}</span> {platform}</p>
                    <div className="flex items-center gap-1.5">
                      {hasLogin && (
                        <a href={testUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] px-2 py-0.5 rounded bg-[#0d4af5]/10 text-[#3b6ff5] border border-[#0d4af5]/20 hover:bg-[#0d4af5]/20 transition-colors flex items-center gap-1">
                          <ExternalLink size={8} /> Testar
                        </a>
                      )}
                      {!hasLogin && <span className="text-[10px] text-amber-400 flex items-center gap-1"><AlertTriangle size={10} /> Pendente</span>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase">Login</p>
                      {editing ? (
                        <input value={form[loginKey] || ""} onChange={(e) => setForm((p) => ({ ...p, [loginKey]: e.target.value }))}
                          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" placeholder="Login / Email" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-foreground flex-1">{form[loginKey] || <span className="text-zinc-600 italic">Nao informado</span>}</p>
                          {hasLogin && <button type="button" onClick={() => copyToClip(form[loginKey])} className="text-zinc-600 hover:text-[#0d4af5] transition-colors" title="Copiar"><LinkIcon size={11} /></button>}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
                        Senha <Shield size={9} className="text-[#0d4af5]" />
                      </p>
                      {editing ? (
                        <div className="relative">
                          <input type={showPw[pwKey] ? "text" : "password"} value={form[pwKey] || ""}
                            onChange={(e) => setForm((p) => ({ ...p, [pwKey]: e.target.value }))}
                            className="w-full bg-card border border-border rounded-lg px-3 py-2 pr-9 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
                            placeholder="Deixe em branco pra manter a senha atual" />
                          <button type="button" onClick={() => setShowPw((p) => ({ ...p, [pwKey]: !p[pwKey] }))} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                            {showPw[pwKey] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-foreground font-mono flex-1">
                            {form[pwKey] ? (
                              showPw[pwKey] ? form[pwKey] : "••••••••"
                            ) : (
                              <span className="text-zinc-600 italic font-sans text-[11px]">
                                {revealingPw === pwKey ? "Descriptografando..." : "🔒 Armazenada (clique pra revelar)"}
                              </span>
                            )}
                          </p>
                          {form[pwKey] ? (
                            <>
                              <button type="button" onClick={() => setShowPw((p) => ({ ...p, [pwKey]: !p[pwKey] }))} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                                {showPw[pwKey] ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                              <button type="button" onClick={() => copyToClip(form[pwKey])} className="text-zinc-600 hover:text-[#0d4af5] transition-colors" title="Copiar"><LinkIcon size={11} /></button>
                            </>
                          ) : (
                            <button type="button" onClick={() => revealPassword(pwKey)} disabled={revealingPw === pwKey}
                              className="text-zinc-500 hover:text-[#0d4af5] transition-colors disabled:opacity-50" title="Revelar senha">
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
                <Shield size={11} className="text-amber-400" /> Documentos Legais
              </p>
              <p className="text-[10px] text-amber-400/70 mt-1 flex items-center gap-1">
                <Shield size={9} /> Acesso restrito a administradores
              </p>
            </div>
          </div>
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
                        <Shield size={16} className="text-amber-400" />
                        <span className="text-xs text-zinc-400">Arquivo privado — gere link para visualizar</span>
                      </div>
                    )}
                    {!isPrivateRef(url) && url.match(/\.pdf$/i) && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border">
                        <FileText size={18} className="text-[#0d4af5]" /><span className="text-xs text-zinc-400">PDF</span>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <button onClick={() => handleSecureOpen(url, docType, false)}
                        disabled={opening === `${docType}-view`}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-xs text-zinc-400 hover:text-white hover:border-[#0d4af5]/30 transition-all disabled:opacity-50">
                        {opening === `${docType}-view` ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />} Visualizar
                      </button>
                      <button onClick={() => handleSecureOpen(url, docType, true)}
                        disabled={opening === `${docType}-dl`}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-xs text-zinc-400 hover:text-white hover:border-[#0d4af5]/30 transition-all disabled:opacity-50">
                        {opening === `${docType}-dl` ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Baixar
                      </button>
                    </div>
                    {/* Substituir — admin pode enviar versão recebida via WhatsApp */}
                    <label className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-zinc-700/50 text-[10px] text-zinc-600 hover:text-zinc-300 hover:border-zinc-500/50 transition-all cursor-pointer">
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
                      <AlertTriangle size={14} className="text-amber-500" /><span className="text-xs text-amber-400">Pendente</span>
                    </div>
                    <label className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-xs text-zinc-400 hover:text-white hover:border-[#0d4af5]/30 transition-all cursor-pointer">
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
            {emailStatus === "sent" && <span className="text-xs text-emerald-400 flex items-center gap-1"><Check size={12} /> Enviado</span>}
            {emailStatus === "error" && <span className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> Erro no envio</span>}
          </div>
          <p className="text-[10px] text-zinc-600">Envia o e-mail de boas-vindas para {form.emailCorporativo || form.phone || "(sem e-mail)"}</p>
        </div>
      )}
    </div>
  );
}
