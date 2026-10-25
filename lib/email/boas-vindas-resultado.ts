// lib/email/boas-vindas-resultado.ts — o resultado do e-mail de boas-vindas e a frase para a tela.
// Separado de boas-vindas.ts (que usa o Resend, só servidor) para a tela de Cadastros Pendentes
// importar sem levar o SDK de e-mail para o navegador. Item 3.9, 24/10/2026.

export interface ResultadoBoasVindas {
  enviado: boolean;
  /** O que houve, para quem precisa decidir (a rota /api/emails devolve 404/400 conforme). */
  codigo: "enviado" | "ja_enviado" | "sem_cliente" | "sem_email" | "falha";
  /** Já tinha sido enviado antes (não é falha; a tela não precisa alarmar). */
  jaEnviado?: boolean;
  /** Frase curta para a tela quando não foi enviado. */
  motivo?: string;
  messageId?: string;
}

/** Frase para a tela de quem ativou. null = nada a dizer além do "ativado". */
export function avisoDoEmail(r: ResultadoBoasVindas | null | undefined): string | null {
  if (!r) return "o e-mail de boas-vindas não foi enviado (o servidor não disse o que houve)";
  if (r.enviado || r.jaEnviado) return null;
  return `o e-mail de boas-vindas não foi enviado: ${r.motivo ?? "motivo desconhecido"}`;
}
