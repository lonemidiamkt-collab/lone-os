"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import NewClientModal from "@/components/NewClientModal";
import { useClientsStore } from "@/stores/useClientsStore";
import CadastroIncompleto from "@/components/CadastroIncompleto";
import ClientesDesativados from "@/components/ClientesDesativados";
import { useRole } from "@/lib/context/RoleContext";
import { MOTIVOS_LISTA, type MotivoSaida } from "@/lib/clients/churn";
import type { Client } from "@/lib/types";
import {
  getAttentionColor,
  getAttentionLabel,
  getStatusLed,
  calcHealthScore,
} from "@/lib/utils";
import { saudeExibida, ROTULO_NIVEL_SAUDE, COR_NIVEL_SAUDE } from "@/lib/scores/health";
import { ROTULO_RESULTADO_ANUNCIO, TITULO_RESULTADO_ANUNCIO } from "@/lib/scores/resultado-anuncio";
import {
  Search, UserPlus, ChevronRight,
  ExternalLink, MoreHorizontal, Facebook,
  Loader2, Clock, Archive, RotateCcw, Trash2, Pause, Play,
} from "lucide-react";
import Link from "next/link";
import { fetchDraftClients, fetchChurnedClients } from "@/lib/supabase/queries";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { rotuloPausa } from "@/lib/clients/pausa";

// Mesma régua da ficha e do termômetro (lib/scores/health.ts) — cor e rótulo do mesmo nível.
function HealthBar({ client }: { client: Client }) {
  const s = saudeExibida(client as Client & { currentHealthScore?: number | null; currentHealthLevel?: string | null }, () => calcHealthScore(client));
  const cor = COR_NIVEL_SAUDE[s.nivel];
  return (
    <div className="flex items-center gap-2" title={`${ROTULO_NIVEL_SAUDE[s.nivel]}${s.doCache ? "" : " (estimativa)"}`}>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${cor.barra}`} style={{ width: `${s.score ?? 0}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${cor.texto}`}>{s.score ?? "—"}</span>
    </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const clients = useClientsStore((s) => s.clients);
  const init = useClientsStore((s) => s.init);
  const subscribeRealtime = useClientsStore((s) => s.subscribeRealtime);
  const patchClientLocal = useClientsStore((s) => s.patchClientLocal);
  const { role, currentUser } = useRole();

  useEffect(() => {
    init();
    const unsub = subscribeRealtime();
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // ── REUNIÃO COMO INDICADOR DA LISTA ───────────────────────────────────
  //
  // Roberto (09/09): "na tabela de clientes quero incluir informações relacionadas às reuniões […]
  // existe filtro de clientes sem reunião." Os dados vêm prontos de /api/reunioes/cobertura, que
  // é o MESMO cálculo do dashboard e da ficha — a lista não recalcula nada por conta própria.
  interface LinhaReuniao {
    clientId: string; status: "realizada" | "agendada" | "sem_reuniao";
    realizadas: number; meta: number; metaAtingida: boolean;
    ultima: string | null; proxima: string | null; diasSemReuniao: number | null;
  }
  const [reunioes, setReunioes] = useState<Map<string, LinhaReuniao>>(new Map());
  const [filtroReuniao, setFiltroReuniao] = useState("all");
  // Ativos / Em encerramento / Desativados. Cliente que saiu não some da tela — muda de aba.
  const [abaLista, setAbaLista] = useState<"ativos" | "encerrando" | "desativados">("ativos");

  useEffect(() => {
    let vivo = true;
    authedFetch("/api/reunioes/cobertura")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j?.clientes) return;
        setReunioes(new Map((j.clientes as LinhaReuniao[]).map((c) => [c.clientId, c])));
      })
      // Sem os dados de reunião a lista continua funcionando: a coluna some, o resto fica.
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  const [responsibleFilter, setResponsibleFilter] = useState("mine");

  const [showNewModal, setShowNewModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // ─── Draft clients (pending invite / awaiting approval) ───
  const isAdmin = role === "admin" || role === "manager";
  const [drafts, setDrafts] = useState<Client[]>([]);
  const [draftsErro, setDraftsErro] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    // Só a contagem: a revisão e a aprovação moram em /clients/pending (bloco duplicado removido).
    fetchDraftClients().then(setDrafts).catch(() => setDraftsErro(true));
  }, [isAdmin]);

  // ─── Lifecycle: arquivar (churn) / reativar (admin/manager) ───
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<Client[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Client | null>(null);
  const [pauseTarget, setPauseTarget] = useState<Client | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseUntil, setPauseUntil] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  // Motivo da saída passou a ser obrigatório: antes era opcional e 5 dos 6 clientes arquivados
  // saíram sem ninguém registrar por quê.
  const [archiveCategory, setArchiveCategory] = useState<MotivoSaida | "">("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  // Exclusão definitiva de cliente arquivado — pede o nome digitado, porque leva junto reuniões,
  // cards, demandas e histórico. Um "tem certeza?" não é proteção suficiente para isso.
  const [excluirAlvo, setExcluirAlvo] = useState<Client | null>(null);
  const [excluirTexto, setExcluirTexto] = useState("");
  const [excluirErro, setExcluirErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const excluirDeVez = async () => {
    if (!excluirAlvo) return;
    setExcluindo(true);
    setExcluirErro(null);
    try {
      const r = await authedFetch(`/api/clients/${excluirAlvo.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setExcluirErro(j?.error ?? `não consegui excluir (${r.status})`); return; }
      setExcluirAlvo(null);
      setArchived((a) => a.filter((c) => c.id !== excluirAlvo.id));
    } catch (e) {
      setExcluirErro((e as Error).message);
    } finally { setExcluindo(false); }
  };

  const loadArchived = () => {
    setArchivedLoading(true);
    fetchChurnedClients().then(setArchived).finally(() => setArchivedLoading(false));
  };
  useEffect(() => {
    if (showArchived && isAdmin) loadArchived();
  }, [showArchived, isAdmin]);

  // PAUSA: o cliente para de receber tudo, mas continua na carteira — ver lib/clients/pausa.ts.
  const confirmPause = async () => {
    if (!pauseTarget || pauseReason.trim().length < 3) return;
    setLifecycleBusy(true); setLifecycleError(null);
    try {
      const res = await authedFetch(`/api/clients/${pauseTarget.id}/lifecycle`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause", reason: pauseReason.trim(), until: pauseUntil || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      // A rota de lifecycle já gravou; aqui é só o estado da tela.
      patchClientLocal(pauseTarget.id, { pausedAt: new Date().toISOString(), pausedReason: pauseReason.trim(), pausedUntil: pauseUntil || null });
      setPauseTarget(null); setPauseReason(""); setPauseUntil("");
    } catch (e) {
      setLifecycleError(e instanceof Error ? e.message : "Erro ao pausar");
    } finally { setLifecycleBusy(false); }
  };

  const handleResume = async (clientId: string) => {
    setLifecycleBusy(true); setLifecycleError(null);
    try {
      const res = await authedFetch(`/api/clients/${clientId}/lifecycle`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      patchClientLocal(clientId, { pausedAt: null, pausedReason: null, pausedUntil: null });
    } catch (e) {
      setLifecycleError(e instanceof Error ? e.message : "Erro ao retomar");
    } finally { setLifecycleBusy(false); }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      const res = await authedFetch(`/api/clients/${archiveTarget.id}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "archive",
          category: archiveCategory,
          reason: archiveReason.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      // O realtime patcha active=false → o cliente sai da lista ativa (filtro abaixo).
      setArchiveTarget(null);
      setArchiveReason("");
      setArchiveCategory("");
      if (showArchived) loadArchived();
    } catch (e) {
      setLifecycleError(e instanceof Error ? e.message : "Erro ao arquivar");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const handleReactivate = async (clientId: string) => {
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      const res = await authedFetch(`/api/clients/${clientId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reactivate" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      setArchived((prev) => prev.filter((c) => c.id !== clientId));
      window.location.reload(); // recarrega p/ trazer o cliente de volta à carteira ativa
    } catch (e) {
      setLifecycleError(e instanceof Error ? e.message : "Erro ao reativar");
      setLifecycleBusy(false);
    }
  };

  // Role-based: which field maps the current user to a client
  const isOperator = role === "traffic" || role === "social" || role === "designer";
  const getAssignedField = (c: Client): string => {
    if (role === "traffic") return c.assignedTraffic;
    if (role === "social") return c.assignedSocial;
    if (role === "designer") return c.assignedDesigner;
    return "";
  };

  // Collect unique responsible names for the dropdown (for operator roles) — sem vazios nem arquivados
  const responsibleNames = isOperator
    ? [...new Set(clients.filter((c) => c.active !== false).map(getAssignedField).filter(Boolean))].sort()
    : [];

  const filtered = clients.filter((c) => {
    if (c.active === false) return false; // arquivados (churn) não aparecem na carteira ativa
    // Busca por nome, nome fantasia, nicho/segmento, contato e cidade (não só nome) — o header
    // mostra o nome fantasia, então procurar por ele tem que achar.
    const q = search.toLowerCase();
    const extra = c as { nomeFantasia?: string; nicho?: string; contactName?: string; cidade?: string };
    const haystack = [c.name, extra.nomeFantasia, c.industry, extra.nicho, extra.contactName, extra.cidade]
      .filter(Boolean).join(" ").toLowerCase();
    const matchSearch = !q || haystack.includes(q);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    // Role-based filter: operators see only their clients by default
    const matchResponsible =
      !isOperator || responsibleFilter === "all"
        ? true
        : responsibleFilter === "mine"
          ? getAssignedField(c) === currentUser
          : getAssignedField(c) === responsibleFilter;
    const r = reunioes.get(c.id);
    const matchReuniao = (() => {
      if (filtroReuniao === "all") return true;
      // Cliente que a rota de cobertura não conhece (recém-criado, em onboarding) não passa em
      // filtro de reunião nenhum — dizer que ele "está sem reunião" seria acusá-lo à toa.
      if (!r) return false;
      if (filtroReuniao === "mais_de_30d") return r.diasSemReuniao === null || r.diasSemReuniao > 30;
      if (filtroReuniao === "meta_nao_batida") return !r.metaAtingida;
      return r.status === filtroReuniao;
    })();
    return matchSearch && matchStatus && matchResponsible && matchReuniao;
  });

  return (
    <>
      {showNewModal && (
        <NewClientModal
          onClose={() => setShowNewModal(false)}
          onSuccess={(id) => {
            setShowNewModal(false);
            router.push(`/clients/${id}`);
          }}
        />
      )}

      {/* ── EXCLUIR DE VEZ ────────────────────────────────────────────────
          Pede o nome digitado, não um "tem certeza?". A exclusão leva junto reuniões, cards,
          pedidos e histórico — coisas que os indicadores contam. Digitar o nome é o único atrito
          que faz a pessoa parar e ler o que vai perder. */}
      {excluirAlvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
             onClick={() => !excluindo && setExcluirAlvo(null)}>
          <div onClick={(e) => e.stopPropagation()}
               className="w-full max-w-md rounded-xl bg-card border border-destructive/30 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Trash2 size={15} className="text-destructive" /> Excluir cadastro
            </h3>
            <p className="text-[12.5px] text-muted-foreground">
              Isso apaga <span className="text-foreground font-medium">{excluirAlvo.name}</span> do
              banco, junto com <strong>reuniões, cards, pedidos e todo o histórico</strong>. Não dá
              para desfazer.
            </p>
            <p className="text-[12px] text-muted-foreground">
              Se a ideia é só tirar da carteira, <strong>Reativar/Arquivar</strong> resolve e mantém
              o histórico.
            </p>
            <label className="block text-[11px] text-muted-foreground">
              Digite <span className="text-foreground font-medium">{excluirAlvo.name}</span> para confirmar:
              <input
                value={excluirTexto}
                onChange={(e) => setExcluirTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && excluirTexto.trim() === excluirAlvo.name) excluirDeVez(); }}
                autoFocus
                className="mt-1 w-full p-2 rounded-lg bg-surface border border-border text-[12.5px] text-foreground"
              />
            </label>
            {excluirErro && <p className="text-[11.5px] text-destructive">{excluirErro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setExcluirAlvo(null)} disabled={excluindo}
                      className="btn-ghost text-xs">Cancelar</button>
              <button
                onClick={excluirDeVez}
                disabled={excluindo || excluirTexto.trim() !== excluirAlvo.name}
                className="text-xs px-3 py-2 rounded-lg bg-destructive text-destructive-foreground font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={13} /> {excluindo ? "Excluindo…" : "Excluir de vez"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pauseTarget && (
        <div className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !lifecycleBusy && setPauseTarget(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Pause size={14} className="text-lone-warning" /> Pausar {pauseTarget.name}</h3>
            <p className="text-xs text-muted-foreground mt-1.5">
              Enquanto pausado: <b>sem</b> relatório, mensagem no grupo, alerta de verba e painel de resultados.
              O cliente <b>continua</b> na carteira do time, com o motivo à vista. Para encerrar de vez, use Arquivar.
            </p>
            <label htmlFor="pausa-motivo" className="block text-[10px] uppercase tracking-wider text-muted-foreground mt-4 mb-1">Motivo (o time lê isto)</label>
            <input id="pausa-motivo" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} autoFocus
                   placeholder="ex.: férias do cliente · pagamento em atraso · campanha suspensa"
                   className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-primary" />
            <label htmlFor="pausa-ate" className="block text-[10px] uppercase tracking-wider text-muted-foreground mt-3 mb-1">Retomar em (opcional — volta sozinho)</label>
            <input id="pausa-ate" type="date" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)}
                   className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-primary" />
            {lifecycleError && <p className="text-xs text-destructive mt-3">{lifecycleError}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setPauseTarget(null)} disabled={lifecycleBusy} className="btn-ghost text-xs">Cancelar</button>
              <button onClick={confirmPause} disabled={lifecycleBusy || pauseReason.trim().length < 3}
                      className="btn-primary text-xs disabled:opacity-50">{lifecycleBusy ? "Pausando…" : "Pausar cliente"}</button>
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
          onClick={() => !lifecycleBusy && setArchiveTarget(null)}
        >
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Archive size={16} className="text-lone-warning" />
              <h3 className="font-semibold text-foreground">Arquivar cliente</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              <span className="text-foreground font-medium">{archiveTarget.name}</span> sai da carteira ativa e de
              toda a automação (mensagens, relatórios, sync). O histórico é mantido e pode ser reativado.
            </p>
            <label className="text-xs text-muted-foreground">
              Por que o cliente saiu? <span className="text-lone-warning">obrigatório</span>
            </label>
            <select
              value={archiveCategory}
              onChange={(e) => setArchiveCategory(e.target.value as MotivoSaida | "")}
              className="w-full mt-1 mb-3 bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-lone-warning"
            >
              <option value="">Selecione o motivo…</option>
              {MOTIVOS_LISTA.map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </select>

            <label className="text-xs text-muted-foreground">
              O que aconteceu{archiveCategory === "outro" ? "" : " (opcional)"}
            </label>
            <textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              rows={3}
              placeholder="Ex.: achou caro depois do reajuste; resultado caiu nos últimos 2 meses…"
              className="w-full mt-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-lone-warning resize-none"
            />
            {lifecycleError && <p className="text-xs text-destructive mt-2">{lifecycleError}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setArchiveTarget(null)} disabled={lifecycleBusy} className="btn-secondary text-sm disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={confirmArchive}
                disabled={lifecycleBusy || !archiveCategory || (archiveCategory === "outro" && archiveReason.trim().length < 3)}
                title={!archiveCategory ? "Escolha o motivo da saída" : undefined}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-lone-warning text-background hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {lifecycleBusy ? <Loader2 className="animate-spin" size={14} /> : <Archive size={14} />}
                Arquivar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Clientes" subtitle="Base completa de clientes e seus dados" />
        <Suspense fallback={null}>
          <FiltroDaUrl
            aoMudar={(f) => {
              setStatusFilter(f ?? "all");
              if (f) setResponsibleFilter("all");
            }}
          />
        </Suspense>

        <div className="flex flex-1 overflow-hidden">
          {/* Client List */}
          <div className="flex-1 p-6 overflow-auto space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: isOperator ? "Meus Clientes" : "Total de Clientes", value: filtered.length, color: "text-foreground", bg: "bg-muted" },
                { label: `${TITULO_RESULTADO_ANUNCIO}: bom`, value: filtered.filter((c) => c.status === "good").length, color: "text-primary", bg: "bg-primary/10" },
                { label: `${TITULO_RESULTADO_ANUNCIO}: ruim`, value: filtered.filter((c) => c.status === "at_risk").length, color: "text-lone-danger", bg: "bg-lone-danger-bg" },
                { label: "Em Onboarding", value: filtered.filter((c) => c.status === "onboarding").length, color: "text-primary", bg: "bg-primary/10" },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-xl p-4 ${stat.bg} border border-border`}>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* ═══ PENDING APPROVALS (Admin Only) ═══ */}
            {/* ── AS TRÊS ABAS ─────────────────────────────────────────────
                Roberto (§17): "dentro de Clientes criar Ativos / Em encerramento / Desativados."
                Encerrando é aba própria porque é trabalho em aberto, não arquivo. */}
            <div className="flex gap-1 mb-4 border-b border-border">
              {([
                ["ativos", "Ativos"],
                ["encerrando", "Em encerramento"],
                ["desativados", "Desativados"],
              ] as const).map(([k, r]) => (
                <button key={k} onClick={() => setAbaLista(k)}
                  className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
                    abaLista === k
                      ? "border-primary text-primary font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {r}
                </button>
              ))}
            </div>

            {abaLista !== "ativos" && (
              <ClientesDesativados aba={abaLista} />
            )}

            {/* A fila de quem está com a ficha pela metade. Fica antes dos pendentes porque é
                trabalho de hoje, não de aprovação. */}
            {abaLista === "ativos" && isAdmin && (
              <div className="mb-4">
                <CadastroIncompleto />
              </div>
            )}

            {isAdmin && (drafts.length > 0 || draftsErro) && (
              <Link href="/clients/pending"
                className="flex items-center justify-between rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 text-sm text-lone-warning hover:opacity-90">
                <span className="flex items-center gap-2">
                  <Clock size={14} />
                  {draftsErro ? "Não consegui contar os cadastros pendentes — abrir a fila" : `Cadastros pendentes (${drafts.length})`}
                </span>
                <span className="flex items-center gap-1 text-xs">Revisar <ExternalLink size={10} /></span>
              </Link>
            )}

            {/* Filters + Add Button */}
            <div className="flex gap-3">
              <div className="flex-1 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <Search size={14} className="text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-card border border-border text-sm text-secondary-foreground rounded-lg px-3 py-2 outline-none focus:border-primary"
              >
                <option value="all">{TITULO_RESULTADO_ANUNCIO}: todos</option>
                <option value="onboarding">{ROTULO_RESULTADO_ANUNCIO.onboarding}</option>
                <option value="good">Anúncio: {ROTULO_RESULTADO_ANUNCIO.good}</option>
                <option value="average">Anúncio: {ROTULO_RESULTADO_ANUNCIO.average}</option>
                <option value="at_risk">Anúncio: {ROTULO_RESULTADO_ANUNCIO.at_risk}</option>
              </select>
              <select
                value={filtroReuniao}
                onChange={(e) => setFiltroReuniao(e.target.value)}
                className="bg-card border border-border text-sm text-foreground rounded-lg px-3 py-2 outline-none focus:border-primary"
              >
                <option value="all">Reunião: todos</option>
                <option value="sem_reuniao">Sem reunião no mês</option>
                <option value="agendada">Só agendada</option>
                <option value="realizada">Reunião realizada</option>
                <option value="meta_nao_batida">Meta não batida</option>
                <option value="mais_de_30d">Última há +30 dias</option>
              </select>
              {isOperator && (
                <select
                  value={responsibleFilter}
                  onChange={(e) => setResponsibleFilter(e.target.value)}
                  className="bg-card border border-border text-sm text-secondary-foreground rounded-lg px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="mine">Meus clientes</option>
                  <option value="all">Todos os clientes</option>
                  {responsibleNames.filter((n) => n !== currentUser).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm border transition-colors ${
                    showArchived
                      ? "bg-lone-warning-bg text-lone-warning border-lone-warning-border"
                      : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  <Archive size={15} />
                  Arquivados
                </button>
              )}
              <button
                onClick={() => setShowNewModal(true)}
                className="btn-primary flex items-center gap-2 whitespace-nowrap"
              >
                <UserPlus size={15} />
                Novo Cliente
              </button>
            </div>

            {/* Client Cards / Arquivados */}
            {showArchived ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Archive size={12} /> Ex-clientes (churn). Reativar traz o cliente de volta à carteira ativa.
                </p>
                {lifecycleError && <p className="text-xs text-destructive">{lifecycleError}</p>}
                {archivedLoading && (
                  <div className="card text-center py-6 text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={16} /> Carregando…
                  </div>
                )}
                {!archivedLoading && archived.length === 0 && (
                  <div className="card text-center py-10 text-muted-foreground">Nenhum cliente arquivado.</div>
                )}
                {archived.map((c) => (
                  <div key={c.id} className="card flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-foreground tracking-tight truncate">{c.name}</h4>
                        <span className="text-xs text-muted-foreground shrink-0">{c.industry}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Arquivado {c.churnedAt ? new Date(c.churnedAt).toLocaleDateString("pt-BR") : "—"}
                        {c.churnReason ? ` · ${c.churnReason}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleReactivate(c.id)}
                        disabled={lifecycleBusy}
                        className="btn-secondary flex items-center gap-2 whitespace-nowrap text-xs disabled:opacity-50"
                      >
                        <RotateCcw size={13} /> Reativar
                      </button>
                      {/* EXCLUIR DE VEZ. Roberto (10/09): "na aba onde ficam os arquivados não tem
                          como excluir cadastro."
                          Fica só aqui, e não na lista de ativos: apagar um cliente que ainda
                          trabalha com a gente não é uma ação que deva estar a um clique. Aqui é
                          faxina de cadastro duplicado ou de teste — e mesmo assim leva confirmação
                          com o nome digitado, porque apaga junto reuniões, cards e histórico. */}
                      {isAdmin && (
                        <button
                          onClick={() => { setExcluirAlvo(c); setExcluirTexto(""); setExcluirErro(null); }}
                          title="Excluir cadastro de vez"
                          className="btn-ghost text-xs flex items-center gap-1.5 border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : abaLista !== "ativos" ? null : (
            <div className="space-y-3">
              {filtered.length === 0 && (
                <div className="card text-center py-10 text-muted-foreground">
                  Nenhum cliente encontrado.
                </div>
              )}
              {filtered.map((client) => {
                const hasMetaLinked = !!client.metaAdAccountId;
                return (
                  <div
                    key={client.id}
                    className={`card card-interactive cursor-pointer select-none hover:border-primary/40 hover:bg-muted/50 hover:shadow-lg ${
                      client.status === "at_risk" ? "border-lone-danger-border" : ""
                    } ${
                      hasMetaLinked ? "ring-1 ring-primary/30" : ""
                    }`}
                    onClick={() => {
                      if (client.status === "onboarding") {
                        router.push(`/clients/${client.id}?tab=onboarding`);
                      } else {
                        router.push(`/clients/${client.id}`);
                      }
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`${getStatusLed(client.status)}`} />
                      {/* A capa: logo do cliente (doc_logo). 47 de 52 têm desde 14/09; sem logo, a inicial. */}
                      {client.docLogo && !/\.pdf(\?|$)/i.test(client.docLogo) ? (
                        <img src={client.docLogo} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-border bg-card object-contain p-0.5" loading="lazy" />
                      ) : (
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-muted text-sm font-bold text-muted-foreground">{client.name.trim().charAt(0).toUpperCase()}</div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-foreground tracking-tight">{client.name}</h4>
                            <span className="text-xs text-muted-foreground" title="Resultado do anúncio (CPL x meta) — não é risco de churn">Anúncio: {ROTULO_RESULTADO_ANUNCIO[client.status] ?? client.status}</span>
                            {/* PAUSA (23/09): o cliente continua na carteira — o selo existe para
                                ninguém cobrar post de quem está pausado. */}
                            {rotuloPausa(client as never) && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-lone-warning-bg text-lone-warning border-lone-warning-border whitespace-nowrap"
                                    title={client.pausedBy ? `Pausado por ${client.pausedBy}` : undefined}>
                                <Pause size={10} aria-hidden="true" /> {rotuloPausa(client as never)}
                              </span>
                            )}
                            {/* O SEMÁFORO DA REUNIÃO. Verde é reunião que ACONTECEU; amarelo é
                                promessa no calendário; vermelho é ninguém marcou nada. */}
                            {(() => {
                              const r = reunioes.get(client.id);
                              if (!r) return null;
                              const cor = r.status === "realizada"
                                ? "bg-lone-success-bg text-lone-success border-lone-success-border"
                                : r.status === "agendada"
                                  ? "bg-lone-warning-bg text-lone-warning border-lone-warning-border"
                                  : "bg-lone-danger-bg text-lone-danger border-lone-danger-border";
                              const txt = r.status === "realizada"
                                ? `${r.realizadas}${r.meta > 1 ? `/${r.meta}` : ""} reunião${r.realizadas > 1 ? "s" : ""}`
                                : r.status === "agendada" ? "agendada" : "sem reunião";
                              const detalhe = r.status === "agendada" && r.proxima
                                ? `próxima ${new Date(r.proxima).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })}`
                                : r.diasSemReuniao !== null ? `última há ${r.diasSemReuniao}d` : "nunca teve";
                              return (
                                <span title={detalhe}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${cor}`}>
                                  {txt}
                                </span>
                              );
                            })()}
                            {hasMetaLinked && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                <Facebook size={9} />
                                Meta
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{client.industry}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-12 shrink-0">Saúde</span>
                          <div className="flex-1 max-w-40">
                            <HealthBar client={client} />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span>Tráfego: <span className="text-foreground/70">{client.assignedTraffic}</span></span>
                          <span>Social: <span className="text-foreground/70">{client.assignedSocial}</span></span>
                          <span>Designer: <span className="text-foreground/70">{client.assignedDesigner}</span></span>
                        </div>
                      </div>

                      {/* Three-dot menu */}
                      <div className="relative shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(menuOpen === client.id ? null : client.id);
                          }}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {menuOpen === client.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }} />
                            <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-xl z-50 py-1 animate-fade-in">
                              <Link
                                href={`/clients/${client.id}`}
                                onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }}
                                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                              >
                                <ExternalLink size={12} />
                                Abrir Perfil
                              </Link>
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpen(null);
                                    if (client.pausedAt) { void handleResume(client.id); return; }
                                    setPauseTarget(client); setPauseReason(""); setPauseUntil(""); setLifecycleError(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                                >
                                  {client.pausedAt ? <><Play size={12} /> Retomar cliente</> : <><Pause size={12} /> Pausar temporariamente</>}
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setArchiveTarget(client);
                                    setArchiveReason("");
                                    setLifecycleError(null);
                                    setMenuOpen(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs text-lone-warning hover:bg-muted transition-colors flex items-center gap-2"
                                >
                                  <Archive size={12} />
                                  Arquivar (churn)
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {client.notes && (
                      <p className="mt-3 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 border-l-2 border-lone-border-strong">
                        {client.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}

// ?filter=at_risk|onboarding vindo do menu ou de um link. Reage também quando a URL muda com a
// tela já aberta (clicar "Em Risco" estando em Clientes); sem filtro depois de um, volta pra "all".
function FiltroDaUrl({ aoMudar }: { aoMudar: (f: "at_risk" | "onboarding" | null) => void }) {
  const bruto = useSearchParams().get("filter");
  const filtro = bruto === "at_risk" || bruto === "onboarding" ? bruto : null;
  const anterior = useRef<string | null>(null);
  useEffect(() => {
    if (filtro === anterior.current) return;
    const tinha = anterior.current;
    anterior.current = filtro;
    if (filtro || tinha) aoMudar(filtro);
    // aoMudar é recriado a cada render da página; só a mudança de filtro importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);
  return null;
}
