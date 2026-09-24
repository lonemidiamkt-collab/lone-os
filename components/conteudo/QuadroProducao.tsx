"use client";

// components/conteudo/QuadroProducao.tsx — O QUADRO DE PRODUÇÃO (Leva 5b, D1).
//
// Antes eram quatro: o "Board de Produção" do Social (oito colunas, com "Roteiro" e "Bloqueado
// (Design)"), os "Kanbans Social Media" do Designer (quatro colunas com outros nomes), o "Quadro de
// Tarefas" do Designer (a fila de pedidos de arte, com mais três) e as listas do Meu Trabalho. A
// mesma arte aparecia com três nomes de etapa. Agora é este, nas duas telas, com as seis etapas de
// lib/conteudo/etapas.ts e três vistas:
//   · Meus         — as seis etapas em colunas (arrasta e solta, ou escolhe a etapa no card);
//   · Por cliente  — cada cliente é uma coluna, o que pede ação no topo;
//   · Por designer — a fila de arte de cada designer.
// Mover um card passa pela regra de lib/conteudo/producao.ts (via useProducao): entrar em "Com o
// designer" pede a arte, voltar pra lá pede alteração, e sair dela exige a entrega.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileWarning, Loader, Plus, Search, Target, X } from "lucide-react";
import { toast } from "sonner";
import DriveButton from "@/components/DriveButton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import CartaoProducao, { type AcoesDoCartao } from "@/components/conteudo/CartaoProducao";
import EntregarArteModal from "@/components/conteudo/EntregarArteModal";
import MotivoModal from "@/components/conteudo/MotivoModal";
import { useProducao, type Pendencia } from "@/components/conteudo/useProducao";
import { useContentStore } from "@/stores/useContentStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { cn, todaySP } from "@/lib/utils";
import { SEM_DONO } from "@/lib/design/dono";
import { ETAPAS, infoEtapa, type Etapa } from "@/lib/conteudo/etapas";
import { somarDias } from "@/lib/conteudo/no-ar";
import {
  VISTAS, colunasPorCliente, colunasPorDesigner, colunasPorEtapa, montarItens, passaNoFiltro, resumir,
  type ItemQuadro, type Vista,
} from "@/lib/conteudo/quadro";
import type { Client, ContentCard } from "@/lib/types";

/** Motivos prontos de "não saiu no prazo" (o designer já usava estes). */
const MOTIVOS_NAO_ENTREGA = [
  "Briefing incompleto",
  "Aguardando assets do cliente",
  "Fila sobrecarregada",
  "Refação pendente (aguardando feedback)",
  "Problema técnico",
];

/** Quantos dias de "No ar" aparecem na coluna (o histórico inteiro afogaria o quadro). */
const DIAS_NO_AR = 14;

export interface QuadroProducaoProps {
  /** De quem é o "Meus" ("Todos" = o time inteiro). Vem do seletor da página. */
  pessoa: string;
  /** Como ler a pessoa: dona do card (social) ou dona da arte (designer). */
  modo: "social" | "designer";
  vista: Vista;
  onVista: (v: Vista) => void;
  onAbrirCard: (card: ContentCard) => void;
  /** "+" na coluna do cliente (vista Por cliente). */
  onNovoCard?: (clientId: string) => void;
  /** Clientes da carteira em foco — as colunas da vista Por cliente. */
  clientes: Client[];
  /** Filtro de cliente vindo da URL (?client=). */
  clienteInicial?: string | null;
}

export default function QuadroProducao({ pessoa, modo, vista, onVista, onAbrirCard, onNovoCard, clientes, clienteInicial }: QuadroProducaoProps) {
  const cards = useContentStore((s) => s.contentCards);
  const pedidos = useContentStore((s) => s.designRequests);
  const carregado = useContentStore((s) => s.initialized);
  const erroDeCarga = useContentStore((s) => s.loadError);
  const updateContentCard = useContentStore((s) => s.updateContentCard);
  const todosClientes = useClientsStore((s) => s.clients);
  const { mover, acao, papel, eu } = useProducao();

  const [busca, setBusca] = useState("");
  const [clienteId, setClienteId] = useState<string>(clienteInicial ?? "");
  // O ?client= chega depois que a lista de clientes carrega: acompanha.
  useEffect(() => { if (clienteInicial) setClienteId(clienteInicial); }, [clienteInicial]);
  const [pendencia, setPendencia] = useState<Pendencia>(null);
  const [reportando, setReportando] = useState<ContentCard | null>(null);
  const [arrastandoSobre, setArrastandoSobre] = useState<Etapa | null>(null);

  const hoje = todaySP();
  const clientesDono = useMemo(() => todosClientes.map((c) => ({ id: c.id, assignedDesigner: c.assignedDesigner })), [todosClientes]);
  const emRisco = useMemo(() => new Set(todosClientes.filter((c) => c.status === "at_risk").map((c) => c.id)), [todosClientes]);
  const todos = useMemo(() => montarItens(cards, pedidos, clientesDono), [cards, pedidos, clientesDono]);

  const filtroBase = { busca, clientId: clienteId || null };
  // "Por designer" mostra todos os designers (é a visão de quem distribui); as outras seguem a pessoa.
  const itens = useMemo(
    () => todos.filter((it) => passaNoFiltro(it, { ...filtroBase, pessoa: vista === "designer" ? "Todos" : pessoa, modo })),
    [todos, busca, clienteId, pessoa, modo, vista], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const resumo = useMemo(() => resumir(itens, hoje), [itens, hoje]);
  const clienteFoco = clienteId ? todosClientes.find((c) => c.id === clienteId) : undefined;
  const opcoesCliente = useMemo(
    () => [...clientes].sort((a, b) => (a.nomeFantasia || a.name).localeCompare(b.nomeFantasia || b.name, "pt-BR")),
    [clientes],
  );

  const aoMover = async (it: ItemQuadro, destino: Etapa) => {
    const p = await mover(it.card, destino);
    if (p) setPendencia(p);
  };

  const acoes: AcoesDoCartao = {
    onAbrir: (it) => onAbrirCard(it.card),
    onMover: (it, d) => { void aoMover(it, d); },
    onPedirArte: (it) => { void aoMover(it, "com_designer"); },
    onIniciar: (it) => { void acao(it.card, { tipo: "iniciar" }); },
    onEntregar: (it) => setPendencia({ tipo: "entregar", card: it.card }),
    onDesbloquear: (it) => { void acao(it.card, { tipo: "desbloquear" }); },
    onReportar: (it) => setReportando(it.card),
  };

  const soltar = (etapa: Etapa, e: React.DragEvent) => {
    e.preventDefault();
    setArrastandoSobre(null);
    const id = e.dataTransfer.getData("text/card-id");
    const it = itens.find((x) => x.card.id === id);
    if (it) void aoMover(it, etapa);
  };

  const cartao = (it: ItemQuadro, extra?: { compacto?: boolean; mostrarCliente?: boolean; arrastavel?: boolean }) => (
    <CartaoProducao key={it.card.id} item={it} hoje={hoje} papel={papel} emRisco={emRisco.has(it.card.clientId)} acoes={acoes} {...extra} />
  );

  if (erroDeCarga && !carregado) {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-destructive/30 bg-destructive/10" role="alert">
        <AlertTriangle size={22} className="mx-auto mb-3 text-destructive" />
        <p className="text-sm font-medium text-destructive">Não consegui carregar os cards — tentando de novo</p>
        <p className="text-xs text-muted-foreground mt-1">O quadro recarrega sozinho assim que a conexão voltar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Barra: vista, cliente, busca ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Vistas do quadro" className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          {VISTAS.map((v) => (
            <button key={v.id} role="tab" aria-selected={vista === v.id} onClick={() => onVista(v.id)}
              className={cn(
                "h-8 px-3 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                vista === v.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}>
              {v.rotulo}
            </button>
          ))}
        </div>

        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} aria-label="Filtrar por cliente"
          className="h-9 max-w-[220px] rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary/40">
          <option value="">Todos os clientes</option>
          {opcoesCliente.map((c) => <option key={c.id} value={c.id}>{c.nomeFantasia || c.name}</option>)}
        </select>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar card…" aria-label="Buscar card"
            className="h-9 w-44 sm:w-56 rounded-lg border border-border bg-card pl-8 pr-7 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/40" />
          {busca && (
            <button onClick={() => setBusca("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>

        {/* O que pede ação agora — a mesma conta para o social e o designer. */}
        <div className="flex flex-wrap items-center gap-1.5 ml-auto text-[11px]">
          <Contador rotulo="Com o designer" n={resumo.comODesigner} />
          <Contador rotulo="Alterações" n={resumo.alteracoes} alerta />
          <Contador rotulo="Devolvidos" n={resumo.bloqueados} alerta />
          <Contador rotulo="Para revisar" n={resumo.paraRevisar} />
          <Contador rotulo="Com o cliente" n={resumo.comOCliente} />
          <Contador rotulo="Arte vencendo" n={resumo.urgentes} alerta />
        </div>
      </div>

      {!carregado && (
        <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
          <Loader size={16} className="animate-spin" aria-hidden="true" /> Carregando o quadro…
        </div>
      )}

      {/* Cliente em foco: o briefing fixo e a pasta, como no quadro de cliente único de antes. */}
      {carregado && clienteFoco && vista === "meus" && (
        <div className="flex flex-wrap items-start gap-3">
          <DriveButton driveLink={clienteFoco.driveLink} clientName={clienteFoco.name} size="md" />
          {clienteFoco.fixedBriefing && (
            <div className="flex-1 min-w-[260px] rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
              <Target size={14} className="text-primary mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-lone-eyebrow uppercase text-primary mb-0.5">Briefing fixo — {clienteFoco.nomeFantasia || clienteFoco.name}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{clienteFoco.fixedBriefing}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Meus: as seis etapas ── */}
      {carregado && vista === "meus" && (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {colunasPorEtapa(itens, { noArDesde: somarDias(hoje, -DIAS_NO_AR) }).map((col) => {
            const info = infoEtapa(col.etapa);
            return (
              <section key={col.id} aria-label={col.titulo}
                onDragOver={(e) => { e.preventDefault(); setArrastandoSobre(col.etapa); }}
                onDragLeave={() => setArrastandoSobre((a) => (a === col.etapa ? null : a))}
                onDrop={(e) => soltar(col.etapa, e)}
                className={cn(
                  "w-72 shrink-0 flex flex-col rounded-xl border transition-colors",
                  arrastandoSobre === col.etapa ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30",
                )}>
                <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", info.cor)} aria-hidden="true" />
                  <h3 className="text-sm font-medium text-foreground flex-1 truncate">{col.titulo}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">{col.itens.length}</span>
                </header>
                <div className="p-2 space-y-2 overflow-y-auto" style={{ maxHeight: "70vh" }}>
                  {col.itens.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-6 px-2 leading-relaxed">{info.descricao}</p>
                  )}
                  {col.itens.map((it) => cartao(it, { arrastavel: true, mostrarCliente: !clienteId }))}
                  {col.etapa === "no_ar" && col.itens.length > 0 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">Últimos {DIAS_NO_AR} dias</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── Por cliente: uma coluna por cliente ── */}
      {carregado && vista === "cliente" && (() => {
        const cols = colunasPorCliente(
          itens.filter((it) => it.etapa !== "no_ar" || (it.card.statusChangedAt ?? "").slice(0, 10) >= somarDias(hoje, -DIAS_NO_AR)),
          (clienteId ? todosClientes.filter((c) => c.id === clienteId) : opcoesCliente).map((c) => ({ id: c.id, nome: c.nomeFantasia || c.name })),
          { comVazios: modo === "social" && pessoa !== "Todos" && !busca },
        );
        if (cols.length === 0) return <Vazio texto="Nenhum card com esse filtro." />;
        return (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {cols.map((col) => {
              const novas = col.itens.filter((it) => it.arteNova).length;
              const pendentes = col.itens.filter((it) => it.estado === "alteracao" || it.estado === "bloqueado").length;
              return (
                <section key={col.id} aria-label={col.titulo}
                  className={cn("w-72 shrink-0 flex flex-col rounded-xl border bg-muted/30", novas > 0 ? "border-chart-4/50" : "border-border")}>
                  <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-foreground truncate">{col.titulo}</h3>
                      <p className="text-[11px] text-muted-foreground">
                        {col.itens.filter((it) => it.etapa !== "no_ar").length} em andamento
                        {novas > 0 && <span className="text-chart-4 font-medium"> · {novas} arte{novas > 1 ? "s" : ""} nova{novas > 1 ? "s" : ""}</span>}
                        {pendentes > 0 && <span className="text-destructive font-medium"> · {pendentes} com problema</span>}
                      </p>
                    </div>
                    {onNovoCard && papel !== "designer" && (
                      <button onClick={() => onNovoCard(col.id)} aria-label={`Novo conteúdo para ${col.titulo}`} title={`Novo conteúdo para ${col.titulo}`}
                        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                        <Plus size={15} />
                      </button>
                    )}
                  </header>
                  <div className="p-2 space-y-2 overflow-y-auto" style={{ maxHeight: "70vh" }}>
                    {col.itens.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-6">Sem produção</p>}
                    {col.itens.map((it) => cartao(it, { compacto: true, mostrarCliente: false }))}
                  </div>
                </section>
              );
            })}
          </div>
        );
      })()}

      {/* ── Por designer: a fila de arte de cada um ── */}
      {carregado && vista === "designer" && (() => {
        const nomes = [...new Set(todosClientes.map((c) => (c.assignedDesigner ?? "").trim()).filter(Boolean))];
        const cols = colunasPorDesigner(itens, nomes);
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Cards em <span className="text-foreground font-medium">{infoEtapa("com_designer").rotulo}</span>, por dono da arte. O que pede ação vem primeiro; depois o prazo mais perto.</p>
            <div className="flex gap-3 overflow-x-auto pb-3">
              {cols.map((col) => {
                const alt = col.itens.filter((it) => it.estado === "alteracao").length;
                const fazendo = col.itens.filter((it) => it.estado === "em_andamento").length;
                const fila = col.itens.filter((it) => it.estado === "na_fila").length;
                const minhaColuna = modo === "designer" && col.id === pessoa;
                return (
                  <section key={col.id} aria-label={col.titulo}
                    className={cn("w-72 shrink-0 flex flex-col rounded-xl border bg-muted/30", minhaColuna ? "border-primary/40" : "border-border")}>
                    <header className="px-3 py-2.5 border-b border-border">
                      <h3 className="text-sm font-medium text-foreground truncate">{col.titulo === SEM_DONO ? "Sem designer" : col.titulo}{col.id === eu ? " (você)" : ""}</h3>
                      <p className="text-[11px] text-muted-foreground">
                        {fila} na fila · {fazendo} fazendo{alt > 0 && <span className="text-destructive font-medium"> · {alt} alteraç{alt > 1 ? "ões" : "ão"}</span>}
                      </p>
                    </header>
                    <div className="p-2 space-y-2 overflow-y-auto" style={{ maxHeight: "70vh" }}>
                      {col.itens.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-6">Nada na fila</p>}
                      {col.itens.map((it) => cartao(it, { compacto: true }))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Modais da produção ── */}
      {pendencia?.tipo === "entregar" && <EntregarArteModal card={pendencia.card} onClose={() => setPendencia(null)} />}
      {pendencia?.tipo === "alteracao" && (
        <MotivoModal tipo="alteracao" tituloCard={pendencia.card.title} onClose={() => setPendencia(null)}
          onConfirmar={(motivo) => acao(pendencia.card, { tipo: "pedir_alteracao", motivo })} />
      )}
      {reportando && (
        <ReportarNaoEntrega card={reportando} onClose={() => setReportando(null)}
          onSalvar={async (motivo) => {
            try {
              await updateContentCard(reportando.id, { nonDeliveryReason: motivo, nonDeliveryReportedBy: eu, nonDeliveryReportedAt: new Date().toISOString() });
              toast.success("Motivo registrado.");
              return true;
            } catch { return false; } // o store já avisou
          }} />
      )}
    </div>
  );
}

function Contador({ rotulo, n, alerta }: { rotulo: string; n: number; alerta?: boolean }) {
  if (n === 0) return null;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-1 rounded-md border",
      alerta ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-card text-muted-foreground border-border",
    )}>
      {rotulo} <span className="font-semibold tabular-nums">{n}</span>
    </span>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-sm text-muted-foreground py-10 text-center">{texto}</p>;
}

function ReportarNaoEntrega({ card, onSalvar, onClose }: { card: ContentCard; onSalvar: (motivo: string) => Promise<boolean>; onClose: () => void }) {
  const [escolhido, setEscolhido] = useState("");
  const [outro, setOutro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const motivo = escolhido === "Outro" ? outro.trim() : escolhido;
  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="p-5 pr-12 border-b border-border">
          <DialogTitle className="text-lone-h2 text-foreground flex items-center gap-2"><FileWarning size={15} className="text-destructive" aria-hidden="true" /> Não saiu no prazo</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 truncate">{card.title} · {card.clientName}</DialogDescription>
        </div>
        <div className="p-5 space-y-1.5">
          {[...MOTIVOS_NAO_ENTREGA, "Outro"].map((m) => (
            <button key={m} type="button" onClick={() => setEscolhido(m)}
              className={cn("w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors",
                escolhido === m ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted")}>
              {m}
            </button>
          ))}
          {escolhido === "Outro" && (
            <input value={outro} onChange={(e) => setOutro(e.target.value)} autoFocus placeholder="Descreva o motivo…" aria-label="Outro motivo"
              className="w-full h-9 bg-background border border-input rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
          )}
        </div>
        <div className="p-5 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancelar</button>
          <button disabled={!motivo || salvando}
            onClick={async () => { setSalvando(true); const ok = await onSalvar(motivo); setSalvando(false); if (ok) onClose(); }}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
            {salvando ? "Salvando…" : "Registrar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Rótulos das etapas, para quem quer mostrar a legenda fora do quadro. */
export const LEGENDA_ETAPAS = ETAPAS.map((e) => ({ id: e.id, rotulo: e.rotulo, cor: e.cor }));
