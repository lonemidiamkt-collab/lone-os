"use client";

// app/clients/[id]/page.tsx — A FICHA DO CLIENTE (Leva 6B).
//
// Seis abas em vez de quinze: Resumo · Marca & Briefing · Entregas · Resultados · Relacionamento ·
// Admin. Abre no Resumo. Cada aba mora em components/client/ficha/; o mapa de aba antiga → nova (e
// a seção para onde rolar) está em components/client/ficha/abas.ts — todo `?tab=` que já existiu
// continua levando ao lugar certo.
//
// Esta página só carrega os dados, monta o contexto e escolhe a aba.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Header from "@/components/Header";
import EditClientModal from "@/components/EditClientModal";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useRole } from "@/lib/context/RoleContext";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { nivelDoCliente, scoreDoCliente } from "@/lib/saude/carteira";
import type { Client } from "@/lib/types";
import CabecalhoCliente from "@/components/client/ficha/CabecalhoCliente";
import PedirArteModal from "@/components/client/ficha/PedirArteModal";
import PainelPortal, { BotaoPortal } from "@/components/client/ficha/PortalDoCliente";
import AbaResumo from "@/components/client/ficha/AbaResumo";
import AbaMarca from "@/components/client/ficha/AbaMarca";
import AbaEntregas from "@/components/client/ficha/AbaEntregas";
import AbaResultados from "@/components/client/ficha/AbaResultados";
import AbaRelacionamento from "@/components/client/ficha/AbaRelacionamento";
import AbaAdmin from "@/components/client/ficha/AbaAdmin";
import { ABAS_FICHA, resolverAba, type AbaFicha } from "@/components/client/ficha/abas";
import type { FichaCtx, ResumoCliente } from "@/components/client/ficha/tipos";

// A lista (useClientsStore) vem MAGRA por segurança — sem logins, tokens de link público nem PII
// (cpf/endereço/docs). Esses campos são puxados 1x, gated, por /api/clients/[id], e mesclados só
// nas chaves sensíveis (pra não sobrescrever updates realtime dos campos comuns).
const SENSIVEIS: (keyof Client)[] = [
  "cpfCnpj", "birthDate", "idade", "docIdentidade", "docContratoSocial",
  "endereco", "enderecoRua", "enderecoNumero", "enderecoBairro", "enderecoCidade", "enderecoEstado", "enderecoCep",
  "facebookLogin", "googleAdsLogin", "instagramLogin",
  "publicReportToken", "publicReportTokenCreatedAt", "publicReportTokenRevokedAt",
  "fichaVivaToken", "fichaVivaRaioxToken", "fichaVivaTokenCreatedAt", "fichaVivaTokenRevokedAt",
];

/** O que falta no cadastro (mesma lista da antiga aba Dados) — só faz sentido com os dados completos. */
function faltaNoCadastro(c: Client): string[] {
  const falta: string[] = [];
  if (!c.nomeFantasia) falta.push("Nome fantasia");
  if (!c.cnpj) falta.push("CNPJ");
  if (!c.phone) falta.push("WhatsApp");
  if (!c.emailCorporativo) falta.push("E-mail");
  if (!c.facebookLogin) falta.push("Acesso Meta/Facebook");
  if (!c.instagramLogin) falta.push("Acesso Instagram");
  if (!c.googleAdsLogin) falta.push("Acesso Google Ads");
  if (!c.docContratoSocial) falta.push("Contrato social");
  if (!c.docIdentidade) falta.push("Documento RG/CNH");
  if (!c.docLogo) falta.push("Logo");
  return falta;
}

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;
  const { role, currentUser } = useRole();

  // ── Stores ────────────────────────────────────────────────────────────────
  const clients = useClientsStore((s) => s.clients);
  const updateClientData = useClientsStore((s) => s.updateClient);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const tasks = useOperationalStore((s) => s.tasks);
  const onboarding = useOperationalStore((s) => s.onboarding);

  const patchClientLocal = useClientsStore((s) => s.patchClientLocal);
  const initClients = useClientsStore((s) => s.init);
  const subClients = useClientsStore((s) => s.subscribeRealtime);
  const initContent = useContentStore((s) => s.init);
  const subContent = useContentStore((s) => s.subscribeRealtime);
  const initOps = useOperationalStore((s) => s.init);
  const subOps = useOperationalStore((s) => s.subscribeRealtime);

  useEffect(() => {
    initClients();
    initContent();
    initOps();
    const u1 = subClients();
    const u2 = subContent();
    const u3 = subOps();
    return () => { u1(); u2(); u3(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Campos sensíveis (1x, gated) ──────────────────────────────────────────
  const baseClient = clients.find((c) => c.id === clientId);
  const [clientExtra, setClientExtra] = useState<Partial<Client>>({});
  // "ok" só quando os campos sensíveis chegaram: antes disso o cadastro não pode ser salvo.
  const [extraStatus, setExtraStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  useEffect(() => {
    let vivo = true;
    setClientExtra({});
    setExtraStatus("carregando");
    chamar<{ client?: Client; completo?: boolean }>(`/api/clients/${clientId}`).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.data?.client) {
        setExtraStatus("erro");
        toast.error(`Não consegui carregar os dados completos do cliente: ${r.erro ?? "resposta vazia"}`);
        return;
      }
      setClientExtra(r.data.client);
      setExtraStatus(r.data.completo === false ? "erro" : "ok");
    });
    return () => { vivo = false; };
  }, [clientId]);
  const client = useMemo(() => {
    if (!baseClient) return undefined;
    const merged = { ...baseClient };
    for (const k of SENSIVEIS) {
      const v = (clientExtra as Record<string, unknown>)[k as string];
      if (v !== undefined) (merged as Record<string, unknown>)[k as string] = v;
    }
    return merged;
  }, [baseClient, clientExtra]);

  // ── Resumo (saúde com o porquê, pendências, NPS, check-ins) ───────────────
  const [resumo, setResumo] = useState<ResumoCliente | null>(null);
  const [resumoErro, setResumoErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let vivo = true;
    setResumoErro(null);
    chamar<ResumoCliente>(`/api/clients/${clientId}/resumo`).then((r) => {
      if (!vivo) return;
      if (r.ok && r.data) setResumo(r.data);
      else setResumoErro(r.erro ?? "Não consegui carregar o resumo.");
    });
    return () => { vivo = false; };
  }, [clientId, recarga]);

  // ── Aba ───────────────────────────────────────────────────────────────────
  // ?tab= (novo ou antigo) decide a aba e a seção. Sem tab: Resumo.
  const [destinoInicial] = useState(() =>
    resolverAba(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null));
  const [aba, setAba] = useState<AbaFicha>(destinoInicial.aba);
  const secaoPendente = useRef<string | null>(destinoInicial.secao ?? null);
  const [rolar, setRolar] = useState(0);

  const irPara = useCallback((nova: AbaFicha, secao?: string) => {
    secaoPendente.current = secao ?? null;
    setAba(nova);
    setRolar((n) => n + 1);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", nova);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);

  // Rola até a seção pedida depois que a aba renderizou (o conteúdo de algumas chega depois).
  const temCliente = !!client;
  useEffect(() => {
    const alvo = secaoPendente.current;
    if (!alvo || !temCliente) return;
    const t = setTimeout(() => {
      document.getElementById(alvo)?.scrollIntoView({ behavior: "smooth", block: "start" });
      secaoPendente.current = null;
    }, 150);
    return () => clearTimeout(t);
  }, [aba, rolar, temCliente]);

  // O DadosTab ainda fala em nomes de aba antigos ("contratos").
  const irParaAntiga = useCallback((tab: string) => {
    const d = resolverAba(tab);
    irPara(d.aba, d.secao);
  }, [irPara]);

  // ── Ações do topo ─────────────────────────────────────────────────────────
  // Portal: o painel abre sozinho quando o link é ?tab=portal (o antigo endereço da seção do portal).
  const [portalAberto, setPortalAberto] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "portal");
  // O token e as datas do link são campos sensíveis (clientExtra): mudar só no store não aparecia,
  // porque o merge lá em cima dá a palavra final ao clientExtra. Os comuns vão também pro store.
  const aoMudarPortal = useCallback((patch: Partial<Client>) => {
    setClientExtra((e) => ({ ...e, ...patch }));
    const comuns = Object.fromEntries(Object.entries(patch).filter(([k]) => !SENSIVEIS.includes(k as keyof Client)));
    if (Object.keys(comuns).length) patchClientLocal(clientId, comuns as Partial<Client>);
  }, [clientId, patchClientLocal]);
  const fecharPortal = useCallback(() => {
    setPortalAberto(false);
    // Veio por ?tab=portal: fechar deixa o endereço no Resumo (recarregar não reabre o painel).
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === "portal") {
      url.searchParams.set("tab", "resumo");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);
  const [editando, setEditando] = useState(false);
  const [pedindoArte, setPedindoArte] = useState(false);
  const [onboardingLink, setOnboardingLink] = useState<string | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);
  const gerarLinkOnboarding = async () => {
    setGerandoLink(true);
    const r = await chamar<{ url?: string }>("/api/onboarding", { action: "generate_link", clientId });
    setGerandoLink(false);
    if (!r.ok || !r.data?.url) { toast.error(r.erro ?? "Não consegui gerar o link."); return; }
    const url = `${window.location.origin}${r.data.url}`;
    setOnboardingLink(url);
    navigator.clipboard.writeText(url).then(() => toast.success("Link de onboarding copiado."), () => {});
  };

  // Espera o cliente aparecer (logo depois de criado, o insert ainda está chegando).
  const [esperando, setEsperando] = useState(!client);
  useEffect(() => {
    if (client) { setEsperando(false); return; }
    const t = setTimeout(() => setEsperando(false), 5000);
    return () => clearTimeout(t);
  }, [client]);

  if (!client && esperando) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        <Header title="Carregando..." subtitle="Preparando dados do cliente" />
        <div className="space-y-5 p-6 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        <Header title="Cliente não encontrado" />
        <div className="flex flex-1 items-center justify-center">
          <div className="space-y-3 text-center">
            <p className="text-muted-foreground">Cliente não encontrado.</p>
            <Link href="/clients" className="btn-primary">Voltar</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Contexto das abas ─────────────────────────────────────────────────────
  const isAdmin = role === "admin" || role === "manager";
  const naMinhaCarteira =
    (role === "traffic" && client.assignedTraffic === currentUser) ||
    (role === "social" && client.assignedSocial === currentUser) ||
    (role === "designer" && client.assignedDesigner === currentUser);
  // Uma régua só — a da Saúde da carteira (lib/saude/carteira.ts): nível do escritor único
  // (/api/scores), sem estimativa local. Sem nota, "Sem dado suficiente", nunca um número inventado.
  const nivelSaude = nivelDoCliente(client);
  const scoreSaude = nivelSaude === "sem_dado" ? null : scoreDoCliente(client);
  const cards = contentCards.filter((c) => c.clientId === clientId);
  const pedidos = designRequests.filter((d) => d.clientId === clientId);
  const tarefas = tasks.filter((t) => t.clientId === clientId);
  const obItens = onboarding[clientId] ?? [];

  const ctx: FichaCtx = {
    client, clientId, role, currentUser, isAdmin, naMinhaCarteira,
    resumo, resumoErro, recarregarResumo: () => setRecarga((n) => n + 1),
    irPara, pedirArte: () => setPedindoArte(true),
  };
  const dadosCompletos = extraStatus === "ok";
  // Quem recebe o link do portal (a rota /api/clients/[id] só manda o token para gestão e social).
  const veLinkPortal = isAdmin || role === "social";

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <CabecalhoCliente
        client={client}
        saude={{ nivel: nivelSaude, score: scoreSaude === null ? null : Math.round(scoreSaude) }}
        isAdmin={isAdmin}
        podePedirArte={role !== "comercial"}
        onEditar={() => setEditando(true)}
        onPedirArte={() => setPedindoArte(true)}
        onLinkOnboarding={gerarLinkOnboarding}
        gerandoLink={gerandoLink}
        linkCopiado={!!onboardingLink}
        portal={veLinkPortal
          ? <BotaoPortal client={client} carregado={extraStatus === "ok"} onClick={() => setPortalAberto(true)} />
          : undefined}
      />

      {/* Abas: rolam na horizontal no celular — o rótulo nunca é cortado. */}
      <nav className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur" aria-label="Seções da ficha">
        <div role="tablist" className="flex overflow-x-auto px-2 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ABAS_FICHA.map((a) => (
            <button key={a.id} role="tab" id={`aba-${a.id}`} aria-selected={aba === a.id} aria-controls="painel-ficha"
              onClick={() => irPara(a.id)}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
                aba === a.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}>
              {a.rotulo}
            </button>
          ))}
        </div>
      </nav>

      <main id="painel-ficha" role="tabpanel" aria-labelledby={`aba-${aba}`} className="px-4 py-6 sm:px-6 animate-fade-in">
        {aba === "resumo" && (
          <AbaResumo ctx={ctx} cards={cards} pedidos={pedidos} tarefas={tarefas} onboarding={obItens}
            faltaNoCadastro={isAdmin && dadosCompletos ? faltaNoCadastro(client) : null} />
        )}
        {aba === "marca" && (
          <AbaMarca ctx={ctx} dadosCompletos={dadosCompletos} updateClientData={updateClientData} onNavigateTab={irParaAntiga} />
        )}
        {aba === "entregas" && <AbaEntregas ctx={ctx} cards={cards} pedidos={pedidos} tarefas={tarefas} />}
        {aba === "resultados" && <AbaResultados ctx={ctx} />}
        {aba === "relacionamento" && <AbaRelacionamento ctx={ctx} />}
        {aba === "admin" && (
          <AbaAdmin ctx={ctx} onboarding={obItens} dadosCompletos={dadosCompletos} updateClientData={updateClientData}
            onNavigateTab={irParaAntiga} onboardingLink={onboardingLink} gerandoLink={gerandoLink} gerarLink={gerarLinkOnboarding} />
        )}
      </main>

      {veLinkPortal && (
        <PainelPortal client={client} aberto={portalAberto} aoFechar={fecharPortal}
          podeGerir={isAdmin} dados={extraStatus} onMudou={aoMudarPortal} />
      )}
      {pedindoArte && <PedirArteModal client={client} currentUser={currentUser} aoFechar={() => setPedindoArte(false)} />}
      {editando && <EditClientModal client={client} onClose={() => setEditando(false)} />}
    </div>
  );
}
