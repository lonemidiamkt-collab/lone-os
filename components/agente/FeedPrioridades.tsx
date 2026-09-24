"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { ROTULO_FONTE } from "@/lib/priority/motor";

// O FEED — Fase 1 do Lone Agent V2. Uma lista só, ranqueada, com evidência e uma decisão de um
// toque. O número que importa está no topo: taxa de decisão em 14 dias (era 37% no WhatsApp).

interface Item {
  id: string; fonte: keyof typeof ROTULO_FONTE; cliente: string; titulo: string; fato: string[]; inferencia: string[] | null;
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
const linkDaAcao = (a: Record<string, unknown> | null): string | null => {
  if (!a) return null;
  if (a.tipo === "ver_trafego" && a.clientId) return `/traffic?client=${a.clientId}`;
  if (a.tipo === "ver_cliente" && a.clientId) return `/clients/${a.clientId}`;
  if (a.tipo === "abrir_tarefa") return "/tarefas";
  if (a.tipo === "abrir_card" || a.tipo === "abrir_pauta") return "/social";
  if (a.tipo === "falar_com_cliente" && a.clientId) return `/clients/${a.clientId}`;
  return null;
};

export default function FeedPrioridades() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [escopo, setEscopo] = useState<"meu" | "todos">("meu");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [limite, setLimite] = useState(12);

  const carregar = useCallback(async (e: "meu" | "todos", lim = 12) => {
    const r = await chamar<Resposta>(`/api/priority/feed?escopo=${e}&limite=${lim}`);
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui carregar o feed."); return; }
    setDados(r.data); setErro(null);
  }, []);
  useEffect(() => { void carregar(escopo, limite); }, [carregar, escopo, limite]);

  const decidir = async (id: string, decisao: "aceita" | "ignorada" | "incorreta" | "executada") => {
    setOcupado(id);
    const r = await chamar("/api/priority/decidir", { id, decisao });
    setOcupado(null);
    if (!r.ok) { toast.error(`Não registrei a decisão: ${r.erro}`); return; }
    setDados((prev) => prev ? { ...prev, itens: prev.itens.filter((i) => i.id !== id) } : prev);
  };

  // Sugestão do agente esperando ok/não: decide aqui mesmo (igual a responder no grupo) e fecha o item.
  const decidirDemanda = async (item: Item, acao: "confirmar" | "descartar") => {
    const codigo = item.acao_proposta?.codigo;
    if (typeof codigo !== "string") { toast.error("Item sem código da demanda — decida pelo grupo."); return; }
    setOcupado(item.id);
    const r = await chamar<{ jaDecidida?: string }>("/api/cs/decide", { codigo, acao });
    if (!r.ok) { setOcupado(null); toast.error(`Não consegui ${acao === "confirmar" ? "criar o card" : "descartar"}: ${r.erro}`); return; }
    toast.success(r.data?.jaDecidida ? `Já estava decidida (${r.data.jaDecidida}).` : acao === "confirmar" ? "Card criado." : "Sugestão descartada.");
    await decidir(item.id, "executada");
  };

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

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lone-h2 text-foreground">O que precisa de você hoje{dados?.total ? ` (${dados.total})` : ""}</h2>
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
      <p className="mb-3 text-xs text-muted-foreground">
        Uma lista só, de todas as fontes, ordenada por tamanho × urgência × R$ em jogo. Fato e recomendação separados; decida com um toque.
        {taxa && taxa.total > 0 && (
          <> · <span className="font-medium text-foreground">Taxa de decisão ({taxa.dias}d): {taxa.taxa}%</span> ({taxa.decididas} de {taxa.total})</>
        )}
      </p>
      {erro && <p className="mb-2 text-xs text-destructive">{erro}</p>}

      {dados && itens.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Nada aberto para {escopo === "meu" ? "você" : "a equipe"} agora. O feed recalcula de hora em hora.
        </p>
      )}

      <ol className="space-y-2">
        {itens.map((i, idx) => {
          const link = linkDaAcao(i.acao_proposta);
          const exp = i.explicacao_score;
          const expandido = aberto === i.id;
          return (
            <li key={i.id} className="rounded-lg border border-border bg-card p-3">
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
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-col sm:items-stretch">
                  {i.acao_proposta?.tipo === "decidir_demanda" && (
                    <>
                      <button onClick={() => decidirDemanda(i, "confirmar")} disabled={ocupado === i.id} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">Criar card</button>
                      <button onClick={() => decidirDemanda(i, "descartar")} disabled={ocupado === i.id} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted disabled:opacity-50">Descartar pedido</button>
                    </>
                  )}
                  {link && <a href={link} className="rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground transition hover:bg-primary/90">Abrir</a>}
                  <button onClick={() => decidir(i.id, "executada")} disabled={ocupado === i.id} className="rounded-lg bg-lone-success px-3 py-1.5 text-xs font-medium text-background transition hover:opacity-90 disabled:opacity-50">Feito</button>
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
    </section>
  );
}
