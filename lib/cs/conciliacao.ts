// lib/cs/conciliacao.ts — VARREDURA DE CONCILIAÇÃO: onde o WhatsApp e a plataforma discordam.
//
// O caso que originou isto: o cron client-messages mandou 42 mensagens de suporte HOJE e registrou
// em `client_group_message_log`, mas o dashboard lia `traffic_routine_checks` (parada desde 16/jul)
// e exibia "0/31". O trabalho acontecia, o registro existia, e a tela mostrava zero — porque as duas
// pontas não conversavam.
//
// A varredura procura o mesmo padrão em toda parte: coisa que aconteceu (ou deixou de acontecer) e
// que não virou dado. Cada achado diz O QUE, QUANTOS e O QUE FAZER. Suggest-only: não corrige nada
// sozinho — reporta pra decisão humana.

import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";

export type Gravidade = "alta" | "media" | "baixa";

export interface Divergencia {
  chave: string;
  titulo: string;
  gravidade: Gravidade;
  quantos: number;
  exemplos: string[];   // nomes de clientes/cards, até 4
  oQueFazer: string;
}

const amostra = (nomes: string[], n = 4) => nomes.slice(0, n);

export async function varrerConciliacao(): Promise<Divergencia[]> {
  const hoje = ymd(spNow());
  const h7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const h3 = new Date(Date.now() - 3 * 86400000).toISOString();

  const [{ data: clients }, { data: cards }, { data: demandas }] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, whatsapp_group_jid, agente_ativo, assigned_social, last_client_msg_at, meta_ad_account_id")
      .is("draft_status", null).neq("active", false).neq("status", "onboarding"),
    supabaseAdmin.from("content_cards")
      .select("id, client_id, title, status, due_date, designer_delivered_at, client_approved_at")
      .is("archived_at", null),
    supabaseAdmin.from("cs_demandas").select("id, client_id, cliente_nome, status, tipo, created_at, resumo"),
  ]);

  const nomeDe = new Map((clients ?? []).map((c) => [c.id as string, ((c.nome_fantasia as string) || (c.name as string) || "—")]));
  const out: Divergencia[] = [];

  // 1) Cliente sem grupo mapeado → o agente é CEGO nesse cliente (não vê pedido, nem elogio, nem risco).
  const semGrupo = (clients ?? []).filter((c) => !c.whatsapp_group_jid);
  if (semGrupo.length) out.push({
    chave: "sem_grupo",
    titulo: "Clientes sem grupo de WhatsApp mapeado",
    gravidade: "alta",
    quantos: semGrupo.length,
    exemplos: amostra(semGrupo.map((c) => nomeDe.get(c.id as string) || "—")),
    oQueFazer: "Mapear o grupo (Clientes → WhatsApp). Sem isso o agente não enxerga nada desse cliente.",
  });

  // 2) Agente desligado no cliente → cego por escolha; vale conferir se ainda faz sentido.
  const agenteOff = (clients ?? []).filter((c) => c.agente_ativo === false);
  if (agenteOff.length) out.push({
    chave: "agente_desligado",
    titulo: "Clientes com o agente desligado",
    gravidade: "media",
    quantos: agenteOff.length,
    exemplos: amostra(agenteOff.map((c) => nomeDe.get(c.id as string) || "—")),
    oQueFazer: "Confirmar se a pausa ainda faz sentido — enquanto estiver off, nada desse cliente é captado.",
  });

  // 3) Cliente sem social responsável → ninguém dono; some das cobranças e das metas.
  const semSocial = (clients ?? []).filter((c) => !((c.assigned_social as string) || "").trim());
  if (semSocial.length) out.push({
    chave: "sem_social",
    titulo: "Clientes sem social responsável",
    gravidade: "alta",
    quantos: semSocial.length,
    exemplos: amostra(semSocial.map((c) => nomeDe.get(c.id as string) || "—")),
    oQueFazer: "Definir o responsável em Clientes — sem dono, o cliente não entra na conta de ninguém.",
  });

  // 4) Arte entregue e parada → o trabalho foi feito e não virou post (o furo dos 89 cards).
  const paradas = (cards ?? []).filter((c) =>
    c.designer_delivered_at && (c.designer_delivered_at as string) < h3 && c.status !== "published");
  if (paradas.length) out.push({
    chave: "arte_parada",
    titulo: "Artes prontas há +3 dias e ainda não postadas",
    gravidade: "alta",
    quantos: paradas.length,
    exemplos: amostra(paradas.map((c) => `${nomeDe.get(c.client_id as string) || "—"}: ${(c.title as string) || ""}`)),
    oQueFazer: "Postar ou dizer o que travou. Se já foi postado, marcar o card — senão não conta em lugar nenhum.",
  });

  // 5) Card vencido não publicado → prazo combinado que passou.
  const vencidos = (cards ?? []).filter((c) => c.due_date && (c.due_date as string) < hoje && c.status !== "published");
  if (vencidos.length) out.push({
    chave: "card_vencido",
    titulo: "Cards com data de postagem vencida",
    gravidade: "media",
    quantos: vencidos.length,
    exemplos: amostra(vencidos.map((c) => `${nomeDe.get(c.client_id as string) || "—"}: ${(c.title as string) || ""}`)),
    oQueFazer: "Repactuar a data ou publicar. Card vencido parado envelhece a métrica do cliente.",
  });

  // 6) Sugestão do agente pendente há +7 dias → o CS viu algo e ninguém decidiu.
  const pendentes = (demandas ?? []).filter((d) => d.status === "pendente" && (d.created_at as string) < h7);
  if (pendentes.length) out.push({
    chave: "demanda_esquecida",
    titulo: "Sugestões do agente esperando decisão há +7 dias",
    gravidade: "media",
    quantos: pendentes.length,
    exemplos: amostra(pendentes.map((d) => `${(d.cliente_nome as string) || "—"}: ${((d.resumo as string) || "").slice(0, 40)}`)),
    oQueFazer: "Aprovar ou descartar no painel do Agente — pendência velha vira ruído e o agente não aprende.",
  });

  // 7) Cliente aprovou a arte no WhatsApp mas o card não andou.
  const aprovadoParado = (cards ?? []).filter((c) =>
    c.client_approved_at && !["scheduled", "published"].includes(c.status as string));
  if (aprovadoParado.length) out.push({
    chave: "aprovado_parado",
    titulo: "Cliente já aprovou, mas o card não avançou",
    gravidade: "alta",
    quantos: aprovadoParado.length,
    exemplos: amostra(aprovadoParado.map((c) => `${nomeDe.get(c.client_id as string) || "—"}: ${(c.title as string) || ""}`)),
    oQueFazer: "Agendar/publicar — o cliente já disse sim e está esperando.",
  });

  // 8) Cliente falou recentemente e nada foi registrado → o agente ouviu e não virou demanda.
  const comDemanda = new Set((demandas ?? []).filter((d) => (d.created_at as string) >= h7).map((d) => d.client_id as string));
  const falouSemRegistro = (clients ?? []).filter((c) =>
    c.last_client_msg_at && (c.last_client_msg_at as string) >= h7 && !comDemanda.has(c.id as string));
  if (falouSemRegistro.length) out.push({
    chave: "falou_sem_registro",
    titulo: "Clientes que falaram na semana sem nenhum registro do agente",
    gravidade: "baixa",
    quantos: falouSemRegistro.length,
    exemplos: amostra(falouSemRegistro.map((c) => nomeDe.get(c.id as string) || "—")),
    oQueFazer: "Normal se foi conversa solta. Se era pedido, o agente não captou — vale conferir o grupo.",
  });

  const ordem: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || b.quantos - a.quantos);
}

/** Formata pro WhatsApp (grupo interno). Retorna null quando está tudo conciliado. */
export function formatConciliacao(divs: Divergencia[]): string | null {
  if (!divs.length) return null;
  const icone: Record<Gravidade, string> = { alta: "🔴", media: "🟡", baixa: "⚪" };
  const linhas = ["🔄 *Varredura de sincronização* — o que aconteceu e não virou dado:"];
  for (const d of divs) {
    linhas.push(`\n${icone[d.gravidade]} *${d.titulo}* — ${d.quantos}`);
    if (d.exemplos.length) linhas.push(`   ${d.exemplos.join(" · ")}${d.quantos > d.exemplos.length ? ` +${d.quantos - d.exemplos.length}` : ""}`);
    linhas.push(`   _${d.oQueFazer}_`);
  }
  return linhas.join("\n");
}
