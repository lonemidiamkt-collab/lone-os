"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { ROTULO_FONTE } from "@/lib/priority/motor";
import { cn } from "@/lib/utils";
import DecidirDemanda, { codigosDaAcao } from "./DecidirDemanda";
import GavetaMensagens from "./GavetaMensagens";

// O FEED — Fase 1 do Lone Agent V2. Uma lista só, ranqueada, com evidência e uma decisão de um
// toque. O número que importa está no topo: taxa de decisão em 14 dias (era 37% no WhatsApp).
//
// Leva 7C (N25/N26): o pedido do cliente se DECIDE aqui ("Decidir" abre a sugestão, com ajuste),
// as últimas mensagens do cliente abrem numa gaveta sem sair do feed, e o teclado anda pela lista
// (j/k, e = feito, d = decidir, m = mensagens, o = abrir). O texto de abertura que repetia o
// cabeçalho da página saiu — a página já diz o que é o feed.

interface Item {
  id: string; fonte: keyof typeof ROTULO_FONTE; client_id: string | null; cliente: string; titulo: string; fato: string[]; inferencia: string[] | null;
  recomendacao: string; score: number; explicacao_score: Record<string, number> | null; severidade: number; urgencia: number;
  confianca: number; exposicao_rs: number | null; owner: string | null; owner_role: string; estado: string; created_at: string; updated_at: string;
  acao_proposta: Record<string, unknown> | null;
}
interface Resposta {
  itens: Item[];
  total: number;
  taxa: { dias: number; total: number; decididas: number; taxa: number | null; porEstado: Record<string, number> };
  eu: { nome: string | null; papel: string | null; admin: boolean };
  escopo: "meu" | "todos";
  error?: string;
}

const COR_FONTE: Record<string, string> = {
  trafego: "bg-primary/10 text-primary", saude: "bg-destructive/10 text-destructive", producao: "bg-lone-warning-bg text-lone-warning",
  cs: "bg-muted text-muted-foreground", tarefa: "bg-muted text-muted-foreground",
};
const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const linkDaAcao = (a: Record<string, unknown> | null, clientId: string | null): string | null => {
  if (!a) return null;
  if (a.tipo === "ver_trafego" && a.clientId) return `/traffic?client=${a.clientId}`;
  if (a.tipo === "ver_cliente" && a.clientId) return `/clients/${a.clientId}`;
  if (a.tipo === "abrir_tarefa") return "/tarefas";
  if (a.tipo === "abrir_card" || a.tipo === "abrir_pauta") return "/social";
  // Agregado (vários cards do mesmo cliente): o quadro já filtrado no cliente.
  if (a.tipo === "abrir_board") return clientId ? `/social?client=${clientId}` : "/social";
  if (a.tipo === "falar_com_cliente" && a.clientId) return `/clients/${a.clientId}`;
  return null;
};
/** Quem pode ler a conversa do cliente (mesma regra de GET /api/cs/mensagens). */
const LE_CONVERSA = new Set(["admin", "manager", "social", "traffic"]);

/** Tecla digitada num campo não é atalho. */
function digitando(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export default function FeedPrioridades() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [escopo, setEscopo] = useState<"meu" | "todos">("meu");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [limite, setLimite] = useState(12);
  const [foco, setFoco] = useState(0);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [gaveta, setGaveta] = useState<{ clientId: string; titulo: string } | null>(null);
  const refs = useRef<Record<string, HTMLLIElement | null>>({});
  const fecharGaveta = useCallback(() => setGaveta(null), []);
  // "g + tecla" é navegação global (components/KeyboardShortcuts): a tecla logo depois do g é dela.
  const ultimoG = useRef(0);

  const carregar = useCallback(async (e: "meu" | "todos", lim = 12) => {
    const r = await chamar<Resposta>(`/api/priority/feed?escopo=${e}&limite=${lim}`);
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui carregar o feed."); return; }
    setDados(r.data); setErro(null);
  }, []);
  useEffect(() => { void carregar(escopo, limite); }, [carregar, escopo, limite]);

  const decidir = useCallback(async (id: string, decisao: "aceita" | "ignorada" | "incorreta" | "executada") => {
    setOcupado(id);
    const r = await chamar("/api/priority/decidir", { id, decisao });
    setOcupado(null);
    if (!r.ok) { toast.error(`Não registrei a decisão: ${r.erro}`); return; }
    setDecidindo((d) => (d === id ? null : d));
    setDados((prev) => prev ? { ...prev, itens: prev.itens.filter((i) => i.id !== id) } : prev);
  }, []);

  const recalcular = async () => {
    setRecalculando(true);
    const r = await chamar<{ erro?: string }>("/api/system/priority-recalcular", {});
    if (!r.ok) toast.error(`Não consegui recalcular: ${r.erro}`);
    await carregar(escopo, limite);
    setRecalculando(false);
  };

  const itens = dados?.itens ?? [];
  const taxa = dados?.taxa;
  const podeVerTudo = !!dados?.eu && (dados.eu.admin || dados.eu.papel === "manager");
  const leConversa = !!dados?.eu && (dados.eu.admin || LE_CONVERSA.has(dados.eu.papel ?? ""));

  // O foco não pode apontar para fora da lista depois que um item sai.
  useEffect(() => { setFoco((f) => Math.min(f, Math.max(0, itens.length - 1))); }, [itens.length]);

  // ── Teclado ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || digitando(e) || gaveta) return;
      if (e.key === "g") { ultimoG.current = Date.now(); return; }
      if (Date.now() - ultimoG.current < 1000) return;
      if (!itens.length) return;
      const atual = itens[Math.min(foco, itens.length - 1)];
      const mover = (n: number) => {
        const novo = Math.max(0, Math.min(itens.length - 1, foco + n));
        setFoco(novo);
        refs.current[itens[novo].id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      switch (e.key) {
        case "j": e.preventDefault(); mover(1); break;
        case "k": e.preventDefault(); mover(-1); break;
        case "e":
          e.preventDefault();
          // Pedido do cliente não se "marca feito" sem decidir: o "e" abre a decisão.
          if (atual.acao_proposta?.tipo === "decidir_demanda") setDecidindo(atual.id);
          else if (ocupado !== atual.id) void decidir(atual.id, "executada");
          break;
        case "d":
          if (atual.acao_proposta?.tipo === "decidir_demanda") { e.preventDefault(); setDecidindo((d) => (d === atual.id ? null : atual.id)); }
          break;
        case "m":
          if (leConversa && atual.client_id) { e.preventDefault(); setGaveta({ clientId: atual.client_id, titulo: atual.cliente }); }
          break;
        case "o": {
          const link = linkDaAcao(atual.acao_proposta, atual.client_id);
          if (link) { e.preventDefault(); window.location.href = link; }
          break;
        }
        case "Escape": setDecidindo(null); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itens, foco, ocupado, gaveta, leConversa, decidir]);

  return (
    <section aria-labelledby="feed-titulo">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="feed-titulo" className="text-lone-h2 text-foreground">O que precisa de você{dados?.total ? ` (${dados.total})` : ""}</h2>
          {taxa && taxa.total > 0 && (
            <p className="text-xs text-muted-foreground">
              Taxa de decisão ({taxa.dias}d): <span className="font-medium text-foreground">{taxa.taxa}%</span> ({taxa.decididas} de {taxa.total})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {podeVerTudo && (
            <div className="flex rounded-lg border border-border p-0.5">
              {(["meu", "todos"] as const).map((e) => (
                <button key={e} onClick={() => setEscopo(e)} className={`rounded-md px-2.5 py-1 ${escopo === e ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  {e === "meu" ? "Meu" : "Toda a equipe"}
                </button>
              ))}
            </div>
          )}
          <button onClick={recalcular} disabled={recalculando} className="rounded-lg border border-border px-2.5 py-1 text-muted-foreground transition hover:text-foreground disabled:opacity-50">
            {recalculando ? "Recalculando…" : "Recalcular"}
          </button>
        </div>
      </div>
      {erro && <p className="mb-2 text-xs text-destructive">{erro}</p>}

      {dados && itens.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Nada aberto para {escopo === "meu" ? "você" : "a equipe"} agora. O feed recalcula de hora em hora.
        </p>
      )}

      <ol className="space-y-2">
        {itens.map((i, idx) => {
          const link = linkDaAcao(i.acao_proposta, i.client_id);
          const exp = i.explicacao_score;
          const expandido = aberto === i.id;
          const ehDemanda = i.acao_proposta?.tipo === "decidir_demanda";
          const codigos = ehDemanda ? codigosDaAcao(i.acao_proposta) : [];
          const focado = idx === foco;
          return (
            <li key={i.id} ref={(el) => { refs.current[i.id] = el; }} onClick={() => setFoco(idx)}
              aria-current={focado ? "true" : undefined}
              className={cn("rounded-lg border bg-card p-3 transition-colors", focado ? "border-primary/40 ring-1 ring-primary/20" : "border-border")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">#{idx + 1}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${COR_FONTE[i.fonte] ?? "bg-muted text-muted-foreground"}`}>{ROTULO_FONTE[i.fonte] ?? i.fonte}</span>
                    <span className="font-medium text-foreground">{i.titulo}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground" title="score = confiança × (severidade·0,35 + urgência·0,25 + R$·0,20 + cliente·0,10 + irreversível·0,10)">{i.score.toFixed(0)}</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {i.fato.map((f, k) => <li key={k}>• <span className="text-foreground/80">{f}</span></li>)}
                  </ul>
                  <p className="mt-1.5 text-xs"><span className="font-medium text-primary">→ </span><span className="text-foreground">{i.recomendacao}</span></p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                    <span>{i.owner ? i.owner : `qualquer ${i.owner_role}`}</span>
                    {i.exposicao_rs ? <span>{dinheiro(i.exposicao_rs)}/dia em jogo</span> : null}
                    <button className="hover:text-foreground" onClick={() => setAberto(expandido ? null : i.id)}>{expandido ? "menos" : "por que este score?"}</button>
                  </div>
                  {expandido && exp && (
                    <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground sm:grid-cols-6">
                      {Object.entries(exp).map(([k, v]) => <span key={k} className="rounded bg-muted px-1.5 py-0.5"><span className="capitalize">{k}</span> <span className="font-mono text-foreground">{v}</span></span>)}
                    </div>
                  )}
                  {decidindo === i.id && codigos.length > 0 && (
                    <DecidirDemanda codigos={codigos} aoFechar={() => setDecidindo(null)}
                      aoTerminar={() => void decidir(i.id, "executada")} />
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-col sm:items-stretch">
                  {ehDemanda && codigos.length > 0 && (
                    <button onClick={() => setDecidindo(decidindo === i.id ? null : i.id)} aria-expanded={decidindo === i.id}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90">
                      Decidir{codigos.length > 1 ? ` (${codigos.length})` : ""}
                    </button>
                  )}
                  {link && !ehDemanda && <a href={link} className="rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground transition hover:bg-primary/90">Abrir</a>}
                  {leConversa && i.client_id && (
                    <button onClick={() => setGaveta({ clientId: i.client_id!, titulo: i.cliente })}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition hover:bg-muted">
                      <MessageCircle size={12} aria-hidden="true" /> Mensagens
                    </button>
                  )}
                  {!ehDemanda && (
                    <button onClick={() => decidir(i.id, "executada")} disabled={ocupado === i.id} className="rounded-lg bg-lone-success px-3 py-1.5 text-xs font-medium text-background transition hover:opacity-90 disabled:opacity-50">Feito</button>
                  )}
                  <button onClick={() => decidir(i.id, "ignorada")} disabled={ocupado === i.id} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted disabled:opacity-50">Ignorar</button>
                  <button onClick={() => decidir(i.id, "incorreta")} disabled={ocupado === i.id} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="O dado está errado ou a leitura não faz sentido — isso ensina o motor">Incorreta</button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {dados && dados.total > itens.length && (
        <button onClick={() => setLimite(200)} className="mt-3 w-full rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition hover:text-foreground">
          Mostrar os outros {dados.total - itens.length} (menor prioridade)
        </button>
      )}
      {itens.length > 0 && (
        <p className="mt-3 hidden text-[11px] text-muted-foreground sm:block">
          Atalhos: <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> anda · <kbd className="font-mono">e</kbd> feito · <kbd className="font-mono">d</kbd> decidir · <kbd className="font-mono">m</kbd> mensagens · <kbd className="font-mono">o</kbd> abrir · <kbd className="font-mono">Esc</kbd> fecha
        </p>
      )}

      {gaveta && <GavetaMensagens clientId={gaveta.clientId} titulo={gaveta.titulo} aoFechar={fecharGaveta} />}
    </section>
  );
}
