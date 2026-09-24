"use client";

// components/design/ModoFoco.tsx — MODO FOCO DO DESIGNER (Leva 7B, N19).
//
// Um card por vez, em tela cheia: o que pedir (briefing, padrão do cliente, alteração fixada), o
// kit da marca ao lado e a entrega por COLAR — Ctrl+V a arte (print, Figma, Photoshop) e Enter
// entrega, sem salvar em disco e sem abrir modal. → vai para o próximo, ← volta, Esc sai.
//
// A fila é a mesma do quadro (lib/conteudo/quadro.ts): o que o designer ainda deve (fila, fazendo,
// alteração), o que pede ação primeiro e depois o prazo mais perto. A entrega é a operação única de
// sempre (/api/upload-art com tipo "entrega" → /api/ops/entregar-arte); o card sai da fila sozinho.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ClipboardPaste, ExternalLink, Loader, Play, RotateCcw, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import SignedImage from "@/components/shared/SignedImage";
import { MarkdownView } from "@/components/Markdown";
import KitDaMarca from "@/components/conteudo/KitDaMarca";
import CompararVersoes from "@/components/conteudo/CompararVersoes";
import { CronometroDaEtapa } from "@/components/conteudo/Cronometro";
import { aplicarEntregaNoStore, depoisDaEntrega } from "@/components/conteudo/entrega";
import { useProducao } from "@/components/conteudo/useProducao";
import { useContentStore } from "@/stores/useContentStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { chamar } from "@/lib/api/chamar";
import { trilha } from "@/lib/obs/trilha";
import { cn, todaySP } from "@/lib/utils";
import { imagensDoPaste, imagensDoDrop } from "@/lib/upload/imagens-coladas";
import { entregarArte, novoOperationId } from "@/lib/ops/entregar-arte";
import { designerDeve, ROTULO_ESTADO_DESIGN } from "@/lib/conteudo/producao";
import { compararItens, montarItens, passaNoFiltro } from "@/lib/conteudo/quadro";
import { cronometroDaEtapa } from "@/lib/conteudo/capacidade";
import type { CardAttachment, ContentCard } from "@/lib/types";

const ACEITO = /^image\/(png|jpe?g|webp|gif)$/;
const MAX_MB = 10;

function ddmmaaaa(ymd: string): string {
  return ymd.slice(0, 10).split("-").reverse().join("/");
}

export default function ModoFoco({ pessoa, onClose, onAbrirCard }: {
  /** De quem é a fila ("Todos" = o time). */
  pessoa: string;
  onClose: () => void;
  onAbrirCard?: (card: ContentCard) => void;
}) {
  const cards = useContentStore((s) => s.contentCards);
  const pedidos = useContentStore((s) => s.designRequests);
  const clientes = useClientsStore((s) => s.clients);
  const pushNotification = useNotificationsStore((s) => s.push);
  const { acao } = useProducao();

  const fila = useMemo(() => {
    const dono = clientes.map((c) => ({ id: c.id, assignedDesigner: c.assignedDesigner }));
    return montarItens(cards, pedidos, dono)
      .filter((it) => it.etapa === "com_designer" && designerDeve(it.estado))
      .filter((it) => passaNoFiltro(it, { pessoa, modo: "designer" }))
      .sort(compararItens);
  }, [cards, pedidos, clientes, pessoa]);

  const [indice, setIndice] = useState(0);
  const atual = fila.length ? fila[Math.min(indice, fila.length - 1)] : null;
  const posicao = atual ? fila.indexOf(atual) : -1;

  const [coladas, setColadas] = useState<File[]>([]);
  const [previas, setPrevias] = useState<string[]>([]);
  const [entregando, setEntregando] = useState(false);
  const [substituir, setSubstituir] = useState(true);
  const [anexos, setAnexos] = useState<CardAttachment[] | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const operationRef = useRef<string | null>(null);
  // Artes que já subiram mas cuja entrega falhou: a nova tentativa reaproveita (não sobe de novo).
  const subidasRef = useRef<{ cardId: string; anexos: CardAttachment[] } | null>(null);

  // Troca de card: limpa o que foi colado e carrega os anexos (referências do social, entrega anterior).
  const cardId = atual?.card.id ?? null;
  useEffect(() => {
    setColadas([]);
    operationRef.current = null;
    subidasRef.current = null;
    setAnexos(null);
    if (!cardId) return;
    let vivo = true;
    chamar<{ attachments?: CardAttachment[] }>(`/api/cards/${cardId}/attachments`).then((r) => {
      if (vivo) setAnexos(r.ok ? r.data?.attachments ?? [] : []);
    });
    return () => { vivo = false; };
  }, [cardId]);

  // Miniaturas do que foi colado (URLs locais, liberadas na troca).
  useEffect(() => {
    const urls = coladas.map((f) => URL.createObjectURL(f));
    setPrevias(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [coladas]);

  const receber = useCallback((arquivos: File[]) => {
    const validos = arquivos.filter((f) => ACEITO.test(f.type) && f.size <= MAX_MB * 1024 * 1024);
    if (validos.length < arquivos.length) toast.error(`Só PNG, JPG, WebP ou GIF até ${MAX_MB} MB.`);
    if (validos.length) { subidasRef.current = null; setColadas((c) => [...c, ...validos].slice(0, 10)); }
  }, []);

  const ir = useCallback((passo: number) => {
    if (!fila.length) return;
    setIndice((i) => Math.max(0, Math.min(fila.length - 1, Math.min(i, fila.length - 1) + passo)));
  }, [fila.length]);

  const entregar = useCallback(async () => {
    if (!atual || !coladas.length || entregando) return;
    const card = atual.card;
    setEntregando(true);
    try {
      // 1) Sobe as artes como ENTREGA do card (ou reaproveita as que subiram numa tentativa que falhou).
      let novos = subidasRef.current?.cardId === card.id ? subidasRef.current.anexos : [];
      if (!novos.length) {
        const fd = new FormData();
        fd.append("cardId", card.id);
        fd.append("tipo", "entrega");
        for (const f of coladas) fd.append("file", f);
        const up = await chamar<{ attachments?: CardAttachment[] }>("/api/upload-art", fd);
        novos = up.data?.attachments ?? [];
        if (!up.ok || !novos.length) { toast.error(up.erro ?? "Não consegui subir a arte."); return; }
        subidasRef.current = { cardId: card.id, anexos: novos };
      }

      // 2) A operação única de entrega (versão, pedido fechado, card na Revisão interna).
      if (!operationRef.current) operationRef.current = novoOperationId();
      const r = await entregarArte({ cardId: card.id, designRequestId: card.designRequestId ?? null, attachmentIds: novos.map((a) => a.id), operationId: operationRef.current });
      if (!r.ok || !r.data?.card) { toast.error(r.erro ?? r.data?.error ?? "Não consegui entregar."); return; }
      operationRef.current = null;
      subidasRef.current = null;
      aplicarEntregaNoStore(card, r.data);
      trilha("foco:entregue", { card: card.id, artes: novos.length });

      // 3) A versão anterior sai do card (o arquivo fica guardado para a comparação de versões).
      const anteriores = substituir ? (anexos ?? []).filter((a) => a.tipo === "entrega" && !novos.some((n) => n.id === a.id)) : [];
      for (const a of anteriores) await chamar(`/api/cards/${card.id}/attachments/${a.id}`, undefined, { method: "DELETE" });
      if (anteriores.length) {
        useContentStore.setState((s) => ({
          contentCards: s.contentCards.map((c) => c.id === card.id ? { ...c, imageUrl: novos[0].url, cardAttachments: [...(c.cardAttachments ?? []).filter((x) => !anteriores.some((a) => a.id === x.id)), ...novos] } : c),
        }));
      }

      pushNotification("content", "Arte entregue pelo Designer", `"${card.title}" (${card.clientName}) — arte pronta para conferir.`, card.clientId, card.id);
      depoisDaEntrega(card);
      toast.success(`Entregue: "${card.title}". Próximo da fila.`);
      setColadas([]);
    } finally {
      setEntregando(false);
    }
  }, [atual, coladas, entregando, substituir, anexos, pushNotification]);

  // Teclado e colar: → próximo, ← anterior, Esc sai, Enter entrega o que foi colado.
  useEffect(() => {
    const emCampo = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
    const outraJanela = () => document.querySelector("[role='dialog']") !== null;
    const tecla = (e: KeyboardEvent) => {
      if (e.defaultPrevented || outraJanela() || emCampo(e.target)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); ir(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); ir(-1); }
      else if (e.key === "Escape") { e.preventDefault(); if (!entregando) onClose(); }
      else if (e.key === "Enter" && coladas.length) { e.preventDefault(); void entregar(); }
    };
    const colar = (e: ClipboardEvent) => {
      if (outraJanela() || emCampo(e.target)) return;
      const imgs = imagensDoPaste(e);
      if (!imgs.length) return;
      e.preventDefault();
      receber(imgs);
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("paste", colar);
    return () => { window.removeEventListener("keydown", tecla); window.removeEventListener("paste", colar); };
  }, [ir, onClose, entregar, receber, coladas.length, entregando]);

  // Sem rolagem da página por trás.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, []);

  const card = atual?.card;
  const referencias = (anexos ?? []).filter((a) => a.tipo === "referencia");
  const entregaAnterior = (anexos ?? []).filter((a) => a.tipo === "entrega");
  const cronometro = atual ? cronometroDaEtapa(atual, Date.now()) : null;
  const hoje = todaySP();

  // No <body>, por cima do menu lateral e do cabeçalho (z-[100]); o diálogo de versões usa uma camada acima.
  return createPortal(
    <section aria-label="Modo foco" className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Barra do topo */}
      <header className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">Modo foco</span>
        <span className="text-xs text-muted-foreground tabular-nums">{fila.length ? `${posicao + 1} de ${fila.length}` : "fila vazia"}{pessoa !== "Todos" ? ` · fila de ${pessoa}` : ""}</span>
        <span className="hidden md:inline text-[11px] text-muted-foreground ml-2">
          <kbd className="px-1 rounded border border-border">Ctrl</kbd>+<kbd className="px-1 rounded border border-border">V</kbd> cola a arte · <kbd className="px-1 rounded border border-border">Enter</kbd> entrega · <kbd className="px-1 rounded border border-border">←</kbd><kbd className="px-1 rounded border border-border">→</kbd> navega · <kbd className="px-1 rounded border border-border">Esc</kbd> sai
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => ir(-1)} disabled={posicao <= 0} aria-label="Card anterior"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30"><ArrowLeft size={16} /></button>
          <button type="button" onClick={() => ir(1)} disabled={posicao < 0 || posicao >= fila.length - 1} aria-label="Próximo card"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30"><ArrowRight size={16} /></button>
          <button type="button" onClick={onClose} disabled={entregando} aria-label="Sair do modo foco"
            className="ml-2 h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent"><X size={14} /> Sair</button>
        </div>
      </header>

      {!atual || !card ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
          <p className="text-lone-h1 text-foreground tracking-tight">Nada na fila</p>
          <p className="text-sm text-muted-foreground">Nenhuma arte a fazer{pessoa !== "Todos" ? ` para ${pessoa}` : ""} agora.</p>
          <button type="button" onClick={onClose} className="mt-3 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Voltar ao quadro</button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* O card */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-5">
            <div className="space-y-1">
              <p className="text-xs text-primary font-medium">{card.clientName} · {card.format || "Post"}</p>
              <h2 className="text-lone-hero text-foreground tracking-tight">{card.title}</h2>
              <p className="text-xs text-muted-foreground">
                {ROTULO_ESTADO_DESIGN[atual.estado]}
                {atual.prazoArte ? ` · prazo da arte ${ddmmaaaa(atual.prazoArte)}${atual.prazoArte < hoje ? " (vencido)" : atual.prazoArte === hoje ? " (hoje)" : ""}` : " · sem prazo"}
                {card.socialMedia ? ` · social ${card.socialMedia}` : ""}
              </p>
              {cronometro && <CronometroDaEtapa cronometro={cronometro} className="max-w-sm pt-1" />}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {atual.estado === "na_fila" && (
                <button type="button" onClick={() => void acao(card, { tipo: "iniciar" })}
                  className="h-8 px-3 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-accent inline-flex items-center gap-1.5"><Play size={13} aria-hidden="true" /> Pegar esta arte</button>
              )}
              {onAbrirCard && (
                <button type="button" onClick={() => { onClose(); onAbrirCard(card); }} title="Sai do modo foco e abre o card completo"
                  className="h-8 px-3 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:border-primary/40 inline-flex items-center gap-1.5"><ExternalLink size={13} aria-hidden="true" /> Abrir o card</button>
              )}
              <CompararVersoes cardId={card.id} alteracaoPendente={atual.estado === "alteracao" ? card.alteracaoMotivo : null} gatilho={card.designerDeliveredAt ?? card.alteracaoPendenteEm} camada="z-[110]" />
            </div>

            {atual.estado === "alteracao" && card.alteracaoMotivo && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <p className="text-xs font-medium text-destructive flex items-center gap-1.5"><RotateCcw size={12} aria-hidden="true" /> O que mudar</p>
                <p className="mt-1 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{card.alteracaoMotivo}</p>
              </div>
            )}

            {/* Entrega por colar */}
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(imagensDoDrop(e)); }}
              className={cn("rounded-xl border-2 border-dashed p-5 transition-colors",
                arrastando ? "border-primary bg-primary/5" : coladas.length ? "border-primary/40 bg-card" : "border-border bg-muted/30")}>
              {coladas.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 text-center py-4">
                  <ClipboardPaste size={22} className="text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">Cole a arte aqui (Ctrl+V) ou arraste o arquivo</p>
                  <p className="text-xs text-muted-foreground">Carrossel: cole uma por uma, na ordem. PNG, JPG, WebP ou GIF até {MAX_MB} MB.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {previas.map((u, i) => (
                      <div key={u} className="relative w-28 aspect-[4/5] rounded-lg overflow-hidden border border-border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element -- blob local da arte colada */}
                        <img src={u} alt={`Arte ${i + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute top-1 left-1 text-[10px] px-1.5 rounded bg-overlay text-overlay-foreground tabular-nums">{i + 1}</span>
                        <button type="button" onClick={() => { subidasRef.current = null; setColadas((c) => c.filter((_, j) => j !== i)); }} aria-label={`Tirar a arte ${i + 1}`}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-overlay text-overlay-foreground flex items-center justify-center"><X size={11} /></button>
                      </div>
                    ))}
                  </div>
                  {entregaAnterior.length > 0 && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="w-4 h-4 accent-primary" />
                      Substituir a versão anterior no card ({entregaAnterior.length} arte{entregaAnterior.length > 1 ? "s" : ""}) — ela continua guardada para a comparação
                    </label>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void entregar()} disabled={entregando}
                      className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                      {entregando ? <Loader size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
                      {entregando ? "Entregando…" : `Entregar ${coladas.length} arte${coladas.length > 1 ? "s" : ""}`}
                    </button>
                    <button type="button" onClick={() => { subidasRef.current = null; setColadas([]); }} disabled={entregando} className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent">Limpar</button>
                    <span className="text-[11px] text-muted-foreground">Enter entrega · vai para a Revisão interna</span>
                  </div>
                </div>
              )}
            </div>

            {card.briefing && (
              <div className="space-y-1.5">
                <p className="text-lone-eyebrow uppercase text-muted-foreground">Briefing</p>
                <div className="rounded-xl border border-border bg-card px-4 py-3"><MarkdownView source={card.briefing} /></div>
              </div>
            )}
            {atual.pedido?.briefingIa && (
              <details className="rounded-xl border border-primary/20 bg-primary/5 p-4" open>
                <summary className="cursor-pointer text-xs font-medium text-primary flex items-center gap-1.5"><Sparkles size={12} aria-hidden="true" /> Padrão deste cliente — leia antes de começar</summary>
                <div className="mt-2"><MarkdownView source={atual.pedido.briefingIa} /></div>
              </details>
            )}
            {atual.pedido?.briefing && atual.pedido.briefing.trim() !== (card.briefing ?? "").trim() && (
              <div className="space-y-1.5">
                <p className="text-lone-eyebrow uppercase text-muted-foreground">Briefing enviado com o pedido</p>
                <div className="rounded-xl border border-border bg-card px-4 py-3"><MarkdownView source={atual.pedido.briefing} /></div>
              </div>
            )}
            {referencias.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-lone-eyebrow uppercase text-muted-foreground">Referências do social ({referencias.length})</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {referencias.map((r, i) => (
                    <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-border bg-muted hover:border-primary/40">
                      <SignedImage src={r.url} alt={`Referência ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Kit da marca, ao lado */}
          <aside className="lg:w-[380px] shrink-0 border-t lg:border-t-0 lg:border-l border-border overflow-y-auto p-4">
            <KitDaMarca clientId={card.clientId} cardId={card.id} className="border-0 bg-transparent" />
          </aside>
        </div>
      )}
    </section>,
    document.body,
  );
}
