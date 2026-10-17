// lib/crm/grupo-vendas-envio.ts — manda texto no GRUPO DE VENDAS (CS_VENDAS_GROUP_JID) pelo número
// do atendimento (monitor[IA]). Sem o JID configurado não manda nada e devolve o motivo: quem chama
// segue o fluxo (o sino já registrou o aviso). Os textos ficam em lib/crm/grupo-vendas.ts.

import { csSendGroupText } from "@/lib/cs/notify";

export async function mandarNoGrupoVendas(texto: string, origem: string): Promise<{ ok: boolean; error?: string }> {
  const jid = process.env.CS_VENDAS_GROUP_JID;
  if (!jid) return { ok: false, error: "CS_VENDAS_GROUP_JID ausente" };
  try {
    const r = await csSendGroupText(jid, texto, undefined, { origem, destino: "interno" });
    if (!r.ok) console.error(`[grupo-vendas] ${origem}: ${r.error}`);
    return r;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[grupo-vendas] ${origem}: ${error}`);
    return { ok: false, error };
  }
}
