"use client";

// components/social/LegendasEmLote.tsx — LEGENDAS EM LOTE (Leva 7B, N12). Escolhe o cliente e a
// semana, a IA escreve a legenda de cada card (no tom e com o briefing do cliente, fechando com o
// contato) e tudo fica EDITÁVEL aqui. Só o que a pessoa marcar é salvo nos cards — pelo mesmo
// caminho de sempre (store → /api/content-cards/update). Nada é publicado nem enviado.

import { useMemo, useState } from "react";
import { Captions, Download, Loader, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useContentStore } from "@/stores/useContentStore";
import { chamar } from "@/lib/api/chamar";
import { cn, todaySP } from "@/lib/utils";
import { somarDias } from "@/lib/conteudo/no-ar";
import { ddmm, segundaDaSemana } from "@/lib/conteudo/lacunas";
import { cardsDaSemana, MAX_CARDS_POR_LOTE, type RascunhoLegenda } from "@/lib/conteudo/legendas-lote";
import { baixarArtesZip } from "@/components/conteudo/ParaAgendar";
import type { Client } from "@/lib/types";

interface Linha extends RascunhoLegenda { salvar: boolean }

const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaCurto = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return DIA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };

export default function LegendasEmLote({ clientes, onClose }: { clientes: Client[]; onClose: () => void }) {
  const cards = useContentStore((s) => s.contentCards);
  const updateContentCard = useContentStore((s) => s.updateContentCard);
  const hoje = todaySP();
  const semanas = useMemo(() => {
    const seg = segundaDaSemana(hoje);
    return [0, 1, 2].map((n) => somarDias(seg, 7 * n));
  }, [hoje]);
  const [clientId, setClientId] = useState("");
  const [semana, setSemana] = useState(semanas[1]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [contato, setContato] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState(false);

  const ordenados = useMemo(() => [...clientes].sort((a, b) => (a.nomeFantasia || a.name).localeCompare(b.nomeFantasia || b.name, "pt-BR")), [clientes]);
  const daSemana = useMemo(
    () => clientId ? cardsDaSemana(cards, clientId, semana).filter((c) => !/stor(y|ies)/i.test(c.format ?? "")) : [],
    [cards, clientId, semana],
  );
  const gerando = progresso !== null;
  const marcadas = linhas.filter((l) => l.salvar && l.legenda.trim());

  const gerar = async () => {
    if (!clientId || !daSemana.length || gerando) return;
    if (daSemana.length > MAX_CARDS_POR_LOTE) { toast.error(`A semana tem ${daSemana.length} cards — o lote vai até ${MAX_CARDS_POR_LOTE}.`); return; }
    setLinhas([]);
    setProgresso({ feito: 0, total: daSemana.length });
    // Um card por requisição: cada legenda leva ~10 s, e a pessoa vê a semana chegando.
    for (const [i, c] of daSemana.entries()) {
      const r = await chamar<{ contato: string | null; rascunhos: RascunhoLegenda[] }>("/api/conteudo/legendas", { clientId, semana, cardIds: [c.id] });
      const rasc = r.ok ? r.data?.rascunhos?.[0] : undefined;
      if (r.ok && r.data?.contato !== undefined) setContato(r.data.contato);
      const linha: Linha = rasc
        ? { ...rasc, salvar: !rasc.erro && !rasc.legendaAtual }
        : { cardId: c.id, titulo: c.title, data: c.dueDate ?? null, formato: c.format, legenda: "", hashtags: c.hashtags ?? "", legendaAtual: c.caption?.trim() || null, contatoAcrescentado: false, erro: r.erro ?? "Não consegui escrever esta legenda.", salvar: false };
      setLinhas((ls) => [...ls, linha]);
      setProgresso({ feito: i + 1, total: daSemana.length });
    }
    setProgresso(null);
  };

  const mudar = (cardId: string, campo: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.cardId === cardId ? { ...l, ...campo } : l)));

  const salvar = async () => {
    if (!marcadas.length || salvando) return;
    setSalvando(true);
    const r = await Promise.allSettled(marcadas.map((l) =>
      updateContentCard(l.cardId, { caption: l.legenda.trim(), hashtags: l.hashtags.trim() || undefined })));
    setSalvando(false);
    const falhas = marcadas.filter((_, i) => r[i].status === "rejected");
    if (!falhas.length) {
      toast.success(`${marcadas.length} legenda${marcadas.length > 1 ? "s salvas" : " salva"} nos cards.`);
      setLinhas((ls) => ls.map((l) => (l.salvar ? { ...l, salvar: false, legendaAtual: l.legenda.trim() } : l)));
      return;
    }
    toast.error(`${falhas.length} de ${marcadas.length} não salvaram: ${falhas.map((l) => `"${l.titulo}"`).join(", ")}. Continuam marcadas.`);
  };

  const campo = "w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50";

  return (
    <Dialog open onOpenChange={(a) => { if (!a && !gerando && !salvando) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <div className="p-5 pr-12 border-b border-border space-y-3">
          <div>
            <DialogTitle className="text-lone-h2 text-foreground flex items-center gap-2"><Captions size={15} className="text-primary" aria-hidden="true" /> Legendas da semana</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              A IA escreve no tom do cliente e fecha com o contato. Você revisa e só o que marcar é salvo nos cards.
            </DialogDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[200px] space-y-1">
              <span className="text-lone-eyebrow uppercase text-muted-foreground">Cliente</span>
              <select value={clientId} onChange={(e) => { setClientId(e.target.value); setLinhas([]); }} disabled={gerando} className={cn(campo, "h-9 py-0")}>
                <option value="">Escolha o cliente…</option>
                {ordenados.map((c) => <option key={c.id} value={c.id}>{c.nomeFantasia || c.name}</option>)}
              </select>
            </label>
            <div className="space-y-1">
              <span className="text-lone-eyebrow uppercase text-muted-foreground">Semana</span>
              <div role="radiogroup" aria-label="Semana" className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
                {semanas.map((s, i) => (
                  <button key={s} type="button" role="radio" aria-checked={semana === s} disabled={gerando} onClick={() => { setSemana(s); setLinhas([]); }}
                    className={cn("h-7 px-2.5 rounded-md text-xs font-medium transition-colors", semana === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {i === 0 ? "Esta" : i === 1 ? "Próxima" : `${ddmm(s)}`}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => void gerar()} disabled={!clientId || !daSemana.length || gerando}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center gap-1.5">
              {gerando ? <Loader size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
              {gerando ? `Escrevendo ${Math.min(progresso!.feito + 1, progresso!.total)} de ${progresso!.total}…` : "Escrever legendas"}
            </button>
          </div>
          {clientId && (
            <p className="text-[11px] text-muted-foreground">
              {daSemana.length === 0
                ? `Nenhum card com data entre ${ddmm(semana)} e ${ddmm(somarDias(semana, 6))}.`
                : `${daSemana.length} card${daSemana.length > 1 ? "s" : ""} de ${ddmm(semana)} a ${ddmm(somarDias(semana, 6))}${contato ? ` · contato: ${contato}` : ""}`}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {linhas.length === 0 && !gerando && (
            <p className="text-sm text-muted-foreground text-center py-10">Escolha o cliente e a semana e peça as legendas.</p>
          )}
          {linhas.map((l) => (
            <article key={l.cardId} className={cn("rounded-xl border p-4 space-y-2", l.erro ? "border-destructive/30" : l.salvar ? "border-primary/40" : "border-border")}>
              <header className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={l.salvar} disabled={!!l.erro || !l.legenda.trim()} onChange={(e) => mudar(l.cardId, { salvar: e.target.checked })}
                    className="w-4 h-4 accent-primary" aria-label={`Salvar a legenda de ${l.titulo}`} />
                  <span className="text-sm font-medium text-foreground">{l.titulo || "Sem título"}</span>
                </label>
                <span className="text-[11px] text-muted-foreground">{l.data ? `${diaCurto(l.data)} ${ddmm(l.data)}` : "sem data"} · {l.formato}</span>
                {l.contatoAcrescentado && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground">contato acrescentado</span>}
                {l.legendaAtual && !l.erro && <span className="text-[10px] px-1.5 py-0.5 rounded border border-lone-warning-border bg-lone-warning-bg text-lone-warning">já tem legenda — salvar substitui</span>}
              </header>
              {l.erro ? (
                <p className="text-xs text-destructive">{l.erro}</p>
              ) : (
                <>
                  <textarea value={l.legenda} onChange={(e) => mudar(l.cardId, { legenda: e.target.value })} rows={7} aria-label={`Legenda de ${l.titulo}`} className={cn(campo, "leading-relaxed resize-y")} />
                  <input value={l.hashtags} onChange={(e) => mudar(l.cardId, { hashtags: e.target.value })} aria-label={`Hashtags de ${l.titulo}`} placeholder="#hashtags" className={cn(campo, "h-9 py-0 text-xs")} />
                  <p className="text-[10px] text-muted-foreground tabular-nums">{l.legenda.trim().length} caracteres{l.legenda.trim().length > 125 ? " · o feed corta em 125" : ""}</p>
                </>
              )}
            </article>
          ))}
        </div>

        <div className="p-5 border-t border-border flex flex-wrap items-center gap-2">
          <button type="button" disabled={!daSemana.length || baixando}
            onClick={async () => { setBaixando(true); await baixarArtesZip(daSemana.map((c) => c.id)); setBaixando(false); }}
            title="As artes entregues da semana, uma pasta por card, com a legenda salva em legenda.txt"
            className="h-9 px-3 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:border-primary/40 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5">
            {baixando ? <Loader size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />} Artes da semana (.zip)
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} disabled={gerando || salvando} className="h-9 px-4 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40">Fechar</button>
          <button type="button" onClick={() => void salvar()} disabled={!marcadas.length || salvando || gerando}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
            {salvando ? "Salvando…" : marcadas.length ? `Salvar ${marcadas.length} nos cards` : "Salvar nos cards"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
