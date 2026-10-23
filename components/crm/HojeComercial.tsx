"use client";

// HOJE do Comercial (redesign de out/2026, Leva D3 do PROMPT-DESIGN-COMERCIAL.md). Antes: 20 cartões grandes
// iguais, cada um com a mensagem inteira aberta e 9 botões. Agora: anel de progresso do dia no topo, grupos
// que recolhem, uma LINHA por lead com a ação principal em destaque e o resto num menu "…", a mensagem abre
// ao clicar, as lojas da rota agrupadas por cidade e "marcar vários como feito". A fila (o que entra, em que
// ordem e por quê) continua em lib/crm/hoje.ts — aqui é só como se mostra.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, ChevronDown, Copy, MapPin, MessageCircle, MoreHorizontal, Phone, SkipForward, Target } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Anel, Cartao } from "@/components/crm/graficos";
import { ORDEM_GRUPOS, ROTULO_GRUPO, type GrupoHoje, type ItemHoje, type LeadHoje } from "@/lib/crm/hoje";
import { waComTexto } from "@/lib/crm/modelos";
import { ROTULO_ETAPA, normalizarEtapa } from "@/lib/crm/etapas";
import { brl, type ResumoMeta } from "@/lib/crm/meta";
import { horaCurta, itensDeReuniao, mensagemVesperaLead, type ReuniaoBase } from "@/lib/crm/reunioes";
import type { CrmAtividadeTipo } from "@/lib/types";

type LeadDoHoje = LeadHoje & { cidade?: string | null; endereco?: string | null };

const somaDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaSP = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
/** Grupos que já abrem recolhidos: decisão que não é urgente. */
const RECOLHIDOS_DE_INICIO: GrupoHoje[] = ["fim"];

export default function HojeComercial<L extends LeadDoHoje>({
  fila, leads, hoje, resumoMeta, ocupado, onAbrir, onEnviarWhatsApp, onRegistrar, onPatch, onDefinirMeta, onVerDashboard,
  reunioes = [], onReuniao, onMarcarReuniao,
}: {
  fila: ItemHoje<L>[];
  leads: L[];
  hoje: string;
  resumoMeta: ResumoMeta;
  ocupado: string | null;
  onAbrir: (l: L) => void;
  onEnviarWhatsApp: (l: L, texto: string) => Promise<void>;
  onRegistrar: (l: L, tipo: CrmAtividadeTipo, texto: string) => Promise<boolean>;
  onPatch: (l: L, patch: Record<string, unknown>, ok: string) => Promise<void>;
  onDefinirMeta: () => void;
  onVerDashboard: () => void;
  /** Reuniões de venda (lib/crm/reunioes.ts): as de hoje, as de amanhã para confirmar e as sem registro. */
  reunioes?: ReuniaoBase[];
  onReuniao?: (id: string, acao: "realizada" | "nao_veio") => Promise<boolean>;
  onMarcarReuniao?: (l: L) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [textoEditado, setTextoEditado] = useState<Record<string, string>>({});
  const [recolhidos, setRecolhidos] = useState<Set<GrupoHoje>>(new Set(RECOLHIDOS_DE_INICIO));
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [emMassa, setEmMassa] = useState(false);

  // Progresso do dia: quem já teve um passo da régua HOJE (contato ou "pulado") × o que ainda falta.
  const feitosHoje = useMemo(() => leads.filter((l) => (l.avancos ?? []).some((t) => diaSP(t) === hoje)).length, [leads, hoje]);
  const pendentes = fila.filter((i) => i.grupo !== "fim").length;
  const totalDia = feitosHoje + pendentes;
  const porGrupo = ORDEM_GRUPOS.map((g) => ({ g, itens: fila.filter((i) => i.grupo === g) })).filter((x) => x.itens.length);

  const alternarGrupo = (g: GrupoHoje) => setRecolhidos((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const alternarSelecao = (id: string) => setSelecionados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const itensSelecionados = fila.filter((i) => selecionados.has(i.lead.id));

  async function emLote(acao: "feito" | "adiar") {
    setEmMassa(true);
    let ok = 0;
    for (const i of itensSelecionados) {
      if (acao === "feito") { if (await onRegistrar(i.lead, "whatsapp", "Contato feito por outro caminho (marcado em lote no Hoje)")) ok++; }
      else { await onPatch(i.lead, { retomarEm: somaDias(hoje, 1) }, "Adiado"); ok++; }
    }
    setEmMassa(false);
    setSelecionados(new Set());
    toast.success(acao === "feito" ? `${ok} marcado(s) como feito.` : `${ok} adiado(s) para amanhã.`);
  }

  // Régua encerrada sem resposta: decidir em bloco (23/10/2026 — ninguém marcava perdido e a taxa de fechamento
  // ficava 100% para sempre). Confirma mostrando a lista; dá para reabrir depois pela ficha.
  async function perderEmLote(lista: ItemHoje<L>[]) {
    const nomes = lista.map((i) => `• ${i.lead.empresa || i.lead.contatoNome}`).join("\n");
    if (!window.confirm(`Marcar como perdido (sem resposta)?\n\n${nomes}\n\nDá para reabrir depois pela ficha.`)) return;
    setEmMassa(true);
    for (const i of lista) await onPatch(i.lead, { estagio: "perdido", motivoPerdaCodigo: "sem_resposta", origemEtapa: "lote" }, `${i.lead.empresa || i.lead.contatoNome}: perdido (sem resposta).`);
    setEmMassa(false);
  }

  const pctMeta = resumoMeta.progresso != null ? Math.round(resumoMeta.progresso * 100) : null;
  const itensReuniao = itensDeReuniao(reunioes, new Date());
  const leadPorId = new Map(leads.map((l) => [l.id, l]));
  const temReuniao = itensReuniao.hoje.length + itensReuniao.confirmarAmanha.length + itensReuniao.comoFoi.length > 0;

  return (
    <div className="space-y-4">
      {/* Progresso do dia + meta em uma linha */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Cartao>
          <div className="flex items-center gap-5">
          <Anel tamanho="md" pct={totalDia ? (feitosHoje / totalDia) * 100 : null} tom={totalDia && feitosHoje >= totalDia ? "success" : "primary"}
            rotuloAcessivel={`${feitosHoje} de ${totalDia} feitos hoje`}
            centro={<><span className="text-lg font-semibold tabular-nums text-foreground">{feitosHoje}</span><span className="mt-0.5 text-lone-caption text-muted-foreground">de {totalDia}</span></>} />
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Seu dia</p>
            <p className="mt-1 text-lone-h2 text-foreground">{pendentes === 0 ? "Tudo feito por hoje." : `${pendentes} ${pendentes === 1 ? "contato para fazer" : "contatos para fazer"}`}</p>
            <p className="mt-0.5 text-lone-caption text-muted-foreground">{feitosHoje} {feitosHoje === 1 ? "feito" : "feitos"} hoje · a lista está na ordem que vende: quem chegou agora primeiro</p>
          </div>
          </div>
        </Cartao>
        <Cartao className="justify-center">
          <div className="flex items-center gap-1.5"><Target size={13} className="text-muted-foreground" aria-hidden="true" /><span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Meta do mês</span></div>
          {resumoMeta.meta == null ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-lone-body text-foreground">Vendido {brl(resumoMeta.vendido)} · sem meta definida</p>
              <button onClick={onDefinirMeta} className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90">Definir meta</button>
            </div>
          ) : (
            <button onClick={onVerDashboard} className="mt-1.5 block w-full text-left">
              <p className="text-lone-body text-foreground"><span className="font-semibold">{brl(resumoMeta.vendido)}</span> de {brl(resumoMeta.meta)} · {pctMeta}%</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted-foreground/15"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pctMeta ?? 0)}%` }} /></div>
              <p className="mt-1.5 text-lone-caption text-muted-foreground">{resumoMeta.bateu ? "Meta batida." : `Faltam ${brl(resumoMeta.falta ?? 0)}`} · ver no dashboard →</p>
            </button>
          )}
        </Cartao>
      </div>

      {/* Reuniões: hoje, confirmar as de amanhã e registrar as que já passaram */}
      {temReuniao && (
        <Cartao semMargem className="overflow-hidden border-primary/30">
          <p className="px-5 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary">Reuniões</p>
          <ul className="divide-y divide-border">
            {itensReuniao.comoFoi.map((r) => {
              const l = leadPorId.get(r.leadId);
              return l ? (
                <li key={`f-${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="w-12 shrink-0 text-lone-body font-semibold tabular-nums text-lone-warning">{horaCurta(r.inicio)}</span>
                  <button onClick={() => onAbrir(l)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-lone-body font-medium text-foreground">{l.empresa || l.contatoNome}</span>
                    <span className="block text-lone-caption text-muted-foreground">Já passou — como foi?</span>
                  </button>
                  <button onClick={() => onReuniao?.(r.id, "realizada")} className="h-8 rounded-lg bg-lone-success-bg px-3 text-[13px] font-medium text-lone-success hover:opacity-80">Aconteceu</button>
                  <button onClick={async () => { if (await onReuniao?.(r.id, "nao_veio")) onMarcarReuniao?.(l); }} className="h-8 rounded-lg border border-border px-3 text-[13px] text-foreground hover:bg-accent">Não veio · remarcar</button>
                </li>
              ) : null;
            })}
            {itensReuniao.hoje.map((r) => {
              const l = leadPorId.get(r.leadId);
              return l ? (
                <li key={`h-${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="w-12 shrink-0 text-lone-body font-semibold tabular-nums text-primary">{horaCurta(r.inicio)}</span>
                  <button onClick={() => onAbrir(l)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-lone-body font-medium text-foreground">{l.empresa || l.contatoNome}</span>
                    <span className="block truncate text-lone-caption text-muted-foreground">Hoje · {r.formato === "meet" ? "Google Meet" : r.formato === "presencial" ? `presencial${r.local ? ` · ${r.local}` : ""}` : "ligação"}</span>
                  </button>
                  {r.meetUrl && <a href={r.meetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90">Entrar no Meet</a>}
                  {r.formato === "presencial" && r.local && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.local)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] text-foreground hover:bg-accent"><MapPin size={14} /> Mapa</a>}
                </li>
              ) : null;
            })}
            {itensReuniao.confirmarAmanha.map((r) => {
              const l = leadPorId.get(r.leadId);
              if (!l) return null;
              const msg = mensagemVesperaLead(r, l);
              const link = waComTexto(l.telefone, msg);
              return (
                <li key={`c-${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="w-12 shrink-0 text-lone-body font-semibold tabular-nums text-foreground">{horaCurta(r.inicio)}</span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-lone-body font-medium text-foreground">{l.empresa || l.contatoNome}</span>
                    <span className="block text-lone-caption text-muted-foreground">Amanhã — confirme hoje com o lead</span>
                  </div>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => onRegistrar(l, "whatsapp", "Pedido de confirmação da reunião de amanhã (pelo Hoje)")}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-lone-success-bg px-3 text-[13px] font-medium text-lone-success hover:opacity-80"><MessageCircle size={14} /> Pedir confirmação</a>
                  ) : (
                    <button onClick={() => { navigator.clipboard?.writeText(msg).catch(() => {}); toast.success("Mensagem copiada — o lead está sem WhatsApp."); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] text-foreground hover:bg-accent"><Copy size={14} /> Copiar confirmação</button>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      {/* Ações em lote */}
      {selecionados.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card px-4 py-2.5 shadow-sm">
          <span className="text-lone-body font-medium text-foreground">{selecionados.size} {selecionados.size === 1 ? "selecionado" : "selecionados"}</span>
          <button disabled={emMassa} onClick={() => emLote("feito")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-lone-success-bg px-3 text-[13px] font-medium text-lone-success disabled:opacity-50"><Check size={14} /> Marcar como feito</button>
          <button disabled={emMassa} onClick={() => emLote("adiar")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] text-foreground hover:bg-accent disabled:opacity-50"><CalendarClock size={14} /> Adiar para amanhã</button>
          <button onClick={() => setSelecionados(new Set())} className="ml-auto text-lone-caption text-muted-foreground hover:text-foreground">Limpar</button>
        </div>
      )}

      {porGrupo.length === 0 && (
        <Cartao className="items-center py-8 text-center">
          <Check size={22} className="text-lone-success" aria-hidden="true" />
          <p className="mt-2 text-lone-body text-foreground">Nada para fazer agora: nenhum lead novo, toque vencido ou negócio esfriando.</p>
        </Cartao>
      )}

      {porGrupo.map(({ g, itens }) => {
        const recolhido = recolhidos.has(g);
        // Lojas da rota: agrupar por cidade quando o grupo é grande e tem mais de uma cidade.
        const cidades = new Set(itens.map((i) => i.lead.cidade || ""));
        const porCidade = itens.length >= 4 && cidades.size > 1;
        const ordenados = porCidade ? [...itens].sort((a, b) => (a.lead.cidade || "~").localeCompare(b.lead.cidade || "~", "pt-BR")) : itens;
        return (
          <Cartao key={g} semMargem className={`overflow-hidden ${g === "responder" ? "border-lone-warning-border" : ""}`}>
            <button onClick={() => alternarGrupo(g)} aria-expanded={!recolhido}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/50">
              <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${recolhido ? "-rotate-90" : ""}`} aria-hidden="true" />
              <span className="text-lone-h2 text-foreground">{ROTULO_GRUPO[g].titulo}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${g === "responder" ? "bg-lone-warning-bg text-lone-warning" : "bg-muted text-muted-foreground"}`}>{itens.length}</span>
              <span className="ml-auto hidden truncate text-lone-caption text-muted-foreground md:block">{ROTULO_GRUPO[g].dica}</span>
            </button>
            {!recolhido && g === "fim" && itens.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-5 py-2">
                <span className="text-lone-caption text-muted-foreground">Régua encerrada e sem resposta: decida em bloco.</span>
                <button disabled={emMassa} onClick={() => perderEmLote(itens)}
                  className="ml-auto inline-flex h-8 items-center rounded-lg border border-lone-danger-border px-3 text-[13px] text-lone-danger hover:bg-lone-danger-bg disabled:opacity-50">
                  Marcar os {itens.length} como perdido: sem resposta
                </button>
              </div>
            )}
            {!recolhido && (
              <ul className="divide-y divide-border border-t border-border">
                {ordenados.map((item, idx) => {
                  const l = item.lead;
                  const texto = textoEditado[l.id] ?? item.mensagem?.texto ?? "";
                  const ehMensagem = item.mensagem?.tipo === "mensagem";
                  const canal = item.passo?.canal ?? (ehMensagem ? "whatsapp" : null);
                  const temZap = !!waComTexto(l.telefone, "x");
                  const busy = ocupado === l.id || emMassa;
                  const abertoAqui = aberto === l.id;
                  const cidadeAnterior = idx > 0 ? ordenados[idx - 1].lead.cidade || "" : null;
                  const mostrarCidade = porCidade && (l.cidade || "") !== cidadeAnterior;
                  const acaoPrincipal = (() => {
                    const cls = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-opacity disabled:opacity-50";
                    if (g === "fim") return <button disabled={busy} onClick={() => onPatch(l, { retomarEm: somaDias(hoje, 30) }, "Volta para o Hoje em 30 dias.")} className={`${cls} border border-border text-foreground hover:bg-accent`}>Retomar em 30 dias</button>;
                    if (g === "reuniao") return <button onClick={() => onAbrir(l)} className={`${cls} bg-primary/10 text-primary hover:opacity-80`}>Abrir</button>;
                    if (canal === "ligacao" && l.telefone) return <a href={`tel:${l.telefone.replace(/\D/g, "")}`} className={`${cls} bg-primary/10 text-primary hover:opacity-80`}><Phone size={14} /> Ligar</a>;
                    if (canal === "visita") return <button disabled={busy} onClick={() => onRegistrar(l, "visita", `Visita (${item.passo?.objetivo ?? "follow-up"})`)} className={`${cls} bg-primary/10 text-primary hover:opacity-80`}><MapPin size={14} /> Registrar visita</button>;
                    if (ehMensagem && temZap) return <button disabled={busy} onClick={() => onEnviarWhatsApp(l, texto)} className={`${cls} bg-lone-success-bg text-lone-success hover:opacity-80`}><MessageCircle size={14} /> Enviar no WhatsApp</button>;
                    if (ehMensagem) return <button onClick={() => { navigator.clipboard?.writeText(texto).catch(() => {}); toast.success("Texto copiado — este lead está sem WhatsApp."); }} className={`${cls} border border-border text-foreground hover:bg-accent`}><Copy size={14} /> Copiar texto</button>;
                    return <button onClick={() => onAbrir(l)} className={`${cls} border border-border text-foreground hover:bg-accent`}>Abrir</button>;
                  })();
                  return (
                    <li key={`${g}-${l.id}`}>
                      {mostrarCidade && (
                        <p className="flex items-center gap-1.5 bg-muted/40 px-5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          <MapPin size={11} aria-hidden="true" /> {l.cidade || "Sem cidade"}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5 sm:flex-nowrap">
                        <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => alternarSelecao(l.id)} disabled={g === "fim"}
                          aria-label={`Selecionar ${l.empresa || l.contatoNome}`} className="h-4 w-4 shrink-0 accent-primary disabled:opacity-30" />
                        <button onClick={() => setAberto(abertoAqui ? null : l.id)} aria-expanded={abertoAqui} className="min-w-0 flex-1 basis-[calc(100%-1.75rem)] text-left sm:basis-0">
                          <span className="block truncate text-lone-body font-medium text-foreground">{l.empresa || l.contatoNome}</span>
                          <span className="block truncate text-lone-caption text-muted-foreground">
                            {[l.empresa && l.contatoNome !== l.empresa ? l.contatoNome : null, ROTULO_ETAPA[normalizarEtapa(l.estagio)], item.motivo].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                        {acaoPrincipal}
                        <DropdownMenu>
                          <DropdownMenuTrigger aria-label="Mais ações" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                            <MoreHorizontal size={16} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="truncate">{l.empresa || l.contatoNome}</DropdownMenuLabel>
                            {item.mensagem && <DropdownMenuItem onSelect={() => setAberto(l.id)}>Ver e editar a mensagem</DropdownMenuItem>}
                            {ehMensagem && <DropdownMenuItem disabled={busy} onSelect={() => onRegistrar(l, "whatsapp", "Contato feito por outro caminho (registrado no Hoje)")}><Check size={14} className="mr-2" />Já falei por outro caminho</DropdownMenuItem>}
                            {canal === "ligacao" && <DropdownMenuItem disabled={busy} onSelect={() => onRegistrar(l, "ligacao", `Ligação (${item.passo?.objetivo ?? "follow-up"})`)}><Phone size={14} className="mr-2" />Registrar ligação</DropdownMenuItem>}
                            {g !== "fim" && g !== "reuniao" && (
                              <>
                                <DropdownMenuSeparator />
                                {[1, 3, 7].map((d) => (
                                  <DropdownMenuItem key={d} disabled={busy} onSelect={() => onPatch(l, { retomarEm: somaDias(hoje, d) }, `Volta para o Hoje em ${d === 1 ? "1 dia" : `${d} dias`}.`)}>
                                    <CalendarClock size={14} className="mr-2" />Adiar {d === 1 ? "1 dia" : `${d} dias`}
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
                            {item.passo && item.toque && item.toque.total != null && (
                              <DropdownMenuItem disabled={busy} onSelect={() => onRegistrar(l, "pulado", `Toque pulado: ${item.passo!.objetivo}`)}><SkipForward size={14} className="mr-2" />Pular este passo</DropdownMenuItem>
                            )}
                            {g === "fim" && (
                              <DropdownMenuItem disabled={busy} className="text-lone-danger focus:text-lone-danger"
                                onSelect={() => onPatch(l, { estagio: "perdido", motivoPerdaCodigo: "sem_resposta" }, "Marcado como perdido (sem resposta).")}>Perdido: sem resposta</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => onAbrir(l)}>Abrir a ficha</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </div>
                      {abertoAqui && (
                        <div className="space-y-2 bg-muted/30 px-5 pb-4 pl-12 pt-1">
                          {item.passo && <p className="text-lone-caption text-muted-foreground">{item.passo.objetivo}</p>}
                          {item.mensagem ? (
                            <>
                              <textarea rows={4} value={texto} onChange={(e) => setTextoEditado({ ...textoEditado, [l.id]: e.target.value })}
                                className={`w-full rounded-lg border border-border bg-card px-3 py-2 text-lone-body focus:border-primary focus:outline-none ${ehMensagem ? "text-foreground" : "italic text-muted-foreground"}`} />
                              <div className="flex flex-wrap gap-2">
                                {ehMensagem && temZap && <button disabled={busy} onClick={() => onEnviarWhatsApp(l, texto)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-lone-success-bg px-3 text-[13px] font-medium text-lone-success hover:opacity-80 disabled:opacity-50"><MessageCircle size={14} /> Enviar este texto</button>}
                                <button onClick={() => { navigator.clipboard?.writeText(texto).catch(() => {}); toast.success("Texto copiado."); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] text-foreground hover:bg-accent"><Copy size={14} /> Copiar</button>
                              </div>
                            </>
                          ) : <p className="text-lone-caption text-muted-foreground">Sem mensagem pronta para este passo — abra a ficha para ver o histórico.</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        );
      })}
    </div>
  );
}
