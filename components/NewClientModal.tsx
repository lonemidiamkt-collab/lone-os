"use client";

import { useState, useEffect, useRef } from "react";
import {
  UserPlus, Building2, Users, Check, Loader2,
  ExternalLink, Phone, Mail, Upload, Camera,
  CreditCard, Shield, Briefcase, MapPin,
  Rocket, TrendingUp, Smartphone, Palette,
  FileText, X, RefreshCw, AlertTriangle,
} from "lucide-react";
import { useClientsStore } from "@/stores/useClientsStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
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
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { enviarComNovaTentativa, motivoDoArquivoQueNaoSubiu } from "@/lib/onboarding/upload";
import {
  ACEITA_DOC, DOCS_NOVO_CLIENTE, dicaDoDoc, problemaDoArquivo, resumoDoEnvio, rotuloDoDoc, tamanhoLegivel,
  type DocNovoCliente, type EnvioDoc,
} from "@/lib/clients/documentos-novo-cliente";

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

// ─── Documentos: escolhidos aqui, enviados DEPOIS de cadastrar ──────────────
// 25/10/2026 (onda 5 da auditoria de erro recuperável): o arquivo subia na hora de escolher, com um
// clientId inventado (o cliente ainda não existe) — a rota respondia "clientId inválido." e o RG/CNH
// ia com um docType que ela nem conhece ("rg_ou_cnh"). Os dois falhavam sempre. Agora a tela só GUARDA
// o arquivo (com Remover), confere formato e tamanho na hora, e o envio acontece com o id que o cadastro
// devolve. Regras em lib/clients/documentos-novo-cliente.ts.
interface ArquivoGuardado { id: string; docType: DocNovoCliente; file: File }

function DocEscolha({ docType, arquivos, onAdicionar, onRemover }: {
  docType: DocNovoCliente;
  arquivos: ArquivoGuardado[];
  onAdicionar: (files: File[]) => void;
  onRemover: (id: string) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const rotulo = rotuloDoDoc(docType);

  const escolher = (lista: FileList | File[] | null | undefined) => {
    const files = lista ? Array.from(lista) : [];
    if (!files.length) return;
    let ja = arquivos.length;
    const bons: File[] = [];
    const problemas: string[] = [];
    for (const f of files) {
      const p = problemaDoArquivo(f, docType, ja);
      if (p) problemas.push(p);
      else { bons.push(f); ja++; }
    }
    if (bons.length) onAdicionar(bons);
    setErro(problemas.length ? problemas.join(" ") : null);
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-border p-2.5">
      <p className="text-[11px] font-medium text-foreground">{rotulo}</p>
      {arquivos.length > 0 && (
        <ul className="space-y-1" aria-label={`Arquivos de ${rotulo}`}>
          {arquivos.map((a) => (
            <li key={a.id} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
              <FileText size={11} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground" title={a.file.name}>{a.file.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{tamanhoLegivel(a.file.size)}</span>
              <button type="button" onClick={() => { onRemover(a.id); setErro(null); }} aria-label={`Remover ${a.file.name}`} title="Remover"
                className="shrink-0 text-muted-foreground hover:text-destructive">
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => ref.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all text-[11px]">
          <Upload size={12} aria-hidden="true" /> {arquivos.length ? "Adicionar outro arquivo" : `Escolher ${rotulo}`}
        </button>
        <button type="button" aria-label={`Fotografar ${rotulo}`} title="Fotografar" onClick={() => {
          const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.capture = "environment";
          input.onchange = (e) => escolher((e.target as HTMLInputElement).files); input.click();
        }} className="px-3 py-2 rounded-lg border border-dashed border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all text-[11px]">
          <Camera size={12} aria-hidden="true" />
        </button>
      </div>
      <input ref={ref} type="file" multiple accept={ACEITA_DOC} className="hidden" aria-label={`Arquivo de ${rotulo}`}
        onChange={(e) => { escolher(e.target.files); e.target.value = ""; }} />
      <p className="text-[10px] text-muted-foreground">{dicaDoDoc(docType)}</p>
      {erro && <p role="alert" className="text-[10px] text-destructive">{erro}</p>}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────
export default function NewClientModal({ onClose, onSuccess }: Props) {
  const addClient = useClientsStore((s) => s.addClient);
  const addTask = useOperationalStore((s) => s.addTask);
  const pushNotification = useNotificationsStore((s) => s.push);
  const { role, currentUser } = useRole();
  const team = useTeamMembers();
  const isAdmin = role === "admin" || role === "manager";

  const [phase, setPhase] = useState<Phase>("pf");

  // CONEXÕES NO CADASTRO (pedido do Roberto, 10/08). Antes a conta de anúncio só existia no modal
  // de EDIÇÃO, como campo de texto pra digitar "act_1734129041237105" na mão — e o grupo do
  // WhatsApp não existia em tela nenhuma. Resultado: Óticas Raki e Império Material ficaram meses
  // sem receber relatório, suporte ou mensagem de data comemorativa, porque ninguém lembrou de
  // voltar depois pra ligar as duas pontas. Cadastrar tem que deixar o cliente PRONTO.
  const [contas, setContas] = useState<{ id: string; name: string }[]>([]);
  const [grupos, setGrupos] = useState<{ id: string; subject: string }[]>([]);
  const [carregandoConexoes, setCarregandoConexoes] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { authedFetch } = await import("@/lib/supabase/authed-fetch");
      const [c, g] = await Promise.all([
        authedFetch("/api/traffic/ad-accounts").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        authedFetch("/api/clients/group-mapping").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!vivo) return;
      setContas(c?.accounts ?? []);
      setGrupos(g?.groups ?? []);
      setCarregandoConexoes(false);
    })();
    return () => { vivo = false; };
  }, []);
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
    // Conexões (conta de anúncio e grupo do WhatsApp) — ver o bloco "Conexões" no formulário
    metaAdAccountId: "",
    whatsappGroupJid: "",
    whatsappGroupName: "",
    // Servico
    serviceType: "lone_growth" as import("@/lib/types").ServiceType,
    paymentMethod: "pix" as Client["paymentMethod"],
    assignedTraffic: "",
    assignedSocial: "",
    assignedDesigner: "",
  });

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const SERVICE_OPTIONS = [
    { value: "lone_growth", label: "Lone Growth", icon: Rocket, desc: "Tráfego + Social + Design" },
    { value: "assessoria_trafego", label: "Assessoria de Tráfego", icon: TrendingUp, desc: "Apenas Tráfego" },
    { value: "assessoria_social", label: "Assessoria de Social", icon: Smartphone, desc: "Apenas Social" },
    { value: "assessoria_design", label: "Assessoria de Design", icon: Palette, desc: "Apenas Design" },
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
      const res = await authedFetch("/api/onboarding", {
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
  // 24/10/2026 (auditoria 3.8): clique duplo criava DOIS clientes e a falha não aparecia (o erro da
  // rota — inclusive o 409 "esta conta de anúncio é do cliente X" — virava uma promessa rejeitada que
  // ninguém tratava). Agora o botão trava enquanto grava (a ref segura o 2º clique antes de a tela
  // redesenhar) e o motivo da rota aparece junto do botão, com o formulário intacto.
  const salvandoRef = useRef(false);
  const [salvando, setSalvando] = useState(false);
  const [erroCadastro, setErroCadastro] = useState<string | null>(null);
  const [avisoPosCadastro, setAvisoPosCadastro] = useState<string[]>([]);
  const [novoId, setNovoId] = useState<string | null>(null);

  // Documentos guardados na tela até o cliente existir (25/10/2026, onda 5).
  const [arquivos, setArquivos] = useState<ArquivoGuardado[]>([]);
  const proximoArquivo = useRef(0);
  const adicionarArquivos = (docType: DocNovoCliente, files: File[]) =>
    setArquivos((p) => [...p, ...files.map((file) => ({ id: `arq-${++proximoArquivo.current}`, docType, file }))]);
  const removerArquivo = (id: string) => setArquivos((p) => p.filter((a) => a.id !== id));
  const [envios, setEnvios] = useState<EnvioDoc[]>([]);
  const [esperaClique, setEsperaClique] = useState(false);

  /**
   * Envia os documentos para o cliente recém-criado, UM POR VEZ (a rota acrescenta cada arquivo à lista
   * da ficha lendo e gravando — dois juntos podiam se atropelar). 429, queda de rede e deploy tentam de
   * novo sozinhos (lib/onboarding/upload.ts). Devolve quantos falharam.
   */
  const enviarDocumentos = async (clientId: string, itens: ArquivoGuardado[]): Promise<number> => {
    let falhas = 0;
    for (const a of itens) {
      setEnvios((p) => p.map((e): EnvioDoc => (e.id === a.id ? { ...e, estado: "enviando", erro: null } : e)));
      const r = await enviarComNovaTentativa(() => {
        const fd = new FormData();
        fd.append("file", a.file);
        fd.append("clientId", clientId);
        fd.append("docType", a.docType);
        return chamar<{ url?: string }>("/api/onboarding/upload", fd);
      });
      const ok = r.ok && !!r.data?.url;
      if (!ok) falhas++;
      setEnvios((p) => p.map((e): EnvioDoc => (e.id === a.id
        ? { ...e, estado: ok ? "enviado" : "falhou", erro: ok ? null : motivoDoArquivoQueNaoSubiu(r.status, r.erro) }
        : e)));
    }
    return falhas;
  };

  const tentarDeNovo = async (id: string) => {
    const a = arquivos.find((x) => x.id === id);
    if (!a || !novoId) return;
    await enviarDocumentos(novoId, [a]);
  };

  const handleSubmit = async () => {
    if (salvandoRef.current) return;
    const name = form.nomeFantasia.trim() || form.razaoSocial.trim();
    if (!name) { setErroCadastro("Nome Fantasia ou Razão Social é obrigatório — preencha na fase Empresa."); return; }

    salvandoRef.current = true;
    setSalvando(true);
    setErroCadastro(null);
    let newClient: Client;
    try {
      newClient = await addClient({
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
        // Documentos NÃO vão aqui: sobem logo abaixo, com o id que esta criação devolve.
        metaAdAccountId: form.metaAdAccountId || undefined,
      });
    } catch (e) {
      // Nada foi criado: o formulário fica como está para corrigir e tentar de novo.
      setErroCadastro(e instanceof Error && e.message ? e.message : "Não consegui cadastrar o cliente. Tente de novo.");
      salvandoRef.current = false;
      setSalvando(false);
      return;
    }

    // Daqui em diante o cliente JÁ existe: o que falhar vira aviso na tela de sucesso, e a trava
    // continua — clicar de novo criaria um segundo cadastro.
    const avisos: string[] = [];

    // O grupo entra pela rota que já existe (o tipo Client não carrega esses campos, e duplicar o
    // caminho de escrita é como se criam dois lugares que discordam). Falhar aqui NÃO derruba o
    // cadastro — o cliente já existe; o que fica faltando é a ligação, e ela aparece na tela.
    if (form.whatsappGroupJid && newClient.id) {
      const r = await chamar("/api/clients/group-mapping", { mappings: [{
        clientId: newClient.id, groupJid: form.whatsappGroupJid, groupName: form.whatsappGroupName,
      }] });
      if (!r.ok) avisos.push(`O grupo do WhatsApp NÃO foi vinculado (${r.erro}). Ligue em Clientes → Grupos.`);
    }

    // Auto-generate tasks
    const today = new Date().toISOString().slice(0, 10);
    const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const tarefas: Promise<unknown>[] = [];
    if (needsDesigner && form.assignedDesigner) {
      tarefas.push(addTask({ title: `[Setup] Identidade Visual — ${name}`, clientId: newClient.id, clientName: name, assignedTo: form.assignedDesigner, role: "designer", status: "pending", priority: "high", startDate: today, dueDate: weekFromNow }));
    }
    if (needsSocial && form.assignedSocial) {
      tarefas.push(addTask({ title: `[Setup] Grade Editorial — ${name}`, clientId: newClient.id, clientName: name, assignedTo: form.assignedSocial, role: "social", status: "pending", priority: "high", startDate: today, dueDate: weekFromNow }));
    }
    if (needsTraffic && form.assignedTraffic) {
      tarefas.push(addTask({ title: `[Setup] Auditoria de Contas — ${name}`, clientId: newClient.id, clientName: name, assignedTo: form.assignedTraffic, role: "traffic", status: "pending", priority: "high", startDate: today, dueDate: weekFromNow }));
    }
    const falhasTarefa = (await Promise.allSettled(tarefas)).filter((t) => t.status === "rejected").length;
    if (falhasTarefa) avisos.push(`${falhasTarefa} de ${tarefas.length} tarefas de setup não foram criadas — crie em Tarefas.`);

    pushNotification("system", "Novo cliente", falhasTarefa ? `${name} cadastrado, mas faltaram tarefas de setup.` : `${name} cadastrado. Tasks de setup criadas.`);
    setNovoId(newClient.id);
    setAvisoPosCadastro(avisos);
    // Os documentos aparecem na tela de sucesso, arquivo a arquivo, enquanto sobem.
    const fila = arquivos;
    setEnvios(fila.map((a) => ({ id: a.id, docType: a.docType, nome: a.file.name, estado: "na_fila" as const })));
    setSuccessState(true);
    const falhasDocs = fila.length ? await enviarDocumentos(newClient.id, fila) : 0;
    // Com aviso ou documento que não subiu, a pessoa precisa ler antes de ir para a ficha (e o botão fica,
    // mesmo que o "Tentar de novo" resolva tudo depois); sem nada, segue sozinha.
    if (avisos.length || falhasDocs) setEsperaClique(true);
    else setTimeout(() => onSuccess(newClient.id), 2000);
  };

  // ─── Phases ───────────────────────────────────
  const PHASES: { key: Phase; label: string; icon: typeof UserPlus }[] = [
    { key: "pf", label: "Pessoa Física", icon: UserPlus },
    { key: "pj", label: "Empresa", icon: Building2 },
    { key: "servico", label: "Serviço & Equipe", icon: Briefcase },
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
            <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
              <ExternalLink size={28} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Link gerado!</h2>
            <p className="text-sm text-muted-foreground text-center">Envie para o cliente preencher dados e documentos.</p>
            <div className="w-full bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-2">
              <input type="text" value={linkGenerated} readOnly className="flex-1 bg-transparent text-xs text-muted-foreground outline-none truncate" onClick={(e) => (e.target as HTMLInputElement).select()} />
              <button onClick={() => navigator.clipboard.writeText(linkGenerated)} className="text-xs text-primary hover:text-foreground transition-colors shrink-0 font-medium">Copiar</button>
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
    const docs = resumoDoEnvio(envios);
    const docsFalharam = docs.falhas.length > 0 && !docs.emAndamento;
    const precisaLer = esperaClique || avisoPosCadastro.length > 0 || docs.falhas.length > 0;
    return (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center justify-center py-12 gap-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-lone-success-bg flex items-center justify-center"><Check size={32} className="text-lone-success" /></div>
            <h2 className="text-lg font-semibold text-foreground">Cliente cadastrado!</h2>
            {avisoPosCadastro.length > 0 && (
              // O que não deu certo DEPOIS de criar (grupo, tarefas) — antes ia para um aviso que a
              // tela de sucesso escondia (24/10/2026, auditoria 3.8).
              <div role="alert" className="w-full space-y-1.5 rounded-lg border border-lone-warning-border bg-lone-warning-bg px-4 py-3">
                {avisoPosCadastro.map((a) => <p key={a} className="text-xs text-lone-warning">{a}</p>)}
              </div>
            )}
            {envios.length > 0 && (
              // Resultado de cada documento (25/10/2026, onda 5): "2 de 2 enviados" ou qual não subiu, com
              // "Tentar de novo" ali mesmo — o cliente já existe, então o reenvio vai para a ficha dele.
              <div role={docsFalharam ? "alert" : "status"} aria-label="Documentos"
                className={`w-full space-y-2 rounded-lg border px-4 py-3 ${docsFalharam ? "border-lone-danger-border bg-lone-danger-bg" : "border-border bg-card"}`}>
                <p className={`text-xs font-medium ${docsFalharam ? "text-lone-danger" : "text-foreground"}`}>{docs.frase}</p>
                <ul className="space-y-1.5">
                  {envios.map((e) => (
                    <li key={e.id} className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        {e.estado === "enviado" ? <Check size={12} className="shrink-0 text-lone-success" aria-hidden="true" />
                          : e.estado === "falhou" ? <AlertTriangle size={12} className="shrink-0 text-lone-danger" aria-hidden="true" />
                          : e.estado === "enviando" ? <Loader2 size={12} className="shrink-0 animate-spin text-primary" aria-hidden="true" />
                          : <FileText size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
                        <span className="shrink-0 text-muted-foreground">{rotuloDoDoc(e.docType)}:</span>
                        <span className="min-w-0 flex-1 truncate text-foreground" title={e.nome}>{e.nome}</span>
                        {e.estado === "falhou" && (
                          <button type="button" onClick={() => void tentarDeNovo(e.id)} disabled={docs.emAndamento}
                            className="inline-flex shrink-0 items-center gap-1 font-medium text-lone-danger underline hover:opacity-80 disabled:opacity-40">
                            <RefreshCw size={11} aria-hidden="true" /> Tentar de novo
                          </button>
                        )}
                      </div>
                      {e.estado === "falhou" && e.erro && <p className="pl-[18px] text-[11px] text-lone-danger">Não subiu: {e.erro}</p>}
                    </li>
                  ))}
                </ul>
                {docsFalharam && (
                  <p className="text-[11px] text-muted-foreground">Também dá para enviar depois na ficha: Admin › Documentos Legais.</p>
                )}
              </div>
            )}
            {precisaLer || docs.emAndamento ? (
              novoId && (
                <Button onClick={() => onSuccess(novoId)} disabled={docs.emAndamento}>
                  {docs.emAndamento ? "Aguarde o envio dos documentos…" : "Abrir a ficha do cliente"}
                </Button>
              )
            ) : (
              <>
                <p className="text-sm text-muted-foreground text-center">Preparando workspace e checklist de onboarding...</p>
                <div className="flex items-center gap-2 mt-2"><Loader2 size={14} className="text-primary animate-spin" /><span className="text-xs text-muted-foreground">Redirecionando...</span></div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Main Render ─────────────────────────────
  return (
    // Fechar no meio da gravação esconderia o resultado (o cliente pode ter sido criado).
    <Dialog open onOpenChange={(open) => !open && !salvandoRef.current && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center"><UserPlus size={18} className="text-primary" /></div>
            <div>
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>Cadastro em 3 fases + onboarding automático</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Phase stepper */}
        <div className="flex items-center gap-2">
          {PHASES.map((p, i) => (
            <div key={p.key} className="flex items-center gap-2 flex-1">
              <button onClick={() => setPhase(p.key)} className={`flex items-center gap-1.5 text-[11px] font-medium transition-all ${currentIdx > i ? "text-lone-success" : currentIdx === i ? "text-foreground" : "text-muted-foreground"}`}>
                <p.icon size={12} /> {p.label}
              </button>
              {i < PHASES.length - 1 && <div className={`flex-1 h-px ${currentIdx > i ? "bg-lone-success-bg" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="space-y-4 py-1 min-h-[300px]">
          {error && <p className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2.5">{error}</p>}

          {/* ═══ FASE 1: PESSOA FISICA ═══ */}
          {phase === "pf" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Shield size={10} className="text-primary" /> Dados do Responsável (PF)</p>

              <div className="space-y-1.5">
                <Label>Nome da Empresa <span className="text-muted-foreground font-normal">(para o link)</span></Label>
                <Input value={form.nomeFantasia} onChange={(e) => { set("nomeFantasia", e.target.value); setError(""); }}
                  placeholder="Ex: Contele Energia Solar" />
              </div>

              {/* Quick Link button */}
              {(form.nomeFantasia.trim().length >= 2 || form.contactName.trim().length >= 2) && (
                <button type="button" onClick={handleGenerateLink} disabled={generatingLink}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06] hover:border-primary/40 transition-all text-left group">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {generatingLink ? <Loader2 size={14} className="text-primary animate-spin" /> : <ExternalLink size={14} className="text-primary" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-primary font-medium group-hover:text-foreground transition-colors">Gerar Link para Cliente Preencher</p>
                    <p className="text-[9px] text-muted-foreground">Cria rascunho + link de onboarding externo</p>
                  </div>
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome Completo <span className="text-destructive">*</span></Label>
                  <Input value={form.contactName} onChange={(e) => { set("contactName", e.target.value); setError(""); }} placeholder="Ex: João da Silva" />
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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Building2 size={10} className="text-primary" /> Dados Empresariais (PJ)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Razão Social</Label>
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
                <Label className="flex items-center gap-1"><MapPin size={10} /> Endereço</Label>
                <Input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Rua, número, bairro, cidade - UF" />
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
                      <SelectItem value="indicacao">Indicação</SelectItem>
                      <SelectItem value="trafego">Tráfego Pago</SelectItem>
                      <SelectItem value="organico">Orgânico</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Documentos: guardados aqui e enviados logo depois de cadastrar (25/10/2026, onda 5). */}
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Documentos (opcional)</p>
                <p className="text-[10px] text-muted-foreground">Os arquivos escolhidos sobem logo depois de “Cadastrar Cliente”, já na ficha dele.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {DOCS_NOVO_CLIENTE.map((d) => (
                    <DocEscolha key={d.docType} docType={d.docType}
                      arquivos={arquivos.filter((a) => a.docType === d.docType)}
                      onAdicionar={(files) => adicionarArquivos(d.docType, files)}
                      onRemover={removerArquivo} />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Observações <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Contexto, expectativas..." />
              </div>
            </div>
          )}

          {/* ═══ FASE 3: SERVICO & EQUIPE ═══ */}
          {phase === "servico" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Briefcase size={10} className="text-primary" /> Serviço Contratado & Equipe</p>

              <div className="grid grid-cols-2 gap-2">
                {SERVICE_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => set("serviceType", opt.value)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                      form.serviceType === opt.value ? "border-primary/50 bg-primary/[0.06]" : "border-border bg-card/[0.02] hover:border-border"
                    }`}>
                    <opt.icon size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className={`text-xs font-medium ${form.serviceType === opt.value ? "text-foreground" : "text-muted-foreground"}`}>{opt.label}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{opt.desc}</p>
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
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground uppercase tracking-wider pt-2">Equipe Responsável</p>
              <div className="space-y-3">
                {([
                  { key: "assignedTraffic" as const, label: "Gestor de Tráfego", members: team.forField("assignedTraffic"), show: needsTraffic },
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

              {/* CONEXÕES — é o que faz o cliente existir pras automações. Sem conta de anúncio
                  não há relatório; sem grupo, o relatório não tem pra onde ir. Ficava fora do
                  cadastro e alguém tinha que lembrar de voltar depois: dois clientes passaram
                  meses sem receber nada por causa disso. */}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider pt-4">
                Conexões <span className="normal-case tracking-normal">— sem isto o cliente não recebe relatório nem mensagem automática</span>
              </p>
              <div className="space-y-3">
                {needsTraffic && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">Conta de anúncio (Meta)</Label>
                    <Select value={form.metaAdAccountId} onValueChange={(v) => set("metaAdAccountId", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={carregandoConexoes ? "Carregando as contas…" : contas.length ? "Escolha a conta" : "Nenhuma conta disponível"} />
                      </SelectTrigger>
                      <SelectContent>
                        {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Só aparecem contas ainda não ligadas a outro cliente. Dá pra escolher depois em Editar.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">Grupo do WhatsApp</Label>
                  <Select
                    value={form.whatsappGroupJid}
                    onValueChange={(v) => {
                      set("whatsappGroupJid", v);
                      set("whatsappGroupName", grupos.find((g) => g.id === v)?.subject ?? "");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={carregandoConexoes ? "Carregando os grupos…" : grupos.length ? "Escolha o grupo" : "Nenhum grupo encontrado"} />
                    </SelectTrigger>
                    <SelectContent>
                      {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.subject}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    É por onde saem relatório, suporte e datas comemorativas. O agente já precisa estar no grupo.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* O erro do cadastro fica junto do botão, com o motivo da rota (24/10/2026, auditoria 3.8). */}
        {erroCadastro && (
          <div role="alert" className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-4 py-2.5 space-y-2">
            <p className="text-sm text-lone-danger">{erroCadastro}</p>
            {form.metaAdAccountId && /conta de anúncio/i.test(erroCadastro) && (
              <button type="button" onClick={() => { set("metaAdAccountId", ""); setErroCadastro(null); }}
                className="text-xs font-medium text-lone-danger underline hover:opacity-80">
                Tirar a conta de anúncio e cadastrar sem ela
              </button>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <div>{currentIdx > 0 && <Button variant="ghost" onClick={goPrev} disabled={salvando} className="text-xs">Anterior</Button>}</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
            {currentIdx < PHASES.length - 1 ? (
              <Button onClick={goNext}>Próximo</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={salvando} className="flex items-center gap-2">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {salvando ? "Cadastrando…" : "Cadastrar Cliente"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
