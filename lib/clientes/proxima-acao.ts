// lib/clientes/proxima-acao.ts — A PRÓXIMA AÇÃO DE CADA CLIENTE, preenchida pelo sistema. PURO.
//
// POR QUE ISTO EXISTE (Leva 6A, set/2026). A Jornada CS tinha um campo "próxima ação" digitado à mão
// e só 7 de 60 clientes tinham alguma coisa escrita. Enquanto isso o feed de prioridades do Agente
// (lib/priority) já calculava, de hora em hora, a coisa mais importante a fazer por cliente — com o
// fato que justifica e um dono. Aqui as duas se encontram:
//
//   • SUGERIDA  — ninguém escreveu nada: vale a recomendação aberta de maior score do feed para o
//                 cliente. Sem recomendação, o texto da saúde (o mesmo que a fonte "saude" do feed usa).
//   • CONFIRMADA — alguém confirmou a sugestão ou escreveu a própria. Guarda quem e quando.
//   • NENHUMA   — cliente saudável, falando no grupo e sem nada aberto no feed.
//
// A pessoa só confirma ou edita. Onde mora: client_journey.proxima_acao (+ responsável e prazo, que
// já existiam) e as colunas da migration 20260925100000_proxima_acao_confirmada.sql (origem, quem,
// quando, fingerprint da recomendação). Sem a migration aplicada, a ação confirmada é gravada sem o
// "quem/quando" — nada quebra.
//
// Quem lê daqui: a tela Saúde da carteira (/saude), GET/POST /api/clientes/proxima-acao e a ficha do
// cliente. Mesmo cliente, mesma próxima ação, em qualquer tela.

import type { NivelSaude } from "@/lib/scores/health";
import { ROTULO_FONTE } from "@/lib/priority/motor";
import type { FonteRecomendacao } from "@/lib/priority/tipos";

/**
 * O texto da ação quando o motivo é a SAÚDE. A fonte "saude" do feed de prioridades
 * (lib/priority/fontes/saude.ts) usa estas mesmas frases — é uma recomendação só, não duas.
 */
export const ACAO_SAUDE = {
  risco: "Ligar para o cliente hoje: ouvir, registrar o que ele pediu e marcar a reunião do mês",
  atencao: "Falar com o cliente esta semana com um resultado ou uma próxima peça na mão",
  esfriando: "Mandar algo concreto no grupo (resultado, próxima peça, pergunta) — não um \"tudo bem?\"",
} as const;

// ─── Entradas ────────────────────────────────────────────────────────────────

/** O que está gravado em client_journey para o cliente. */
export interface ProximaAcaoRegistrada {
  texto: string | null;
  responsavel: string | null;
  /** YYYY-MM-DD */
  prazo: string | null;
  /** "manual" = alguém escreveu; "sugerida" = confirmou a do sistema; null = gravada antes desta leva. */
  origem: "manual" | "sugerida" | null;
  confirmadaPor: string | null;
  confirmadaEm: string | null;
  /** Fingerprint da recomendação confirmada (lib/priority/motor.ts → fingerprintDe). */
  fingerprint: string | null;
}

/** Uma recomendação ABERTA (nova/vista/aceita) do feed, deste cliente. */
export interface RecomendacaoDoCliente {
  id: string;
  fingerprint: string;
  fonte: string;
  titulo: string;
  recomendacao: string;
  fato: string[];
  score: number;
  owner: string | null;
}

export interface SaudeParaAcao {
  nivel: NivelSaude;
  esfriando: boolean;
  /** Os porquês da situação (lib/saude/carteira.ts → situacaoDaSaude().motivos). */
  motivos?: string[];
  /** Pausado não recebe nada — nem sugestão de contato. */
  pausado?: boolean;
}

// ─── Saída ───────────────────────────────────────────────────────────────────

export interface Sugestao {
  texto: string;
  /** O fato que justifica (1ª evidência da recomendação, ou o 1º porquê da saúde). */
  porque: string | null;
  /** Rótulo da fonte ("Tráfego", "Saúde do cliente"…). */
  fonte: string;
  responsavel: string | null;
  recomendacaoId: string | null;
  fingerprint: string | null;
}

export type EstadoProximaAcao = "confirmada" | "sugerida" | "nenhuma";

export interface ProximaAcao {
  estado: EstadoProximaAcao;
  texto: string | null;
  porque: string | null;
  responsavel: string | null;
  prazo: string | null;
  /** Prazo já passou (em São Paulo). */
  vencida: boolean;
  /** "pessoa" = alguém escreveu; "sistema" = veio do feed/saúde (confirmada ou só sugerida). */
  origem: "pessoa" | "sistema" | null;
  fonte: string | null;
  recomendacaoId: string | null;
  fingerprint: string | null;
  confirmadaPor: string | null;
  confirmadaEm: string | null;
  /** Com uma ação confirmada: a sugestão atual do sistema, quando é OUTRA coisa. A tela oferece trocar. */
  outraSugestao: Sugestao | null;
}

// ─── Regras ──────────────────────────────────────────────────────────────────

const limpo = (s: string | null | undefined) => (s ?? "").trim();
const mesmoTexto = (a: string | null | undefined, b: string | null | undefined) =>
  limpo(a).toLowerCase().replace(/\s+/g, " ") === limpo(b).toLowerCase().replace(/\s+/g, " ");

function rotuloFonte(fonte: string): string {
  return ROTULO_FONTE[fonte as FonteRecomendacao] ?? fonte;
}

/**
 * O que o sistema sugere para o cliente AGORA, sem olhar o que está gravado: a recomendação aberta de
 * maior score; sem nenhuma, o texto da saúde (risco → atenção → esfriando). Pausado não tem sugestão.
 */
export function sugestaoDoSistema(p: {
  recomendacoes: readonly RecomendacaoDoCliente[];
  saude?: SaudeParaAcao | null;
  dono?: string | null;
}): Sugestao | null {
  if (p.saude?.pausado) return null;
  const top = [...p.recomendacoes]
    .filter((r) => limpo(r.recomendacao))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
  if (top) {
    return {
      texto: limpo(top.recomendacao),
      porque: limpo(top.fato?.[0]) || limpo(top.titulo) || null,
      fonte: rotuloFonte(top.fonte),
      responsavel: top.owner || p.dono || null,
      recomendacaoId: top.id,
      fingerprint: top.fingerprint,
    };
  }
  const s = p.saude;
  if (!s) return null;
  const chave = s.nivel === "risco" ? "risco" : s.nivel === "atencao" ? "atencao" : s.esfriando ? "esfriando" : null;
  if (!chave) return null;
  return {
    texto: ACAO_SAUDE[chave],
    porque: limpo(s.motivos?.[0]) || null,
    fonte: rotuloFonte("saude"),
    responsavel: p.dono || null,
    recomendacaoId: null,
    fingerprint: null,
  };
}

/**
 * A próxima ação do cliente — a mesma na tela Saúde da carteira, na ficha e na API.
 *
 * Gravada (confirmada ou escrita) vence a sugestão; sem nada gravado, vale a sugestão do sistema.
 */
export function proximaAcaoDoCliente(p: {
  registrada: ProximaAcaoRegistrada | null;
  recomendacoes: readonly RecomendacaoDoCliente[];
  saude?: SaudeParaAcao | null;
  /** Dono do relacionamento (lib/saude/carteira.ts → donoDoCliente), já com o nome do cadastro. */
  dono?: string | null;
  /** Hoje em São Paulo, YYYY-MM-DD — decide se o prazo venceu. */
  hoje: string;
}): ProximaAcao {
  const sugestao = sugestaoDoSistema(p);
  const r = p.registrada;

  if (r && limpo(r.texto)) {
    const prazo = r.prazo ? r.prazo.slice(0, 10) : null;
    // A confirmada veio da recomendação que continua aberta? Então o fato dela ainda explica a ação.
    const mesmaRec = !!r.fingerprint && sugestao?.fingerprint === r.fingerprint ? sugestao : null;
    const outra = sugestao && !mesmaRec && !mesmoTexto(sugestao.texto, r.texto) ? sugestao : null;
    return {
      estado: "confirmada",
      texto: limpo(r.texto),
      porque: mesmaRec?.porque ?? null,
      responsavel: limpo(r.responsavel) || p.dono || null,
      prazo,
      vencida: !!prazo && prazo < p.hoje,
      origem: r.origem === "sugerida" ? "sistema" : "pessoa",
      fonte: mesmaRec?.fonte ?? null,
      recomendacaoId: mesmaRec?.recomendacaoId ?? null,
      fingerprint: r.fingerprint,
      confirmadaPor: r.confirmadaPor,
      confirmadaEm: r.confirmadaEm,
      outraSugestao: outra,
    };
  }

  if (sugestao) {
    return {
      estado: "sugerida",
      texto: sugestao.texto,
      porque: sugestao.porque,
      responsavel: sugestao.responsavel,
      prazo: null,
      vencida: false,
      origem: "sistema",
      fonte: sugestao.fonte,
      recomendacaoId: sugestao.recomendacaoId,
      fingerprint: sugestao.fingerprint,
      confirmadaPor: null,
      confirmadaEm: null,
      outraSugestao: null,
    };
  }

  return {
    estado: "nenhuma", texto: null, porque: null, responsavel: p.dono || null, prazo: null, vencida: false,
    origem: null, fonte: null, recomendacaoId: null, fingerprint: null, confirmadaPor: null, confirmadaEm: null,
    outraSugestao: null,
  };
}

// ─── Banco (client_journey) ─────────────────────────────────────────────────

/** Colunas que a migration 20260925100000 cria. Sem ela, a gravação cai para as colunas antigas. */
export const COLUNAS_CONFIRMACAO = [
  "proxima_acao_origem", "proxima_acao_confirmada_por", "proxima_acao_confirmada_em", "proxima_acao_fingerprint",
] as const;

/** Linha de client_journey (select "*") → o que está gravado. null quando não há linha. */
export function registradaDaLinha(row: Record<string, unknown> | null | undefined): ProximaAcaoRegistrada | null {
  if (!row) return null;
  const s = (k: string) => (typeof row[k] === "string" && (row[k] as string).trim() ? (row[k] as string).trim() : null);
  const origem = s("proxima_acao_origem");
  return {
    texto: s("proxima_acao"),
    responsavel: s("proxima_acao_responsavel"),
    prazo: s("proxima_acao_prazo"),
    origem: origem === "manual" || origem === "sugerida" ? origem : null,
    confirmadaPor: s("proxima_acao_confirmada_por"),
    confirmadaEm: s("proxima_acao_confirmada_em"),
    fingerprint: s("proxima_acao_fingerprint"),
  };
}

export type PatchJornada = Record<string, string | null>;

/** Confirmar a sugestão do sistema: o texto dela vira a próxima ação, com quem e quando. */
export function patchConfirmar(s: Sugestao, quem: string, agoraIso: string): PatchJornada {
  return {
    proxima_acao: s.texto,
    proxima_acao_responsavel: s.responsavel,
    // Sugestão não tem prazo: não herda o de uma ação antiga (apareceria "venceu" sem motivo).
    proxima_acao_prazo: null,
    proxima_acao_origem: "sugerida",
    proxima_acao_fingerprint: s.fingerprint,
    proxima_acao_confirmada_por: quem,
    proxima_acao_confirmada_em: agoraIso,
  };
}

/** Escrever a própria (ou corrigir a sugerida): escrever é confirmar. */
export function patchEditar(
  e: { texto: string; responsavel?: string | null; prazo?: string | null },
  quem: string,
  agoraIso: string,
): PatchJornada {
  return {
    proxima_acao: limpo(e.texto).slice(0, 500),
    proxima_acao_responsavel: limpo(e.responsavel) || null,
    proxima_acao_prazo: /^\d{4}-\d{2}-\d{2}$/.test(limpo(e.prazo)) ? limpo(e.prazo) : null,
    proxima_acao_origem: "manual",
    proxima_acao_fingerprint: null,
    proxima_acao_confirmada_por: quem,
    proxima_acao_confirmada_em: agoraIso,
  };
}

/** Feita: limpa. A próxima sugestão do sistema aparece sozinha. */
export function patchConcluir(): PatchJornada {
  return {
    proxima_acao: null, proxima_acao_responsavel: null, proxima_acao_prazo: null,
    proxima_acao_origem: null, proxima_acao_fingerprint: null,
    proxima_acao_confirmada_por: null, proxima_acao_confirmada_em: null,
  };
}

/** O mesmo patch sem as colunas novas — para gravar antes de a migration estar aplicada. */
export function semColunasNovas(p: PatchJornada): PatchJornada {
  const out: PatchJornada = {};
  for (const [k, v] of Object.entries(p)) if (!(COLUNAS_CONFIRMACAO as readonly string[]).includes(k)) out[k] = v;
  return out;
}

/** O erro do PostgREST é de coluna que ainda não existe? (migration não aplicada) */
export function ehColunaAusente(msg: string | null | undefined): boolean {
  const m = (msg ?? "").toLowerCase();
  return (m.includes("column") || m.includes("coluna")) && (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"))
    && COLUNAS_CONFIRMACAO.some((c) => m.includes(c));
}
