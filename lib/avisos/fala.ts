// lib/avisos/fala.ts — O PAINEL FALA OS AVISOS (o lado do navegador). Regras do servidor: ./regras.ts.
//
// Roberto (05/10/2026): "como se o sistema falasse com a gente ... o cliente Bruno Tintas caiu o
// resultado, no computador do Júlio". v1 (dc24181) falava demais; a v2 (mesmo dia) fala só o que
// exige ação em minutos, só pra quem age, com teto e horário — ver o porquê em ./regras.ts.
//
//  - TRÁFEGO (gestor do cliente; sócio só se ligar a voz): o SERVIDOR decide e marca `falar` na
//    notificação (conta parada, saldo zerado, teto, horário, grupo de controle do teste). O painel
//    só obedece.
//  - ARTE (social e designer, debddc9): arte entregue/adicionada, só do cliente da própria pessoa
//    (ou aviso dirigido a ela) e só no horário comercial.
//
// Limites do navegador: o painel precisa estar aberto e a pessoa precisa ter clicado nele desde que
// abriu (sem isso o Chrome bloqueia a fala). Com várias abas, só uma fala (./lider.ts).

import type { AppNotification } from "@/lib/types";

import { TETO_FALAS_DIA, dentroDoHorario, relogioSP } from "./regras";

/** Tráfego: quem cuida de conta e os sócios (esses só se ligarem). Arte: quem produz e publica. */
const OUVE_TRAFEGO = new Set(["traffic", "manager", "admin"]);
const OUVE_ARTE = new Set(["social", "designer"]);

export function podeOuvir(papel: string | null | undefined): boolean {
  const p = String(papel ?? "");
  return OUVE_TRAFEGO.has(p) || OUVE_ARTE.has(p);
}

/** Aviso sobre ARTE entrando — designer entregou ou o social adicionou. */
export function ehAvisoDeArte(n: Pick<AppNotification, "type" | "title" | "body">): boolean {
  if (n.type !== "content") return false;
  const t = `${n.title} ${n.body}`.toLowerCase();
  return /arte (entregue|pronta|adicionad|nova)|entregou a arte|nova arte|arte do designer|designer entregou/.test(t);
}

export interface ContextoFala {
  papel: string | null | undefined;
  /** A pessoa deixou a voz ligada (preferência guardada no servidor). */
  ligada: boolean;
  /** Nome de quem está no painel — o mesmo de clients.assigned_*. */
  eu: string;
  /** Dono do cliente do aviso (só importa pra arte). null = cliente não encontrado. */
  dono?: { social?: string | null; designer?: string | null } | null;
  agora?: Date;
}

type Falavel = Pick<AppNotification, "type" | "title" | "body"> & Partial<Pick<AppNotification, "falar" | "paraMim">>;

export function deveFalar(n: Falavel, c: ContextoFala): boolean {
  if (!c.ligada || !dentroDoHorario(c.agora ?? new Date())) return false;
  const p = String(c.papel ?? "");
  if (n.type === "trafego") return OUVE_TRAFEGO.has(p) && n.falar === true;
  if (ehAvisoDeArte(n) && OUVE_ARTE.has(p)) {
    if (n.paraMim) return true;
    const dono = p === "social" ? c.dono?.social : c.dono?.designer;
    return !!dono && dono.trim() === c.eu.trim(); // arte do cliente de OUTRA pessoa não fala aqui
  }
  return false;
}

// ── Arte: agrupar e limitar (o servidor não decide a arte, então a disciplina mora aqui) ─────────
//
// Avisos de arte no banco (14 dias até 05/10): 4 a 126 por dia — 126 em 23/09. Falar um por um
// transformaria a voz em barulho de fundo no primeiro dia. Então: as artes do mesmo cliente que
// chegam juntas viram UMA frase, e vale o mesmo teto diário do tráfego.

export interface GrupoArte { chave: string; frase: string; ids: string[] }

/** Junta os avisos de arte por cliente: "3 artes da Veneza Estofados chegaram." */
export function agruparArte(avisos: Pick<AppNotification, "id" | "title" | "body" | "clientId">[], nomeDoCliente: (id: string) => string | null): GrupoArte[] {
  const porCliente = new Map<string, Pick<AppNotification, "id" | "title" | "body" | "clientId">[]>();
  for (const a of avisos) {
    const k = a.clientId ?? `sem-cliente:${a.id}`;
    porCliente.set(k, [...(porCliente.get(k) ?? []), a]);
  }
  return [...porCliente.entries()].map(([chave, lista]) => {
    const nome = lista[0].clientId ? nomeDoCliente(lista[0].clientId) : null;
    const frase = lista.length === 1
      ? (nome ? `Chegou uma arte da ${nome}. Vale dar uma olhada.` : fraseParaFalar(lista[0].title, lista[0].body))
      : `Chegaram ${lista.length} artes ${nome ? `da ${nome}` : "novas"}. Vale dar uma olhada.`;
    return { chave, frase, ids: lista.map((a) => a.id) };
  });
}

export type VezDaArte = "falar" | "avisar_teto" | "mudo";

/** Contador de falas de arte do dia, por navegador (só a aba eleita fala, então ele não duplica). */
export function vezDaArte(agora: Date = new Date()): VezDaArte {
  try {
    const chave = `lone:falas-arte:${relogioSP(agora).dia}`;
    const n = Number(localStorage.getItem(chave) ?? "0") || 0;
    localStorage.setItem(chave, String(n + 1));
    if (n < TETO_FALAS_DIA) return "falar";
    if (n === TETO_FALAS_DIA) return "avisar_teto";
    return "mudo";
  } catch {
    return "falar";
  }
}

export const FRASE_TETO_ARTE = `Já são ${TETO_FALAS_DIA} avisos de arte falados hoje. As próximas artes ficam só no sino.`;

/**
 * A frase falada. O que fez a amostra aprovada (versão C, 05/10) soar como gente:
 *  - chama a pessoa pelo primeiro nome no começo ("Lucas, ...");
 *  - valor em reais como se fala: "R$ 3,53" → "3 e 53"; acima de 100 reais, sem centavos;
 *  - sem emoji, sem marcação do WhatsApp (*, _), sem link — "asterisco SALDO asterisco" é ruído.
 */
export function fraseParaFalar(titulo: string, corpo = "", pessoa?: string | null, max = 300): string {
  const limpar = (x: string) => x
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[*_~`]/g, "")
    .replace(/R\$\s?([\d.]+),(\d{2})/g, (_, r, c) => {
      const reais = Number(r.replace(/\./g, ""));
      return reais < 100 && c !== "00" ? `${reais} e ${Number(c)}` : `${reais} reais`;
    })
    .replace(/R\$\s?([\d.]+)/g, (_, r) => `${r.replace(/\./g, "")} reais`)
    .replace(/\s+/g, " ")
    .trim();
  const t = limpar(titulo).replace(/[.:—-]+$/, "");
  const c = limpar(corpo);
  let frase = c ? `${t}. ${c}` : t;
  const nome = (pessoa ?? "").trim().split(/\s+/)[0];
  // "A conta..." → "Julio, a conta..." (sigla como "CPL" não vira minúscula)
  if (nome) {
    const primeira = frase.split(/\s/)[0] ?? "";
    const sigla = primeira.length >= 2 && primeira === primeira.toUpperCase();
    frase = `${nome}, ${sigla ? frase : frase.charAt(0).toLowerCase() + frase.slice(1)}`;
  }
  if (frase.length > max) {
    const corte = frase.lastIndexOf(".", max);
    frase = corte > max * 0.5 ? frase.slice(0, corte + 1) : `${frase.slice(0, max).replace(/\s+\S*$/, "")}.`;
  }
  return frase;
}

// ── Navegador ────────────────────────────────────────────────────────────────

// A parte que TOCA (voz natural + reserva do navegador) mora em ./tocar.ts — este arquivo também
// é lido pelo servidor e não pode depender do navegador.
