// lib/clientes/linha-do-tempo.ts — A LINHA DO TEMPO ÚNICA DO CLIENTE (Leva 7C, N20). Módulo PURO.
//
// Antes: o "Histórico" da ficha lia só `timeline_entries`, e pela store global — as 500 entradas mais
// recentes de TODOS os clientes. Cliente com pouca movimentação recente aparecia vazio, e o que não
// virava linha nessa tabela (a conversa no grupo, a reunião marcada, a pergunta do cliente, o NPS,
// a arte aprovada) simplesmente não existia ali.
//
// Agora a rota GET /api/clients/[id]/linha-do-tempo junta, deste cliente:
//   · o REGISTRO (timeline_entries): post publicado, arte entregue, pedido do cliente, relatório,
//     status, contrato, onboarding e as notas manuais — o que o cron historico-cliente e as telas gravam;
//   · a CONVERSA no grupo (cs_message_corpus), resumida em UMA linha por dia — cada mensagem virar
//     linha transformaria memória em log;
//   · as REUNIÕES (meetings) — sem repetir o dia que o registro já contou;
//   · as PERGUNTAS do cliente (customer_requests) e os PEDIDOS DE ARTE (design_requests);
//   · a APROVAÇÃO do cliente num card (content_cards.client_approved_at) e o NPS respondido.
// Este módulo só normaliza, deduplica e ordena. Quem busca é a rota.

export type TipoLinha = "conversa" | "reuniao" | "producao" | "pedido" | "status" | "nota";

export const ROTULO_TIPO_LINHA: Record<TipoLinha, string> = {
  conversa: "Conversa",
  reuniao: "Reunião",
  producao: "Produção",
  pedido: "Pedido",
  status: "Status",
  nota: "Nota",
};

export const TIPOS_LINHA: readonly TipoLinha[] = ["conversa", "reuniao", "producao", "pedido", "status", "nota"];

export interface EventoLinha {
  id: string;
  tipo: TipoLinha;
  /** ISO. É por aqui que a linha ordena. */
  quando: string;
  titulo: string;
  detalhe: string | null;
  /** Quem fez: pessoa, "Cliente" ou "Sistema". */
  ator: string | null;
}

// ── Entradas ────────────────────────────────────────────────────────────────

export interface RegistroRow { id: string; type: string; actor: string | null; description: string; timestamp: string | null; created_at: string | null }
export interface MensagemRow { created_at: string; is_team: boolean | null; author_name: string | null; text: string | null }
export interface ReuniaoRow { id: string; title: string | null; start_at: string | null; estado: string | null; responsavel: string | null; realizada_em: string | null }
export interface PerguntaRow { id: string; origin_text: string | null; author_name: string | null; status: string | null; aberta_em: string | null; respondida_em: string | null }
export interface PedidoArteRow { id: string; title: string | null; status: string | null; requested_by: string | null; created_at: string | null }
export interface AprovacaoRow { id: string; title: string | null; client_approved_at: string | null }
export interface NpsRow { id: string; nota: number | null; respondido_em: string | null; motivo: string | null }

export interface FontesLinha {
  registros?: RegistroRow[];
  mensagens?: MensagemRow[];
  reunioes?: ReuniaoRow[];
  perguntas?: PerguntaRow[];
  pedidosArte?: PedidoArteRow[];
  aprovacoes?: AprovacaoRow[];
  nps?: NpsRow[];
}

// ── Datas ───────────────────────────────────────────────────────────────────

/**
 * `timeline_entries.timestamp` é TEXTO em pt-BR ("24/09/2026, 14:03:00" ou "24/09/2026 14:03"),
 * carimbado no fuso de São Paulo, e é a hora do FATO (o cron grava a entrega de ontem com a data
 * de ontem). `created_at` é a hora em que a linha entrou. Usa o fato; cai para o created_at.
 */
export function quandoDoRegistro(timestamp: string | null | undefined, createdAt: string | null | undefined): string | null {
  const m = (timestamp ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, d, mes, a, h, min, s] = m;
    const iso = `${a}-${mes}-${d}T${h.padStart(2, "0")}:${min}:${s ?? "00"}-03:00`;
    const t = new Date(iso);
    if (Number.isFinite(t.getTime())) return t.toISOString();
  }
  const soData = (timestamp ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (soData) {
    const t = new Date(`${soData[3]}-${soData[2]}-${soData[1]}T12:00:00-03:00`);
    if (Number.isFinite(t.getTime())) return t.toISOString();
  }
  if (createdAt && Number.isFinite(new Date(createdAt).getTime())) return new Date(createdAt).toISOString();
  return null;
}

/** Dia (YYYY-MM-DD) em São Paulo. */
export function diaSP(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const curto = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

// ── Normalização por fonte ──────────────────────────────────────────────────

const TIPO_DO_REGISTRO: Record<string, TipoLinha> = {
  chat: "pedido",      // "Pedido do cliente: …" (cs_demandas, via cron)
  task: "producao",
  content: "producao", // post publicado
  design: "producao",  // arte entregue
  report: "status",    // relatório enviado ao cliente
  status: "status",
  onboarding: "status",
  meeting: "reuniao",
  manual: "nota",
};

function doRegistro(r: RegistroRow): EventoLinha | null {
  const quando = quandoDoRegistro(r.timestamp, r.created_at);
  if (!quando || !r.description?.trim()) return null;
  return {
    id: `reg-${r.id}`, tipo: TIPO_DO_REGISTRO[r.type] ?? "nota", quando,
    titulo: r.description.trim(), detalhe: null, ator: r.actor?.trim() || null,
  };
}

/**
 * A conversa do dia numa linha: quantas mensagens, de quem, e a última do CLIENTE (é ela que diz o
 * assunto — a do time costuma ser "bom dia" ou "já vejo").
 */
export function conversasPorDia(mensagens: MensagemRow[]): EventoLinha[] {
  const porDia = new Map<string, MensagemRow[]>();
  for (const m of mensagens) {
    if (!m.created_at || !Number.isFinite(new Date(m.created_at).getTime())) continue;
    const d = diaSP(m.created_at);
    (porDia.get(d) ?? porDia.set(d, []).get(d)!).push(m);
  }
  const out: EventoLinha[] = [];
  for (const [dia, ms] of porDia) {
    ms.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const doCliente = ms.filter((m) => !m.is_team);
    const doTime = ms.length - doCliente.length;
    const ultimaCliente = doCliente[doCliente.length - 1];
    const partes = [
      doCliente.length ? `${doCliente.length} do cliente` : null,
      doTime ? `${doTime} do time` : null,
    ].filter(Boolean).join(", ");
    out.push({
      id: `conv-${dia}`, tipo: "conversa", quando: new Date(ms[ms.length - 1].created_at).toISOString(),
      titulo: `Conversa no grupo: ${ms.length} mensage${ms.length === 1 ? "m" : "ns"}${partes ? ` (${partes})` : ""}`,
      detalhe: ultimaCliente?.text ? `${ultimaCliente.author_name ? `${ultimaCliente.author_name}: ` : ""}“${curto(ultimaCliente.text, 160)}”` : null,
      ator: doCliente.length ? "Cliente" : "Time",
    });
  }
  return out;
}

function daReuniao(r: ReuniaoRow, agora: Date): EventoLinha | null {
  const quando = r.realizada_em || r.start_at;
  if (!quando || !Number.isFinite(new Date(quando).getTime())) return null;
  const titulo = r.title?.trim() || "Reunião";
  const estado = (r.estado ?? "").toLowerCase();
  const futura = new Date(r.start_at ?? quando).getTime() > agora.getTime();
  const rotulo = estado === "realizada" ? "Reunião realizada"
    : estado === "cancelada" ? "Reunião cancelada"
      : futura ? "Reunião marcada" : "Reunião (sem registro de que aconteceu)";
  return {
    id: `reu-${r.id}`, tipo: "reuniao", quando: new Date(quando).toISOString(),
    titulo: `${rotulo}: ${curto(titulo, 120)}`, detalhe: null, ator: r.responsavel?.trim() || null,
  };
}

function daPergunta(p: PerguntaRow): EventoLinha | null {
  if (!p.aberta_em || !p.origin_text?.trim()) return null;
  const situacao = p.status === "respondida" ? "respondida"
    : p.status === "aberta" ? "ainda sem resposta"
      : p.status === "expirada" ? "ficou sem resposta" : "descartada";
  return {
    id: `perg-${p.id}`, tipo: "pedido", quando: new Date(p.aberta_em).toISOString(),
    titulo: `Pergunta do cliente (${situacao})`, detalhe: `“${curto(p.origin_text, 160)}”`,
    ator: p.author_name?.trim() || "Cliente",
  };
}

function doPedidoArte(p: PedidoArteRow): EventoLinha | null {
  if (!p.created_at) return null;
  const st = p.status === "done" ? "entregue" : p.status === "in_progress" ? "em produção" : "na fila";
  return {
    id: `arte-${p.id}`, tipo: "pedido", quando: new Date(p.created_at).toISOString(),
    titulo: `Pedido de arte: ${curto(p.title, 120) || "sem título"} (${st})`, detalhe: null,
    ator: p.requested_by?.trim() || null,
  };
}

function daAprovacao(a: AprovacaoRow): EventoLinha | null {
  if (!a.client_approved_at) return null;
  return {
    id: `aprov-${a.id}`, tipo: "producao", quando: new Date(a.client_approved_at).toISOString(),
    titulo: `Cliente aprovou: "${curto(a.title, 120) || "sem título"}"`, detalhe: null, ator: "Cliente",
  };
}

function doNps(n: NpsRow): EventoLinha | null {
  if (!n.respondido_em || n.nota === null || n.nota === undefined) return null;
  return {
    id: `nps-${n.id}`, tipo: "status", quando: new Date(n.respondido_em).toISOString(),
    titulo: `NPS respondido: nota ${n.nota}`, detalhe: n.motivo?.trim() ? `“${curto(n.motivo, 160)}”` : null, ator: "Cliente",
  };
}

// ── Junção ──────────────────────────────────────────────────────────────────

/**
 * Junta tudo, mais recente primeiro. Deduplica o que duas fontes contam do mesmo fato:
 *   · reunião: o registro (lib/meetings/auditoria) já escreve a reunião realizada; a linha da tabela
 *     meetings só entra no dia em que o registro não tem reunião;
 *   · linhas idênticas (mesmo título no mesmo dia) viram uma só — cron rodando duas vezes.
 */
export function montarLinhaDoTempo(f: FontesLinha, opts: { agora?: Date; limite?: number; tipos?: TipoLinha[] } = {}): EventoLinha[] {
  const agora = opts.agora ?? new Date();
  const registros = (f.registros ?? []).map(doRegistro).filter(Boolean) as EventoLinha[];
  const diasComReuniaoNoRegistro = new Set(registros.filter((e) => e.tipo === "reuniao").map((e) => diaSP(e.quando)));

  const reunioes = (f.reunioes ?? [])
    .map((r) => daReuniao(r, agora))
    .filter((e): e is EventoLinha => !!e && !diasComReuniaoNoRegistro.has(diaSP(e.quando)));

  const todos = [
    ...registros,
    ...conversasPorDia(f.mensagens ?? []),
    ...reunioes,
    ...((f.perguntas ?? []).map(daPergunta).filter(Boolean) as EventoLinha[]),
    ...((f.pedidosArte ?? []).map(doPedidoArte).filter(Boolean) as EventoLinha[]),
    ...((f.aprovacoes ?? []).map(daAprovacao).filter(Boolean) as EventoLinha[]),
    ...((f.nps ?? []).map(doNps).filter(Boolean) as EventoLinha[]),
  ];

  const vistos = new Set<string>();
  const unicos: EventoLinha[] = [];
  for (const e of todos.sort((a, b) => b.quando.localeCompare(a.quando))) {
    const chave = `${diaSP(e.quando)}|${e.titulo.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (opts.tipos && opts.tipos.length && !opts.tipos.includes(e.tipo)) continue;
    unicos.push(e);
  }
  return opts.limite ? unicos.slice(0, opts.limite) : unicos;
}

/** Quantos eventos de cada tipo — é o número ao lado de cada filtro. */
export function contarPorTipo(eventos: EventoLinha[]): Record<TipoLinha, number> {
  const c = Object.fromEntries(TIPOS_LINHA.map((t) => [t, 0])) as Record<TipoLinha, number>;
  for (const e of eventos) c[e.tipo] += 1;
  return c;
}
