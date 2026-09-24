// lib/cs/risco-semanal.ts — UM aviso semanal de clientes pedindo atenção, uma seção por dono.
//
// Substitui a segunda-feira de cs-esfriando + cs-risco: dois recados sobre os mesmos clientes, com
// critérios próprios (o risco tinha "score >= 3" local) e sem dizer de quem era cada um. Aqui:
//   • o nível vem do modelo ÚNICO de saúde (/api/scores → clients.current_health_level)
//   • o porquê vem do breakdown gravado (client_health_scores.breakdown.motivos)
//   • "esfriando" = o cliente não fala no grupo há 7+ dias (last_client_msg_at), mesmo corte do cs-esfriando
//   • cada cliente cai no dono dele (social; sem social, o tráfego) — cobrança nominal
//
// Módulo PURO — a rota cs-risco-semanal busca os dados e chama daqui.

import type { NivelSaude } from "@/lib/scores/health";
import { LIMIAR_ATENCAO, LIMIAR_SAUDAVEL } from "@/lib/scores/health";
import { SEM_DONO } from "@/lib/cs/cobranca-nominal";

/** Mesmo corte do cs-esfriando e do snapshot: sumiu do grupo há N dias ou mais. */
export const DIAS_ESFRIANDO = 7;
/** Mais que isso por pessoa vira lista, não conversa da semana. */
export const POR_DONO = 6;
const MOTIVOS_POR_CLIENTE = 3;

export interface ClienteSemana {
  cliente: string;
  /** Dono já canonizado (social; sem social, tráfego). null = ninguém atribuído. */
  dono: string | null;
  nivel: NivelSaude;
  score: number | null;
  /** breakdown.motivos do dia — já em frase ("Relacionamento em 40", "3 pedidos sem resposta…"). */
  motivos: string[];
  /** Dias desde a última fala do cliente no grupo. null = nunca falou (sem base pra dizer que esfriou). */
  diasQuieto: number | null;
}

export interface BlocoSemana {
  dono: string;
  clientes: ClienteSemana[];
  /** Quantos ficaram de fora do corte. */
  resto: number;
  risco: number;
}

export const esfriou = (c: ClienteSemana) => c.diasQuieto !== null && c.diasQuieto >= DIAS_ESFRIANDO;

/** Entra no aviso: saúde em risco/atenção, ou cliente que parou de falar. */
export function entraNaSemana(c: ClienteSemana): boolean {
  return c.nivel === "risco" || c.nivel === "atencao" || esfriou(c);
}

const pesoNivel = (c: ClienteSemana) => (c.nivel === "risco" ? 0 : c.nivel === "atencao" ? 1 : 2);

/** Pior primeiro: risco, atenção, só-esfriando; dentro disso, menor nota e mais tempo calado. */
function ordenar(a: ClienteSemana, b: ClienteSemana): number {
  return pesoNivel(a) - pesoNivel(b)
    || (a.score ?? 101) - (b.score ?? 101)
    || (b.diasQuieto ?? -1) - (a.diasQuieto ?? -1)
    || a.cliente.localeCompare(b.cliente);
}

export function agruparSemana(clientes: ClienteSemana[]): BlocoSemana[] {
  const mapa = new Map<string, ClienteSemana[]>();
  for (const c of clientes.filter(entraNaSemana)) {
    const k = c.dono?.trim() || SEM_DONO;
    (mapa.get(k) ?? mapa.set(k, []).get(k)!).push(c);
  }
  const blocos: BlocoSemana[] = [...mapa.entries()].map(([dono, lista]) => {
    lista.sort(ordenar);
    return {
      dono,
      clientes: lista.slice(0, POR_DONO),
      resto: Math.max(0, lista.length - POR_DONO),
      risco: lista.filter((c) => c.nivel === "risco").length,
    };
  });
  // Quem tem mais cliente em risco abre; "sem dono" fecha — é recado pro time, mas não some.
  return blocos.sort((a, b) => {
    if ((a.dono === SEM_DONO) !== (b.dono === SEM_DONO)) return a.dono === SEM_DONO ? 1 : -1;
    return b.risco - a.risco || (b.clientes.length + b.resto) - (a.clientes.length + a.resto) || a.dono.localeCompare(b.dono);
  });
}

/** O porquê de um cliente: o esfriando (medido na conversa) primeiro, depois o que o score apontou. */
export function motivosDoCliente(c: ClienteSemana): string[] {
  const out: string[] = [];
  if (esfriou(c)) out.push(`sem falar no grupo há ${c.diasQuieto} dias`);
  // O score já traz "N dias sem contato"/"não falou nada" — repetir ao lado do esfriando é ruído.
  const doScore = c.motivos.filter((m) => m?.trim() && !(esfriou(c) && /sem contato|não falou nada/i.test(m)));
  out.push(...doScore);
  return out.slice(0, MOTIVOS_POR_CLIENTE);
}

const MARCA: Record<NivelSaude, string> = { risco: "🔴", atencao: "🟡", saudavel: "👀", sem_dado: "👀" };

function linhaCliente(c: ClienteSemana): string {
  const nota = (c.nivel === "risco" || c.nivel === "atencao") && c.score !== null ? ` (${Math.round(c.score)})` : "";
  const porque = motivosDoCliente(c);
  return `• ${MARCA[c.nivel]} *${c.cliente}*${nota}${porque.length ? ` — ${porque.join("; ")}` : ""}`;
}

export interface Contagem { risco: number; atencao: number; esfriando: number }

export function contar(todos: ClienteSemana[]): Contagem {
  const dentro = todos.filter(entraNaSemana);
  return {
    risco: dentro.filter((c) => c.nivel === "risco").length,
    atencao: dentro.filter((c) => c.nivel === "atencao").length,
    esfriando: dentro.filter(esfriou).length,
  };
}

export function linhaContagem(n: Contagem): string {
  return [
    n.risco ? `🔴 ${n.risco} em risco` : "",
    n.atencao ? `🟡 ${n.atencao} em atenção` : "",
    n.esfriando ? `👀 ${n.esfriando} esfriando` : "",
  ].filter(Boolean).join(" · ");
}

/**
 * O aviso. "" quando ninguém entra — semana sem cliente pedindo atenção não merece mensagem.
 * `rotulo` troca "*Nome*" pela menção real quando sai como texto.
 */
export function textoRiscoSemanal(
  clientes: ClienteSemana[],
  semanaLabel: string,
  rotulo: (dono: string) => string = (d) => `*${d}*`,
): string {
  const blocos = agruparSemana(clientes);
  if (!blocos.length) return "";
  const l: string[] = [`🩺 *Clientes pedindo atenção* — semana de ${semanaLabel}`, linhaContagem(contar(clientes))];
  for (const b of blocos) {
    const total = b.clientes.length + b.resto;
    l.push("", `👤 ${b.dono === SEM_DONO ? "_sem dono_" : rotulo(b.dono)} — ${total}`);
    for (const c of b.clientes) l.push(linhaCliente(c));
    if (b.resto) l.push(`_+${b.resto} na lista de saúde_`);
  }
  l.push("", `_🔴 saúde abaixo de ${LIMIAR_ATENCAO} · 🟡 ${LIMIAR_ATENCAO} a ${LIMIAR_SAUDAVEL - 1} (100 = saudável) · 👀 ${DIAS_ESFRIANDO}+ dias sem falar. O porquê completo está na ficha do cliente._`);
  return l.join("\n");
}

/** Legenda do PDF: a contagem e de quem é cada pedaço. */
export function resumoRiscoSemanal(clientes: ClienteSemana[], rotulo: (dono: string) => string): string {
  const blocos = agruparSemana(clientes);
  const quem = blocos.map((b) => `${b.dono === SEM_DONO ? "_sem dono_" : rotulo(b.dono)} (${b.clientes.length + b.resto})`);
  return [linhaContagem(contar(clientes)), quem.length ? `👤 ${quem.join(" · ")}` : ""].filter(Boolean).join("\n");
}
