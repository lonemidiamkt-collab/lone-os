"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  User, FileText, Shield, Upload, Camera, Check, Loader2,
  Eye, EyeOff, AlertTriangle, Building2, ChevronRight, MapPin, RefreshCw,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";

// ─── Types ──────────────────────────────────────────────────
interface SubmissionData {
  id: string;
  client_id: string;
  token: string;
  status: string;
  clients?: { name: string; industry: string; service_type: string };
}

type Step = "dados" | "documentos" | "acessos" | "review";
type AccessStatus = "fill_now" | "waiting_client" | "partner_invite";

const STEPS: { key: Step; label: string; icon: typeof User }[] = [
  { key: "dados", label: "Identificacao", icon: User },
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "acessos", label: "Acessos", icon: Shield },
  { key: "review", label: "Revisao", icon: Check },
];

// ─── Validators ────────────────────────────────────────────
function validateCnpj(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (s: string, w: number[]) => {
    const sum = s.split("").reduce((a, c, i) => a + Number(c) * w[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return calc(d.slice(0, 12), w1) === Number(d[12]) && calc(d.slice(0, 13), w2) === Number(d[13]);
}

function validatePhone(v: string): boolean {
  return v.replace(/\D/g, "").length >= 10;
}

function validateEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ─── Masks ──────────────────────────────────────────────────
function maskCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCnpj(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function maskCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ─── Components ─────────────────────────────────────────────
function InputField({ label, value, onChange, placeholder, required, type = "text", mask, error: fieldError }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; type?: string;
  mask?: (v: string) => string; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(mask ? mask(e.target.value) : e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-card border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors ${
          fieldError ? "border-destructive/50 focus:border-destructive" : "border-border focus:border-primary/50"
        }`}
      />
      {fieldError && <p className="text-[10px] text-destructive">{fieldError}</p>}
    </div>
  );
}

function FileUpload({ label, docType, clientId, onUploaded, uploaded, previewRound, required, missing, onToast }: {
  label: string; docType: string; clientId: string; onUploaded: (url: string) => void; uploaded?: string;
  previewRound?: boolean; required?: boolean; missing?: boolean; onToast?: (msg: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError("");
    if (file.size > 10 * 1024 * 1024) { setError("Maximo 10MB."); return; }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif|pdf)$/i)) {
      setError("Formato nao suportado. Use JPG, PNG ou PDF."); return;
    }
    if (file.type.startsWith("image/")) setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      fd.append("docType", docType);
      const res = await fetch("/api/onboarding/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro no servidor."); setPreview(null); return; }
      onUploaded(data.url);
      onToast?.(`${label} salvo com sucesso`);
    } catch {
      setError("Falha na conexao."); setPreview(null);
    } finally { setUploading(false); }
  };

  const borderClass = uploaded
    ? "border-lone-success-border bg-lone-success-bg/[0.03]"
    : missing
      ? "border-destructive/40 bg-destructive/[0.03]"
      : "border-border bg-card";

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-all ${borderClass}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </p>
        {uploaded && <Check size={16} className="text-lone-success" />}
      </div>
      {missing && !uploaded && (
        <p className="text-[10px] text-destructive -mt-1">Este arquivo e essencial para a geracao do seu contrato.</p>
      )}
      {(() => {
        const previewSrc = preview || (uploaded && !uploaded.startsWith("legal://") ? uploaded : null);
        if (previewSrc) {
          return (
            <div className="flex justify-center">
              <img src={previewSrc} alt={label}
                className={`max-h-24 object-contain ${previewRound ? "w-20 h-20 rounded-full border-2 border-primary/30" : "rounded-lg border border-border"}`} />
            </div>
          );
        }
        if (uploaded && uploaded.startsWith("legal://")) {
          return (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border">
              <Check size={14} className="text-lone-success" />
              <span className="text-xs text-muted-foreground">Arquivo privado salvo com seguranca</span>
            </div>
          );
        }
        return null;
      })()}
      {uploaded ? (
        <p className="text-xs text-lone-success">Enviado com sucesso</p>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all text-xs">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Enviando..." : "Selecionar Arquivo"}
          </button>
          <button type="button" disabled={uploading} onClick={() => {
            const input = document.createElement("input");
            input.type = "file"; input.accept = "image/*"; input.capture = "environment";
            input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f); };
            input.click();
          }}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all text-xs">
            <Camera size={14} /> Foto
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*,.pdf,.heic,.heif" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if (f) handleFile(f);
      }} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground">JPG, PNG ou PDF — maximo 10MB</p>
    </div>
  );
}

function AccessField({ platform, icon, login, password, status, onLogin, onPassword, onStatus }: {
  platform: string; icon: string; login: string; password: string; status: AccessStatus;
  onLogin: (v: string) => void; onPassword: (v: string) => void; onStatus: (v: AccessStatus) => void;
}) {
  const [showPw, setShowPw] = useState(false);
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-all ${
      status === "waiting_client" ? "border-lone-warning-border bg-lone-warning-bg/[0.02]" :
      status === "partner_invite" ? "border-primary/20 bg-primary/[0.02]" :
      "border-border bg-card"
    }`}>
      <p className="text-sm font-medium text-muted-foreground flex items-center gap-2"><span>{icon}</span> {platform}</p>
      <div className="flex gap-1.5">
        {([
          { v: "fill_now" as const, label: "Preencher", icon: "📥" },
          { v: "waiting_client" as const, label: "Nao tenho", icon: "⏳" },
          { v: "partner_invite" as const, label: "Convite Partner", icon: "🤝" },
        ]).map((opt) => (
          <button key={opt.v} type="button" onClick={() => onStatus(opt.v)}
            className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
              status === opt.v ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-muted-foreground"
            }`}>{opt.icon} {opt.label}</button>
        ))}
      </div>
      {status === "fill_now" && (
        <div className="space-y-2">
          <input type="text" value={login} onChange={(e) => onLogin(e.target.value)} placeholder="Login / Email"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
          <div className="relative">
            <input type={showPw ? "text" : "password"} value={password} onChange={(e) => onPassword(e.target.value)} placeholder="Senha"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      )}
      {status === "waiting_client" && (
        <div className="flex items-center gap-2 text-xs text-lone-warning"><AlertTriangle size={12} /><span>Sera marcado como pendencia</span></div>
      )}
      {status === "partner_invite" && (
        <p className="text-xs text-primary">Nos adicionaremos como parceiro via Business Manager.</p>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────
export default function ExternalOnboardingPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [step, setStep] = useState<Step>("dados");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [cnpjError, setCnpjError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [uploadToast, setUploadToast] = useState<string>("");
  const [submittedData, setSubmittedData] = useState<Record<string, string> | null>(null);

  // Form state
  const [contactName, setContactName] = useState("");
  const [contactCpf, setContactCpf] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [nicho, setNicho] = useState("");
  const [enderecoRua, setEnderecoRua] = useState("");
  const [enderecoBairro, setEnderecoBairro] = useState("");
  const [enderecoCidade, setEnderecoCidade] = useState("");
  const [enderecoEstado, setEnderecoEstado] = useState("");
  const [enderecoCep, setEnderecoCep] = useState("");
  const [docContrato, setDocContrato] = useState("");
  const [docIdentidade, setDocIdentidade] = useState("");
  const [docLogo, setDocLogo] = useState("");
  const [metaLogin, setMetaLogin] = useState("");
  const [metaPassword, setMetaPassword] = useState("");
  const [metaStatus, setMetaStatus] = useState<AccessStatus>("fill_now");
  const [instaLogin, setInstaLogin] = useState("");
  const [instaPassword, setInstaPassword] = useState("");
  const [instaStatus, setInstaStatus] = useState<AccessStatus>("fill_now");
  const [googleLogin, setGoogleLogin] = useState("");
  const [googlePassword, setGooglePassword] = useState("");
  const [googleStatus, setGoogleStatus] = useState<AccessStatus>("fill_now");
  const [notes, setNotes] = useState("");

  // ─── Required fields (integrity gate) ─────────────────────
  // These MUST be filled to enable submit. Missing any → contract + automation break.
  const REQUIRED_ERROR = "Este campo e essencial para a geracao do seu contrato e ativacao da conta.";

  const missingRequired: Record<string, boolean> = {
    nomeFantasia: !nomeFantasia.trim(),
    cnpj: !cnpj.trim() || !validateCnpj(cnpj),
    contactName: !contactName.trim(),
    contactEmail: !contactEmail.trim() || !validateEmail(contactEmail),
    contactWhatsapp: !contactWhatsapp.trim() || !validatePhone(contactWhatsapp),
    enderecoCep: !enderecoCep.trim() || enderecoCep.replace(/\D/g, "").length !== 8,
    enderecoRua: !enderecoRua.trim(),
    enderecoBairro: !enderecoBairro.trim(),
    enderecoCidade: !enderecoCidade.trim(),
    docLogo: !docLogo,
    docContrato: !docContrato,
  };
  const isFormComplete = Object.values(missingRequired).every((v) => !v);

  // ─── Field-based progress (not step-based) ────────────────
  const filledCount = [
    nomeFantasia, contactName, contactEmail, contactWhatsapp, // required identification
    razaoSocial, cnpj, contactCpf, // business
    enderecoRua, enderecoCep, enderecoCidade, // address
    docContrato, docIdentidade, docLogo, // docs
    metaStatus !== "fill_now" || metaLogin ? "x" : "", // meta
    instaStatus !== "fill_now" || instaLogin ? "x" : "", // insta
    googleStatus !== "fill_now" || googleLogin ? "x" : "", // google
  ].filter(Boolean).length;
  const totalFields = 16;
  const fieldProgress = Math.round((filledCount / totalFields) * 100);

  // ─── Auto-save draft (debounced) ──────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSave = useCallback(() => {
    if (!submission) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setAutoSaving(true);
      try {
        await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "auto_save",
            token,
            contactName, contactCpf, contactWhatsapp, contactEmail,
            nomeFantasia, razaoSocial, cnpj, nicho,
            enderecoRua, enderecoBairro, enderecoCidade, enderecoEstado, enderecoCep,
            metaLogin, metaPassword, metaStatus,
            instagramLogin: instaLogin, instagramPassword: instaPassword, instagramStatus: instaStatus,
            googleLogin, googlePassword, googleStatus,
            docContratoSocial: docContrato, docIdentidade, docLogo, notes,
          }),
        });
      } catch {}
      setAutoSaving(false);
    }, 3000);
  }, [submission, token, contactName, contactCpf, contactWhatsapp, contactEmail, nomeFantasia, razaoSocial, cnpj, nicho,
    enderecoRua, enderecoBairro, enderecoCidade, enderecoEstado, enderecoCep,
    metaLogin, metaPassword, metaStatus, instaLogin, instaPassword, instaStatus,
    googleLogin, googlePassword, googleStatus, docContrato, docIdentidade, docLogo, notes]);

  useEffect(() => { if (submission) autoSave(); }, [autoSave, submission]);

  // Auto-dismiss upload toast after 3s
  useEffect(() => {
    if (!uploadToast) return;
    const t = setTimeout(() => setUploadToast(""), 3000);
    return () => clearTimeout(t);
  }, [uploadToast]);

  // Load submission + restore backup
  useEffect(() => {
    fetch(`/api/onboarding?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error === "already_submitted") {
          setSubmitted(true);
          if (data.submission) {
            setSubmittedData({
              contactName: data.submission.contact_name || "",
              nomeFantasia: data.submission.nome_fantasia || "",
              cnpj: data.submission.cnpj || "",
            });
          }
        } else if (data.error) {
          setError(data.error);
        } else {
          setSubmission(data);
          // Restore any previously saved fields from the submission
          if (data.contact_name) setContactName(data.contact_name);
          if (data.contact_cpf) setContactCpf(data.contact_cpf);
          if (data.contact_whatsapp) setContactWhatsapp(data.contact_whatsapp);
          if (data.contact_email) setContactEmail(data.contact_email);
          if (data.nome_fantasia) setNomeFantasia(data.nome_fantasia);
          if (data.razao_social) setRazaoSocial(data.razao_social);
          if (data.cnpj) setCnpj(data.cnpj);
          if (data.nicho) setNicho(data.nicho);
          if (data.endereco_rua) setEnderecoRua(data.endereco_rua);
          if (data.endereco_bairro) setEnderecoBairro(data.endereco_bairro);
          if (data.endereco_cidade) setEnderecoCidade(data.endereco_cidade);
          if (data.endereco_estado) setEnderecoEstado(data.endereco_estado);
          if (data.endereco_cep) setEnderecoCep(data.endereco_cep);
          if (data.doc_contrato_social) setDocContrato(data.doc_contrato_social);
          if (data.doc_identidade) setDocIdentidade(data.doc_identidade);
          if (data.doc_logo) setDocLogo(data.doc_logo);
          if (data.notes) setNotes(data.notes);
        }
      })
      .catch(() => setError("Erro ao carregar. Tente novamente."))
      .finally(() => setLoading(false));
  }, [token]);

  const currentStep = STEPS.findIndex((s) => s.key === step);
  const goNext = () => { const idx = STEPS.findIndex((s) => s.key === step); if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].key); };
  const goPrev = () => { const idx = STEPS.findIndex((s) => s.key === step); if (idx > 0) setStep(STEPS[idx - 1].key); };

  // ViaCEP
  const handleCepChange = async (value: string) => {
    const masked = maskCep(value);
    setEnderecoCep(masked);
    const digits = value.replace(/\D/g, "");
    if (digits.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setEnderecoRua(data.logradouro || "");
          setEnderecoBairro(data.bairro || "");
          setEnderecoCidade(data.localidade || "");
          setEnderecoEstado(data.uf || "");
        }
      } catch {}
    }
  };

  // CNPJ validation
  const handleCnpjChange = (v: string) => {
    const masked = maskCnpj(v);
    setCnpj(masked);
    const digits = v.replace(/\D/g, "");
    if (digits.length === 14) {
      setCnpjError(validateCnpj(v) ? "" : "CNPJ invalido");
    } else {
      setCnpjError("");
    }
  };

  // WhatsApp validation
  const handlePhoneChange = (v: string) => {
    const masked = maskPhone(v);
    setContactWhatsapp(masked);
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 10) {
      setPhoneError(validatePhone(v) ? "" : "Numero incompleto");
    } else {
      setPhoneError("");
    }
  };

  // Email validation
  const handleEmailChange = (v: string) => {
    setContactEmail(v);
    if (v.length > 3 && !validateEmail(v)) {
      setEmailError("E-mail com formato invalido");
    } else {
      setEmailError("");
    }
  };

  const buildPayload = () => ({
    action: "submit", token, clientId: submission?.client_id,
    nomeFantasia: nomeFantasia.trim(), razaoSocial: razaoSocial.trim(), cnpj: cnpj.trim(),
    nicho: nicho.trim(),
    contactName: contactName.trim(), contactCpf: contactCpf.trim(), contactWhatsapp: contactWhatsapp.trim(),
    contactEmail: contactEmail.trim().toLowerCase(),
    enderecoRua: enderecoRua.trim(), enderecoBairro: enderecoBairro.trim(),
    enderecoCidade: enderecoCidade.trim(), enderecoEstado: enderecoEstado.trim(), enderecoCep: enderecoCep.trim(),
    metaLogin, metaPassword, metaStatus,
    instagramLogin: instaLogin, instagramPassword: instaPassword, instagramStatus: instaStatus,
    googleLogin, googlePassword, googleStatus,
    docContratoSocial: docContrato, docIdentidade, docLogo, notes,
  });

  const handleSubmit = async () => {
    setShowValidation(true);
    if (!isFormComplete) {
      const missingCount = Object.values(missingRequired).filter(Boolean).length;
      setError(`Existem ${missingCount} campo(s) obrigatorio(s) pendentes. ${REQUIRED_ERROR}`);
      // Jump to first step with missing field for UX
      if (missingRequired.nomeFantasia || missingRequired.cnpj || missingRequired.contactName ||
          missingRequired.contactEmail || missingRequired.contactWhatsapp ||
          missingRequired.enderecoCep || missingRequired.enderecoRua ||
          missingRequired.enderecoBairro || missingRequired.enderecoCidade) {
        setStep("dados");
      } else if (missingRequired.docLogo || missingRequired.docContrato) {
        setStep("documentos");
      }
      return;
    }

    const payload = buildPayload();
    try { localStorage.setItem(`onboarding_backup_${token}`, JSON.stringify(payload)); } catch {}

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Erro ${res.status}`);
      }
      try { localStorage.removeItem(`onboarding_backup_${token}`); } catch {}
      setSubmittedData({ contactName: contactName.trim(), nomeFantasia: nomeFantasia.trim(), cnpj: cnpj.trim() });
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setError(`Falha ao enviar: ${msg}. Seus dados foram salvos — tente novamente.`);
    } finally { setSubmitting(false); }
  };

  const clientName = submission?.clients?.name ?? "Cliente";

  // ─── States ─────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 size={24} className="text-primary animate-spin" />
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-lone-success-bg flex items-center justify-center mx-auto">
          <Check size={40} className="text-lone-success" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Tudo certo!</h1>
        <p className="text-muted-foreground">
          Seus dados foram recebidos com sucesso. A equipe da <span className="text-foreground font-medium">Lone Midia</span> vai analisar e entrar em contato pelo WhatsApp.
        </p>
        {submittedData && (
          <div className="bg-card border border-border rounded-xl p-4 text-left space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Dados recebidos:</p>
            {submittedData.nomeFantasia && <p className="text-xs text-muted-foreground">Empresa: <span className="text-foreground">{submittedData.nomeFantasia}</span></p>}
            {submittedData.contactName && <p className="text-xs text-muted-foreground">Responsavel: <span className="text-foreground">{submittedData.contactName}</span></p>}
            {submittedData.cnpj && <p className="text-xs text-muted-foreground">CNPJ: <span className="text-foreground">{submittedData.cnpj}</span></p>}
          </div>
        )}
        <div className="bg-card border border-border rounded-xl p-4 text-left">
          <p className="text-xs text-muted-foreground mb-1">Proximos passos:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>1. Analise dos documentos pela equipe</li>
            <li>2. Configuracao das plataformas</li>
            <li>3. Kickoff e inicio das operacoes</li>
          </ul>
        </div>
        <button onClick={() => { setSubmitted(false); setSubmission(null); setError(""); }}
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 mx-auto">
          <RefreshCw size={12} /> Preciso corrigir algo
        </button>
      </div>
    </div>
  );

  if (error && !submission) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <AlertTriangle size={40} className="text-lone-warning mx-auto" />
        <h1 className="text-xl font-bold text-foreground">Link invalido</h1>
        <p className="text-muted-foreground text-sm">{error}</p>
      </div>
    </div>
  );

  // ─── Main Form ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Upload success toast (ephemeral) */}
      {uploadToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-lone-success-bg border border-lone-success-border text-lone-success text-xs font-medium shadow-lg animate-fade-in">
          <Check size={14} /> {uploadToast}
        </div>
      )}
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {docLogo ? (
                <img src={docLogo} alt="Logo do cliente" className="w-7 h-7 rounded-lg object-contain border border-border" />
              ) : (
                <Logo className="w-7 h-7" />
              )}
              <span className="font-semibold text-foreground text-sm">{nomeFantasia || "Lone Midia"}</span>
            </div>
            <div className="flex items-center gap-2">
              {autoSaving && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Salvando...</span>}
              <span className="text-[10px] text-primary font-medium">{fieldProgress}%</span>
            </div>
          </div>
          {/* Progress bar — field-based */}
          <div className="h-1.5 bg-card rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-700 ease-out" style={{ width: `${fieldProgress}%` }} />
          </div>
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => (
              <button key={s.key} onClick={() => setStep(s.key)}
                className={`text-[10px] transition-colors ${i <= currentStep ? "text-primary" : "text-muted-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-lg font-bold text-foreground">Onboarding — {clientName}</h1>
          <p className="text-xs text-muted-foreground mt-1">Preencha os dados para iniciarmos seu projeto</p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2.5 text-xs text-destructive">{error}</div>
        )}

        {/* ═══ STEP 1: DADOS ═══ */}
        {step === "dados" && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Building2 size={10} className="text-primary" /> Dados da Empresa
              </p>
              <InputField label="Nome Fantasia" value={nomeFantasia} onChange={setNomeFantasia} placeholder="Ex: Loja do Joao" required
                error={showValidation && missingRequired.nomeFantasia ? REQUIRED_ERROR : undefined} />
              <InputField label="Razao Social" value={razaoSocial} onChange={setRazaoSocial} placeholder="Ex: Joao da Silva LTDA" />
              <InputField label="CNPJ" value={cnpj} onChange={handleCnpjChange} placeholder="00.000.000/0000-00" required
                error={cnpjError || (showValidation && missingRequired.cnpj ? REQUIRED_ERROR : undefined)} />
              <div className="space-y-2">
                <InputField label="Ramo de Atividade / Nicho" value={nicho} onChange={setNicho}
                  placeholder="Ex: varejo de moda, odontologia, restaurante..." />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Construção Civil",
                    "Arquitetura e Engenharia",
                    "Imobiliária",
                    "Odontologia",
                    "Estética e Beleza",
                    "Restaurante / Food",
                    "Varejo de Moda",
                    "Fitness / Academia",
                    "Saúde / Clínicas",
                    "Advocacia",
                    "Educação / Cursos",
                    "E-commerce",
                    "Automotivo",
                    "Tecnologia / SaaS",
                    "Turismo / Hotelaria",
                  ].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setNicho(opt)}
                      className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                        nicho === opt
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-card text-muted-foreground border-border hover:border-primary/20 hover:text-muted-foreground"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Clique numa sugestão ou digite o seu. Usado pra personalizar o objeto do contrato.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                <User size={10} className="text-primary" /> Responsavel
              </p>
              <InputField label="Nome Completo" value={contactName} onChange={setContactName} placeholder="Ex: Joao da Silva" required
                error={showValidation && missingRequired.contactName ? REQUIRED_ERROR : undefined} />
              <InputField label="E-mail" type="email" value={contactEmail} onChange={handleEmailChange} placeholder="voce@empresa.com" required
                error={emailError || (showValidation && missingRequired.contactEmail ? REQUIRED_ERROR : undefined)} />
              <InputField label="CPF do Responsavel" value={contactCpf} onChange={setContactCpf} placeholder="000.000.000-00" mask={maskCpf} />
              <InputField label="WhatsApp de Contato" value={contactWhatsapp} onChange={handlePhoneChange} placeholder="(11) 99999-9999" required
                error={phoneError || (showValidation && missingRequired.contactWhatsapp ? REQUIRED_ERROR : undefined)} />
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={10} className="text-primary" /> Endereco
              </p>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="CEP" value={enderecoCep} onChange={handleCepChange} placeholder="00000-000" required
                  error={showValidation && missingRequired.enderecoCep ? REQUIRED_ERROR : undefined} />
                <InputField label="Bairro" value={enderecoBairro} onChange={setEnderecoBairro} placeholder="Ex: Centro" required
                  error={showValidation && missingRequired.enderecoBairro ? REQUIRED_ERROR : undefined} />
              </div>
              <InputField label="Rua / Logradouro" value={enderecoRua} onChange={setEnderecoRua} placeholder="Ex: Rua das Flores, 123" required
                error={showValidation && missingRequired.enderecoRua ? REQUIRED_ERROR : undefined} />
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Cidade" value={enderecoCidade} onChange={setEnderecoCidade} placeholder="Ex: Sao Paulo" required
                  error={showValidation && missingRequired.enderecoCidade ? REQUIRED_ERROR : undefined} />
                <InputField label="Estado (UF)" value={enderecoEstado} onChange={setEnderecoEstado} placeholder="Ex: SP" />
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: DOCUMENTOS ═══ */}
        {step === "documentos" && submission && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-xs text-muted-foreground">Envie os documentos abaixo. Voce pode selecionar um arquivo ou tirar uma foto.</p>
            <FileUpload label="Logo da Empresa" docType="logo" clientId={submission.client_id} onUploaded={setDocLogo} uploaded={docLogo} previewRound
              required missing={showValidation && missingRequired.docLogo} onToast={setUploadToast} />
            <FileUpload label="Contrato Social (PDF ou Foto)" docType="contrato_social" clientId={submission.client_id} onUploaded={setDocContrato} uploaded={docContrato}
              required missing={showValidation && missingRequired.docContrato} onToast={setUploadToast} />
            <FileUpload label="Documento com Foto (RG ou CNH)" docType="identidade" clientId={submission.client_id} onUploaded={setDocIdentidade} uploaded={docIdentidade}
              onToast={setUploadToast} />
          </div>
        )}

        {/* ═══ STEP 3: ACESSOS ═══ */}
        {step === "acessos" && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-xs text-muted-foreground">Informe os acessos das plataformas. Se nao tiver agora, selecione &quot;Nao tenho&quot;.</p>
            <AccessField platform="Facebook / Meta Ads" icon="📘" login={metaLogin} password={metaPassword} status={metaStatus}
              onLogin={setMetaLogin} onPassword={setMetaPassword} onStatus={setMetaStatus} />
            <AccessField platform="Instagram" icon="📷" login={instaLogin} password={instaPassword} status={instaStatus}
              onLogin={setInstaLogin} onPassword={setInstaPassword} onStatus={setInstaStatus} />
            <AccessField platform="Google Ads / Gmail" icon="🔍" login={googleLogin} password={googlePassword} status={googleStatus}
              onLogin={setGoogleLogin} onPassword={setGooglePassword} onStatus={setGoogleStatus} />
          </div>
        )}

        {/* ═══ STEP 4: REVIEW ═══ */}
        {step === "review" && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Resumo</p>
              <div className="space-y-2 text-sm">
                {nomeFantasia && <div className="flex justify-between"><span className="text-muted-foreground">Nome Fantasia</span><span className="text-foreground">{nomeFantasia}</span></div>}
                {razaoSocial && <div className="flex justify-between"><span className="text-muted-foreground">Razao Social</span><span className="text-foreground">{razaoSocial}</span></div>}
                {cnpj && <div className="flex justify-between"><span className="text-muted-foreground">CNPJ</span><span className={`${cnpjError ? "text-destructive" : "text-foreground"}`}>{cnpj} {cnpjError && "(invalido)"}</span></div>}
                {nicho && <div className="flex justify-between"><span className="text-muted-foreground">Ramo / Nicho</span><span className="text-foreground">{nicho}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Responsavel</span><span className="text-foreground">{contactName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">WhatsApp</span><span className="text-foreground">{contactWhatsapp || "—"}</span></div>
                {(enderecoRua || enderecoCidade) && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Endereco</span>
                    <span className="text-foreground text-right max-w-[60%]">{[enderecoRua, enderecoBairro, enderecoCidade, enderecoEstado, enderecoCep].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                <div className="border-t border-border my-2" />
                {[
                  { label: "Logo", ok: !!docLogo },
                  { label: "Contrato Social", ok: !!docContrato },
                  { label: "Documento c/ Foto", ok: !!docIdentidade },
                ].map(({ label, ok }) => (
                  <div key={label} className="flex justify-between"><span className="text-muted-foreground">{label}</span>
                    <span className={ok ? "text-lone-success" : "text-lone-warning"}>{ok ? "Enviado" : "Pendente"}</span></div>
                ))}
                <div className="border-t border-border my-2" />
                {[
                  { label: "Meta Ads", status: metaStatus, login: metaLogin },
                  { label: "Instagram", status: instaStatus, login: instaLogin },
                  { label: "Google", status: googleStatus, login: googleLogin },
                ].map(({ label, status, login }) => (
                  <div key={label} className="flex justify-between"><span className="text-muted-foreground">{label}</span>
                    <span className={status === "fill_now" && login ? "text-lone-success" : "text-lone-warning"}>
                      {status === "fill_now" ? (login ? "Preenchido" : "Vazio") : status === "waiting_client" ? "Pendente" : "Partner"}
                    </span></div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Observacoes (opcional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Alguma informacao adicional..."
                className="w-full bg-card border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors resize-none" />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          {currentStep > 0 ? (
            <button onClick={goPrev} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-4 py-2">Voltar</button>
          ) : <div />}
          {step === "review" ? (
            <div className="flex flex-col items-end gap-2">
              {!isFormComplete && (
                <p className="text-[10px] text-lone-warning">
                  {Object.values(missingRequired).filter(Boolean).length} campo(s) obrigatorio(s) pendente(s)
                </p>
              )}
              <button onClick={handleSubmit} disabled={submitting || !isFormComplete}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={!isFormComplete ? "Preencha todos os campos obrigatorios para finalizar" : ""}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {submitting ? "Enviando..." : "Finalizar Onboarding"}
              </button>
            </div>
          ) : (
            <button onClick={goNext}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-medium transition-colors">
              Proximo <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
