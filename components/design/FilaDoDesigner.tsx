"use client";

// components/design/FilaDoDesigner.tsx — A FILA DE ARTES, o quadro do lado de quem faz a arte
// (set/2026). Cinco colunas com nome de trabalho de designer — Na fila, Fazendo, Ajustes pedidos,
// Entregue, Aprovado / No ar — tiradas do estado da arte (lib/conteudo/fila-designer.ts). As etapas do
// social (Pauta, Revisão interna, Com o cliente, Agendado) não são coluna: aparecem no cartão como
// contexto, onde ajudam.
//
// Arrastar só faz o que é do designer: soltar em "Fazendo" pega a arte; soltar em "Entregue" abre o
// "Entregar arte". Tudo pela mesma transição do quadro de produção (useProducao → producao-server).

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Download, FolderOpen, Loader, Play, RotateCcw, Undo2, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import SignedImage from "@/components/shared/SignedImage";
import { markdownPlainText } from "@/components/Markdown";
import EntregarArteModal from "@/components/conteudo/EntregarArteModal";
import { useProducao } from "@/components/conteudo/useProducao";
import LogoDoCliente from "@/components/design/LogoDoCliente";
import SeloPrazo from "@/components/design/SeloPrazo";
import { cn, getPriorityColor, getPriorityLabel } from "@/lib/utils";
import { duracaoCurta } from "@/lib/conteudo/capacidade";
import { designerDeve } from "@/lib/conteudo/producao";
import {
  LIMITE_FAZENDO, DIAS_APROVADO, DIAS_ENTREGUE, acimaDoLimite, contextoDoSocial, esperaDesde, faltasNoPedido,
  formatoDaPeca, miniaturaDoItem, montarFila, type ColunaFila,
} from "@/lib/conteudo/fila-designer";
import type { ItemQuadro } from "@/lib/conteudo/quadro";
import type { Client, ContentCard } from "@/lib/types";

export interface FilaDoDesignerProps {
  /** Os cards já filtrados pela página (de quem, cliente, busca). */
  itens: ItemQuadro[];
  hoje: string;
  /** Quantos designers a fila está mostrando (o limite de "Fazendo" é por pessoa). */
  designersNaVista: number;
  /** "Todos os designers": o cartão diz de quem é a arte. */
  mostrarDesigner: boolean;
  clientes: Client[];
  onAbrir: (card: ContentCard) => void;
}

export default function FilaDoDesigner({ itens, hoje, designersNaVista, mostrarDesigner, clientes, onAbrir }: FilaDoDesignerProps) {
  const { acao, papel, eu } = useProducao();
  const colunas = useMemo(() => montarFila(itens, { hoje }), [itens, hoje]);
  const porCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const [entregar, setEntregar] = useState<ContentCard | null>(null);
  const [pegando, setPegando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<ColunaFila | null>(null);
  const [aprovadoAberto, setAprovadoAberto] = useState(false);
  const podeAgir = papel === "designer" || papel === "admin" || papel === "manager";

  const pegar = async (it: ItemQuadro) => {
    setPegando(it.card.id);
    try { await acao(it.card, { tipo: "iniciar" }); } finally { setPegando(null); }
  };

  const soltar = (destino: ColunaFila, e: React.DragEvent) => {
    e.preventDefault();
    setSobre(null);
    const id = e.dataTransfer.getData("text/card-id");
    const it = itens.find((x) => x.card.id === id);
    if (!it || !podeAgir) return;
    if (destino === "fazendo") {
      if (it.estado === "na_fila") void pegar(it);
      else if (it.estado !== "em_andamento") toast.info("Em \"Fazendo\" entra o que estava na fila.");
      return;
    }
    if (destino === "entregue") {
      if (designerDeve(it.estado)) setEntregar(it.card);
      else toast.info("Essa arte não está com você para entregar.");
    }
  };

  const soltavel = (id: ColunaFila) => podeAgir && (id === "fazendo" || id === "entregue");

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-3" role="list" aria-label="Fila de artes">
        {colunas.map((col) => {
          if (col.id === "aprovado" && !aprovadoAberto) {
            return (
              <button key={col.id} type="button" role="listitem" onClick={() => setAprovadoAberto(true)}
                title={`Mostrar ${col.rotulo.toLowerCase()} (últimos ${DIAS_APROVADO} dias)`}
                className="w-12 shrink-0 rounded-xl border border-border bg-muted/30 hover:border-primary/40 transition-colors flex flex-col items-center gap-2 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronLeft size={14} className="text-muted-foreground" aria-hidden="true" />
                <span className={cn("w-2 h-2 rounded-full", col.cor)} aria-hidden="true" />
                <span className="text-xs tabular-nums text-muted-foreground">{col.itens.length}</span>
                <span className="text-xs font-medium text-foreground [writing-mode:vertical-rl] rotate-180">{col.rotulo}</span>
              </button>
            );
          }
          const fazendoAcima = col.id === "fazendo" && acimaDoLimite(col.itens.length, designersNaVista);
          const paraHoje = col.id === "na_fila" ? col.itens.filter((it) => it.estado !== "bloqueado" && it.prazoArte && it.prazoArte <= hoje).length : 0;
          const devolvidos = col.id === "na_fila" ? col.itens.filter((it) => it.estado === "bloqueado").length : 0;
          return (
            <section key={col.id} role="listitem" aria-label={col.rotulo}
              onDragOver={soltavel(col.id) ? (e) => { e.preventDefault(); setSobre(col.id); } : undefined}
              onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
              onDrop={soltavel(col.id) ? (e) => soltar(col.id, e) : undefined}
              className={cn(
                "flex-1 min-w-[260px] shrink-0 flex flex-col rounded-xl border transition-colors",
                sobre === col.id ? "border-primary/50 bg-primary/5" : col.id === "ajustes" && col.itens.length ? "border-destructive/30 bg-muted/30" : "border-border bg-muted/30",
              )}>
              <header className="px-3 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", col.cor)} aria-hidden="true" />
                  <h3 className="text-sm font-medium text-foreground flex-1 truncate">{col.rotulo}</h3>
                  <span className={cn("text-xs tabular-nums", fazendoAcima ? "text-lone-warning font-medium" : "text-muted-foreground")}>
                    {col.id === "fazendo" && designersNaVista === 1 ? `${col.itens.length} de ${LIMITE_FAZENDO}` : col.itens.length}
                  </span>
                  {col.id === "aprovado" && (
                    <button type="button" onClick={() => setAprovadoAberto(false)} aria-label="Recolher a coluna"
                      className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
                {(paraHoje > 0 || devolvidos > 0) && (
                  <p className="text-[11px] mt-0.5">
                    {paraHoje > 0 && <span className="text-lone-warning font-medium">{paraHoje} para hoje</span>}
                    {paraHoje > 0 && devolvidos > 0 && <span className="text-muted-foreground"> · </span>}
                    {devolvidos > 0 && <span className="text-muted-foreground">{devolvidos} devolvido{devolvidos > 1 ? "s" : ""} ao social</span>}
                  </p>
                )}
                {fazendoAcima && <p className="text-[11px] mt-0.5 text-lone-warning">Muita coisa aberta — termine uma antes de pegar outra.</p>}
                {col.id === "entregue" && col.itens.length > 0 && <p className="text-[11px] mt-0.5 text-muted-foreground">Esperando o social ou o cliente</p>}
                {col.id === "aprovado" && <p className="text-[11px] mt-0.5 text-muted-foreground">Últimos {DIAS_APROVADO} dias</p>}
              </header>
              <div className="p-2 space-y-2 overflow-y-auto" style={{ maxHeight: "70vh" }}>
                {col.itens.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-6 px-2 leading-relaxed">{col.descricao}</p>
                )}
                {col.itens.map((it) => (
                  <CartaoFila key={it.card.id} item={it} coluna={col.id} hoje={hoje} eu={eu} podeAgir={podeAgir}
                    mostrarDesigner={mostrarDesigner} cliente={porCliente.get(it.card.clientId)} pegando={pegando === it.card.id}
                    onAbrir={() => onAbrir(it.card)} onPegar={() => void pegar(it)} onEntregar={() => setEntregar(it.card)} />
                ))}
                {col.ocultos > 0 && (
                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                    +{col.ocultos} {col.id === "entregue" ? `entregue${col.ocultos > 1 ? "s" : ""} há mais de ${DIAS_ENTREGUE} dias` : "mais antigos"} — veja no Histórico
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {entregar && <EntregarArteModal card={entregar} onClose={() => setEntregar(null)} />}
    </>
  );
}

function CartaoFila({ item: it, coluna, hoje, eu, podeAgir, mostrarDesigner, cliente, pegando, onAbrir, onPegar, onEntregar }: {
  item: ItemQuadro;
  coluna: ColunaFila;
  hoje: string;
  eu: string;
  podeAgir: boolean;
  mostrarDesigner: boolean;
  cliente?: Client;
  pegando: boolean;
  onAbrir: () => void;
  onPegar: () => void;
  onEntregar: () => void;
}) {
  const { card, pedido, estado } = it;
  const nomeCliente = cliente?.nomeFantasia || cliente?.name || card.clientName;
  const formato = formatoDaPeca(card.format || pedido?.format);
  const mini = miniaturaDoItem(it, coluna);
  const aFazer = coluna === "na_fila" || coluna === "fazendo" || coluna === "ajustes";
  const devolvido = estado === "bloqueado";
  const briefing = aFazer && coluna !== "ajustes" ? markdownPlainText(card.briefing || pedido?.briefing) : "";
  // O que falta no pedido (sem as guidelines: é cadastro do cliente, não do pedido — o card aberto avisa).
  const faltas = coluna === "na_fila" && !devolvido && pedido
    ? faltasNoPedido({ briefing: card.briefing, briefingDoPedido: pedido.briefing, formato: card.format || pedido.format, prazo: it.prazoArte })
        .filter((f) => f !== "guidelines do cliente")
    : [];
  const contexto = contextoDoSocial(it);
  const desde = esperaDesde(card);
  const esperaMs = desde ? Date.now() - Date.parse(desde) : NaN;
  const compacto = coluna === "entregue" || coluna === "aprovado";

  return (
    <article
      draggable={podeAgir && aFazer && !devolvido}
      onDragStart={(e) => { e.dataTransfer.setData("text/card-id", card.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onAbrir}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onAbrir(); }}
      role="button"
      tabIndex={0}
      aria-label={`${card.title} — ${nomeCliente}`}
      className={cn(
        "bg-card border rounded-lg p-2.5 space-y-2 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        coluna === "ajustes" ? "border-destructive/30 hover:border-destructive/50" : devolvido ? "border-dashed border-border opacity-80 hover:opacity-100" : "border-border hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-2">
        <LogoDoCliente nome={nomeCliente} logo={cliente?.logo} />
        <span className="text-[11px] text-muted-foreground truncate flex-1">{nomeCliente}</span>
        {aFazer && !devolvido && <SeloPrazo prazo={it.prazoArte} hora={card.dueDate ? card.dueTime : null} hoje={hoje} />}
      </div>

      <div className="flex gap-2.5">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className={cn("font-medium text-foreground leading-snug line-clamp-2", compacto ? "text-[12px]" : "text-[13px]")}>{card.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {formato.rotulo}
            {formato.medida && <span className="tabular-nums"> · {formato.medida}</span>}
            {formato.detalhe && ` · ${formato.detalhe}`}
          </p>
          {briefing && <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 pt-0.5">{briefing}</p>}
        </div>
        {mini && (
          <div className={cn("relative shrink-0 rounded-md overflow-hidden border border-border bg-muted aspect-[4/5]", compacto ? "w-10" : "w-14")}>
            <SignedImage src={mini.url} alt={mini.tipo === "referencia" ? "Referência" : "Versão atual"} className="w-full h-full object-cover" />
            {!compacto && (
              <span className="absolute inset-x-0 bottom-0 text-[9px] text-center bg-overlay text-overlay-foreground py-px">
                {mini.tipo === "referencia" ? "Ref." : "Atual"}
              </span>
            )}
          </div>
        )}
      </div>

      {coluna === "ajustes" && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive flex items-center gap-1"><RotateCcw size={10} aria-hidden="true" /> Ajuste pedido</p>
          <p className="text-[11px] text-foreground leading-snug line-clamp-3 mt-0.5">{card.alteracaoMotivo || "Sem motivo registrado — abra o card."}</p>
        </div>
      )}
      {devolvido && (
        <p className="text-[11px] text-destructive leading-snug line-clamp-2 flex gap-1">
          <Undo2 size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>Devolvido ao social{card.blockedReason ? `: ${card.blockedReason}` : ""}</span>
        </p>
      )}
      {faltas.length > 0 && (
        <p className="text-[10px] text-lone-warning">Falta no pedido: {faltas.join(", ")}</p>
      )}
      {coluna === "entregue" && (
        <p className={cn("text-[11px] flex items-center gap-1", Number.isFinite(esperaMs) && esperaMs > 48 * 3_600_000 ? "text-lone-warning" : "text-muted-foreground")}>
          <Clock size={11} aria-hidden="true" />
          {contexto ?? "Entregue"}{Number.isFinite(esperaMs) ? ` há ${duracaoCurta(esperaMs)}` : ""}
        </p>
      )}
      {coluna === "aprovado" && contexto && <p className="text-[11px] text-lone-success">{card.clientApprovedAt && it.etapa === "com_cliente" ? "Cliente aprovou" : contexto}</p>}

      {!compacto && (
        <div className="flex items-center gap-1 flex-wrap pt-1.5 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
          {(card.priority === "high" || card.priority === "critical") && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", getPriorityColor(card.priority))}>{getPriorityLabel(card.priority)}</span>
          )}
          {card.requestedByTraffic && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-medium inline-flex items-center gap-0.5">
              <Zap size={9} aria-hidden="true" /> {/agente cs/i.test(card.requestedByTraffic) ? "Agente CS" : "Tráfego"}
            </span>
          )}
          {pedido?.requestedBy === eu && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">Tarefa sua</span>}
          {mostrarDesigner && it.designer && <span className="text-[10px] text-muted-foreground truncate">{it.designer.split(" ")[0]}</span>}
          <span className="ml-auto flex items-center gap-1">
            {cliente?.driveLink && (
              <a href={cliente.driveLink} target="_blank" rel="noopener noreferrer" aria-label={`Abrir o Drive de ${nomeCliente}`} title="Drive do cliente"
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <FolderOpen size={13} />
              </a>
            )}
            {podeAgir && estado === "na_fila" && (
              <>
                <button type="button" onClick={onEntregar} aria-label="Entregar direto" title="Entregar direto (sem pegar antes)"
                  className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <Upload size={13} />
                </button>
                <button type="button" onClick={onPegar} disabled={pegando}
                  className="h-7 px-2.5 rounded-md bg-muted text-foreground text-[11px] font-medium hover:bg-accent transition-colors inline-flex items-center gap-1 disabled:opacity-50">
                  {pegando ? <Loader size={11} className="animate-spin" aria-hidden="true" /> : <Play size={11} aria-hidden="true" />} Pegar
                </button>
              </>
            )}
            {podeAgir && (estado === "em_andamento" || estado === "alteracao") && (
              <button type="button" onClick={onEntregar}
                className="h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1">
                <Upload size={11} aria-hidden="true" /> {estado === "alteracao" ? "Entregar ajuste" : "Entregar"}
              </button>
            )}
          </span>
        </div>
      )}
      {coluna === "entregue" && mini && (
        <div className="flex justify-end -mt-1" onClick={(e) => e.stopPropagation()}>
          <a href={mini.url} download target="_blank" rel="noopener noreferrer" aria-label="Baixar a arte"
            className="h-6 px-2 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1 transition-colors">
            <Download size={11} aria-hidden="true" /> Baixar
          </a>
        </div>
      )}
    </article>
  );
}
