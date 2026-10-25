"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { Client, Role, ServiceType, ContentProfile } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { FAIXAS_FATURAMENTO, rotuloFaixa, PORTES, porteValido, type EmpresaReceita } from "@/lib/empresa/receita";
import type { ClientPatch } from "@/stores/useClientsStore";
import {
  Building2, Shield, FileText, Eye, EyeOff, Download, Upload,
  Pencil, Check, Loader2, AlertTriangle, Send, ExternalLink,
  Link as LinkIcon, Clock, CheckCircle, Mail, Settings,
  Facebook, Instagram, Search, Smartphone,
  Trash2, RefreshCw, Plus, Image as ImageIcon, X,
} from "lucide-react";
import { listaDocs, adicionarDoc, removerDocDaLista } from "@/lib/onboarding/docs";
import { limiteDoDocumento, MB } from "@/lib/onboarding/etapas";
import { trocarDocNaLista, cabeMaisUmDoc, descreverDoc, rotuloDoc } from "@/lib/clients/documentos-legais";
import { rotuloDoCampo } from "@/lib/cofre/versoes";
import { ACEITA_LOGO, DICA_LOGO, validarLogo } from "@/lib/clients/logo-upload";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import MarcaDoCliente from "@/components/clients/MarcaDoCliente";
import CofreStatus from "@/components/client/ficha/CofreStatus";

interface Props {
  client: Client;
  role: Role;
  currentUser: string;
  updateClientData: (id: string, data: ClientPatch) => Promise<void>;
  onNavigateTab: (tab: string) => void;
  generateOnboardingLink: () => void;
  generatingLink: boolean;
  onboardingLink?: string | null;
  /** false enquanto os campos sensíveis não chegaram (ou falharam): editar agora gravaria vazio por cima. */
  dadosCompletos: boolean;
  /**
   * Qual metade da antiga aba "Dados" (Leva 6B): "identidade" = logo e materiais da marca (aba Marca &
   * Briefing); "cadastro" = identificação, cofre de acessos, documentos, configuração e ações (aba Admin).
   */
  parte?: "identidade" | "cadastro";
}

export default function DadosTab({ client, role, currentUser, updateClientData, onNavigateTab, generateOnboardingLink, generatingLink, onboardingLink, dadosCompletos, parte = "cadastro" }: Props) {
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

  const initForm = () => ({
    nomeFantasia: client.nomeFantasia || "", razaoSocial: client.razaoSocial || "",
    cnpj: client.cnpj || "", nicho: client.nicho || "",
    faturamentoFaixa: client.faturamentoFaixa || "",
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
    perfilConteudo: client.perfilConteudo || "",
    assignedTraffic: client.assignedTraffic || "",
    assignedSocial: client.assignedSocial || "",
    assignedDesigner: client.assignedDesigner || "",
  });

  // Os campos sensíveis (logins, CPF, endereço) chegam DEPOIS, por /api/clients/[id]. Dependendo só
  // do id, o form ficava com o vazio do primeiro render e o save gravava vazio por cima.
  const assinaturaSensivel = [
    client.id, client.cpfCnpj, client.facebookLogin, client.instagramLogin, client.googleAdsLogin,
    client.enderecoRua, client.enderecoNumero, client.enderecoBairro, client.enderecoCep, client.razaoSocial, client.cnpj,
    client.faturamentoFaixa,
  ].join("|");
  useEffect(() => {
    if (!editing) setForm(initForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaSensivel]);

  // 21/10/2026 (auditoria 3.6): erro ao ler o contrato aparecia como "Nenhum contrato" + "Gerar
  // Contrato" — convite a gerar um repetido. Agora diz que não leu e oferece tentar de novo.
  const [contratoErro, setContratoErro] = useState(false);
  const [contratoTentativa, setContratoTentativa] = useState(0);
  useEffect(() => {
    let mounted = true;
    setContratoErro(false);
    import("@/lib/supabase/client").then(({ supabase }) => {
      supabase.from("contracts").select("status, end_date, version")
        .eq("client_id", client.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
        .then(({ data, error }) => {
          if (!mounted) return;
          if (error) { setContratoErro(true); return; }
          setLatestContract(data ? { status: data.status as string, endDate: data.end_date as string, version: data.version as number } : null);
        });
    }).catch(() => { if (mounted) setContratoErro(true); });
    return () => { mounted = false; };
  }, [client.id, contratoTentativa]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Separamos campos não-sensíveis (via updateClientData, caminho normal)
      // de senhas (via /api/client-vault que criptografa server-side).
      // await: o store dá throw se o banco recusar → cai no catch com toast (antes salvava
      // otimista e não avisava nada em caso de falha).
      // Campo esvaziado vira null (apaga); `|| undefined` impedia limpar qualquer dado errado.
      const v = (x: string | undefined) => (x && x.trim() ? x.trim() : null);
      await updateClientData(client.id, {
        nomeFantasia: v(form.nomeFantasia), razaoSocial: v(form.razaoSocial),
        cnpj: v(form.cnpj), nicho: v(form.nicho),
        // Só gestão vê e edita a faixa (a rota de detalhe nem a manda para os outros papéis).
        ...(isAdmin ? { faturamentoFaixa: form.faturamentoFaixa || null } : {}),
        contactName: v(form.contactName),
        cpfCnpj: v(form.cpfCnpj), phone: v(form.phone),
        emailCorporativo: v(form.emailCorporativo),
        email: v(form.emailCorporativo) ?? undefined,
        enderecoRua: v(form.enderecoRua), enderecoNumero: v(form.enderecoNumero),
        enderecoBairro: v(form.enderecoBairro),
        enderecoCidade: v(form.enderecoCidade), enderecoEstado: v(form.enderecoEstado),
        enderecoCep: v(form.enderecoCep),
        // Logins (não-sensível) ainda via path normal
        facebookLogin: v(form.facebookLogin),
        instagramLogin: v(form.instagramLogin),
        googleAdsLogin: v(form.googleAdsLogin),
        // Operational fields
        serviceType: (form.serviceType as ServiceType) || undefined,
        perfilConteudo: (form.perfilConteudo as ContentProfile) || null,
        assignedTraffic: v(form.assignedTraffic),
        assignedSocial: v(form.assignedSocial),
        assignedDesigner: v(form.assignedDesigner),
      });

      // Senhas: só envia se foi editada (evita regravar blob criptografado com string vazia).
      const pwUpdates: { field: string; value: string }[] = [];
      if (form.facebookPassword && form.facebookPassword !== "••••••••") pwUpdates.push({ field: "facebook_password", value: form.facebookPassword });
      if (form.instagramPassword && form.instagramPassword !== "••••••••") pwUpdates.push({ field: "instagram_password", value: form.instagramPassword });
      if (form.googleAdsPassword && form.googleAdsPassword !== "••••••••") pwUpdates.push({ field: "google_ads_password", value: form.googleAdsPassword });

      // 21/10/2026 (auditoria 3.5): a rota guarda a senha anterior e devolve o id dela (→ "Desfazer"),
      // e diz quando a troca não chegou ao cofre do social — antes isso falhava calado.
      const falhas: string[] = [];
      const avisosEspelho: string[] = [];
      const trocadas: { field: string; versaoId: string }[] = [];
      for (const u of pwUpdates) {
        const r = await chamar<{ historicoId?: string | null; aviso?: string | null }>("/api/client-vault", { clientId: client.id, table: "clients", field: u.field, value: u.value });
        if (!r.ok) { falhas.push(`${rotuloDoCampo(u.field)}: ${r.erro}`); continue; }
        if (r.data?.historicoId) trocadas.push({ field: u.field, versaoId: r.data.historicoId });
        if (r.data?.aviso) avisosEspelho.push(r.data.aviso);
      }
      if (avisosEspelho.length) toast.warning(avisosEspelho.join(" "), { duration: 20000 });
      const ofereceDesfazer = trocadas.length
        ? { action: { label: "Desfazer troca de senha", onClick: () => { void desfazerSenhas(trocadas); } }, duration: 15000 }
        : undefined;
      if (falhas.length) {
        // Os dados foram salvos; a senha não. Mantém em edição para não perder o que foi digitado.
        toast.error(`Dados salvos, mas a senha não: ${falhas.join(" · ")}`, ofereceDesfazer);
        return;
      }

      setEditing(false);
      if (ofereceDesfazer) toast.success("Dados salvos. A senha anterior ficou guardada.", ofereceDesfazer);
      else toast.success("Dados do cliente salvos.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Não foi possível salvar. Tente de novo.");
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
  // Sem a revelação não dá pra saber se há senha no cofre — "Armazenada" era chute.
  const [semSenha, setSemSenha] = useState<Record<string, boolean>>({});

  // "Desfazer" do toast: volta cada senha trocada para a versão guardada pela rota (21/10/2026, 3.5).
  // A restauração também guarda a que sai — dá para desfazer o desfazer pelo mesmo caminho.
  async function desfazerSenhas(itens: { field: string; versaoId: string }[]) {
    const erros: string[] = [];
    const avisos: string[] = [];
    for (const it of itens) {
      const r = await chamar<{ aviso?: string | null }>("/api/client-vault", {
        acao: "restaurar", clientId: client.id, table: "clients", field: it.field, versaoId: it.versaoId,
      });
      if (!r.ok) erros.push(`${rotuloDoCampo(it.field)}: ${r.erro}`);
      else if (r.data?.aviso) avisos.push(r.data.aviso);
    }
    // A tela mostrava a senha nova: limpa para quem precisar revelar a que vale agora.
    const chaves = Object.entries(pwFieldMap).filter(([, col]) => itens.some((i) => i.field === col)).map(([k]) => k);
    setForm((p) => { const n = { ...p }; for (const k of chaves) n[k] = ""; return n; });
    setSemSenha((p) => { const n = { ...p }; for (const k of chaves) delete n[k]; return n; });
    if (erros.length) toast.error(`Não consegui voltar a senha anterior: ${erros.join(" · ")}`);
    else toast.success(itens.length > 1 ? "Senhas anteriores restauradas." : "Senha anterior restaurada.");
    if (avisos.length) toast.warning(avisos.join(" "), { duration: 20000 });
  }
  const revealPassword = async (pwKey: string): Promise<void> => {
    const field = pwFieldMap[pwKey];
    if (!field) return;
    setRevealingPw(pwKey);
    const r = await chamar<{ value: string | null }>(`/api/client-vault?clientId=${client.id}&table=clients&field=${field}`);
    setRevealingPw(null);
    if (!r.ok) { toast.error(`Não consegui revelar a senha: ${r.erro}`); return; }
    const valor = r.data?.value ?? "";
    setSemSenha((p) => ({ ...p, [pwKey]: !valor }));
    setForm((p) => ({ ...p, [pwKey]: valor }));
  };

  // ── Documentos: um campo guarda VÁRIOS arquivos ("url\nurl", lib/onboarding/docs.ts) ─────────────
  // 21/10/2026 (auditoria 3.4): a ficha tratava a lista como um arquivo só — "Visualizar" quebrava com
  // 2+, "Substituir" deixava só o novo e as outras páginas sumiam, e não havia Remover. Agora cada
  // arquivo tem Ver / Trocar / Remover, e "Adicionar" acrescenta sem apagar nada.
  const CAMPO_DOC: Record<string, "docContratoSocial" | "docIdentidade" | "docLogo"> = {
    contrato_social: "docContratoSocial", identidade: "docIdentidade", logo: "docLogo",
  };
  // A rota de upload grava SÓ o arquivo novo na coluna; quem completa a lista é o salvamento daqui.
  // Se ele falhar, a ficha ficaria só com o novo: guardamos o valor certo para "Tentar salvar de novo".
  const [salvarPendente, setSalvarPendente] = useState<{ field: "docContratoSocial" | "docIdentidade" | "docLogo"; valor: string | null; rotulo: string } | null>(null);
  const [salvandoDoc, setSalvandoDoc] = useState(false);
  // 24/10/2026 (auditoria 3.12): o erro do logo aparece junto do botão "Trocar logo" (aba Marca). Antes
  // ia para o aviso dos Documentos Legais — que fica na aba Admin — e na Marca não aparecia nada.
  const [erroLogo, setErroLogo] = useState<string | null>(null);
  const avisarDoc = (field: "docContratoSocial" | "docIdentidade" | "docLogo", msg: string | null) =>
    field === "docLogo" ? setErroLogo(msg) : setUploadError(msg);

  const gravarCampoDoc = async (field: "docContratoSocial" | "docIdentidade" | "docLogo", valor: string | null, rotulo: string): Promise<boolean> => {
    setSalvandoDoc(true);
    try {
      await updateClientData(client.id, { [field]: valor });
      setSalvarPendente(null);
      return true;
    } catch (e) {
      setSalvarPendente({ field, valor, rotulo });
      avisarDoc(field, `${rotulo}: a ficha não foi atualizada (${e instanceof Error && e.message ? e.message : "erro"}). Use "Tentar salvar de novo"${field === "docLogo" ? "." : " — sem isso a ficha pode ficar só com o último arquivo."}`);
      return false;
    } finally { setSalvandoDoc(false); }
  };

  /** Envia um arquivo. `substituir` = url do arquivo que este troca (mesma posição na lista). */
  const handleDocUpload = async (file: File, docType: string, substituir?: string) => {
    const field = CAMPO_DOC[docType];
    if (!field) return;
    const rotulo = docType === "contrato_social" ? "Contrato Social" : docType === "identidade" ? "Documento c/ Foto" : "Logo";
    const antes = (client[field] as string | undefined) ?? null; // ANTES do upload: a rota sobrescreve a coluna
    if (docType !== "logo" && !substituir && !cabeMaisUmDoc(antes, client.id, docType)) {
      setUploadError(`${rotulo}: não cabe mais um arquivo neste campo. Junte as páginas num PDF só, ou remova uma antes.`);
      return;
    }
    // Logo: formato e tamanho conferidos antes de enviar, com o motivo junto do botão (auditoria 3.12).
    if (docType === "logo") {
      const problema = validarLogo(file);
      if (problema) { setErroLogo(problema); return; }
    }
    setUploading(substituir ? `troca:${substituir}` : docType);
    avisarDoc(field, null);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("clientId", client.id); fd.append("docType", docType);
      const r = await chamar<{ url?: string }>("/api/onboarding/upload", fd);
      if (!r.ok || !r.data?.url) {
        avisarDoc(field, `${rotulo} (${file.name}): ${r.erro ?? "o arquivo não subiu"}. Nada mudou na ficha.`);
        return;
      }
      const url = r.data.url;
      const novo = docType === "logo" ? url
        : substituir ? trocarDocNaLista(antes, substituir, url)
        : adicionarDoc(antes, url);
      if (await gravarCampoDoc(field, novo, rotulo)) {
        toast.success(substituir ? `${rotulo}: arquivo trocado.` : `${rotulo}: arquivo adicionado.`);
      }
    } finally { setUploading(null); }
  };

  const [removendoDoc, setRemovendoDoc] = useState<string | null>(null);
  const removerDoc = async (docType: string, rotulo: string, url: string, indice: number, total: number) => {
    const field = CAMPO_DOC[docType];
    if (!field) return;
    const qual = rotuloDoc(url, indice, total);
    const resto = total > 1 ? `Os outros ${total - 1 === 1 ? "1 arquivo continua" : `${total - 1} arquivos continuam`} na ficha.` : "O campo fica pendente.";
    if (!window.confirm(`Remover este arquivo de ${rotulo}?\n\n${qual}\n\n${resto}`)) return;
    setRemovendoDoc(url); setUploadError(null);
    const ok = await gravarCampoDoc(field, removerDocDaLista((client[field] as string | undefined) ?? null, url), rotulo);
    setRemovendoDoc(null);
    if (ok) toast.success(`${rotulo}: arquivo removido da ficha.`);
  };

  const copyToClip = (text: string) => { navigator.clipboard.writeText(text).catch(() => {}); };

  const accessCards = [
    { platform: "Meta / Facebook Ads", icon: Facebook, loginKey: "facebookLogin", pwKey: "facebookPassword", testUrl: "https://business.facebook.com", roles: ["admin", "manager", "traffic"] },
    { platform: "Instagram", icon: Instagram, loginKey: "instagramLogin", pwKey: "instagramPassword", testUrl: "https://www.instagram.com/accounts/login/", roles: ["admin", "manager", "social"] },
    { platform: "Google Ads", icon: Search, loginKey: "googleAdsLogin", pwKey: "googleAdsPassword", testUrl: "https://ads.google.com", roles: ["admin", "manager", "traffic"] },
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
      {parte === "cadastro" && (<>
      {/* Título + ações (o logo e o nome já estão no topo da ficha) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lone-h2 text-foreground">Dados do cadastro</p>
          <p className="text-lone-caption text-muted-foreground">Identificação, acessos, documentos e configuração da operação.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button onClick={generateOnboardingLink} disabled={generatingLink}
              className="btn-ghost text-xs flex items-center gap-1.5 border border-border hover:border-lone-warning-border hover:text-lone-warning">
              {generatingLink ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Link de Correção
            </button>
          )}
          {isAdmin && editing ? (
            <>
              <button onClick={() => { setForm(initForm()); setEditing(false); }} className="btn-ghost text-xs border border-border">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-xs font-medium transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar Alterações
              </button>
            </>
          ) : isAdmin ? (
            <button onClick={() => { setForm(initForm()); setEditing(true); }} disabled={!dadosCompletos}
              title={dadosCompletos ? undefined : "Os dados completos do cliente não carregaram — editar agora apagaria CPF, endereço e logins."}
              className="btn-ghost text-xs flex items-center gap-1.5 border border-border hover:border-primary/30 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed">
              <Pencil size={12} /> Editar Dados
            </button>
          ) : null}
        </div>
      </div>

      {/* Link de Correção gerado */}
      {onboardingLink && (
        <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg p-4 space-y-2">
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
        <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg p-4">
          <p className="text-xs font-medium text-lone-warning flex items-center gap-1.5 mb-2">
            <AlertTriangle size={12} /> {missing.length} {missing.length === 1 ? "pendência" : "pendências"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((m) => <span key={m} className="text-[10px] px-2 py-1 rounded-lg bg-lone-warning-bg text-lone-warning border border-lone-warning-border">{m}</span>)}
          </div>
        </div>
      )}

      </>)}

      {parte === "identidade" && (<>
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
              <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-lone-warning-border bg-lone-warning-bg flex flex-col items-center justify-center gap-1.5">
                <AlertTriangle size={18} className="text-lone-warning" />
                <span className="text-[10px] text-lone-warning text-center px-2">Logo pendente</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground truncate">{companyName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {client.docLogo ? "Disponível para equipe social e design" : "Solicite ao cliente via link de correção"}
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
                <input type="file" accept={ACEITA_LOGO} className="hidden" disabled={uploading === "logo"} onChange={(e) => {
                  const f = e.target.files?.[0]; if (f) handleDocUpload(f, "logo"); e.target.value = "";
                }} />
              </label>
            </div>
            {/* O limite dito antes de escolher, e o erro no lugar onde nasce (24/10/2026, auditoria 3.12). */}
            <p className="mt-2 text-[10px] text-muted-foreground">{DICA_LOGO}</p>
            {erroLogo && (
              <div role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-lone-danger-border bg-lone-danger-bg p-2.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-lone-danger" />
                <span className="flex-1 text-[11px] text-lone-danger">{erroLogo}</span>
                {salvarPendente?.field === "docLogo" ? (
                  <button onClick={() => gravarCampoDoc("docLogo", salvarPendente.valor, salvarPendente.rotulo).then((ok) => { if (ok) { setErroLogo(null); toast.success("Logo: ficha atualizada."); } })}
                    disabled={salvandoDoc}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-lone-danger-border px-2 py-0.5 text-[10px] text-lone-danger hover:bg-card disabled:opacity-50">
                    {salvandoDoc ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Tentar salvar de novo
                  </button>
                ) : (
                  <button onClick={() => setErroLogo(null)} className="shrink-0 text-lone-danger hover:text-foreground" aria-label="Fechar aviso"><X size={12} /></button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Materiais da marca: todas as versões da logo, links de Figma/Drive, upload e capa.
          Antes só existia UMA logo (doc_logo, do onboarding) e 32 de 52 clientes não tinham. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <MarcaDoCliente clientId={client.id} podeEditar={["admin", "manager", "social", "designer", "traffic"].includes(role)}
          onCapaChange={(url) => { updateClientData(client.id, { docLogo: url }).catch((e) => toast.error(`Capa não salva: ${e instanceof Error ? e.message : "erro"}`)); }} />
      </div>
      </>)}

      {parte === "cadastro" && (<>
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
            <p className="text-xs text-muted-foreground">Status Jurídico</p>
            <p className="text-sm font-medium text-foreground">
              {contratoErro ? (
                <span className="text-lone-warning flex items-center gap-1.5">
                  Não consegui ler o contrato
                  <button onClick={() => setContratoTentativa((n) => n + 1)} className="text-[11px] underline hover:text-foreground">Tentar de novo</button>
                </span>
              ) : !latestContract ? "Nenhum contrato" :
               latestContract.status === "active" ? `Contrato Ativo (V${latestContract.version})` :
               latestContract.status === "expired" ? `Contrato Vencido (V${latestContract.version})` :
               `Rascunho (V${latestContract.version})`}
            </p>
          </div>
        </div>
        <button onClick={() => onNavigateTab("contratos")}
          className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-primary/30 hover:text-primary">
          <FileText size={11} /> {latestContract || contratoErro ? "Ver Contratos" : "Gerar Contrato"}
        </button>
      </div>
      )}

      {/* WhatsApp quick-link */}
      {form.phone && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-lone-success-bg flex items-center justify-center"><Smartphone size={18} className="text-lone-success" aria-hidden="true" /></div>
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

      {/* BLOCO 1: Identificação */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
          <Building2 size={11} className="text-primary" /> Identificação Corporativa
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {([
            { key: "nomeFantasia", label: "Nome Fantasia" }, { key: "razaoSocial", label: "Razão Social" },
            { key: "cnpj", label: "CNPJ" }, { key: "nicho", label: "Ramo / Nicho" },
            { key: "contactName", label: "Responsável" }, { key: "cpfCnpj", label: "CPF" },
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
                <p className="text-sm text-foreground">{form[key] || <span className="text-muted-foreground italic">Não informado</span>}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* BLOCO 1b: Perfil da empresa (Receita + faturamento declarado) — só gestão */}
      {isAdmin && (
        <PerfilEmpresa client={client} editing={editing}
          faixa={form.faturamentoFaixa || ""} onFaixa={(f) => setForm((p) => ({ ...p, faturamentoFaixa: f }))} />
      )}

      {/* BLOCO 2: Cofre de Acessos */}
      {role !== "designer" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <Shield size={11} className="text-primary" /> Cofre de Acessos
            {!isAdmin && <span className="text-[10px] text-muted-foreground normal-case font-normal ml-2">Mostrando apenas plataformas do seu departamento</span>}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accessCards.map(({ platform, icon: IconePlataforma, loginKey, pwKey, testUrl }) => {
              const hasLogin = !!form[loginKey];
              const hasPw = !!form[pwKey];
              return (
                <div key={loginKey} className={`rounded-xl border p-4 space-y-3 ${hasLogin ? "border-border bg-surface" : "border-lone-warning-border bg-lone-warning-bg"}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground flex items-center gap-1.5"><IconePlataforma size={12} className="text-muted-foreground shrink-0" aria-hidden="true" /> {platform}</p>
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
                          <p className="text-sm text-foreground flex-1">{form[loginKey] || <span className="text-muted-foreground italic">Não informado</span>}</p>
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
                                {revealingPw === pwKey ? "Descriptografando..." : semSenha[pwKey] ? "Nenhuma senha no cofre" : "Clique no olho pra revelar"}
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
          {/* Leva 7C (N24): ok / pendente / inválido, pedido por link e quem revelou. */}
          <CofreStatus clientId={client.id} telefone={form.phone || client.phone} />
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
            <div className="flex items-start gap-2 p-3 rounded-lg bg-lone-danger-bg border border-lone-danger-border">
              <AlertTriangle size={13} className="text-lone-danger shrink-0 mt-0.5" />
              <span className="text-xs text-lone-danger flex-1">{uploadError ?? openError}</span>
              {salvarPendente && salvarPendente.field !== "docLogo" && (
                <button onClick={() => gravarCampoDoc(salvarPendente.field, salvarPendente.valor, salvarPendente.rotulo).then((ok) => { if (ok) { setUploadError(null); toast.success(`${salvarPendente.rotulo}: ficha atualizada.`); } })}
                  disabled={salvandoDoc}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-lone-danger-border text-lone-danger hover:bg-card flex items-center gap-1 shrink-0 disabled:opacity-50">
                  {salvandoDoc ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Tentar salvar de novo
                </button>
              )}
              {(!salvarPendente || salvarPendente.field === "docLogo") && (
                <button onClick={() => { setUploadError(null); setOpenError(null); }} className="text-lone-danger hover:text-foreground shrink-0" aria-label="Fechar aviso"><X size={12} /></button>
              )}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">JPG, PNG, WEBP, HEIC ou PDF · até {limiteDoDocumento("contrato_social") / MB} MB por arquivo · cada página pode ser um arquivo.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { label: "Contrato Social", valor: client.docContratoSocial, docType: "contrato_social" },
              { label: "Documento c/ Foto (RG/CNH)", valor: client.docIdentidade, docType: "identidade" },
            ]).map(({ label, valor, docType }) => {
              const arquivos = listaDocs(valor);
              const ocupado = !!uploading || !!removendoDoc || salvandoDoc;
              return (
              <div key={docType} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">{label}</p>
                  {arquivos.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{arquivos.length} {arquivos.length === 1 ? "arquivo" : "arquivos"}</span>
                  )}
                </div>
                {arquivos.length ? (
                  <>
                    <ul className="space-y-2">
                      {arquivos.map((url, i) => {
                        const d = descreverDoc(url);
                        const trocando = uploading === `troca:${url}`;
                        return (
                          <li key={url} className="rounded-lg border border-border bg-card p-2.5 space-y-2">
                            <div className="flex items-start gap-2 min-w-0">
                              {d.tipo === "imagem" ? <ImageIcon size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
                                : <FileText size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-foreground">{rotuloDoc(url, i, arquivos.length)}</p>
                                <p className="text-[10px] text-muted-foreground truncate" title={d.nome}>
                                  {d.nome}{d.privado ? " · privado" : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <button onClick={() => handleSecureOpen(url, url, false)} disabled={opening === `${url}-view`}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50">
                                {opening === `${url}-view` ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />} Ver
                              </button>
                              <button onClick={() => handleSecureOpen(url, url, true)} disabled={opening === `${url}-dl`}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50">
                                {opening === `${url}-dl` ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Baixar
                              </button>
                              <label className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors ${ocupado ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
                                {trocando ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} {trocando ? "Trocando..." : "Trocar"}
                                <input type="file" accept="image/*,.pdf" className="hidden" disabled={ocupado} onChange={(e) => {
                                  const f = e.target.files?.[0]; if (f) handleDocUpload(f, docType, url); e.target.value = "";
                                }} />
                              </label>
                              <button onClick={() => removerDoc(docType, label, url, i, arquivos.length)} disabled={ocupado}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-lone-danger hover:border-lone-danger-border transition-colors disabled:opacity-50">
                                {removendoDoc === url ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />} Remover
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {/* Mais uma página (verso do RG, outra folha do contrato) — acrescenta, não substitui. */}
                    <label className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors ${ocupado ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
                      {uploading === docType ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                      {uploading === docType ? "Enviando..." : "Adicionar outro arquivo"}
                      <input type="file" accept="image/*,.pdf" className="hidden" disabled={ocupado} onChange={(e) => {
                        const f = e.target.files?.[0]; if (f) handleDocUpload(f, docType); e.target.value = "";
                      }} />
                    </label>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-4 rounded-lg border border-dashed border-border bg-card">
                      <AlertTriangle size={14} className="text-lone-warning" /><span className="text-xs text-lone-warning">Pendente</span>
                    </div>
                    <label className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors ${ocupado ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
                      {uploading === docType ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      {uploading === docType ? "Enviando..." : "Enviar arquivo do WhatsApp"}
                      <input type="file" accept="image/*,.pdf" className="hidden" disabled={ocupado} onChange={(e) => {
                        const f = e.target.files?.[0]; if (f) handleDocUpload(f, docType); e.target.value = "";
                      }} />
                    </label>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BLOCO: Configuração Operacional — admin only */}
      {isAdmin && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <Settings size={11} className="text-primary" /> Configuração Operacional
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="space-y-1 col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo de Serviço</p>
              {editing ? (
                <select value={form.serviceType || ""} onChange={(e) => setForm((p) => ({ ...p, serviceType: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Não definido</option>
                  <option value="lone_growth">Lone Growth (Tráfego + Social + Design)</option>
                  <option value="assessoria_trafego">Assessoria de Tráfego</option>
                  <option value="assessoria_social">Assessoria de Social</option>
                  <option value="assessoria_design">Assessoria de Design</option>
                </select>
              ) : (
                <p className="text-sm text-foreground">
                  {form.serviceType === "lone_growth" ? "Lone Growth" :
                   form.serviceType === "assessoria_trafego" ? "Assessoria de Tráfego" :
                   form.serviceType === "assessoria_social" ? "Assessoria de Social" :
                   form.serviceType === "assessoria_design" ? "Assessoria de Design" :
                   <span className="text-muted-foreground italic">Não definido</span>}
                </p>
              )}
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Perfil de Conteúdo</p>
              {editing ? (
                <select value={form.perfilConteudo || ""} onChange={(e) => setForm((p) => ({ ...p, perfilConteudo: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Não definido</option>
                  <option value="so_arte">Só Arte</option>
                  <option value="video">Vídeo (grava vídeos — quarta é dia de Reels)</option>
                  <option value="completo">Completo (vídeo + arte + stories)</option>
                </select>
              ) : (
                <p className="text-sm text-foreground">
                  {form.perfilConteudo === "video" ? "Vídeo (faz Reels)" :
                   form.perfilConteudo === "completo" ? "Completo" :
                   form.perfilConteudo === "so_arte" ? "Só Arte" :
                   <span className="text-muted-foreground italic">Não definido</span>}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsável Tráfego</p>
              {editing ? (
                <select value={form.assignedTraffic || ""} onChange={(e) => setForm((p) => ({ ...p, assignedTraffic: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Nenhum</option>
                  {team.forField("assignedTraffic").map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-foreground">{form.assignedTraffic || <span className="text-muted-foreground italic">Não atribuído</span>}</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Responsável Social</p>
              {editing ? (
                <select value={form.assignedSocial || ""} onChange={(e) => setForm((p) => ({ ...p, assignedSocial: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Nenhum</option>
                  {team.forField("assignedSocial").map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-foreground">{form.assignedSocial || <span className="text-muted-foreground italic">Não atribuído</span>}</p>
              )}
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Designer Responsável</p>
              {editing ? (
                <select value={form.assignedDesigner || ""} onChange={(e) => setForm((p) => ({ ...p, assignedDesigner: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Nenhum</option>
                  {team.forField("assignedDesigner").map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-foreground">{form.assignedDesigner || <span className="text-muted-foreground italic">Não atribuído</span>}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ações do Sistema */}
      {isAdmin && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <Mail size={11} className="text-primary" /> Ações do Sistema
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
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div>
                  <p className="text-xs font-medium text-foreground">Agente CS</p>
                  <p className="text-[10px] text-muted-foreground">
                    {agenteAtivo ? "Ativo — capta demanda e vigia o fluxo deste cliente" : "Pausado — o agente ignora este cliente"}
                  </p>
                </div>
                <button
                  onClick={() => updateClientData(client.id, { agenteAtivo: !agenteAtivo })}
                  title={agenteAtivo ? "Pausar o agente p/ este cliente" : "Reativar o agente"}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${agenteAtivo ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-primary-foreground transition-all ${agenteAtivo ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            );
          })()}
        </div>
      )}
      </>)}

    </div>
  );
}


/**
 * O que a Receita diz da empresa e a faixa de faturamento que o cliente declarou (lib/empresa/receita.ts).
 * Porte é enquadramento legal com teto anual, nunca o faturamento — por isso aparecem separados.
 */
function PerfilEmpresa({ client, editing, faixa, onFaixa }: {
  client: Client; editing: boolean; faixa: string; onFaixa: (f: string) => void;
}) {
  const [receita, setReceita] = useState({
    porte: client.porteReceita ?? null, cnae: client.cnaePrincipal ?? null, cnaeDescricao: client.cnaeDescricao ?? null,
    situacao: client.situacaoCadastral ?? null, em: client.receitaConsultadaEm ?? null,
  });
  const [buscando, setBuscando] = useState(false);

  const atualizar = async () => {
    setBuscando(true);
    const r = await chamar<{ empresa: EmpresaReceita; nichoPreenchido: boolean; numeroPreenchido?: boolean }>(`/api/clients/${client.id}/receita`, {});
    setBuscando(false);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não deu para consultar a Receita agora."); return; }
    const e = r.data.empresa;
    setReceita({ porte: e.porte, cnae: e.cnaePrincipal, cnaeDescricao: e.cnaeDescricao, situacao: e.situacao, em: new Date().toISOString() });
    const extras = [r.data.nichoPreenchido ? `nicho sugerido: ${e.nichoRotulo}` : "", r.data.numeroPreenchido ? `número do endereço: ${e.endereco.numero}` : ""].filter(Boolean);
    toast.success(`Dados da Receita atualizados${extras.length ? ` — ${extras.join("; ")}` : ""}.${r.data.numeroPreenchido ? " Recarregue para ver o número na ficha." : ""}`);
  };

  const porte = porteValido(receita.porte) ? PORTES[receita.porte] : null;
  const item = (rotulo: string, valor: React.ReactNode, dica?: string) => (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{rotulo}</p>
      <div className="text-sm text-foreground">{valor ?? <span className="text-muted-foreground italic">Não informado</span>}</div>
      {dica && <p className="text-[10px] text-muted-foreground">{dica}</p>}
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
          <Building2 size={11} className="text-primary" /> Perfil da empresa
        </p>
        <button type="button" onClick={atualizar} disabled={buscando || !client.cnpj}
          title={client.cnpj ? "Consulta o CNPJ na Receita Federal (BrasilAPI)" : "Cadastre o CNPJ primeiro"}
          className="text-[11px] px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50">
          {buscando ? "Consultando…" : receita.em ? "Atualizar pela Receita" : "Buscar na Receita"}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Faturamento médio por mês (declarado)</p>
          {editing ? (
            <select value={faixa} onChange={(e) => onFaixa(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
              <option value="">Não informado</option>
              {FAIXAS_FATURAMENTO.map((f) => <option key={f.chave} value={f.chave}>{f.rotulo}</option>)}
            </select>
          ) : (
            <p className="text-sm text-foreground">{rotuloFaixa(faixa) ?? <span className="text-muted-foreground italic">Não informado</span>}</p>
          )}
        </div>
        {item("Porte na Receita", porte?.rotulo ?? null, porte ? `Enquadramento: ${porte.teto}. Não é o faturamento.` : undefined)}
        {item("Atividade principal (CNAE)", receita.cnae ? `${receita.cnae} · ${receita.cnaeDescricao ?? ""}` : null)}
        {item("Situação na Receita", receita.situacao
          ? <span className={receita.situacao === "ATIVA" ? "" : "text-lone-warning"}>{receita.situacao.charAt(0) + receita.situacao.slice(1).toLowerCase()}</span>
          : null,
          receita.em ? `Consultado em ${new Date(receita.em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : undefined)}
      </div>
    </div>
  );
}
