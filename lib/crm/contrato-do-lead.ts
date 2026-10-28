// lib/crm/contrato-do-lead.ts — o contrato da D4Sign visto do Comercial. Puro (a tela do CRM usa no navegador).

/**
 * O contrato do cliente que o lead virou, visto da D4Sign (28/10/2026): a assinatura não chegava ao Comercial —
 * só ao grupo de cadastro e à tela de Contratos.
 */
export type ContratoDoLead =
  | { situacao: "assinado"; em: string }
  | { situacao: "esperando"; desde: string | null; falta: ("cliente" | "Lone")[] };

/**
 * A situação do contrato a partir do que o Lone OS sabe da D4Sign. Pura. Assinado vence esperando só se for o mais
 * recente: uma renovação enviada depois do contrato assinado volta a "esperando".
 */
export function contratoDoLead(assinadoEm: string | null, pendentes: { enviado_em: string | null; signatarios: unknown }[]): ContratoDoLead | null {
  const ultimo = [...pendentes].sort((a, b) => String(b.enviado_em ?? "").localeCompare(String(a.enviado_em ?? "")))[0];
  if (ultimo && (!assinadoEm || String(ultimo.enviado_em ?? "") > assinadoEm)) {
    const lista = Array.isArray(ultimo.signatarios) ? (ultimo.signatarios as { papel?: string; assinou?: boolean }[]) : [];
    const falta = [...new Set(lista.filter((x) => !x.assinou).map((x) => (x.papel === "lone" ? "Lone" : "cliente") as "cliente" | "Lone"))];
    return { situacao: "esperando", desde: ultimo.enviado_em ?? null, falta };
  }
  return assinadoEm ? { situacao: "assinado", em: assinadoEm } : null;
}

/** O selo do card/linha: texto curto e tom. Pura. */
export function seloDoContrato(e: { contrato: ContratoDoLead | null; cadastroAprovacao: boolean; cadastroPendente: boolean }): { texto: string; tom: "ok" | "atencao" | "neutro" } | null {
  if (e.contrato?.situacao === "assinado") {
    const d = new Date(e.contrato.em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    return { texto: `Contrato assinado ${d}`, tom: "ok" };
  }
  if (e.contrato?.situacao === "esperando") {
    const quem = e.contrato.falta.length === 2 ? "cliente e Lone" : e.contrato.falta[0] === "Lone" ? "a Lone" : e.contrato.falta[0] ?? "assinatura";
    return { texto: `Contrato: falta ${quem}`, tom: "atencao" };
  }
  if (e.cadastroAprovacao) return { texto: "Cadastro a aprovar", tom: "atencao" };
  if (!e.cadastroPendente) return { texto: "Contrato não enviado", tom: "neutro" };
  return null;
}
