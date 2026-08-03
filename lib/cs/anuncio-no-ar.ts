// lib/cs/anuncio-no-ar.ts — o cliente novo já está anunciando de verdade?
//
// PEDIDO (Roberto, 03/08): "identificar o cliente que entrou na empresa e não iniciou os anúncios
// em até 3 dias — isso ele pode puxar API Meta".
//
// POR QUE A META E NÃO O CHECKLIST. O item "Anúncio no ar" já existe em CHECKLIST_SETUP, mas é
// caixinha que alguém marca. Caixinha marcada não é anúncio rodando: o item pode ser dado como
// feito com a campanha ainda pausada, ou ficar por marcar com tudo no ar. Quem sabe é a Meta.
//
// A REGRA DOS 3 DIAS. Contrato assinado sem anúncio no ar é dinheiro parado do cliente e é a
// primeira impressão que ele tem da agência. Sete dias (o prazo do setup) é tarde demais pra
// descobrir; três dá tempo de reagir na mesma semana.
//
// NÃO CONFUNDIR "SEM ANÚNCIO" COM "NÃO SEI". Conta sem acesso, token vencido ou API fora do ar
// devolvem `indefinido` — nunca "não está anunciando". Acusar o Julio de não subir campanha por
// causa de um 403 da Meta destrói a confiança no aviso inteiro.

const GRAPH = "https://graph.facebook.com/v21.0";

export type EstadoAnuncio = "no_ar" | "sem_anuncio" | "indefinido";

export interface DiagnosticoAnuncio {
  clientId: string;
  cliente: string;
  estado: EstadoAnuncio;
  /** Dias desde que o cliente entrou. */
  diasDeCasa: number;
  /** Quantas campanhas ativas a Meta reportou (0 quando nenhuma). */
  ativas?: number;
  /** Por que não deu pra saber — só quando estado = indefinido. */
  motivo?: string;
}

/** A partir daqui, cliente novo sem anúncio vira aviso. */
export const DIAS_PRA_COBRAR = 3;

/**
 * Pergunta à Meta se a conta tem campanha ATIVA. Uma chamada por conta, campos mínimos.
 *
 * `effective_status` é o que vale: `status` diz o que o anunciante pediu, `effective_status` diz
 * o que a Meta está realmente fazendo — campanha "ACTIVE" dentro de conta suspensa ou com verba
 * esgotada aparece como ACTIVE em `status` e NÃO está rodando.
 */
export async function campanhasAtivas(
  accountId: string, token: string,
): Promise<{ ok: true; ativas: number } | { ok: false; motivo: string }> {
  const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  try {
    const r = await fetch(
      `${GRAPH}/${act}/campaigns?fields=effective_status&limit=200&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j as { error?: { message?: string } })?.error?.message ?? `HTTP ${r.status}`;
      return { ok: false, motivo: msg.slice(0, 120) };
    }
    const dados = (j as { data?: { effective_status?: string }[] }).data ?? [];
    return { ok: true, ativas: dados.filter((c) => c.effective_status === "ACTIVE").length };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "erro de conexão" };
  }
}

export interface ClienteNovo {
  id: string;
  nome: string;
  criadoEm: string | null;
  contaAnuncio: string | null;
}

export function diasDesde(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Diagnostica um cliente. Sem conta vinculada já é problema — e é um problema NOSSO, não da Meta. */
export async function diagnosticar(c: ClienteNovo, token: string | null): Promise<DiagnosticoAnuncio> {
  const diasDeCasa = diasDesde(c.criadoEm);
  const base = { clientId: c.id, cliente: c.nome, diasDeCasa };

  // Sem conta vinculada não dá nem pra perguntar. Não é "indefinido": é falta de setup, e o
  // sistema fica cego pra relatório, saldo e pacing enquanto isso.
  if (!c.contaAnuncio) return { ...base, estado: "sem_anuncio", ativas: 0, motivo: "conta de anúncio não vinculada" };
  if (!token) return { ...base, estado: "indefinido", motivo: "token da Meta ausente ou vencido" };

  const r = await campanhasAtivas(c.contaAnuncio, token);
  if (!r.ok) return { ...base, estado: "indefinido", motivo: r.motivo };
  return { ...base, estado: r.ativas > 0 ? "no_ar" : "sem_anuncio", ativas: r.ativas };
}

/** Quem precisa de aviso: passou dos 3 dias e a Meta confirmou que não há campanha ativa. */
export function paraCobrar(diags: DiagnosticoAnuncio[]): DiagnosticoAnuncio[] {
  return diags
    .filter((d) => d.estado === "sem_anuncio" && d.diasDeCasa >= DIAS_PRA_COBRAR)
    .sort((a, b) => b.diasDeCasa - a.diasDeCasa);
}

/** O texto pro grupo. "" quando não há ninguém — silêncio é a resposta certa nesse caso. */
export function textoCobranca(alvos: DiagnosticoAnuncio[]): string {
  if (!alvos.length) return "";
  const l = [
    `🚦 *Cliente novo ainda sem anúncio no ar* — ${alvos.length}`,
    "",
  ];
  for (const d of alvos.slice(0, 10)) {
    const porque = d.motivo === "conta de anúncio não vinculada"
      ? "a conta de anúncio nem foi vinculada aqui"
      : "nenhuma campanha ativa na Meta";
    l.push(`• *${d.cliente}* — ${d.diasDeCasa} dias de casa · ${porque}`);
  }
  if (alvos.length > 10) l.push(`_…e mais ${alvos.length - 10}._`);
  l.push("", "_Conferi na Meta agora. Se já subiu e não apareceu, me avisa que eu confiro de novo._");
  return l.join("\n");
}

/** Quando a Meta não respondeu por alguém: vale dizer, mas separado — dúvida não é acusação. */
export function textoIndefinidos(diags: DiagnosticoAnuncio[]): string {
  const duvidas = diags.filter((d) => d.estado === "indefinido" && d.diasDeCasa >= DIAS_PRA_COBRAR);
  if (!duvidas.length) return "";
  const l = [`⚠️ Não consegui conferir ${duvidas.length} conta(s) na Meta:`];
  for (const d of duvidas.slice(0, 5)) l.push(`• ${d.cliente} — _${d.motivo}_`);
  return l.join("\n");
}
