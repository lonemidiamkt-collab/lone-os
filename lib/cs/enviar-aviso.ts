// lib/cs/enviar-aviso.ts — o ponto ÚNICO por onde todo aviso interno do agente sai.
//
// Roberto pediu PDF três vezes, em contextos diferentes (03/09 bom-dia, 11/09 véspera, 11/09 setup),
// e as três correções foram feitas separadamente — cada uma com seu gerador, seu limite e seu jeito.
// Foi assim que o bom-dia acabou mandando quatro PDFs de UMA linha enquanto a véspera de 11 itens
// saía como texto cortado no "Ler mais".
//
// Aqui a decisão mora num lugar só: quem manda aviso chama esta função e não escolhe formato.
// Curto vai como texto, longo vai como PDF, e se o render falhar volta ao texto — porque aviso que
// SOME é pior que aviso comprido.

import { csSendGroupText } from "@/lib/cs/notify";
import type { CsSendMeta } from "@/lib/cs/notify";
import { escolherFormato } from "@/lib/cs/formato-aviso";

export interface OpcoesAviso {
  /** Cabeçalho do PDF e primeira linha da legenda. Ex.: "Setup de cliente novo". */
  titulo: string;
  /** Nome do arquivo, sem extensão. Sai do título quando não informado. */
  arquivo?: string;
  /** Uma frase que resume o aviso. Vai na legenda para não ser preciso abrir o PDF pra saber se é urgente. */
  resumo?: string;
  /** JIDs a mencionar de verdade. */
  mencionados?: string[];
  /** Força o formato. Use só em teste ou quando o formato é exigência do próprio aviso. */
  forcar?: "texto" | "pdf";
}

export interface ResultadoAviso {
  ok: boolean;
  formato: "texto" | "pdf";
  error?: string;
}

/** Conta os itens de lista do texto — é o que decide o formato junto com o tamanho. */
export function contarItens(texto: string): number {
  return (texto ?? "").split("\n").filter((l) => /^\s*[•\-*]\s+\S/.test(l)).length;
}

/**
 * Manda um aviso ao grupo interno no formato que couber.
 *
 * ```ts
 * await enviarAviso(jid, msg, { titulo: "Setup de cliente novo", resumo: "4 clientes com item aberto" },
 *                   { origem: "setup-7dias", destino: "interno" });
 * ```
 */
export async function enviarAviso(
  jid: string,
  texto: string,
  opts: OpcoesAviso,
  meta?: CsSendMeta,
): Promise<ResultadoAviso> {
  const itens = contarItens(texto);
  const formato = opts.forcar ?? escolherFormato({ itens, texto });

  if (formato === "texto") {
    const r = await csSendGroupText(jid, texto, undefined, meta, opts.mencionados);
    return { ok: r.ok, formato: "texto", error: r.error };
  }

  try {
    const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
    const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
    const { csSendGroupDocument } = await import("@/lib/cs/notify");
    const { avisoPdfHtml } = await import("@/lib/reports/avisoPdf");

    const quando = new Date().toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo",
    });
    const logo = await loadLoneLogo().catch(() => "");
    const pdf = await htmlToPdf(avisoPdfHtml(opts.titulo, texto, logo, quando));
    if (!pdf.ok || !pdf.buffer) throw new Error(pdf.error ?? "render falhou");

    const base = (opts.arquivo ?? opts.titulo).replace(/[^\p{L}\p{N} -]/gu, "").trim() || "Aviso";
    const nome = `${base} — ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(/\//g, "-")}.pdf`;

    // A legenda tem que bastar para decidir se abre agora ou depois.
    const legenda = `📋 *${opts.titulo}*${opts.resumo ? `\n${opts.resumo}` : ""}`;
    const env = await csSendGroupDocument(jid, pdf.buffer.toString("base64"), nome, legenda, "application/pdf", opts.mencionados);
    if (!env.ok) throw new Error(env.error ?? "envio falhou");
    return { ok: true, formato: "pdf" };
  } catch (e) {
    // VOLTA PRO TEXTO. Aviso que some porque o chromium engasgou é o pior desfecho possível —
    // ninguém descobre que existia.
    console.error(`[enviar-aviso] PDF falhou (${opts.titulo}), mandando como texto:`, String(e));
    const r = await csSendGroupText(jid, texto, undefined, meta, opts.mencionados);
    return { ok: r.ok, formato: "texto", error: r.ok ? undefined : r.error };
  }
}
