// Tráfego: o diagnóstico diário já ranqueia por prioridade e R$ em jogo — vira ItemBruto direto.
// Só clientes COM tráfego contratado (a conta Meta vinculada não basta — caso Dumar).

import { montarDiagnostico } from "@/lib/traffic/diagnostico";
import type { ItemBruto } from "../tipos";
import type { ClienteRef } from "./index";

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function itensDoTrafego(clientes: { porId: Map<string, ClienteRef> }): Promise<ItemBruto[]> {
  const d = await montarDiagnostico();
  const out: ItemBruto[] = [];
  for (const f of d.funcoes) {
    for (const i of f.itens) {
      const c = clientes.porId.get(i.clientId);
      if (!c || !c.temTrafego) continue;
      if (!i.acao || !i.achado) continue; // sem ação sustentada pelo dado, não é recomendação
      const emJogo = i.emJogoDia ?? null;
      out.push({
        fonte: "trafego",
        clientId: i.clientId,
        cliente: c.nome || i.cliente,
        entityRef: null,
        motivo: slug(f.nome),
        titulo: `${c.nome || i.cliente}: ${f.pergunta.replace(/\?$/, "")}`,
        fato: [i.achado],
        recomendacao: i.acao,
        acaoProposta: { tipo: "ver_trafego", clientId: i.clientId, funcao: f.nome },
        severidade: i.prioridade,
        urgencia: emJogo && emJogo > 0 ? 75 : 55, // dinheiro saindo hoje pesa mais que ajuste de estrutura
        confianca: emJogo != null ? 0.85 : 0.65,
        exposicaoRs: emJogo,
        reversivel: !(emJogo && emJogo > 0), // verba já gasta não volta
        ownerRole: "traffic",
        owner: c.assignedTraffic,
        nivelPolicy: "B",
      });
    }
  }
  return out;
}
