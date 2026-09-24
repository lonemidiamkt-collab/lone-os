"use client";

// components/design/CardDoDesigner.tsx — O CARD NO MODO ARTE (set/2026).
//
// Rodrigo: "tô visualizando como se fosse social media". O card completo abre com legenda, hashtags,
// prévia do Instagram, aprovação e comentários na frente, e a arte numa seção no meio. O designer
// precisa do contrário — e era assim o modal da "demanda" antes da Leva 5b: o que mudar no topo, o
// briefing, as referências, o padrão do cliente, e "Enviar arte" em destaque.
//
// Aqui: ajuste pedido fixado no topo → briefing e referências → versão atual → kit da marca ao lado.
// Legenda, data de postagem, etapa do social e a conversa ficam recolhidos em "Contexto do post".
// Nenhuma regra nova: as ações passam por useProducao/EntregarArteModal, que chamam a mesma transição
// do quadro (lib/conteudo/producao-server.ts). "Ver card completo" troca para o modal de sempre.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle, Download, FileText, FolderOpen, Loader, MessageSquare,
  Play, RotateCcw, Sparkles, Undo2, Upload, UserCheck, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import SignedImage from "@/components/shared/SignedImage";
import { MarkdownView } from "@/components/Markdown";
import KitDaMarca from "@/components/conteudo/KitDaMarca";
import CompararVersoes from "@/components/conteudo/CompararVersoes";
import EntregarArteModal from "@/components/conteudo/EntregarArteModal";
import MotivoModal from "@/components/conteudo/MotivoModal";
import ComentariosDoCard from "@/components/conteudo/ComentariosDoCard";
import { ArquivosDoPedido, ComentarioDoDesigner, HistoricoDaArte, PropostaIa, dataHora, useHistoricoArte } from "@/components/conteudo/EtapaDesign";
import { useProducao } from "@/components/conteudo/useProducao";
import LogoDoCliente from "@/components/design/LogoDoCliente";
import SeloPrazo from "@/components/design/SeloPrazo";
import { useContentStore } from "@/stores/useContentStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { chamar } from "@/lib/api/chamar";
import { cn, getPriorityColor, getPriorityLabel, todaySP } from "@/lib/utils";
import { corDoStatus, rotuloCompleto } from "@/lib/conteudo/etapas";
import { designerDeve } from "@/lib/conteudo/producao";
import { montarItem } from "@/lib/conteudo/quadro";
import {
  COLUNAS_FILA, colunaDaFila, faltasNoPedido, formatoDaPeca, motivoDasFaltas, rotuloRodada,
} from "@/lib/conteudo/fila-designer";
import type { CardAttachment, ContentCard } from "@/lib/types";

const EH_IMAGEM = /\.(png|jpe?g|webp|gif)(\?|$)/i;

function Secao({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-lone-eyebrow uppercase text-muted-foreground flex-1">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Miniaturas({ urls, rotulo }: { urls: readonly string[]; rotulo: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {urls.map((u, i) => (
        <div key={`${u}-${i}`} className="group relative rounded-lg overflow-hidden border border-border bg-muted">
          <a href={u} target="_blank" rel="noopener noreferrer" title={`Abrir ${rotulo.toLowerCase()} ${i + 1}`} className="block aspect-[4/5]">
            <SignedImage src={u} alt={`${rotulo} ${i + 1}`} className="w-full h-full object-cover" />
          </a>
          <a href={u} download target="_blank" rel="noopener noreferrer" aria-label={`Baixar ${rotulo.toLowerCase()} ${i + 1}`}
            className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-md bg-overlay text-overlay-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity">
            <Download size={13} />
          </a>
        </div>
      ))}
    </div>
  );
}

export default function CardDoDesigner({ card: cardProp, onClose, onVerCompleto }: {
  card: ContentCard;
  onClose: () => void;
  onVerCompleto: () => void;
}) {
  // Card vivo: depois de pegar/entregar, o store muda e a tela acompanha.
  const cardVivo = useContentStore((s) => s.contentCards.find((c) => c.id === cardProp.id));
  const card = cardVivo ?? cardProp;
  const pedidos = useContentStore((s) => s.designRequests);
  const updateDesignRequest = useContentStore((s) => s.updateDesignRequest);
  const clientes = useClientsStore((s) => s.clients);
  const { acao, papel, eu } = useProducao();
  const hoje = todaySP();

  const donos = useMemo(() => clientes.map((c) => ({ id: c.id, assignedDesigner: c.assignedDesigner })), [clientes]);
  const it = montarItem(card, pedidos, donos);
  const { pedido, estado } = it;
  const coluna = colunaDaFila(it);
  const infoColuna = coluna ? COLUNAS_FILA.find((c) => c.id === coluna)! : null;
  const cliente = clientes.find((c) => c.id === card.clientId);
  const nomeCliente = cliente?.nomeFantasia || cliente?.name || card.clientName;
  const formato = formatoDaPeca(card.format || pedido?.format);
  const historico = useHistoricoArte(card);
  const rodada = rotuloRodada(historico?.alteracoes.length ?? 0);
  const deve = designerDeve(estado);
  const podeAgir = papel === "designer" || papel === "admin" || papel === "manager";
  const faltas = pedido ? faltasNoPedido({
    briefing: card.briefing, briefingDoPedido: pedido.briefing, formato: card.format || pedido.format, prazo: it.prazoArte, guidelines: cliente?.fixedBriefing,
  }) : [];

  const [anexos, setAnexos] = useState<CardAttachment[] | null>(null);
  const [erroAnexos, setErroAnexos] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [entregando, setEntregando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Referências e versão atual. Recarrega depois de uma entrega (a capa e os anexos mudam).
  useEffect(() => {
    let vivo = true;
    setErroAnexos(null);
    chamar<{ attachments?: CardAttachment[] }>(`/api/cards/${card.id}/attachments`).then((r) => {
      if (!vivo) return;
      if (!r.ok) { setErroAnexos(r.erro); return; }
      setAnexos(r.data?.attachments ?? []);
    });
    return () => { vivo = false; };
  }, [card.id, card.designerDeliveredAt, card.imageUrl, tentativa]);

  const lista = anexos ?? [];
  const entregas = lista.filter((a) => a.tipo === "entrega").map((a) => a.url);
  const refsDoCard = lista.filter((a) => a.tipo !== "entrega" && a.id !== "legacy").map((a) => a.url);
  // Card antigo, de antes da multi-arte: a imagem única é a arte (se entregue) ou a referência.
  const legado = anexos && lista.length === 0 && card.imageUrl ? card.imageUrl : null;
  const versaoAtual = entregas.length ? entregas : legado && card.designerDeliveredAt ? [legado] : [];
  const imagensDoPedido = (pedido?.attachments ?? []).filter((u) => EH_IMAGEM.test(u));
  const outrosDoPedido = (pedido?.attachments ?? []).filter((u) => !EH_IMAGEM.test(u));
  const referencias = [...refsDoCard, ...(legado && !card.designerDeliveredAt ? [legado] : []), ...imagensDoPedido];

  const pegar = async () => {
    setOcupado(true);
    try { await acao(card, { tipo: "iniciar" }); } finally { setOcupado(false); }
  };

  const meu = it.designer === eu;
  const assumida = !!(pedido?.assignedDesigner ?? "").trim();
  const assumir = async () => {
    if (!pedido) return;
    const novo = meu && assumida ? "" : eu;
    try {
      await updateDesignRequest(pedido.id, { assignedDesigner: novo });
      toast.success(novo ? `Arte assumida por ${eu}.` : "Arte devolvida à carteira do cliente.");
    } catch {
      toast.error("Não consegui salvar. Tenta de novo?");
    }
  };

  const botao = "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40";
  const alteracaoMaisRecente = historico?.alteracoes[0];

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="max-w-6xl h-[92vh] max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* ── Cabeçalho: de quem, o quê, até quando ── */}
        <header className="px-6 pt-5 pb-4 pr-14 border-b border-border flex items-start gap-4 shrink-0">
          <LogoDoCliente nome={nomeCliente} logo={cliente?.logo} className="h-11 w-11 rounded-lg" texto="text-sm" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5">
              <span className="text-primary font-medium">{nomeCliente}</span>
              <span aria-hidden="true">·</span>
              <span className="text-foreground">{formato.rotulo}</span>
              {formato.medida && <span className="tabular-nums">{formato.medida}</span>}
              {formato.detalhe && <><span aria-hidden="true">·</span><span>{formato.detalhe}</span></>}
              {card.socialMedia && <><span aria-hidden="true">·</span><span>social {card.socialMedia}</span></>}
            </p>
            <DialogTitle className="text-lone-h1 text-foreground tracking-tight mt-1 leading-tight">{card.title}</DialogTitle>
            <DialogDescription className="sr-only">Card no modo arte: briefing, referências, kit da marca e entrega.</DialogDescription>
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {infoColuna && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border bg-muted text-[11px] font-medium text-foreground">
                  <span className={cn("w-1.5 h-1.5 rounded-full", estado === "bloqueado" ? "bg-destructive" : infoColuna.cor)} aria-hidden="true" />
                  {estado === "bloqueado" ? "Devolvido ao social" : infoColuna.rotulo}
                </span>
              )}
              {deve || estado === "bloqueado" ? (
                <SeloPrazo prazo={it.prazoArte} hora={card.dueDate ? card.dueTime : null} hoje={hoje} prefixo="Prazo" />
              ) : null}
              {rodada && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium bg-destructive/10 text-destructive border-destructive/20">
                  <RotateCcw size={11} aria-hidden="true" /> {rodada}
                </span>
              )}
              {(card.priority === "high" || card.priority === "critical") && (
                <span className={cn("px-1.5 py-0.5 rounded-md border text-[11px] font-medium", getPriorityColor(card.priority))}>{getPriorityLabel(card.priority)}</span>
              )}
              {card.requestedByTraffic && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium bg-primary/10 text-primary border-primary/20">
                  <Zap size={11} aria-hidden="true" /> {/agente cs/i.test(card.requestedByTraffic) ? "Agente CS" : "Tráfego"}
                </span>
              )}
              {pedido && (
                <span className="text-[11px] text-muted-foreground">
                  {pedido.requestedBy === eu ? "Tarefa sua" : `Pedido por ${pedido.requestedBy}`}
                  {it.designer && !meu ? ` · arte de ${it.designer}` : ""}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onVerCompleto} title="Legenda, agendamento, aprovação e comentários"
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
            <FileText size={13} aria-hidden="true" /> Ver card completo
          </button>
        </header>

        {/* ── A ação principal, sempre à vista ── */}
        {podeAgir && (
          <div className="px-6 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center gap-2 shrink-0">
            {estado === "na_fila" && (
              <button type="button" disabled={ocupado} onClick={() => void pegar()} className={cn(botao, "bg-card border border-border text-foreground hover:border-primary/40")}>
                {ocupado ? <Loader size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} Pegar esta arte
              </button>
            )}
            {deve && (
              <button type="button" onClick={() => setEntregando(true)} className={cn(botao, "bg-primary text-primary-foreground hover:opacity-90")}>
                <Upload size={14} aria-hidden="true" /> {estado === "alteracao" ? "Entregar ajuste" : "Entregar arte"}
              </button>
            )}
            {coluna === "entregue" && (
              <button type="button" onClick={() => setEntregando(true)} className={cn(botao, "bg-card border border-border text-foreground hover:border-primary/40")}>
                <Upload size={14} aria-hidden="true" /> Trocar arte
              </button>
            )}
            <CompararVersoes cardId={card.id} alteracaoPendente={estado === "alteracao" ? card.alteracaoMotivo : null}
              gatilho={`${card.designerDeliveredAt ?? ""}|${card.alteracaoPendenteEm ?? ""}`} className="h-9" />
            {(estado === "na_fila" || estado === "em_andamento") && (
              <button type="button" onClick={() => setDevolvendo(true)} className={cn(botao, "text-destructive hover:bg-destructive/10")}>
                <Undo2 size={14} aria-hidden="true" /> Devolver ao social
              </button>
            )}
            {estado === "bloqueado" && <span className="text-xs text-muted-foreground">Devolvido ao social — volta pra sua fila quando ele resolver.</span>}
            {estado === "sem_pedido" && <span className="text-xs text-muted-foreground">Ainda sem pedido de arte — o social pede quando o post sair da pauta.</span>}
            {(coluna === "aprovado") && <span className="text-xs text-lone-success inline-flex items-center gap-1"><CheckCircle size={13} aria-hidden="true" /> Aprovado — nada a fazer aqui.</span>}
            <span className="ml-auto flex items-center gap-2">
              {cliente?.driveLink && (
                <a href={cliente.driveLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <FolderOpen size={14} aria-hidden="true" /> Drive do cliente
                </a>
              )}
              {papel === "designer" && pedido && (
                <button type="button" onClick={() => void assumir()}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <UserCheck size={14} aria-hidden="true" /> {meu && assumida ? "Devolver à carteira" : meu ? "É sua" : "Assumir esta arte"}
                </button>
              )}
            </span>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {/* ── O pedido: o que mudar, o que fazer, com o quê ── */}
          <main className="flex-1 min-w-0 lg:overflow-y-auto p-6 space-y-6">
            {estado === "alteracao" && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                  <RotateCcw size={13} aria-hidden="true" /> O que mudar
                  <span className="font-normal text-muted-foreground">
                    {alteracaoMaisRecente?.por ? `· pedido por ${alteracaoMaisRecente.por}` : ""}
                    {card.alteracaoPendenteEm ? ` · ${dataHora(card.alteracaoPendenteEm)}` : ""}
                  </span>
                </p>
                <p className="mt-1.5 text-base text-foreground leading-relaxed whitespace-pre-wrap">{card.alteracaoMotivo || "O motivo não foi registrado — pergunte na conversa do card."}</p>
              </div>
            )}
            {estado === "bloqueado" && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <p className="text-xs font-medium text-destructive flex items-center gap-1.5"><Undo2 size={13} aria-hidden="true" /> Devolvido ao social{card.blockedBy ? ` por ${card.blockedBy}` : ""}</p>
                {card.blockedReason && <p className="mt-1.5 text-sm text-foreground leading-relaxed">{card.blockedReason}</p>}
              </div>
            )}
            {podeAgir && deve && faltas.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg px-3 py-2">
                <AlertTriangle size={13} className="text-lone-warning shrink-0" aria-hidden="true" />
                <p className="text-xs text-lone-warning flex-1 min-w-[200px]">Falta no pedido: {faltas.join(", ")}. Se travar a arte, devolva hoje com o que falta.</p>
                {estado !== "alteracao" && (
                  <button type="button" onClick={() => setDevolvendo(true)} className="text-xs font-medium text-lone-warning underline underline-offset-2">Devolver com isso</button>
                )}
              </div>
            )}

            <Secao titulo="Briefing">
              {card.briefing || pedido?.briefing ? (
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <MarkdownView source={card.briefing || pedido?.briefing} />
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Sem briefing. Peça ao social na conversa ou devolva o card.</p>
              )}
              {card.trafficRequestNote && (
                <p className="text-xs text-muted-foreground"><span className="text-foreground font-medium">Pedido do tráfego:</span> {card.trafficRequestNote}</p>
              )}
              {pedido?.briefing && card.briefing && pedido.briefing.trim() !== card.briefing.trim() && (
                <details className="rounded-lg border border-border bg-card p-3">
                  <summary className="cursor-pointer text-xs font-medium text-foreground">Briefing enviado com o pedido</summary>
                  <div className="mt-2"><MarkdownView source={pedido.briefing} /></div>
                </details>
              )}
            </Secao>

            {pedido?.briefingIa && (
              <details className="rounded-xl border border-primary/20 bg-primary/5 p-4" open={deve}>
                <summary className="cursor-pointer text-xs font-medium text-primary flex items-center gap-1.5"><Sparkles size={12} aria-hidden="true" /> Padrão deste cliente — leia antes de começar</summary>
                <div className="mt-2"><MarkdownView source={pedido.briefingIa} /></div>
              </details>
            )}

            <Secao titulo={`Referências${referencias.length ? ` (${referencias.length})` : ""}`}>
              {erroAnexos ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <span>Não consegui carregar as imagens do card: {erroAnexos}</span>
                  <button type="button" onClick={() => setTentativa((n) => n + 1)} className="underline shrink-0">Tentar de novo</button>
                </div>
              ) : anexos === null ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader size={13} className="animate-spin" aria-hidden="true" /> Carregando…</div>
              ) : referencias.length ? (
                <Miniaturas urls={referencias} rotulo="Referência" />
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma referência anexada. O kit da marca, ao lado, tem as últimas aprovadas.</p>
              )}
              <ArquivosDoPedido urls={outrosDoPedido} />
            </Secao>

            {(versaoAtual.length > 0 || estado === "alteracao") && (
              <Secao titulo={estado === "alteracao" ? "Versão que voltou" : "Versão atual"}
                extra={historico?.entregas[0] ? <span className="text-[11px] text-muted-foreground">V{historico.entregas[0].versao} · {historico.entregas[0].por || "—"} · {dataHora(historico.entregas[0].em)}</span> : null}>
                {versaoAtual.length ? <Miniaturas urls={versaoAtual} rotulo="Arte" /> : (
                  <p className="text-xs text-muted-foreground">A versão anterior não está mais no card — veja em "Comparar".</p>
                )}
              </Secao>
            )}

            {podeAgir && pedido && deve && <PropostaIa pedido={pedido} />}

            {pedido && <ComentarioDoDesigner pedido={pedido} editavel={podeAgir} />}

            <HistoricoDaArte historico={historico} aberto={estado === "alteracao"} />

            {/* ── O que é do social: à mão, mas recolhido ── */}
            <details className="rounded-xl border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">Contexto do post</summary>
              <div className="px-4 pb-4 space-y-3 text-xs">
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <dt className="text-muted-foreground">Etapa no quadro</dt>
                    <dd className="mt-0.5 text-foreground inline-flex items-center gap-1.5"><span className={cn("w-1.5 h-1.5 rounded-full", corDoStatus(card.status))} aria-hidden="true" />{rotuloCompleto(card.status)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Data de postagem</dt>
                    <dd className="mt-0.5 text-foreground tabular-nums">{card.dueDate ? `${card.dueDate.slice(0, 10).split("-").reverse().join("/")}${card.dueTime ? ` · ${card.dueTime.slice(0, 5)}` : ""}` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Social</dt>
                    <dd className="mt-0.5 text-foreground">{card.socialMedia || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cliente</dt>
                    <dd className={cn("mt-0.5", card.clientApprovedAt ? "text-lone-success" : "text-foreground")}>{card.clientApprovedAt ? "Aprovou" : "Ainda não aprovou"}</dd>
                  </div>
                </dl>
                {(card.caption || card.hashtags) && (
                  <div>
                    <p className="text-muted-foreground mb-1">Legenda</p>
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed rounded-lg bg-muted/40 px-3 py-2">{[card.caption, card.hashtags].filter(Boolean).join("\n\n")}</p>
                  </div>
                )}
                {card.observations && (
                  <div>
                    <p className="text-muted-foreground mb-1">Observações</p>
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed">{card.observations}</p>
                  </div>
                )}
              </div>
            </details>

            <details className="rounded-xl border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2">
                <MessageSquare size={14} className="text-muted-foreground" aria-hidden="true" /> Conversa no card
                {(card.comments?.length ?? 0) > 0 && <span className="text-xs text-muted-foreground font-normal">· {card.comments!.length}</span>}
              </summary>
              <ComentariosDoCard card={card} className="px-4 pb-4 max-h-96" />
            </details>
          </main>

          {/* ── Kit da marca ao lado, aberto ── */}
          <aside className="lg:w-[360px] shrink-0 border-t lg:border-t-0 lg:border-l border-border lg:overflow-y-auto p-4 space-y-3 bg-muted/20">
            <KitDaMarca clientId={card.clientId} cardId={card.id} className="border-0 bg-transparent" />
            {cliente?.fixedBriefing && (
              <details className="rounded-lg border border-border bg-card p-3">
                <summary className="cursor-pointer text-xs font-medium text-foreground">Guidelines do cliente</summary>
                <div className="mt-2"><MarkdownView source={cliente.fixedBriefing} /></div>
              </details>
            )}
          </aside>
        </div>

        {entregando && <EntregarArteModal card={card} onClose={() => setEntregando(false)} />}
        {devolvendo && (
          <MotivoModal tipo="devolver" tituloCard={card.title} inicial={motivoDasFaltas(faltas)} onClose={() => setDevolvendo(false)}
            onConfirmar={(m) => acao(card, { tipo: "bloquear", motivo: m })} />
        )}
      </DialogContent>
    </Dialog>
  );
}
