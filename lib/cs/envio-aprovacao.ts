// lib/cs/envio-aprovacao.ts — "Enviar pro cliente": a regra (pura) do envio das artes ao grupo do
// cliente pedindo aprovação. Quem lê o banco e manda é app/api/cs/enviar-aprovacao/route.ts; a
// tela é components/conteudo/EnviarProClienteModal.tsx. Testes em tests/envio-aprovacao.test.ts.
//
// Por que existe (21/10/2026, auditoria de erro recuperável, itens 2.2 e 2.3):
//  · era um window.confirm com o nome do cliente — sem ver as artes, o texto nem o grupo;
//  · clicar de novo mandava tudo de novo ao grupo do CLIENTE;
//  · se a rota caía no meio, parte já tinha saído mas a tela dizia "não deu";
//  · se todas as imagens falhavam, ia só o texto "estou enviando a arte" — sem arte nenhuma;
//  · funcionava com a arte não entregue ou com alteração pedida: ia a versão reprovada e o card
//    pulava de "Com o designer" para "Com o cliente" com o pedido de alteração aberto.
// O que sai pelo WhatsApp não volta. Então: prévia exata, registro ANTES de mandar, repetição só
// com "reenviar" explícito, e a resposta diz exatamente o que saiu.

export const MAX_ARTES_ENVIO = 20;
/** Não começa arte nova depois disto: a rota tem ~60 s e cada imagem pode levar até TIMEOUT_ARTE_MS. */
export const ORCAMENTO_ENVIO_MS = 38_000;
export const TIMEOUT_ARTE_MS = 20_000;
export const PAUSA_ENTRE_ARTES_MS = 700;
/** "Enviando" há mais que isso = o processo morreu no meio (deploy, queda). */
export const ENVIO_TRAVADO_MS = 3 * 60_000;

export type TipoAnexo = "referencia" | "entrega" | null | undefined;

export interface AnexoDoCard {
  id: string;
  url: string;
  tipo?: TipoAnexo;
  delivery_id?: string | null;
  position?: number | null;
}

/** Uma arte que vai (ou foi) ao grupo. id null = a capa legada do card (image_url). */
export interface ArteDoEnvio { id: string | null; url: string }

export const ehImagemDireta = (u: string | null | undefined): boolean =>
  !!u && /^https?:\/\//.test(u) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);

// ─── 2.3: só arte entregue, sem alteração pendente ──────────────────────────

export interface EstadoParaEnvio {
  entregueEm?: string | null;
  alteracaoPendenteEm?: string | null;
  arquivadoEm?: string | null;
}

export type Permissao = { ok: true } | { ok: false; motivo: string };

/**
 * O card pode ir ao cliente? A mesma pergunta na tela (botão desabilitado com o motivo) e no
 * servidor (409). "Entregue" é o que o portal já usa: designer_delivered_at — pedir alteração zera.
 */
export function podeEnviarAoCliente(c: EstadoParaEnvio): Permissao {
  if (c.arquivadoEm) return { ok: false, motivo: "Card arquivado — desarquive antes de enviar ao cliente." };
  if (c.alteracaoPendenteEm) {
    return { ok: false, motivo: "Há alteração pedida nesta arte. Ela só vai ao cliente depois que o designer entregar a nova versão." };
  }
  if (!c.entregueEm) {
    return { ok: false, motivo: "A arte ainda não foi entregue pelo designer. Ela vai ao cliente depois do \"Entregar arte\"." };
  }
  return { ok: true };
}

// ─── Quais artes vão ────────────────────────────────────────────────────────

export interface ForaDoEnvio {
  /** Referência do social — nunca vai ao cliente. */
  referencias: number;
  /** Artes de uma versão anterior que continuam no card. */
  versaoAnterior: number;
  /** Anexadas como entrega mas não entregues (sem "Entregar arte"). */
  naoEntregues: number;
  /** Anexos antigos sem classificação (quando há versão registrada, ficam de fora). */
  semClassificacao: number;
  /** Arte que é link (ex.: Google Drive) e não imagem — a Evolution não manda. */
  semImagem: number;
  /** Além do teto de MAX_ARTES_ENVIO. */
  acimaDoLimite: number;
}

export interface EscolhaDeArtes {
  artes: ArteDoEnvio[];
  fora: ForaDoEnvio;
  /** Card sem versão registrada e sem anexo marcado como entrega: vão os anexos sem classificação. */
  legado: boolean;
  /** Por que não há o que mandar. null = há. */
  erro: string | null;
}

/**
 * As artes da ENTREGA ATUAL — e só elas.
 *
 * Com versão registrada (creative_deliveries, desde 18/09): os anexos ligados a ela; se ela foi por
 * link, a capa do card. Sem versão registrada (cards antigos): o que está marcado como entrega, e
 * na falta disso o que não tem classificação (782 anexos são anteriores à separação de 09/08).
 * Referência não sai em nenhum caso — nem disfarçada de capa do card.
 */
export function escolherArtesParaCliente(
  anexos: readonly AnexoDoCard[],
  entregaAtualId: string | null,
  capaDoCard: string | null | undefined,
): EscolhaDeArtes {
  const ordenados = [...anexos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const referencias = ordenados.filter((a) => a.tipo === "referencia");
  const entregas = ordenados.filter((a) => a.tipo === "entrega");
  const semTipo = ordenados.filter((a) => !a.tipo);
  const urlsDeReferencia = new Set(referencias.map((a) => a.url));
  const capa = capaDoCard && !urlsDeReferencia.has(capaDoCard) ? capaDoCard : null;

  const fora: ForaDoEnvio = { referencias: referencias.length, versaoAnterior: 0, naoEntregues: 0, semClassificacao: 0, semImagem: 0, acimaDoLimite: 0 };
  let candidatos: ArteDoEnvio[];
  let legado = false;

  if (entregaAtualId) {
    const daAtual = ordenados.filter((a) => a.delivery_id === entregaAtualId && a.tipo !== "referencia");
    candidatos = daAtual.length ? daAtual.map(arte) : capa ? [{ id: null, url: capa }] : [];
    fora.versaoAnterior = entregas.filter((a) => a.delivery_id && a.delivery_id !== entregaAtualId).length;
    fora.naoEntregues = entregas.filter((a) => !a.delivery_id).length;
    fora.semClassificacao = semTipo.filter((a) => a.delivery_id !== entregaAtualId).length;
  } else if (entregas.length) {
    candidatos = entregas.map(arte);
    fora.semClassificacao = semTipo.length;
  } else if (semTipo.length) {
    candidatos = semTipo.map(arte);
    legado = true;
  } else {
    candidatos = capa ? [{ id: null, url: capa }] : [];
  }

  const imagens = candidatos.filter((a) => ehImagemDireta(a.url));
  fora.semImagem = candidatos.length - imagens.length;
  const artes = imagens.slice(0, MAX_ARTES_ENVIO);
  fora.acimaDoLimite = imagens.length - artes.length;

  let erro: string | null = null;
  if (!artes.length) {
    erro = fora.semImagem
      ? "A arte entregue é um link (ex.: Google Drive), não uma imagem — o envio automático só manda imagem. Anexe a arte no card ou mande o link pelo WhatsApp."
      : referencias.length
        ? `Este card só tem referência do social (${referencias.length}) — a arte final ainda não foi entregue.`
        : "Não há arte entregue com imagem para enviar.";
  }
  return { artes, fora, legado, erro };
}

function arte(a: AnexoDoCard): ArteDoEnvio {
  return { id: a.id, url: a.url };
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** O que fica de fora, em frases — a prévia mostra antes de confirmar. */
export function frasesDoQueFicaDeFora(f: ForaDoEnvio, legado = false): string[] {
  const l: string[] = [];
  if (f.referencias) l.push(`${f.referencias} ${plural(f.referencias, "referência do social fica", "referências do social ficam")} de fora.`);
  if (f.versaoAnterior) l.push(`${f.versaoAnterior} ${plural(f.versaoAnterior, "arte da versão anterior fica", "artes da versão anterior ficam")} de fora.`);
  if (f.naoEntregues) l.push(`${f.naoEntregues} ${plural(f.naoEntregues, "arte anexada depois da entrega fica", "artes anexadas depois da entrega ficam")} de fora — o designer precisa entregar.`);
  if (f.semClassificacao) l.push(`${f.semClassificacao} ${plural(f.semClassificacao, "anexo sem classificação fica", "anexos sem classificação ficam")} de fora.`);
  if (f.semImagem) l.push(`${f.semImagem} ${plural(f.semImagem, "arte é link e não vai", "artes são link e não vão")} (o envio só manda imagem).`);
  if (f.acimaDoLimite) l.push(`${f.acimaDoLimite} ${plural(f.acimaDoLimite, "arte passa", "artes passam")} do limite de ${MAX_ARTES_ENVIO} e não ${plural(f.acimaDoLimite, "vai", "vão")}.`);
  if (legado) l.push("Estas artes não estão marcadas como \"entrega\" (card antigo) — confira se não é referência.");
  return l;
}

// ─── Chave do envio e texto ─────────────────────────────────────────────────

/** Hash estável (FNV-1a 32 bits) — chave de idempotência, não segurança. */
export function hash32(s: string, semente = 0x811c9dc5): number {
  let h = semente >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hashHex(s: string): string {
  return hash32(s).toString(16).padStart(8, "0") + hash32(s, 0x2c1b3c6d).toString(16).padStart(8, "0");
}

/** O MESMO envio = o mesmo card com o mesmo conjunto de artes (a ordem não importa). */
export function chaveDoEnvio(cardId: string, artes: readonly ArteDoEnvio[]): string {
  return `${cardId}:${hashHex([...artes.map((a) => a.url)].sort().join("\n"))}`;
}

/**
 * O TÍTULO DO CARD NÃO VAI PRO CLIENTE (pedido do Roberto, 03/08): é campo livre do quadro, escrito
 * pra uso interno ("03 SEG - Mesa Londrina…"). A arte já mostra o produto.
 */
export function variacoesDoTexto(nArtes: number): string[] {
  const alvo = nArtes > 1 ? `as ${nArtes} artes` : "a arte";
  return [
    `Pessoal, estou enviando ${alvo}. Vocês poderiam verificar se está tudo certinho, por favor? 🙌`,
    `Oi, pessoal! Seguem ${alvo}. Poderiam conferir pra mim se está tudo ok pra publicar? 😊`,
    `Pessoal, tudo bem? Estou mandando ${alvo}. Dá uma olhadinha e me diz se pode liberar ou se ajusto algo, por favor. 🎨`,
    `Olá! Enviando ${alvo} pra vocês. Poderiam verificar se ficou certinho antes de eu publicar? 🙏`,
    `Pessoal, aqui ${nArtes > 1 ? "estão" : "está"} ${alvo}. Vocês poderiam conferir se está tudo certo, por favor? ✨`,
    `Oi, pessoal! Tudo certo? Deixei ${alvo} aqui pra vocês. Poderiam dar uma conferida e me dizer se ficou certinho? 🙌`,
    `Pessoal, ${nArtes > 1 ? "chegaram" : "chegou"} ${alvo}! Vocês poderiam verificar pra mim se está tudo ok antes de publicar, por favor? 😊`,
    `Olá, pessoal! ${nArtes > 1 ? "Seguem" : "Segue"} ${alvo} pra aprovação de vocês. Se puderem conferir e me retornar se pode ir ao ar, agradeço demais! 🙏`,
    `Oi! Estou passando ${alvo} pra vocês darem uma olhada. Está tudo certinho ou querem que eu ajuste alguma coisa? 🎨`,
  ];
}

/**
 * Texto variado (pra não soar robótico) mas DETERMINADO pela chave: a prévia mostra exatamente o
 * texto que vai sair. Antes era sorteado no envio — impossível mostrar antes.
 */
export function textoDoEnvio(nArtes: number, chave: string): string {
  const v = variacoesDoTexto(nArtes);
  return v[hash32(chave) % v.length];
}

// ─── O registro e a repetição ───────────────────────────────────────────────

export type StatusEnvio = "enviando" | "enviado" | "parcial" | "falhou" | "incerto";
export type SituacaoEnvio = StatusEnvio | "interrompido";

export interface ResultadoArte {
  id: string | null;
  url: string;
  ok: boolean;
  /** O WhatsApp não respondeu a tempo: pode ter saído. */
  incerto?: boolean;
  /** Não chegou a ser tentada (o envio parou antes). */
  naoTentada?: boolean;
  /** Esta arte levou o texto como legenda. */
  comTexto?: boolean;
  erro?: string | null;
}

export interface EnvioRegistrado {
  id: string;
  chave: string;
  tentativa: number;
  status: StatusEnvio;
  enviadas: number;
  total: number;
  artes: ArteDoEnvio[];
  resultado: ResultadoArte[];
  texto: string | null;
  enviado_por: string | null;
  grupo_nome?: string | null;
  criado_em: string;
  concluido_em?: string | null;
  reenvio_de?: string | null;
}

export function situacaoDoEnvio(e: Pick<EnvioRegistrado, "status" | "criado_em">, agoraMs: number): SituacaoEnvio {
  if (e.status === "enviando" && agoraMs - new Date(e.criado_em).getTime() > ENVIO_TRAVADO_MS) return "interrompido";
  return e.status;
}

export type ModoEnvio = "primeiro" | "todas" | "faltantes";

export interface PlanoDeEnvio {
  modo: ModoEnvio;
  artes: ArteDoEnvio[];
  /** null = o texto já saiu num envio anterior (com uma arte que chegou). */
  texto: string | null;
  tentativa: number;
  reenvioDe: string | null;
}

/**
 * As artes deste conjunto que chegaram — ou PODEM ter chegado (sem resposta a tempo) — em algum
 * envio, por URL. "Mandar só as que faltaram" não repete nenhuma delas: se a incerta não está no
 * grupo, a pessoa usa "Reenviar todas".
 */
export function urlsQuePodemTerChegado(envios: readonly EnvioRegistrado[]): Set<string> {
  const s = new Set<string>();
  for (const e of envios) for (const r of e.resultado ?? []) if (r.ok || r.incerto) s.add(r.url);
  return s;
}

function textoPodeTerChegado(envios: readonly EnvioRegistrado[]): boolean {
  return envios.some((e) => (e.resultado ?? []).some((r) => (r.ok || r.incerto) && r.comTexto));
}

/**
 * O que cada botão da prévia mandaria. `envios` = os registros DESTE conjunto de artes (mesma
 * chave), do mais novo para o mais velho.
 *
 * - nenhum envio: "primeiro" (tudo, com o texto);
 * - já houve: só "todas" (reenviar tudo, com o texto) e, se faltou alguma, "faltantes" (só as que
 *   não chegaram nem ficaram incertas; o texto só vai se ele não chegou);
 * - envio em andamento (não travado): nada — esperar.
 */
export function opcoesDeEnvio(
  artes: readonly ArteDoEnvio[],
  texto: string,
  envios: readonly EnvioRegistrado[],
  agoraMs: number,
): PlanoDeEnvio[] {
  if (!artes.length) return [];
  const ultimo = envios[0];
  if (!ultimo) return [{ modo: "primeiro", artes: [...artes], texto, tentativa: 1, reenvioDe: null }];
  if (situacaoDoEnvio(ultimo, agoraMs) === "enviando") return [];

  const tentativa = Math.max(...envios.map((e) => e.tentativa)) + 1;
  const chegaram = urlsQuePodemTerChegado(envios);
  const faltam = artes.filter((a) => !chegaram.has(a.url));
  const opcoes: PlanoDeEnvio[] = [];
  if (faltam.length && faltam.length < artes.length) {
    opcoes.push({ modo: "faltantes", artes: faltam, texto: textoPodeTerChegado(envios) ? null : texto, tentativa, reenvioDe: ultimo.id });
  }
  opcoes.push({ modo: "todas", artes: [...artes], texto, tentativa, reenvioDe: ultimo.id });
  return opcoes;
}

/**
 * Assinatura do que a pessoa VIU na prévia: artes, texto, grupo e modo. O servidor recalcula na
 * hora do envio e recusa se mudou (arte nova entregue, grupo trocado, outro envio no meio).
 */
export function assinaturaDaPrevia(p: { chave: string; jid: string; plano: Pick<PlanoDeEnvio, "modo" | "artes" | "texto" | "tentativa"> }): string {
  return hashHex([p.chave, p.jid, p.plano.modo, String(p.plano.tentativa), p.plano.texto ?? "", ...p.plano.artes.map((a) => a.url)].join("\u0001"));
}

export type DecisaoDeEnvio =
  | { ok: true; plano: PlanoDeEnvio }
  | { ok: false; motivo: string };

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
}).replace(",", " às");

/** O POST: o que a pessoa confirmou (assinatura) ainda é o que vai sair? E a repetição é explícita? */
export function decidirEnvio(
  p: { chave: string; jid: string; artes: readonly ArteDoEnvio[]; texto: string; envios: readonly EnvioRegistrado[]; agoraMs: number },
  pedido: { previa?: string | null; modo?: ModoEnvio | null },
): DecisaoDeEnvio {
  const ultimo = p.envios[0];
  if (ultimo && situacaoDoEnvio(ultimo, p.agoraMs) === "enviando") {
    return { ok: false, motivo: `Estas artes já estão sendo enviadas (desde ${quando(ultimo.criado_em)}). Espere terminar e atualize a prévia.` };
  }
  const modo = pedido.modo ?? "primeiro";
  if (ultimo && modo === "primeiro") {
    return { ok: false, motivo: `Estas artes já foram enviadas ao grupo em ${quando(ultimo.criado_em)}${ultimo.enviado_por ? ` por ${ultimo.enviado_por}` : ""} (${ultimo.enviadas} de ${ultimo.total}). Para mandar de novo, use "Reenviar" na prévia.` };
  }
  const plano = opcoesDeEnvio(p.artes, p.texto, p.envios, p.agoraMs).find((o) => o.modo === modo);
  if (!plano) return { ok: false, motivo: "Essa opção de envio não vale mais — abra a prévia de novo." };
  if (!pedido.previa || pedido.previa !== assinaturaDaPrevia({ chave: p.chave, jid: p.jid, plano })) {
    return { ok: false, motivo: "O que vai sair mudou desde a prévia (arte, texto, grupo ou outro envio no meio). Confira a prévia de novo antes de enviar." };
  }
  return { ok: true, plano };
}

// ─── O envio em si (com o mensageiro injetado, para testar sem WhatsApp) ────

export interface RespostaDoMensageiro { ok: boolean; error?: string; incerto?: boolean }

/**
 * Manda as artes em ordem. Regras:
 *  · o texto vai como legenda da PRIMEIRA arte que chegar — nunca sozinho, sem arte;
 *  · falha clara (o WhatsApp respondeu erro): segue para a próxima;
 *  · sem resposta a tempo (pode ter saído): PARA, para não duplicar nem embaralhar a ordem;
 *  · orçamento de tempo estourado: não começa a próxima (a rota tem ~60 s).
 * `aoProgredir` grava o resultado parcial depois de cada arte (se o processo morrer, fica o rastro).
 */
export async function mandarArtes(
  artes: readonly ArteDoEnvio[],
  texto: string | null,
  mandar: (url: string, legenda?: string) => Promise<RespostaDoMensageiro>,
  opcoes: {
    agora?: () => number;
    orcamentoMs?: number;
    pausaMs?: number;
    esperar?: (ms: number) => Promise<void>;
    aoProgredir?: (parcial: ResultadoArte[]) => Promise<void> | void;
  } = {},
): Promise<ResultadoArte[]> {
  const agora = opcoes.agora ?? (() => Date.now());
  const orcamento = opcoes.orcamentoMs ?? ORCAMENTO_ENVIO_MS;
  const pausa = opcoes.pausaMs ?? PAUSA_ENTRE_ARTES_MS;
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const inicio = agora();
  let textoPendente = texto;
  let parar: string | null = null;
  const resultado: ResultadoArte[] = [];

  for (let i = 0; i < artes.length; i++) {
    const a = artes[i];
    if (!parar && i > 0 && agora() - inicio > orcamento) parar = "não enviada: o tempo do envio acabou";
    if (parar) { resultado.push({ id: a.id, url: a.url, ok: false, naoTentada: true, erro: parar }); continue; }

    const legenda = textoPendente ?? undefined;
    let r: RespostaDoMensageiro;
    try { r = await mandar(a.url, legenda); } catch (err) { r = { ok: false, error: err instanceof Error ? err.message : "erro" }; }

    if (r.ok) {
      resultado.push({ id: a.id, url: a.url, ok: true, comTexto: !!legenda });
      if (legenda) textoPendente = null;
    } else if (r.incerto) {
      resultado.push({ id: a.id, url: a.url, ok: false, incerto: true, comTexto: !!legenda, erro: r.error ?? "o WhatsApp não respondeu a tempo" });
      parar = "não enviada: parei depois de uma arte sem resposta, para não duplicar";
    } else {
      resultado.push({ id: a.id, url: a.url, ok: false, erro: r.error ?? "erro" });
    }
    await opcoes.aoProgredir?.(resultado.slice());
    if (!parar && i < artes.length - 1) await esperar(pausa);
  }
  return resultado;
}

export function statusDoResultado(r: readonly ResultadoArte[]): StatusEnvio {
  const ok = r.filter((x) => x.ok).length;
  if (r.length > 0 && ok === r.length) return "enviado";
  if (ok > 0) return "parcial";
  return r.some((x) => x.incerto) ? "incerto" : "falhou";
}

const nArtes = (n: number) => `${n} arte${n === 1 ? "" : "s"}`;

/**
 * Exatamente o que saiu, para a tela e para o comentário no card.
 * Ex.: "2 de 3 artes enviadas ao grupo Padaria Sol. Arte 3: HTTP 500 …"
 */
export function resumoDoEnvio(r: readonly ResultadoArte[], grupo: string): string {
  const total = r.length;
  const ok = r.filter((x) => x.ok).length;
  const partes: string[] = [];
  if (ok === 0) {
    partes.push(r.some((x) => x.incerto)
      ? `Nenhuma arte confirmada no grupo ${grupo}.`
      : `Nenhuma arte saiu — nada foi mandado ao grupo ${grupo}.`);
  } else {
    partes.push(`${ok} de ${nArtes(total)} enviada${ok === 1 ? "" : "s"} ao grupo ${grupo}.`);
  }
  r.forEach((x, i) => {
    if (x.ok) return;
    if (x.incerto) partes.push(`Arte ${i + 1}: o WhatsApp não respondeu a tempo — pode ter saído; confira no grupo antes de reenviar.`);
    else if (x.naoTentada) partes.push(`Arte ${i + 1}: ${x.erro ?? "não enviada"}.`);
    else partes.push(`Arte ${i + 1}: não saiu (${x.erro ?? "erro"}).`);
  });
  return partes.join(" ");
}
