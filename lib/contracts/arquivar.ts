// lib/contracts/arquivar.ts — tirar da lista o contrato que não vai ser assinado, sem apagar.
//
// Roberto, 26/10/2026, olhando a tela de Contratos com 4 "Pendente" de maio a julho: "esses contratos
// você já pode remover daqui… são outros contratos que temos que assinar ainda". Eram rascunhos nunca
// enviados à D4Sign. Apagar perderia o PDF e o histórico; arquivar tira da conta e da lista e volta
// com um clique.

export interface ContratoParaArquivar {
  signed_at: string | null;
  d4sign_assinado_em?: string | null;
  archived_at?: string | null;
}

/** Pode arquivar? Contrato assinado é registro — fica na lista e no arquivo do mês. Pura. */
export function podeArquivar(c: ContratoParaArquivar): { ok: true } | { ok: false; motivo: string } {
  if (c.archived_at) return { ok: false, motivo: "Este contrato já está arquivado." };
  if (c.signed_at || c.d4sign_assinado_em) {
    return { ok: false, motivo: "Contrato assinado não é arquivado: ele é o registro do que foi combinado." };
  }
  return { ok: true };
}
