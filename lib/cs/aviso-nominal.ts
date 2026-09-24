// lib/cs/aviso-nominal.ts — aviso com menção de verdade, no formato que o volume pedir.
//
// Em texto, a menção vai no corpo (@número + `mentioned`). Em PDF, número dentro do documento não
// notifica ninguém: o corpo leva o nome e a menção vai na legenda. Sem número cadastrado, fica o
// nome — um "@" que não notifica engana (lib/cs/mencao.ts).
//
// O ?dry=1 passa pelo mesmo caminho até a porta do envio: devolve o corpo e a legenda exatos.

import { enviarAviso, contarItens, legendaDoAviso } from "@/lib/cs/enviar-aviso";
import { escolherFormato, type Formato } from "@/lib/cs/formato-aviso";
import { mencionar, type Mencao } from "@/lib/cs/mencao";
import type { CsSendMeta } from "@/lib/cs/notify";

export type Rotulo = (dono: string) => string;

export interface ResultadoNominal {
  formato: Formato;
  /** Corpo exato: a mensagem (texto) ou o conteúdo do PDF. */
  texto: string;
  /** Legenda exata do PDF; null quando vai como texto. */
  legenda: string | null;
  mencionados: string[];
  enviado: boolean;
  erro?: string;
}

export async function avisoNominal(p: {
  jid: string | null;
  dry: boolean;
  /** Nomes como aparecem no texto — cada um vira menção quando há número. */
  donos: string[];
  titulo: string;
  montar: (rotulo: Rotulo) => string;
  resumo: (rotulo: Rotulo) => string;
  meta: CsSendMeta;
}): Promise<ResultadoNominal> {
  const mencoes = new Map<string, Mencao>();
  for (const d of new Set(p.donos)) {
    mencoes.set(d, await mencionar(d).catch(() => ({ trecho: "", jids: [] as string[], notifica: false })));
  }
  const porNome: Rotulo = (d) => `*${d}*`;
  const porMencao: Rotulo = (d) => {
    const m = mencoes.get(d);
    return m?.notifica ? m.trecho : `*${d}*`;
  };
  const jids = [...new Set([...mencoes.values()].flatMap((m) => m.jids))];

  const comMencao = p.montar(porMencao);
  const formato = escolherFormato({ itens: contarItens(comMencao), texto: comMencao });
  const texto = formato === "texto" ? comMencao : p.montar(porNome);
  const resumo = formato === "pdf" ? p.resumo(porMencao) : undefined;
  const legenda = formato === "pdf" ? legendaDoAviso({ titulo: p.titulo, resumo }) : null;

  if (p.dry || !p.jid) return { formato, texto, legenda, mencionados: jids, enviado: false };

  const r = await enviarAviso(p.jid, texto, { titulo: p.titulo, resumo, mencionados: jids, forcar: formato }, p.meta);
  return {
    // Render do PDF caiu → enviarAviso voltou pro texto; o resultado diz o que de fato saiu.
    formato: r.formato, texto, legenda: r.formato === "pdf" ? legenda : null,
    mencionados: jids, enviado: r.ok, erro: r.error,
  };
}
