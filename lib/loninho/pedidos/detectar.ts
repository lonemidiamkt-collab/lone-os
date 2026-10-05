// lib/loninho/pedidos/detectar.ts — reconhece o pedido do time (texto ou áudio transcrito). Puro.
//
// Regra em código, não em modelo: o pedido precisa (1) chamar o agente pelo nome, (2) ter um verbo,
// uma pergunta ou ser curto (até 8 palavras) e (3) bater com o assunto de UM pedido do catálogo. Conversa comum que só cita
// "atenção" ou "resultado" não dispara PDF.

import type { IdPedido } from "./catalogo";

export interface PedidoLido {
  id: IdPedido;
  /** "equipe" só vale pra sócio e gestão (atender.ts confere). */
  escopo: "meu" | "equipe";
  /** Pros resultados da semana: o que a pessoa quer ver primeiro. */
  foco: "todos" | "bons" | "ruins";
}

const CHAMA = /\blon(e|inho|ezinho)\b/i;
const PEDE = /\b(manda|mande|me (passa|mostra|envia|traz|d[aá]|fala)|envia|mostra|quero|quais|quem|lista|gera|gere|faz|fa[cç]a|tem como|pode|preciso (ver|saber))\b|\?\s*$/i;

/** Ordem importa: o primeiro que bater ganha. */
const ASSUNTOS: [IdPedido, RegExp][] = [
  ["manual", /\b(manual|o que (voc[eê] |vc )?(sabe|consegue|pode) fazer|quais (s[aã]o )?(os )?(seus )?comandos|lista de comandos|como (eu )?(te )?pe[cç]o)\b/i],
  ["atencao_hoje", /\b(precisa[mn]? (d[ae] )?(minha |sua |nossa |da |de )?aten[cç][aã]o|aten[cç][aã]o (hoje|agora)|pedem aten[cç][aã]o|(clientes?|contas?) em risco|quem precisa de mim)\b/i],
  ["resultados_semana", /\b(bons? resultados?|resultados? (bons|ruins)|resultados? d[aeo]s? (semana|clientes)|resultados? (dessa|desta|da|na) semana|quem (foi|est[aá]|t[aá]|teve) (bem|mal)|melhoraram|pioraram|n[aã]o tiveram (bons? )?resultados?|destaques? d[aoe]s? (semana|tr[aá]fego)|como foi a semana)\b/i],
  ["diagnostico_trafego", /\b(diagn[oó]stico|como est[aã]o as contas|sa[uú]de das contas)\b/i],
];

export function chamaOLoninho(texto: string): boolean {
  return CHAMA.test(String(texto ?? "").replace(/\blone\s*m[ií]dia\b/gi, ""));
}

export function lerPedidoDoTime(texto: string): PedidoLido | null {
  const t = String(texto ?? "").trim();
  // Pedido curto sem verbo também vale ("Lone, clientes em risco da equipe"); frase longa que só
  // CITA o assunto ("o Julio falou dos resultados da semana na reunião") precisa de verbo de pedido.
  const curto = t.split(/\s+/).filter(Boolean).length <= 8;
  if (!t || !chamaOLoninho(t) || !(PEDE.test(t) || curto)) return null;
  const achado = ASSUNTOS.find(([, re]) => re.test(t));
  if (!achado) return null;
  const equipe = /\b(da equipe|do time|de todo mundo|de todos|geral|da ag[eê]ncia|da carteira (toda|inteira))\b/i.test(t);
  const bons = /\b(bons?|bem|melhoraram|melhores)\b/i.test(t) && !/\bn[aã]o tiveram bons\b/i.test(t);
  const ruins = /\b(ruins?|mal|pioraram|piores|n[aã]o tiveram)\b/i.test(t);
  return {
    id: achado[0],
    escopo: equipe ? "equipe" : "meu",
    foco: bons && !ruins ? "bons" : ruins && !bons ? "ruins" : "todos",
  };
}
