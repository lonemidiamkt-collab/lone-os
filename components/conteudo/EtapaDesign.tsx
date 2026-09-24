"use client";

// components/conteudo/EtapaDesign.tsx — a ARTE dentro do card (Leva 5b, D2). O pedido de design não
// é mais um registro que se abre à parte: tudo o que o designer via no modal da "demanda" (briefing
// da arte, padrão do cliente, prazo, dono, comentário, entregas, alterações, proposta por IA) mora
// aqui, no card — e as ações (pedir arte, pegar, entregar, pedir alteração, devolver) passam pela
// mesma transição que o quadro usa.
//
// As peças de apoio (histórico, comentário do designer, proposta por IA, arquivos do pedido) são
// exportadas: o card do designer (components/design/CardDoDesigner.tsx) monta a mesma arte na ordem
// de quem faz — briefing e referências primeiro.

import { useEffect, useState } from "react";
import {
  Calendar, CheckCircle, Download, ExternalLink, History, Palette, Play, RotateCcw, Sparkles, ThumbsDown,
  ThumbsUp, Undo2, Upload, UserCheck, X,
} from "lucide-react";
import { toast } from "sonner";
import { MarkdownView } from "@/components/Markdown";
import EntregarArteModal from "@/components/conteudo/EntregarArteModal";
import MotivoModal, { type TipoMotivo } from "@/components/conteudo/MotivoModal";
import CompararVersoes from "@/components/conteudo/CompararVersoes";
import { useProducao } from "@/components/conteudo/useProducao";
import { useContentStore } from "@/stores/useContentStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { chamar } from "@/lib/api/chamar";
import { cn, todaySP } from "@/lib/utils";
import { donoDaDemanda } from "@/lib/design/dono";
import { etapaDoStatus } from "@/lib/conteudo/etapas";
import { ROTULO_ESTADO_DESIGN, designerDeve, estadoDoDesign, pedidoAberto } from "@/lib/conteudo/producao";
import { faltasNoPedido, motivoDasFaltas } from "@/lib/conteudo/fila-designer";
import { pedidoDoCard, paraPedidoDesign } from "@/lib/conteudo/quadro";
import { diasEntre } from "@/lib/conteudo/no-ar";
import type { ContentCard, DesignRequest } from "@/lib/types";

export interface HistoricoArte {
  entregas: { versao: number; por: string; em: string; substituida: boolean; motivoRevisao: string | null }[];
  alteracoes: { em: string; por: string | null; motivo: string | null; origem: string }[];
}

const TOM: Record<string, string> = {
  sem_pedido: "bg-muted text-muted-foreground border-border",
  na_fila: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  em_andamento: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  alteracao: "bg-destructive/10 text-destructive border-destructive/20",
  bloqueado: "bg-destructive/10 text-destructive border-destructive/20",
  entregue: "bg-lone-success-bg text-lone-success border-lone-success-border",
};

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function ddmmaaaa(ymd: string): string {
  return ymd.slice(0, 10).split("-").reverse().join("/");
}

// ─── Peças de apoio (também usadas pelo card do designer) ────────────────────

/** Histórico da arte (versões e alterações). Recarrega quando a entrega ou a alteração mudam. */
export function useHistoricoArte(card: Pick<ContentCard, "id" | "designerDeliveredAt" | "alteracaoPendenteEm">): HistoricoArte | null {
  const [historico, setHistorico] = useState<HistoricoArte | null>(null);
  useEffect(() => {
    let vivo = true;
    chamar<HistoricoArte>(`/api/cards/${card.id}/historico-arte`).then((r) => { if (vivo && r.ok && r.data) setHistorico(r.data); });
    return () => { vivo = false; };
  }, [card.id, card.designerDeliveredAt, card.alteracaoPendenteEm]);
  return historico;
}

/** Versões entregues e alterações pedidas, da mais nova para a mais velha. */
export function HistoricoDaArte({ historico, aberto }: { historico: HistoricoArte | null; aberto?: boolean }) {
  if (!historico || (historico.entregas.length === 0 && historico.alteracoes.length === 0)) return null;
  return (
    <details className="rounded-lg border border-border bg-card p-3" open={aberto}>
      <summary className="cursor-pointer text-xs font-medium text-foreground flex items-center gap-1.5">
        <History size={12} aria-hidden="true" /> Histórico da arte · {historico.entregas.length} entrega{historico.entregas.length === 1 ? "" : "s"} · {historico.alteracoes.length} alteraç{historico.alteracoes.length === 1 ? "ão" : "ões"}
      </summary>
      <ol className="mt-2 space-y-1.5">
        {[
          ...historico.entregas.map((e) => ({ em: e.em, tipo: "entrega" as const, texto: `V${e.versao} entregue por ${e.por || "—"}${e.substituida ? " (substituída)" : ""}` })),
          ...historico.alteracoes.map((a) => ({ em: a.em, tipo: "alteracao" as const, texto: `Alteração${a.por ? ` pedida por ${a.por}` : ""}${a.motivo ? `: ${a.motivo}` : ""}` })),
        ].sort((a, b) => b.em.localeCompare(a.em)).map((h, i) => (
          <li key={i} className="flex gap-2 text-[11px] leading-snug">
            <span className="text-muted-foreground tabular-nums shrink-0">{dataHora(h.em)}</span>
            <span className={h.tipo === "alteracao" ? "text-destructive" : "text-foreground"}>{h.texto}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Comentário do designer no pedido — o social vê no card. Quem não é designer/gestão só lê. */
export function ComentarioDoDesigner({ pedido, editavel }: { pedido: DesignRequest; editavel: boolean }) {
  const updateDesignRequest = useContentStore((s) => s.updateDesignRequest);
  const [nota, setNota] = useState(pedido.designerNote ?? "");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setNota(pedido.designerNote ?? ""); }, [pedido.id, pedido.designerNote]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await updateDesignRequest(pedido.id, { designerNote: nota.trim() });
      toast.success(nota.trim() ? "Comentário salvo — o social vê no card." : "Comentário apagado.");
    } catch (err) {
      toast.error(`Não consegui salvar o comentário${err instanceof Error ? ` (${err.message})` : ""}.`);
    } finally { setSalvando(false); }
  };

  if (!editavel && !pedido.designerNote) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-lone-eyebrow uppercase text-muted-foreground">Comentário do designer</p>
      {editavel ? (
        <>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2}
            placeholder="Precisa de algo? Ex.: faltou o preço no briefing — o social vê no card."
            aria-label="Comentário do designer"
            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none" />
          <button type="button" onClick={() => void salvar()} disabled={salvando || nota.trim() === (pedido.designerNote ?? "").trim()}
            className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-40">
            {salvando ? "Salvando…" : "Salvar comentário"}
          </button>
        </>
      ) : (
        <p className="text-sm text-foreground bg-card border border-border rounded-lg px-3 py-2">{pedido.designerNote}</p>
      )}
    </div>
  );
}

/** Proposta por IA com a identidade do cliente — vira referência no pedido, não entrega. */
export function PropostaIa({ pedido }: { pedido: DesignRequest }) {
  const [gerando, setGerando] = useState(false);
  const [geracao, setGeracao] = useState<{ id: string } | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  const gerar = async () => {
    setGerando(true);
    try {
      const r = await chamar<{ urls: string[]; geracaoId: string; entradas?: { logo?: boolean; estilos?: number; textos?: string[] } }>(`/api/design-requests/${pedido.id}/variacoes-ia`, undefined, { method: "POST" });
      if (!r.ok || !r.data) { toast.error(r.erro ?? "Não consegui gerar."); return; }
      useContentStore.setState((s) => ({
        designRequests: s.designRequests.map((d) => d.id === pedido.id ? { ...d, attachments: [...(d.attachments ?? []), ...r.data!.urls] } : d),
      }));
      setGeracao({ id: r.data.geracaoId });
      const e = r.data.entradas;
      toast.success(`${r.data.urls.length} proposta(s) anexada(s) — ${e?.logo ? "com logo" : "sem logo"}, ${e?.estilos ?? 0} artes de estilo, ${e?.textos?.length ?? 0} textos exatos.`);
    } finally { setGerando(false); }
  };

  const feedback = async (tipo: "serviu" | "nao_serviu", m = "") => {
    if (!geracao) return;
    const r = await chamar(`/api/ia/geracoes/${geracao.id}/feedback`, { feedback: tipo, motivo: m });
    if (r.ok) { toast.success(tipo === "serviu" ? "Anotado: serviu." : "Anotado: não serviu — vai calibrar as instruções."); setGeracao(null); setMotivo(null); }
    else toast.error(`Não consegui anotar: ${r.erro}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <button type="button" disabled={gerando} onClick={() => void gerar()}
        className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10 disabled:opacity-50"
        title="Propostas com a logo, as artes recentes, o estilo lido e os textos exatos do cliente. Vira referência, não entrega.">
        <Sparkles size={11} aria-hidden="true" /> {gerando ? "Gerando (≈30 s)…" : pedido.parentAdId ? "Gerar variações (IA)" : "Proposta de arte (IA)"}
      </button>
      {geracao && (
        <span className="inline-flex items-center gap-1">
          Serviu?
          <button onClick={() => void feedback("serviu")} className="rounded border border-border px-1.5 py-0.5 hover:bg-lone-success-bg" aria-label="A proposta ajudou"><ThumbsUp size={10} /></button>
          <button onClick={() => setMotivo("")} className="rounded border border-border px-1.5 py-0.5 hover:bg-destructive/10" aria-label="Não ajudou"><ThumbsDown size={10} /></button>
        </span>
      )}
      {geracao && motivo !== null && (
        <span className="flex items-center gap-1.5 w-full">
          <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void feedback("nao_serviu", motivo); if (e.key === "Escape") setMotivo(null); }}
            placeholder="O que saiu errado? (logo, cores, texto inventado…)" aria-label="O que saiu errado"
            className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 h-7 text-[11px] text-foreground outline-none focus:border-primary/50" />
          <button onClick={() => void feedback("nao_serviu", motivo)} className="rounded-md border border-border px-2 h-7 text-[11px] text-foreground hover:bg-muted">Enviar</button>
        </span>
      )}
    </div>
  );
}

/** Arquivos do pedido: propostas da IA e o que foi anexado antes das artes irem pro card. */
export function ArquivosDoPedido({ urls, aberto }: { urls: readonly string[]; aberto?: boolean }) {
  if (!urls.length) return null;
  return (
    <details className="rounded-lg border border-border bg-card p-3" open={aberto}>
      <summary className="cursor-pointer text-xs font-medium text-foreground">Arquivos do pedido ({urls.length})</summary>
      <ul className="mt-2 space-y-1">
        {urls.map((url, i) => (
          <li key={`${url}-${i}`} className="flex items-center gap-2 text-xs">
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-primary hover:underline inline-flex items-center gap-1">
              <ExternalLink size={11} aria-hidden="true" /> Arquivo {i + 1}
            </a>
            <a href={url} download className="text-muted-foreground hover:text-foreground" aria-label={`Baixar arquivo ${i + 1}`}><Download size={12} /></a>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── A seção "Arte" do card completo ─────────────────────────────────────────

export default function EtapaDesign({ card, briefingIa }: {
  card: ContentCard;
  /** Briefing da arte gerado pela IA no card e ainda não enviado (vai no pedido ao "Pedir arte"). */
  briefingIa?: string | null;
}) {
  const pedidos = useContentStore((s) => s.designRequests);
  const updateDesignRequest = useContentStore((s) => s.updateDesignRequest);
  const clientes = useClientsStore((s) => s.clients);
  const { acao, mover, papel, eu } = useProducao();
  const pedido = pedidoDoCard(card, pedidos);
  const estado = estadoDoDesign(card, paraPedidoDesign(pedido));
  const etapa = etapaDoStatus(card.status);
  const cliente = clientes.find((c) => c.id === card.clientId);
  const dono = donoDaDemanda({ clientId: card.clientId, assignedDesigner: pedido?.assignedDesigner ?? null },
    clientes.map((c) => ({ id: c.id, assignedDesigner: c.assignedDesigner })));
  const prazo = (card.dueDate || pedido?.deadline || "").slice(0, 10) || null;
  const ehDesigner = papel === "designer";
  const gestao = papel === "admin" || papel === "manager";

  const [entregando, setEntregando] = useState(false);
  const [motivo, setMotivo] = useState<TipoMotivo | null>(null);
  const historico = useHistoricoArte(card);
  const [ocupado, setOcupado] = useState(false);

  const executar = async (fn: () => Promise<unknown>) => { setOcupado(true); try { await fn(); } finally { setOcupado(false); } };

  const assumir = async () => {
    if (!pedido) return;
    const meu = dono === eu && !!(pedido.assignedDesigner ?? "").trim();
    const novo = meu ? "" : eu;
    try {
      await updateDesignRequest(pedido.id, { assignedDesigner: novo });
      toast.success(novo ? `Arte assumida por ${eu}.` : "Arte devolvida à carteira do cliente.");
    } catch {
      toast.error("Não consegui salvar. Tenta de novo?");
    }
  };

  const urgente = prazo && designerDeve(estado) ? diasEntre(todaySP(), prazo) : null;
  const botao = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-40";
  // Saúde do briefing — a mesma regra do card do designer (lib/conteudo/fila-designer.ts).
  const faltas = pedido ? faltasNoPedido({
    briefing: card.briefing, briefingDoPedido: pedido.briefing, formato: card.format || pedido.format, prazo, guidelines: cliente?.fixedBriefing,
  }) : [];

  return (
    <section aria-label="Arte do card" className="rounded-xl border border-border bg-muted/20">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
        <Palette size={14} className="text-chart-4" aria-hidden="true" />
        <h3 className="text-sm font-medium text-foreground">Arte</h3>
        <span className={cn("text-[11px] px-2 py-0.5 rounded-full border font-medium", TOM[estado])}>{ROTULO_ESTADO_DESIGN[estado]}</span>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {dono && <span className="inline-flex items-center gap-1"><UserCheck size={11} aria-hidden="true" /> {dono}{pedido?.assignedDesigner ? " (assumiu)" : ""}</span>}
          {prazo && (
            <span className={cn("inline-flex items-center gap-1", urgente !== null && urgente <= 0 && "text-destructive font-medium")}>
              <Calendar size={11} aria-hidden="true" /> Prazo da arte {ddmmaaaa(prazo)}{urgente !== null && urgente < 0 ? " · vencido" : urgente === 0 ? " · hoje" : ""}
            </span>
          )}
        </span>
      </header>

      <div className="p-4 space-y-3">
        {/* O que pede ação primeiro: alteração pedida ou card devolvido. */}
        {estado === "alteracao" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive flex items-center gap-1.5"><RotateCcw size={12} aria-hidden="true" /> Alteração pedida{card.alteracaoPendenteEm ? ` em ${dataHora(card.alteracaoPendenteEm)}` : ""}</p>
            {card.alteracaoMotivo && <p className="mt-1 text-sm text-destructive leading-relaxed">{card.alteracaoMotivo}</p>}
          </div>
        )}
        {estado === "bloqueado" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive flex items-center gap-1.5"><Undo2 size={12} aria-hidden="true" /> Devolvido pelo designer{card.blockedBy ? ` (${card.blockedBy})` : ""}</p>
            {card.blockedReason && <p className="mt-1 text-sm text-destructive leading-relaxed">{card.blockedReason}</p>}
          </div>
        )}

        {/* Saúde do briefing — o que falta antes de começar (o designer usava no modal da demanda). */}
        {(ehDesigner || gestao) && pedido && designerDeve(estado) && faltas.length > 0 && (
          <p className="text-[11px] text-lone-warning bg-lone-warning-bg border border-lone-warning-border rounded-lg px-3 py-2">
            Falta no pedido: {faltas.join(", ")}. Se travar o trabalho, devolva ao social com o motivo.
          </p>
        )}

        {/* Padrão do cliente (IA) — o que evita a arte voltar por "não seguiu o padrão". */}
        {pedido?.briefingIa && (
          <details className="rounded-lg border border-primary/20 bg-primary/5 p-3" open={ehDesigner && designerDeve(estado)}>
            <summary className="cursor-pointer text-xs font-medium text-primary flex items-center gap-1.5"><Sparkles size={12} aria-hidden="true" /> Padrão deste cliente — leia antes de começar</summary>
            <div className="mt-2"><MarkdownView source={pedido.briefingIa} /></div>
          </details>
        )}
        {pedido && pedido.briefing && pedido.briefing.trim() !== (card.briefing ?? "").trim() && (
          <details className="rounded-lg border border-border bg-card p-3">
            <summary className="cursor-pointer text-xs font-medium text-foreground">Briefing enviado com o pedido</summary>
            <div className="mt-2"><MarkdownView source={pedido.briefing} /></div>
          </details>
        )}
        {cliente?.fixedBriefing && ehDesigner && (
          <details className="rounded-lg border border-border bg-card p-3">
            <summary className="cursor-pointer text-xs font-medium text-foreground">Guidelines do cliente</summary>
            <div className="mt-2"><MarkdownView source={cliente.fixedBriefing} /></div>
          </details>
        )}

        {pedido && (
          <p className="text-[11px] text-muted-foreground">
            Pedido por <span className="text-foreground">{pedido.requestedBy}</span>
            {pedido.createdAt ? ` em ${dataHora(pedido.createdAt)}` : ""}
          </p>
        )}

        {/* Ações — só as que fazem sentido agora, para este papel. */}
        <div className="flex flex-wrap items-center gap-2">
          {!ehDesigner && estado === "sem_pedido" && etapa !== "no_ar" && (
            <button type="button" disabled={ocupado}
              onClick={() => {
                // Sem data de postagem não vai pro designer: é o prazo que ele e o CS usam.
                if (!card.dueDate && !card.requestedByTraffic) { toast.error("Falta a data de postagem — preencha e salve antes de pedir a arte."); return; }
                void executar(async () => { await acao(card, { tipo: "pedir_arte" }, { briefing: briefingIa }); });
              }}
              className={cn(botao, "bg-chart-4/15 text-chart-4 hover:bg-chart-4/25")}>
              <Palette size={13} aria-hidden="true" /> Pedir arte
            </button>
          )}
          {(ehDesigner || gestao) && estado === "na_fila" && (
            <button type="button" disabled={ocupado} onClick={() => executar(() => acao(card, { tipo: "iniciar" }))}
              className={cn(botao, "bg-muted text-foreground hover:bg-accent")}>
              <Play size={13} aria-hidden="true" /> Pegar esta arte
            </button>
          )}
          {(ehDesigner || gestao) && (designerDeve(estado) || estado === "entregue") && etapa !== "no_ar" && etapa !== "agendado" && (
            <button type="button" onClick={() => setEntregando(true)} className={cn(botao, "bg-primary text-primary-foreground hover:opacity-90")}>
              <Upload size={13} aria-hidden="true" /> {estado === "entregue" ? "Trocar arte" : estado === "alteracao" ? "Entregar de novo" : "Entregar arte"}
            </button>
          )}
          {(ehDesigner || gestao) && (estado === "na_fila" || estado === "em_andamento") && (
            <button type="button" onClick={() => setMotivo("devolver")} className={cn(botao, "text-destructive hover:bg-destructive/10")}>
              <Undo2 size={13} aria-hidden="true" /> Devolver ao social
            </button>
          )}
          {!ehDesigner && estado === "bloqueado" && (
            <button type="button" disabled={ocupado} onClick={() => executar(() => acao(card, { tipo: "desbloquear" }))}
              className={cn(botao, "bg-muted text-foreground hover:bg-accent")}>
              <CheckCircle size={13} aria-hidden="true" /> Resolvido — voltar pra fila
            </button>
          )}
          {!ehDesigner && estado === "entregue" && etapa !== "no_ar" && (
            <button type="button" onClick={() => setMotivo("alteracao")} className={cn(botao, "text-destructive hover:bg-destructive/10")}>
              <RotateCcw size={13} aria-hidden="true" /> Pedir alteração
            </button>
          )}
          {gestao && pedidoAberto(paraPedidoDesign(pedido)) && estado !== "entregue" && (
            <button type="button" disabled={ocupado}
              onClick={() => { if (window.confirm("Cancelar o pedido de arte? O card volta pra Pauta.")) void executar(() => mover(card, "pauta")); }}
              className={cn(botao, "text-muted-foreground hover:text-foreground hover:bg-accent")}>
              <X size={13} aria-hidden="true" /> Cancelar pedido
            </button>
          )}
          {ehDesigner && pedido && (
            <button type="button" onClick={() => void assumir()} className={cn(botao, "text-muted-foreground hover:text-foreground hover:bg-accent ml-auto")}>
              {dono === eu && pedido.assignedDesigner ? "Devolver à carteira" : dono === eu ? "É sua" : "Assumir esta arte"}
            </button>
          )}
        </div>

        {/* Versão anterior × atual com o motivo fixado (N17): na revisão, conferir se o pedido foi
            atendido; na alteração, ver o que mudar. Some quando não há o que comparar. */}
        <CompararVersoes cardId={card.id} alteracaoPendente={estado === "alteracao" ? card.alteracaoMotivo : null}
          gatilho={`${card.designerDeliveredAt ?? ""}|${card.alteracaoPendenteEm ?? ""}`} />

        {(ehDesigner || gestao) && pedido && designerDeve(estado) && <PropostaIa pedido={pedido} />}

        <ArquivosDoPedido urls={pedido?.attachments ?? []} />

        {pedido && <ComentarioDoDesigner pedido={pedido} editavel={ehDesigner || gestao} />}

        <HistoricoDaArte historico={historico} aberto={!!historico && historico.alteracoes.length > 0 && estado === "alteracao"} />
      </div>

      {entregando && <EntregarArteModal card={card} onClose={() => setEntregando(false)} />}
      {motivo && (
        <MotivoModal tipo={motivo} tituloCard={card.title} onClose={() => setMotivo(null)}
          inicial={motivo === "devolver" ? motivoDasFaltas(faltas) : undefined}
          onConfirmar={(m) => acao(card, motivo === "alteracao" ? { tipo: "pedir_alteracao", motivo: m } : { tipo: "bloquear", motivo: m })} />
      )}
    </section>
  );
}
