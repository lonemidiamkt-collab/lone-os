// lib/cs/manha.ts — UMA mensagem de manhã no lugar de quatro (bom-dia, postagem, pendências, setup).
//
// O time recebia 21 mensagens por dia no grupo; só de manhã eram quatro rotinas em uma hora. Aqui
// cada seção chega pronta do builder de sempre (mesma lógica, mesmas palavras) e só se decide o que
// entra e em que ordem. Seção vazia some; se nada tem conteúdo, não sai mensagem nenhuma.
//
// Módulo PURO (sem banco, sem rede) — a rota cs-manha junta os dados e chama daqui.

import { textoPorDono, SEM_DONO, type BlocoDono } from "@/lib/cs/cobranca-nominal";
import { manchetePanorama, filasPanorama, type PanoramaBomDia } from "@/lib/reports/bomDiaPdf";

export type ChaveSecao = "bom-dia" | "postagem" | "pendencias" | "setup";

export interface SecaoManha {
  chave: ChaveSecao;
  /** "" = nada a dizer; a seção some. */
  texto: string;
  /** Chaves do porta-voz que esta seção afirma (as mesmas que a rota antiga declarava). */
  fatos?: string[];
  /** Só moldura (a saudação de um dia sem fila): acompanha as outras, mas sozinha não vira mensagem. */
  soMoldura?: boolean;
}

export interface Manha {
  texto: string;
  secoes: ChaveSecao[];
  fatos: string[];
}

const ORDEM: ChaveSecao[] = ["bom-dia", "postagem", "pendencias", "setup"];
export const DIVISOR_MANHA = "———";

/** Junta as seções com conteúdo, na ordem fixa. null = nada a dizer hoje. */
export function montarManha(secoes: SecaoManha[]): Manha | null {
  const cheias = secoes
    .filter((s) => s.texto.trim())
    .sort((a, b) => ORDEM.indexOf(a.chave) - ORDEM.indexOf(b.chave));
  if (!cheias.some((s) => !s.soMoldura)) return null;
  return {
    texto: cheias.map((s) => s.texto.trim()).join(`\n\n${DIVISOR_MANHA}\n\n`),
    secoes: cheias.map((s) => s.chave),
    fatos: [...new Set(cheias.flatMap((s) => s.fatos ?? []))],
  };
}

/**
 * A seção do bom-dia: a manchete (sem o "mandei em PDF", que aqui não existe) + o de cada um.
 * `rotulo` troca o nome pela menção real quando a mensagem sai como texto.
 */
export function secaoBomDia(p: {
  panorama: PanoramaBomDia;
  blocos: BlocoDono[];
  fatos?: string[];
  rotulo?: (dono: string) => string;
}): SecaoManha {
  const texto = [manchetePanorama(p.panorama, null), textoPorDono(p.blocos, p.rotulo)].filter(Boolean).join("\n");
  return {
    chave: "bom-dia", texto, fatos: p.fatos,
    soMoldura: !filasPanorama(p.panorama) && !p.blocos.length,
  };
}

/** Seção de pendências: o aviso das que morreram hoje vem antes do lembrete das vivas. */
export function secaoPendencias(arquivadas: string, lembrete: string): SecaoManha {
  return { chave: "pendencias", texto: [arquivadas, lembrete].filter((t) => t.trim()).join("\n\n") };
}

const NO_PDF: Record<Exclude<ChaveSecao, "bom-dia">, string> = {
  postagem: "pauta de hoje",
  pendencias: "sugestões esperando ok/não",
  setup: "setup de cliente novo",
};

/**
 * Legenda do PDF: tem que bastar pra decidir se abre agora. Filas do dia, o que tem dentro, e de
 * quem é cada pedaço (com a menção, que é o que notifica).
 */
export function resumoManha(p: {
  panorama: PanoramaBomDia | null;
  secoes: ChaveSecao[];
  blocos: BlocoDono[];
  rotulo: (dono: string) => string;
}): string {
  const l: string[] = [];
  const filas = p.panorama ? filasPanorama(p.panorama) : "";
  if (filas) l.push(filas);
  const dentro = [
    p.blocos.length && p.secoes.includes("bom-dia") ? "o de cada um" : "",
    ...p.secoes.filter((k): k is Exclude<ChaveSecao, "bom-dia"> => k !== "bom-dia").map((k) => NO_PDF[k]),
  ].filter(Boolean);
  if (dentro.length) l.push(`No PDF: ${dentro.join(" · ")}`);
  if (p.blocos.length && p.secoes.includes("bom-dia")) {
    const quem = p.blocos.map((b) => `${b.dono === SEM_DONO ? "_sem dono_" : p.rotulo(b.dono)} (${b.itens.length + b.resto})`);
    l.push(`👤 ${quem.join(" · ")}`);
  }
  return l.join("\n");
}
