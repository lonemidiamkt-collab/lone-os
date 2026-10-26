// Tráfego: o diagnóstico diário já ranqueia por prioridade e R$ em jogo — vira ItemBruto direto.
// Só clientes COM tráfego contratado (a conta Meta vinculada não basta — caso Dumar).
//
// 26/10/2026 (Mesa do Gestor): um item por CRIATIVO, CONJUNTO ou CAMPANHA (entityRef), não mais um por cliente e
// tipo. Antes o motor descartava o segundo item com o mesmo cliente+tipo: três criativos queimando verba no
// mesmo cliente apareciam como um só, e os outros dois sumiam.

import { montarDiagnostico } from "@/lib/traffic/diagnostico";
import type { ItemBruto } from "../tipos";
import type { ClienteRef } from "./index";

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function itensDoTrafego(clientes: { porId: Map<string, ClienteRef> }): Promise<ItemBruto[]> {
  const d = await montarDiagnostico();
  // 25/10/2026 (11.6): diagnóstico parcial não vira "nada a recomendar" nas seções que não leram —
  // a fonte inteira falha e o motor mostra o erro (as outras fontes seguem).
  if (d.falhas?.length) throw new Error(`diagnóstico parcial: não li ${d.falhas.join(", ")}`);
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
        entityRef: i.entidade ? `${i.entidade.nivel}:${i.entidade.chave}` : null,
        motivo: slug(f.nome),
        // Com a coisa no título: três itens do mesmo cliente e tipo precisam se distinguir na lista.
        titulo: i.entidade
          ? `${c.nome || i.cliente}: ${f.nome.toLowerCase()} em "${i.entidade.nome}"`
          : `${c.nome || i.cliente}: ${f.pergunta.replace(/\?$/, "")}`,
        fato: [i.achado],
        recomendacao: i.acao,
        acaoProposta: { tipo: "ver_trafego", clientId: i.clientId, funcao: f.nome, ...(i.entidade ? { entidade: i.entidade } : {}) },
        severidade: i.prioridade,
        urgencia: emJogo && emJogo > 0 ? 75 : 55, // dinheiro saindo hoje pesa mais que ajuste de estrutura
        confianca: i.confianca ?? (emJogo != null ? 0.85 : 0.65),
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
