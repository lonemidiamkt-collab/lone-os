// lib/cs/confirmar-demanda-server.ts — o "ok" numa demanda do agente: cria o card e SÓ ENTÃO marca
// "confirmada". Usado pelo inbound (WhatsApp) e por /api/cs/decide (painel). Regras em
// lib/cs/confirmar-demanda.ts.

import { supabaseAdmin } from "@/lib/supabase/server";
import { criarCardDemandaDetalhado, criarCardsPautaDetalhado } from "@/lib/cs/card";
import { parsePautaItens } from "@/lib/cs/pauta";
import { clienteDaDemanda, desfechoDaConfirmacao, type Criacao, type MotivoFalha } from "@/lib/cs/confirmar-demanda";

export interface OpcoesConfirmacao {
  /** Quem decidiu (vai em decided_by). */
  quem: string;
  /** Título do card quando quem confirma reescreveu (ex.: a IA do "pode criar, chama de X"). */
  titulo?: string | null;
  /** Briefing final (com o ajuste de quem confirmou). Sem isto, o da demanda. */
  briefing?: string | null;
  /** Nota anexada a cada card de pauta. */
  notaPauta?: string | null;
  /** Colunas extras gravadas JUNTO com o "confirmada" (só quando o card nasceu). */
  gravar?: { briefing?: string; resumo?: string };
}

export type ResultadoConfirmacao =
  | { ok: true; cardId: string; criados: number; total: number; falhas: string[] }
  | { ok: false; motivo: MotivoFalha; erro: string };

/** Grava o motivo da falha na demanda (que segue pendente). Coluna da migration 20261021130001. */
async function gravarFalha(id: string, erro: string): Promise<void> {
  const { error } = await supabaseAdmin.from("cs_demandas")
    .update({ erro_card: erro.slice(0, 500), erro_card_em: new Date().toISOString() }).eq("id", id);
  if (error) console.warn("[CS/confirmar] motivo não gravado (migration 20261021130001 aplicada?):", error.message);
}

export async function confirmarDemanda(d: Record<string, unknown>, o: OpcoesConfirmacao): Promise<ResultadoConfirmacao> {
  const id = d.id as string;
  const clientId = clienteDaDemanda(d);
  if (!clientId) {
    await gravarFalha(id, "demanda sem cliente vinculado");
    return { ok: false, motivo: "sem_cliente", erro: "a demanda não tem cliente vinculado" };
  }
  const clienteNome = (d.cliente_nome as string) || "Cliente";
  const responsavel = (d.responsavel as string | null) ?? null;

  let criacao: Criacao;
  if (d.tipo === "pauta_semanal") {
    const itens = parsePautaItens((d.message_text as string) || "") ?? [];
    if (!itens.length) {
      await gravarFalha(id, "pauta sem itens recuperáveis");
      return { ok: false, motivo: "pauta_sem_itens", erro: "não consegui recuperar os itens da pauta" };
    }
    const r = await criarCardsPautaDetalhado({ clientId, clienteNome, responsavel, itens, notaExtra: o.notaPauta ?? null });
    criacao = { ids: r.ids, total: itens.length, erros: r.erros };
  } else {
    const r = await criarCardDemandaDetalhado({
      clientId, clienteNome, responsavel,
      titulo: o.titulo || (d.resumo as string) || (d.message_text as string) || "Demanda",
      urgencia: (d.urgencia as string) || "media",
      briefing: o.briefing ?? ((d.briefing as string) || (d.message_text as string) || ""),
      tipo: d.tipo as string,
      ajusteCardId: (d.content_card_id as string) ?? null,
    });
    criacao = { ids: r.id ? [r.id] : [], total: 1, erros: r.erro ? [r.erro] : [] };
  }

  const des = desfechoDaConfirmacao(criacao);
  if (!des.confirmar) {
    await gravarFalha(id, des.erro);
    console.error(`[CS/confirmar] demanda ${d.codigo ?? id} continua pendente: ${des.erro}`);
    return { ok: false, motivo: des.motivo, erro: des.erro };
  }

  const { data: marcada, error } = await supabaseAdmin.from("cs_demandas").update({
    status: "confirmada", content_card_id: des.cardId,
    decided_at: new Date().toISOString(), decided_by: o.quem,
    ...(o.gravar ?? {}),
  }).eq("id", id).eq("status", "pendente").select("id");
  if (error) console.error(`[CS/confirmar] card ${des.cardId} criado, mas a demanda ${id} não foi marcada:`, error.message);
  else if (!marcada?.length) console.warn(`[CS/confirmar] demanda ${id} já tinha sido decidida por outra pessoa — card ${des.cardId} criado mesmo assim`);
  if (d.erro_card) {
    void supabaseAdmin.from("cs_demandas").update({ erro_card: null, erro_card_em: null }).eq("id", id).then(() => {}, () => {});
  }
  return { ok: true, cardId: des.cardId, criados: des.criados, total: des.total, falhas: des.falhas };
}
