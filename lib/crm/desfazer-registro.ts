// lib/crm/desfazer-registro.ts — o "Desfazer" de um registro do comercial (24/10/2026, auditoria 4.6). Módulo PURO.
//
// Antes, marcar "Já falei", "Registrar ligação", "Aconteceu" ou "Marcar como feito" no Hoje não tinha volta: o
// toque contava na cadência, o lead saía de Novo e a única saída era editar à mão. Agora quem registra recebe,
// junto com a resposta, o que o registro mudou (as atividades criadas e os campos do lead, antes → depois), e o
// "Desfazer" do aviso devolve isso ao servidor por alguns minutos.
//
// O servidor não confia cegamente no que volta: só apaga atividade DESTE lead criada há pouco, e só restaura o
// campo que ainda está com o valor que o registro gravou — se alguém mexeu no lead nesse meio-tempo, a mudança
// dessa pessoa fica (e a resposta diz o que ficou).

export type CampoDesfazivel = "estagio" | "etapaDesde" | "retomarEm" | "primeiroContatoEm";
export const CAMPOS_DESFAZIVEIS: readonly CampoDesfazivel[] = ["estagio", "etapaDesde", "retomarEm", "primeiroContatoEm"];

export interface DesfazerRegistro {
  leadId: string;
  /** A atividade registrada e, se houve, a nota automática ("Movido para Contato feito"). */
  atividadeIds: string[];
  /** Valor de cada campo ANTES do registro (só os que o registro mudou). */
  antes: Partial<Record<CampoDesfazivel, string | null>>;
  /** Valor que o registro gravou em cada campo. */
  depois: Partial<Record<CampoDesfazivel, string | null>>;
}

/** Por quanto tempo o registro pode ser desfeito. O aviso na tela fica bem menos; a folga é para rede lenta. */
export const JANELA_DESFAZER_MIN = 15;

const ROTULO_CAMPO: Record<CampoDesfazivel, string> = {
  estagio: "a etapa", etapaDesde: "a data da etapa", retomarEm: "a data de retomar", primeiroContatoEm: "o primeiro contato",
};

const ehDataHora = (c: CampoDesfazivel) => c === "etapaDesde" || c === "primeiroContatoEm";
/** Mesmo valor? Data-hora compara pelo instante (o banco devolve "+00:00", a tela manda "Z"). */
function mesmoValor(c: CampoDesfazivel, a: string | null | undefined, b: string | null | undefined): boolean {
  if ((a ?? null) === null || (b ?? null) === null) return (a ?? null) === (b ?? null);
  if (ehDataHora(c)) return Date.parse(a!) === Date.parse(b!);
  return a === b;
}

/** Confere o pedido de desfazer: formato válido e só campos conhecidos. */
export function lerDesfazer(bruto: unknown): DesfazerRegistro | null {
  if (!bruto || typeof bruto !== "object") return null;
  const d = bruto as Record<string, unknown>;
  if (typeof d.leadId !== "string" || !d.leadId) return null;
  if (!Array.isArray(d.atividadeIds) || d.atividadeIds.some((x) => typeof x !== "string") || d.atividadeIds.length > 5) return null;
  const campos = (o: unknown): Partial<Record<CampoDesfazivel, string | null>> | null => {
    if (o == null) return {};
    if (typeof o !== "object") return null;
    const out: Partial<Record<CampoDesfazivel, string | null>> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (!(CAMPOS_DESFAZIVEIS as readonly string[]).includes(k)) return null;
      if (v !== null && typeof v !== "string") return null;
      out[k as CampoDesfazivel] = v as string | null;
    }
    return out;
  };
  const antes = campos(d.antes), depois = campos(d.depois);
  if (!antes || !depois) return null;
  return { leadId: d.leadId, atividadeIds: d.atividadeIds as string[], antes, depois };
}

/**
 * O que o servidor faz para desfazer. `atividades` = as que ainda existem entre as pedidas (lidas do banco).
 * Atividade já apagada é ignorada: desfazer duas vezes não dá erro.
 */
export function planoDesfazer(p: {
  desfazer: DesfazerRegistro;
  lead: Partial<Record<CampoDesfazivel, string | null>> | null;
  atividades: { id: string; leadId: string; createdAt: string }[];
  agora: Date;
  janelaMin?: number;
}): { ok: true; apagar: string[]; restaurar: Partial<Record<CampoDesfazivel, string | null>>; mantidos: CampoDesfazivel[] } | { ok: false; erro: string } {
  const janela = (p.janelaMin ?? JANELA_DESFAZER_MIN) * 60_000;
  if (!p.lead) return { ok: false, erro: "Não achei o lead — ele pode ter sido excluído." };
  for (const a of p.atividades) {
    if (a.leadId !== p.desfazer.leadId) return { ok: false, erro: "Esse registro não é deste lead." };
    if (p.agora.getTime() - Date.parse(a.createdAt) > janela) {
      return { ok: false, erro: `Só dá para desfazer nos primeiros ${p.janelaMin ?? JANELA_DESFAZER_MIN} minutos. Se o contato não aconteceu, anote no histórico do lead.` };
    }
  }
  const restaurar: Partial<Record<CampoDesfazivel, string | null>> = {};
  const mantidos: CampoDesfazivel[] = [];
  for (const c of CAMPOS_DESFAZIVEIS) {
    if (!(c in p.desfazer.antes)) continue;
    if (mesmoValor(c, p.lead[c], p.desfazer.depois[c])) restaurar[c] = p.desfazer.antes[c] ?? null;
    else mantidos.push(c);
  }
  return { ok: true, apagar: p.atividades.map((a) => a.id), restaurar, mantidos };
}

/** Frase para quando parte do lead mudou depois do registro e ficou como estava. */
export function textoMantidos(mantidos: CampoDesfazivel[]): string | null {
  if (!mantidos.length) return null;
  return `O registro foi desfeito, mas ${mantidos.map((c) => ROTULO_CAMPO[c]).join(" e ")} já tinha mudado depois dele e ficou como está.`;
}
