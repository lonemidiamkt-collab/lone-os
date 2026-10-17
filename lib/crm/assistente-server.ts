// lib/crm/assistente-server.ts — executa o LONINHO NO GRUPO DE VENDAS (CS_VENDAS_GROUP_JID).
// Chamado pelo webhook (app/api/cs/inbound) ANTES de qualquer outro fluxo: o grupo de vendas não é
// grupo de cliente, não entra no corpus de estilo e não vira demanda. A decisão mora em
// lib/crm/assistente.ts (puro, testado); aqui só banco, IA e WhatsApp.
//
// Portas, nesta ordem: foi chamado pelo nome? → quem falou é sócio (PAPEIS_COMERCIAL, por
// team_members)? → a IA interpretou? → cada ação conferida em código → resposta citando a mensagem.

import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";
import { csSendGroupText, csFetchMediaBase64 } from "@/lib/cs/notify";
import { transcribeAudio } from "@/lib/cs/transcribe";
import { quemEh } from "@/lib/cs/autoridade";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { hojeSP } from "@/lib/crm/meta";
import { carregarExtras, EXTRAS_VAZIOS, type ExtrasLead } from "@/lib/crm/extras";
import { montarFilaHoje, inicioDaCadencia } from "@/lib/crm/hoje";
import { proximoToque, rotuloToque, TIPOS_TOQUE } from "@/lib/crm/cadencia";
import { registrarAtividade } from "@/lib/crm/registrar-atividade";
import { textoFollowupsGrupo } from "@/lib/crm/grupo-vendas";
import {
  chamaOLoninho, chamadaDireta, AJUDA, leadsDoPedido, montarPedido, planejarPassos, SCHEMA_ASSISTENTE, diaPorExtenso,
  textoAgendado, textoRegistrado, textoConsulta, textoCadastrado, TEXTO_SEM_AUTORIDADE, TEXTO_IA_FORA,
  type RespostaIA, type Passo,
} from "@/lib/crm/assistente";
import type { CrmLead } from "@/lib/types";

export interface MensagemGrupo {
  groupJid: string;
  authorJid: string;
  authorName?: string;
  text: string;
  messageId: string;
  isAudio?: boolean;
}

export const ehGrupoVendas = (jid: string | null | undefined) => !!jid && !!process.env.CS_VENDAS_GROUP_JID && jid === process.env.CS_VENDAS_GROUP_JID;

const responder = (msg: MensagemGrupo, texto: string) =>
  csSendGroupText(msg.groupJid, texto, msg.messageId || undefined, { origem: "crm-assistente", destino: "interno" });

function proximoPasso(l: CrmLead, extras: ExtrasLead, hoje: string): string | null {
  if (l.reuniaoData && l.reuniaoData >= hoje) return `Reunião em ${diaPorExtenso(l.reuniaoData)}`;
  if (l.retomarEm && l.retomarEm > hoje) return `Follow-up marcado para ${diaPorExtenso(l.retomarEm)}`;
  if (l.retomarEm && l.retomarEm <= hoje) return "Retomar hoje";
  const t = proximoToque({ estagio: l.estagio, inicio: inicioDaCadencia({ ...l, cadenciaInicio: extras.cadenciaInicio ?? null }), toques: extras.avancos ?? [], hoje, retomarEm: l.retomarEm });
  if (t) return rotuloToque(t);
  if (l.proximoContato) return `Contato marcado para ${diaPorExtenso(l.proximoContato)}`;
  return null;
}
const EXTRAS_DE = (m: Map<string, ExtrasLead>, id: string): ExtrasLead => m.get(id) ?? EXTRAS_VAZIOS;

export async function tratarGrupoVendas(msg: MensagemGrupo, rawData: { key?: unknown; message?: unknown }): Promise<Record<string, unknown>> {
  // Nota de voz: só transcreve quem pode mandar (sócio) — o resto do grupo não gasta Whisper.
  let texto = (msg.text ?? "").trim();
  const autor = await quemEh(msg.authorJid);
  const ehSocio = !!autor && (PAPEIS_COMERCIAL as string[]).includes(autor.papel);
  if (!texto && msg.isAudio) {
    if (!ehSocio || !isOpenAIConfigured()) return { ok: true, skip: "áudio no grupo de vendas (não transcrito)" };
    const media = await csFetchMediaBase64(rawData);
    if (!media.base64 || media.base64.length > 8_000_000) return { ok: true, skip: "áudio sem mídia ou longo" };
    texto = (await transcribeAudio(media.base64, media.mimetype, "Lone Mídia, comercial, follow-up, lojas de material de construção")).trim();
  }
  if (!texto || !chamaOLoninho(texto)) return { ok: true, skip: "grupo de vendas: não chamou o Loninho" };
  if (!ehSocio) {
    await responder(msg, TEXTO_SEM_AUTORIDADE);
    return { ok: true, skip: "sem autoridade no grupo de vendas" };
  }
  if (!isOpenAIConfigured()) { await responder(msg, TEXTO_IA_FORA); return { ok: false, erro: "IA off" }; }

  const hoje = hojeSP();
  const r = await interpretar(texto, autor!.nome, hoje);
  if (!r.ok) {
    console.error("[crm-assistente] IA falhou:", r.erro);
    await responder(msg, TEXTO_IA_FORA);
    return { ok: false, erro: r.erro };
  }
  const { passos, todos } = r;
  if (!passos.length) {
    // A IA não viu pedido. Chamado direto ("Loninho, …") → explica o que faz; nome citado no meio da conversa → silêncio.
    if (chamadaDireta(texto)) await responder(msg, AJUDA);
    return { ok: true, skip: "sem pedido para o Loninho" };
  }

  const linhas: string[] = [];
  for (const p of passos) {
    try { linhas.push(await executar(p, autor!.nome, hoje, todos)); }
    catch (e) {
      console.error(`[crm-assistente] ${p.tipo} falhou:`, e instanceof Error ? e.message : e);
      linhas.push("Não consegui gravar isso agora. Tenta de novo ou faz pelo painel do Comercial.");
    }
  }
  await responder(msg, linhas.join("\n\n"));
  console.log(`[crm-assistente] ${autor!.nome}: ${passos.map((p) => p.tipo).join(", ")}`);
  return { ok: true, passos: passos.map((p) => p.tipo) };
}

/** A frase vira passos conferidos (IA + código), sem gravar nada. Usado também pelo ensaio do cron. */
export async function interpretar(texto: string, autorNome: string, hoje: string):
  Promise<{ ok: true; passos: Passo<CrmLead>[]; todos: CrmLead[] } | { ok: false; erro: string }> {
  const [todos, clientesQ] = await Promise.all([
    db.fetchCrmLeads(),
    supabaseAdmin.from("clients").select("name, phone, contact_phone, company_phone, whatsapp_team_phone").limit(3000),
  ]);
  const lista = leadsDoPedido(todos);
  const pedido = montarPedido({ texto: texto.slice(0, 1500), autor: autorNome, hoje, leads: lista });
  const ia = await chatJson<RespostaIA>({
    model: "gpt-4o-mini", system: pedido.system, user: pedido.user, schema: SCHEMA_ASSISTENTE, schemaName: "crm_assistente",
    maxTokens: 600, temperature: 0, origem: "crm:assistente",
  });
  if (!ia.ok) return { ok: false, erro: ia.error ?? "IA sem resposta" };
  const passos = planejarPassos({
    resposta: ia.data, lista, todos, hoje,
    clientes: (clientesQ.data ?? []).map((c) => ({ nome: c.name as string, telefones: [c.phone, c.contact_phone, c.company_phone, c.whatsapp_team_phone] as (string | null)[] })),
  });
  return { ok: true, passos, todos };
}

async function executar(p: Passo<CrmLead>, autor: string, hoje: string, todos: CrmLead[]): Promise<string> {
  switch (p.tipo) {
    case "responder":
      return p.texto;
    case "agendar": {
      await db.updateCrmLead(p.lead.id, { retomarEm: p.data });
      await db.insertLeadActivity({
        leadId: p.lead.id, tipo: "nota", autor,
        texto: `Follow-up marcado para ${diaPorExtenso(p.data)} pelo grupo de vendas${p.resumo ? `: ${p.resumo}` : "."}`,
      });
      return textoAgendado(p.lead, p.data, hoje);
    }
    case "registrar": {
      const { lead } = await registrarAtividade({ leadId: p.lead.id, tipo: p.atividade, texto: `${p.resumo} (pelo grupo de vendas)`, autor });
      return textoRegistrado(p.lead, p.atividade, p.resumo, lead?.estagio === "contato" && p.lead.estagio === "novo");
    }
    case "consultar_lead": {
      const [extras, atividades] = await Promise.all([carregarExtras([p.lead.id]), db.fetchLeadActivities(p.lead.id)]);
      const ultimoToque = atividades.find((a) => TIPOS_TOQUE.has(a.tipo));
      return textoConsulta({
        lead: p.lead, hoje,
        ultimo: ultimoToque ? { tipo: ultimoToque.tipo, quando: new Date(ultimoToque.createdAt).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) } : null,
        proximo: proximoPasso(p.lead, EXTRAS_DE(extras, p.lead.id), hoje),
      });
    }
    case "consultar_hoje": {
      const extras = await carregarExtras(todos.map((l) => l.id));
      const fila = montarFilaHoje(todos.map((l) => ({ ...l, ...EXTRAS_DE(extras, l.id) })), hoje, new Date());
      const fazer = fila.filter((i) => i.grupo !== "fim");
      return textoFollowupsGrupo(fazer.map((i) => ({ empresa: i.lead.empresa, contatoNome: i.lead.contatoNome, motivo: i.motivo })), fila.length - fazer.length)
        ?? "Nada para hoje: nenhum follow-up vencido, retomada ou lead novo esperando.";
    }
    case "cadastrar": {
      await db.insertCrmLead({
        contatoNome: p.contato, empresa: p.empresa, telefone: p.telefone, estagio: "novo",
        origem: "Grupo de vendas", responsavel: autor, etapaDesde: new Date().toISOString(),
      });
      return textoCadastrado(p.empresa, p.contato, p.telefone);
    }
  }
}
