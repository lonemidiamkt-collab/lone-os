// lib/clients/offboarding-passos.ts — os passos de "Encerrar parceria" (app/api/clients/offboarding),
// cada um conferido.
//
// 24/10/2026 (auditoria de erro recuperável, 3.10): "Concluir encerramento" fazia quatro gravações sem
// olhar o erro de nenhuma e respondia ok. Se a gravação que tira o cliente da carteira falhasse, a tela
// dizia "concluído" com o cliente ainda ativo — recebendo relatório, mensagem e alerta de verba.
// Agora cada passo é conferido: passo ESSENCIAL que falha interrompe e a resposta diz o que foi feito e
// o que não foi; passo de registro (auditoria, linha do tempo) que falha vira pendência dita na tela.

/** O que o supabase devolve numa gravação: `error` preenchido = não gravou. */
export interface ResultadoGravacao { error: { message: string } | null }

export interface Passo {
  /** Frase curta do que o passo faz, no infinitivo: "tirar o cliente da carteira ativa". */
  rotulo: string;
  /** Se falhar, os seguintes não rodam (dependem dele). */
  essencial: boolean;
  rodar: () => PromiseLike<ResultadoGravacao>;
}

export interface ResultadoPassos {
  feitos: string[];
  naoFeitos: { rotulo: string; erro: string }[];
  /** O passo essencial que falhou (e interrompeu), se houve. */
  falhaEssencial: { rotulo: string; erro: string } | null;
}

export async function executarPassos(passos: Passo[]): Promise<ResultadoPassos> {
  const r: ResultadoPassos = { feitos: [], naoFeitos: [], falhaEssencial: null };
  for (const p of passos) {
    if (r.falhaEssencial) { r.naoFeitos.push({ rotulo: p.rotulo, erro: "não tentado — o passo anterior falhou" }); continue; }
    let erro: string | null;
    try {
      const { error } = await p.rodar();
      erro = error ? (error.message || "erro sem descrição") : null;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
    if (!erro) { r.feitos.push(p.rotulo); continue; }
    r.naoFeitos.push({ rotulo: p.rotulo, erro });
    if (p.essencial) r.falhaEssencial = { rotulo: p.rotulo, erro };
  }
  return r;
}

/**
 * A resposta da rota a partir do resultado. Falha essencial = 500 com a frase do que houve; falha
 * só de registro = 200 com `pendencias` (a operação aconteceu, mas a tela precisa dizer o que faltou).
 */
export function respostaDosPassos(r: ResultadoPassos, o: { semEfeito: string }): { status: number; corpo: Record<string, unknown> } {
  if (r.falhaEssencial) {
    const feito = r.feitos.length ? ` Feito: ${r.feitos.join("; ")}.` : " Nada foi gravado.";
    return {
      status: 500,
      corpo: {
        error: `Não consegui ${r.falhaEssencial.rotulo} (${r.falhaEssencial.erro}). ${o.semEfeito}${feito} Tente de novo.`,
        feitos: r.feitos, naoFeitos: r.naoFeitos,
      },
    };
  }
  const pendencias = r.naoFeitos.map((n) => `${n.rotulo} (${n.erro})`);
  return { status: 200, corpo: { ok: true, feitos: r.feitos, ...(pendencias.length ? { pendencias } : {}) } };
}
