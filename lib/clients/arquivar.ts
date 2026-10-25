// lib/clients/arquivar.ts — quando arquivar (churn) e quando desfazer, para a rota
// app/api/clients/[id]/lifecycle/route.ts.
//
// 24/10/2026 (auditoria de erro recuperável, 3.7): a lista de clientes não tem realtime, então o
// cliente arquivado continuava na tela; arquivar de novo regravava a data de saída e mandava o aviso
// de churn ao grupo DE NOVO. Agora a rota recusa arquivar o que já está arquivado, e a lista oferece
// "Desfazer" por alguns segundos — com prazo no servidor, porque desfazer avisa o grupo que o aviso
// de saída foi engano, e isso só faz sentido logo depois.

export interface EstadoArquivo {
  active: boolean | null;
  churned_at: string | null;
  name?: string | null;
  nome_fantasia?: string | null;
}

export type Decisao = { ok: true } | { ok: false; status: number; erro: string };

/** Até quantos minutos depois de arquivar o "Desfazer" ainda vale. */
export const PRAZO_DESFAZER_MIN = 30;

const nomeDe = (c: EstadoArquivo) => c.nome_fantasia || c.name || "Este cliente";
const dataBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;

export function podeArquivar(atual: EstadoArquivo | null): Decisao {
  if (!atual) return { ok: false, status: 404, erro: "Cliente não encontrado — ele pode ter sido excluído." };
  if (atual.active === false) {
    const desde = dataBR(atual.churned_at);
    return {
      ok: false, status: 409,
      erro: `${nomeDe(atual)} já está arquivado${desde ? ` desde ${desde}` : ""} — nada foi feito e o grupo não foi avisado de novo. Para trazer de volta, use Reativar em Arquivados.`,
    };
  }
  return { ok: true };
}

/** Reativar (ou desfazer o arquivamento de agora há pouco). */
export function podeReativar(atual: EstadoArquivo | null, opcoes: { desfazer?: boolean; agora: Date }): Decisao {
  if (!atual) return { ok: false, status: 404, erro: "Cliente não encontrado — ele pode ter sido excluído." };
  if (atual.active !== false) {
    return { ok: false, status: 409, erro: `${nomeDe(atual)} já está ativo — nada foi feito.` };
  }
  if (opcoes.desfazer) {
    const quando = atual.churned_at ? new Date(atual.churned_at).getTime() : NaN;
    const minutos = (opcoes.agora.getTime() - quando) / 60000;
    if (!Number.isFinite(minutos) || minutos > PRAZO_DESFAZER_MIN) {
      return {
        ok: false, status: 409,
        erro: `Passou o prazo do Desfazer (${PRAZO_DESFAZER_MIN} min). Use Reativar em Arquivados — o grupo já tratou o aviso de saída como verdadeiro.`,
      };
    }
  }
  return { ok: true };
}

/** O que vai ao grupo quando o arquivamento é desfeito: o aviso de saída já tinha saído. */
export function textoArquivamentoDesfeito(p: { cliente: string; porQuem: string }): string {
  return `↩️ *${p.cliente} continua cliente* — ${p.porQuem} desfez o arquivamento de agora há pouco.\n\n` +
    "Desconsiderem o aviso de saída: nada muda na operação.";
}
