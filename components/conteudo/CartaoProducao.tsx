"use client";

// components/conteudo/CartaoProducao.tsx — um card no quadro de produção. O mesmo desenho no Social e
// no Designer: etapa (clicável), título, cliente, onde a arte está e o prazo. As ações rápidas
// mudam com o papel — quem pede arte vê "Pedir arte"; o designer vê "Pegar" e "Entregar arte".

import {
  AlertTriangle, Calendar, Check, ChevronDown, Clock, Download, FileWarning, ImageIcon, Palette, Play,
  RotateCcw, Undo2, Upload, Zap,
} from "lucide-react";
import SignedImage from "@/components/shared/SignedImage";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn, getPriorityColor, getPriorityLabel } from "@/lib/utils";
import { ETAPAS, ROTULO_BLOQUEADO, corDoStatus, estaBloqueado, infoEtapa, type Etapa } from "@/lib/conteudo/etapas";
import { ROTULO_ESTADO_DESIGN, designerDeve, type EstadoDesign } from "@/lib/conteudo/producao";
import { diasEntre } from "@/lib/conteudo/no-ar";
import type { ItemQuadro } from "@/lib/conteudo/quadro";

/** Tom da linha "onde está a arte". */
const TOM_ESTADO: Record<EstadoDesign, string> = {
  sem_pedido: "text-muted-foreground",
  na_fila: "text-chart-4",
  em_andamento: "text-chart-4",
  alteracao: "text-destructive",
  bloqueado: "text-destructive",
  entregue: "text-lone-success",
};

const ICONE_ESTADO: Record<EstadoDesign, typeof Palette> = {
  sem_pedido: Palette, na_fila: Palette, em_andamento: Palette, alteracao: RotateCcw, bloqueado: Undo2, entregue: Check,
};

export interface AcoesDoCartao {
  onAbrir: (it: ItemQuadro) => void;
  onMover: (it: ItemQuadro, destino: Etapa) => void;
  onPedirArte?: (it: ItemQuadro) => void;
  onIniciar?: (it: ItemQuadro) => void;
  onEntregar?: (it: ItemQuadro) => void;
  onDesbloquear?: (it: ItemQuadro) => void;
  onReportar?: (it: ItemQuadro) => void;
}

function ddmm(ymd: string): string {
  const [, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** Prazo relativo a hoje: vencido, hoje, amanhã — o resto é só a data. */
function urgencia(prazo: string | null, hoje: string): { rotulo: string; cls: string } | null {
  if (!prazo) return null;
  const d = diasEntre(hoje, prazo.slice(0, 10));
  if (d < 0) return { rotulo: "Vencido", cls: "bg-destructive/10 text-destructive border-destructive/20" };
  if (d === 0) return { rotulo: "Hoje", cls: "bg-lone-warning-bg text-lone-warning border-lone-warning-border" };
  if (d === 1) return { rotulo: "Amanhã", cls: "bg-muted text-muted-foreground border-border" };
  return null;
}

/** Parado na etapa há mais de um dia (só onde parar é problema). */
function parado(it: ItemQuadro): string | null {
  if (it.etapa === "pauta" || it.etapa === "agendado" || it.etapa === "no_ar") return null;
  const desde = it.card.columnEnteredAt?.[it.card.status] ?? it.card.statusChangedAt;
  if (!desde) return null;
  const h = (Date.now() - new Date(desde).getTime()) / 3_600_000;
  if (h < 24) return null;
  return h >= 48 ? `${Math.floor(h / 24)}d parado` : `${Math.floor(h)}h parado`;
}

export function SeletorDeEtapa({ status, onEscolher, desabilitado }: {
  status: string;
  onEscolher: (e: Etapa) => void;
  desabilitado?: boolean;
}) {
  const info = infoEtapa(ETAPAS.find((e) => e.status.includes(status as never))?.id ?? "pauta");
  const bloqueado = estaBloqueado(status);
  const conteudo = (
    <>
      <span className={cn("w-2 h-2 rounded-full shrink-0", corDoStatus(status))} aria-hidden="true" />
      <span className="truncate">{info.rotulo}{bloqueado ? ` · ${ROTULO_BLOQUEADO}` : ""}</span>
    </>
  );
  if (desabilitado) {
    return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border max-w-full">{conteudo}</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} title="Mudar a etapa"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-muted text-foreground border border-border hover:border-primary/40 transition-colors max-w-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {conteudo}
          <ChevronDown size={11} className="text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" onClick={(e) => e.stopPropagation()}>
        {ETAPAS.map((e) => (
          <DropdownMenuItem key={e.id} onSelect={() => { if (e.id !== info.id) onEscolher(e.id); }} className="gap-2 text-xs cursor-pointer">
            <span className={cn("w-2 h-2 rounded-full shrink-0", e.cor)} aria-hidden="true" />
            <span className="flex-1">{e.rotulo}</span>
            {e.id === info.id && <Check size={12} className="text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function CartaoProducao({ item: it, hoje, papel, compacto, mostrarCliente = true, emRisco, arrastavel, acoes }: {
  item: ItemQuadro;
  hoje: string;
  papel: string;
  /** Nas colunas de cliente/designer: miniatura menor, sem prioridade. */
  compacto?: boolean;
  mostrarCliente?: boolean;
  emRisco?: boolean;
  arrastavel?: boolean;
  acoes: AcoesDoCartao;
}) {
  const { card, estado, etapa } = it;
  const ehDesigner = papel === "designer";
  const gestao = papel === "admin" || papel === "manager";
  const podeEntregar = (ehDesigner || gestao) && etapa === "com_designer" && designerDeve(estado);
  const podeIniciar = (ehDesigner || gestao) && estado === "na_fila";
  const podePedir = !ehDesigner && etapa === "pauta" && estado === "sem_pedido";
  const podeDesbloquear = !ehDesigner && estado === "bloqueado";
  const prazo = etapa === "com_designer" ? it.prazoArte : card.dueDate?.slice(0, 10) ?? null;
  const urg = etapa === "agendado" || etapa === "no_ar" ? null : urgencia(prazo, hoje);
  const vencidoSemArte = !!urg && urg.rotulo === "Vencido" && designerDeve(estado);
  const podeReportar = !!acoes.onReportar && !card.nonDeliveryReason && !!urg && urg.rotulo === "Vencido" && etapa !== "agendado" && etapa !== "no_ar";
  const IconeEstado = ICONE_ESTADO[estado];
  const tempo = parado(it);
  const mostrarEstado = etapa === "com_designer" || estado === "alteracao" || estado === "bloqueado" || (etapa === "pauta" && estado !== "sem_pedido");

  return (
    <div
      draggable={arrastavel}
      onDragStart={arrastavel ? (e) => { e.dataTransfer.setData("text/card-id", card.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
      onClick={() => acoes.onAbrir(it)}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) acoes.onAbrir(it); }}
      role="button"
      tabIndex={0}
      aria-label={`${card.title} — ${card.clientName}`}
      className={cn(
        "group bg-card border rounded-lg overflow-hidden cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        it.arteNova ? "border-chart-4/60" : estado === "alteracao" || estado === "bloqueado" || vencidoSemArte ? "border-destructive/30" : "border-border hover:border-primary/40",
      )}
    >
      {card.imageUrl && (
        <div className={cn("w-full overflow-hidden bg-muted relative", compacto ? "aspect-[4/3]" : "aspect-video")}>
          <SignedImage src={card.imageUrl} alt={card.title} className="w-full h-full object-cover" />
          {it.arteNova && (
            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-chart-4 text-background">
              <Palette size={10} aria-hidden="true" /> Arte nova
            </span>
          )}
          {(card.cardAttachments?.length ?? 0) > 1 && (
            <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-overlay text-overlay-foreground">
              <ImageIcon size={10} aria-hidden="true" /> {card.cardAttachments!.length}
            </span>
          )}
        </div>
      )}

      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
          <SeletorDeEtapa status={card.status} onEscolher={(d) => acoes.onMover(it, d)} />
          {!compacto && (
            <span className={cn("badge border text-[10px] shrink-0", getPriorityColor(card.priority))}>{getPriorityLabel(card.priority)}</span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap empty:hidden">
          {emRisco && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-medium">Cliente em risco</span>}
          {card.requestedByTraffic && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-medium inline-flex items-center gap-0.5">
              <Zap size={9} aria-hidden="true" /> {/agente cs/i.test(card.requestedByTraffic) ? "Agente CS" : "Tráfego"}
            </span>
          )}
          {tempo && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium inline-flex items-center gap-0.5 text-lone-warning bg-lone-warning-bg border-lone-warning-border">
              <Clock size={9} aria-hidden="true" /> {tempo}
            </span>
          )}
        </div>

        <p className={cn("font-medium text-foreground leading-snug line-clamp-2", compacto ? "text-[12px]" : "text-[13px]")}>{card.title}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {mostrarCliente ? card.clientName : null}
          {mostrarCliente && card.format ? " · " : null}
          {card.format}
        </p>

        {mostrarEstado && (
          <p className={cn("text-[11px] font-medium flex items-center gap-1", TOM_ESTADO[estado])}>
            <IconeEstado size={11} className="shrink-0" aria-hidden="true" />
            <span className="truncate">
              {ROTULO_ESTADO_DESIGN[estado]}
              {it.designer && estado !== "entregue" && !ehDesigner ? ` · ${it.designer.split(" ")[0]}` : ""}
              {estado === "entregue" && card.designerDeliveredBy ? ` · ${card.designerDeliveredBy.split(" ")[0]}` : ""}
            </span>
          </p>
        )}
        {estado === "alteracao" && card.alteracaoMotivo && (
          <p className="text-[11px] text-destructive leading-snug line-clamp-2">{card.alteracaoMotivo}</p>
        )}
        {estado === "bloqueado" && card.blockedReason && (
          <p className="text-[11px] text-destructive leading-snug line-clamp-2">{card.blockedReason}</p>
        )}
        {card.clientApprovedAt && etapa !== "no_ar" && (
          <p className="text-[11px] font-medium text-lone-success flex items-center gap-1"><Check size={11} aria-hidden="true" /> Cliente aprovou</p>
        )}

        {prazo && (
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/60">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Calendar size={10} aria-hidden="true" />
              {etapa === "com_designer" && !card.dueDate ? "Prazo " : ""}{ddmm(prazo)}
              {card.dueTime && etapa !== "com_designer" && <span>{card.dueTime.slice(0, 5)}</span>}
            </span>
            {urg && <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium", urg.cls)}>{urg.rotulo}</span>}
          </div>
        )}

        {(podePedir || podeIniciar || podeEntregar || podeDesbloquear || podeReportar || card.nonDeliveryReason || (card.imageUrl && !compacto)) && (
          <div className="flex items-center gap-1 pt-1.5 border-t border-border/60 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {podePedir && acoes.onPedirArte && (
              <button type="button" onClick={() => acoes.onPedirArte!(it)} title="Manda o card pro designer (abre o pedido de arte)"
                className="text-[11px] px-2 py-1 rounded-md bg-chart-4/15 text-chart-4 hover:bg-chart-4/25 transition-colors inline-flex items-center gap-1 font-medium">
                <Palette size={11} aria-hidden="true" /> Pedir arte
              </button>
            )}
            {podeIniciar && acoes.onIniciar && (
              <button type="button" onClick={() => acoes.onIniciar!(it)}
                className="text-[11px] px-2 py-1 rounded-md bg-muted text-foreground hover:bg-accent transition-colors inline-flex items-center gap-1 font-medium">
                <Play size={11} aria-hidden="true" /> Pegar
              </button>
            )}
            {podeEntregar && acoes.onEntregar && (
              <button type="button" onClick={() => acoes.onEntregar!(it)}
                className="text-[11px] px-2 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-flex items-center gap-1 font-medium">
                <Upload size={11} aria-hidden="true" /> {estado === "alteracao" ? "Entregar de novo" : "Entregar arte"}
              </button>
            )}
            {podeDesbloquear && acoes.onDesbloquear && (
              <button type="button" onClick={() => acoes.onDesbloquear!(it)} title="Resolvido — devolve pra fila do designer"
                className="text-[11px] px-2 py-1 rounded-md bg-muted text-foreground hover:bg-accent transition-colors inline-flex items-center gap-1 font-medium">
                <Check size={11} aria-hidden="true" /> Resolvido
              </button>
            )}
            {card.imageUrl && !compacto && (
              <a href={card.imageUrl} download target="_blank" rel="noopener noreferrer" title="Baixar a arte"
                className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors inline-flex items-center gap-1">
                <Download size={11} aria-hidden="true" /> Baixar
              </a>
            )}
            {card.nonDeliveryReason ? (
              <span className="text-[11px] text-destructive inline-flex items-center gap-1" title={card.nonDeliveryReason}>
                <FileWarning size={11} aria-hidden="true" /> Não entregue
              </span>
            ) : podeReportar && (
              <button type="button" onClick={() => acoes.onReportar!(it)} title="Registrar por que não saiu no prazo"
                className="text-[11px] px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors inline-flex items-center gap-1">
                <AlertTriangle size={11} aria-hidden="true" /> Reportar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
