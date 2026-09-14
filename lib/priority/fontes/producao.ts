// Produção e atendimento: o snapshot do CS já sabe o que está atrasado, pronto sem postar,
// esperando decisão e esfriando. Cada item vira uma recomendação com dono.

import { montarSnapshotCS } from "@/lib/cs/snapshot";
import type { ItemBruto } from "../tipos";
import type { ClienteRef } from "./index";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function itensDaProducao(clientes: { porNome: Map<string, ClienteRef> }): Promise<ItemBruto[]> {
  const s = await montarSnapshotCS();
  const out: ItemBruto[] = [];
  const ref = (nome: string) => clientes.porNome.get(nome.trim().toLowerCase()) ?? null;

  for (const a of s.atrasados) {
    const c = ref(a.cliente);
    out.push({
      fonte: "producao", clientId: c?.id ?? null, cliente: c?.nome ?? a.cliente,
      entityRef: a.titulo, motivo: "card_atrasado",
      titulo: `${c?.nome ?? a.cliente}: "${a.titulo}" atrasado há ${a.dias} dia${a.dias === 1 ? "" : "s"}`,
      fato: [
        `Post "${a.titulo}" está ${a.dias} dia${a.dias === 1 ? "" : "s"} depois da data de postagem`,
        a.designerEntregou ? "A arte já foi entregue pelo designer — falta postar" : "O designer ainda não entregou a arte",
      ],
      recomendacao: a.designerEntregou ? "Postar hoje ou combinar nova data com o cliente" : "Cobrar a arte do designer e avisar o cliente da nova data",
      acaoProposta: { tipo: "abrir_card", titulo: a.titulo, cliente: a.cliente },
      severidade: clamp(50 + a.dias * 8), urgencia: 90, confianca: 0.95, exposicaoRs: null,
      reversivel: false, // a data passou; o que dá para salvar é a relação
      ownerRole: "social", owner: a.responsavel ?? c?.assignedSocial ?? null, nivelPolicy: "C",
    });
  }

  for (const p of s.prontasPraPostar) {
    const c = ref(p.cliente);
    out.push({
      fonte: "producao", clientId: c?.id ?? null, cliente: c?.nome ?? p.cliente,
      entityRef: p.titulo, motivo: "pronta_sem_postar",
      titulo: `${c?.nome ?? p.cliente}: "${p.titulo}" pronta há ${p.dias} dia${p.dias === 1 ? "" : "s"} sem postar`,
      fato: [`Arte entregue há ${p.dias} dia${p.dias === 1 ? "" : "s"} e o card não avançou`],
      recomendacao: "Confirmar a arte e agendar a postagem",
      acaoProposta: { tipo: "abrir_card", titulo: p.titulo, cliente: p.cliente },
      severidade: clamp(35 + p.dias * 10), urgencia: 70, confianca: 0.9, exposicaoRs: null,
      reversivel: true, ownerRole: "social", owner: p.responsavel ?? c?.assignedSocial ?? null, nivelPolicy: "C",
    });
  }

  for (const p of s.pendentes) {
    const c = ref(p.cliente);
    out.push({
      fonte: "cs", clientId: c?.id ?? null, cliente: c?.nome ?? p.cliente,
      entityRef: p.codigo, motivo: "sugestao_sem_decisao",
      titulo: `${c?.nome ?? p.cliente}: pedido "${p.resumo.slice(0, 60)}" espera ok/não há ${p.dias} dia${p.dias === 1 ? "" : "s"}`,
      fato: [`O agente pegou "${p.resumo.slice(0, 80)}" (${p.tipo}) no grupo há ${p.dias} dia${p.dias === 1 ? "" : "s"} e ninguém decidiu`, "Sem decisão, expira em 14 dias e o cliente fica sem resposta"],
      recomendacao: `Responder no grupo interno: ok ${p.codigo} para criar, ou não ${p.codigo}`,
      acaoProposta: { tipo: "decidir_demanda", codigo: p.codigo },
      severidade: clamp(30 + p.dias * 5), urgencia: clamp(40 + p.dias * 5), confianca: 0.9, exposicaoRs: null,
      reversivel: true, ownerRole: "social", owner: p.responsavel ?? c?.assignedSocial ?? null, nivelPolicy: "C",
    });
  }

  for (const e of s.esfriando) {
    const c = ref(e.cliente);
    out.push({
      fonte: "cs", clientId: c?.id ?? null, cliente: c?.nome ?? e.cliente,
      entityRef: null, motivo: "cliente_esfriando",
      titulo: `${c?.nome ?? e.cliente}: ${e.dias} dias sem falar com a gente`,
      fato: [`Última mensagem do cliente há ${e.dias} dias`],
      recomendacao: "Mandar uma mensagem com algo concreto (resultado, próxima peça, pergunta) — não um 'tudo bem?'",
      acaoProposta: { tipo: "falar_com_cliente", clientId: c?.id ?? null },
      severidade: clamp(30 + e.dias * 3), urgencia: clamp(30 + e.dias * 2), confianca: 0.8, exposicaoRs: null,
      reversivel: true, ownerRole: "social", owner: c?.assignedSocial ?? null, nivelPolicy: "D",
    });
  }

  for (const sp of s.semPostsSemana) {
    const c = ref(sp.nome);
    const essaSemana = /essa semana/i.test(s.semPostsLabel);
    out.push({
      fonte: "producao", clientId: c?.id ?? null, cliente: c?.nome ?? sp.nome,
      entityRef: s.semPostsLabel, motivo: "sem_post_semana",
      titulo: `${c?.nome ?? sp.nome}: nenhum post planejado ${s.semPostsLabel}`,
      fato: [`Cliente de social sem card no calendário ${s.semPostsLabel}`],
      recomendacao: "Abrir os cards da semana (seg/qua/sex) com a pauta do cliente",
      acaoProposta: { tipo: "abrir_pauta", clientId: c?.id ?? null },
      severidade: 55, urgencia: essaSemana ? 85 : 50, confianca: 0.9, exposicaoRs: null,
      reversivel: !essaSemana, ownerRole: "social", owner: sp.social ?? c?.assignedSocial ?? null, nivelPolicy: "C",
    });
  }
  return out;
}
