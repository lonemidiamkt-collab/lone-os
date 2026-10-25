// lib/contracts/pdf-assinado.ts — enviar e TROCAR o PDF assinado de um contrato
// (app/api/contracts/upload-signed/route.ts).
//
// 24/10/2026 (auditoria de erro recuperável, 3.13): depois do primeiro envio a tela só mostrava "Ver
// assinado" — PDF errado (o de outro cliente, a versão sem a assinatura) ficava para sempre. Agora
// existe "Trocar PDF assinado", com confirmação, e o anterior NÃO se perde: o arquivo continua no
// storage (cada envio tem caminho próprio) e a referência vai para `contracts.signed_pdf_anteriores`,
// com quem enviou e quem trocou. Um envio comum sobre um contrato já assinado é recusado — só a troca
// explícita substitui (tela velha aberta em outra aba não apaga a referência do PDF certo).

export interface PdfAnterior {
  path: string;
  assinadoEm: string | null;
  enviadoPor: string | null;
  metodo: string | null;
  substituidoEm: string;
  substituidoPor: string;
}

export type DecisaoEnvio = { ok: true; troca: boolean } | { ok: false; status: number; erro: string };

/** A coluna nova existe? (a rota lê o contrato com `select("*")`). */
export const temColunaDeAnteriores = (contrato: Record<string, unknown>) => "signed_pdf_anteriores" in contrato;

export function decidirEnvioAssinado(contrato: Record<string, unknown>, substituir: boolean): DecisaoEnvio {
  const atual = (contrato.signed_pdf_path as string | null) || null;
  if (!atual) return { ok: true, troca: false };
  if (!substituir) {
    return {
      ok: false, status: 409,
      erro: "Este contrato já tem PDF assinado. Para corrigir, use \"Trocar PDF assinado\" — o atual fica guardado.",
    };
  }
  if (!temColunaDeAnteriores(contrato)) {
    // Sem onde guardar o anterior, não troca: perder a referência do PDF que valia é pior do que esperar.
    return {
      ok: false, status: 503,
      erro: "A troca do PDF assinado ainda não foi liberada no banco (falta aplicar a migration 20261024120000). O PDF atual não foi mexido.",
    };
  }
  return { ok: true, troca: true };
}

/** Lê a lista gravada, tolerando o que não for lista (coluna nova, linha antiga). */
export function lerAnteriores(valor: unknown): PdfAnterior[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((x): x is PdfAnterior => !!x && typeof x === "object" && typeof (x as PdfAnterior).path === "string");
}

/** A lista depois da troca: o PDF que valia entra no topo, com quem trocou e quando. */
export function anterioresDepoisDaTroca(contrato: Record<string, unknown>, quem: string, agoraIso: string): PdfAnterior[] {
  const atual: PdfAnterior = {
    path: contrato.signed_pdf_path as string,
    assinadoEm: (contrato.signed_at as string | null) ?? null,
    enviadoPor: (contrato.signed_uploaded_by as string | null) ?? null,
    metodo: (contrato.signature_method as string | null) ?? null,
    substituidoEm: agoraIso,
    substituidoPor: quem,
  };
  return [atual, ...lerAnteriores(contrato.signed_pdf_anteriores)];
}

/** O que o histórico do contrato registra na troca. */
export function textoDaTroca(anterior: PdfAnterior): string {
  const quando = anterior.assinadoEm
    ? new Date(anterior.assinadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "data desconhecida";
  return `PDF assinado trocado. O anterior (enviado em ${quando}${anterior.enviadoPor ? ` por ${anterior.enviadoPor}` : ""}) continua guardado.`;
}
