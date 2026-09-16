// lib/prospeccao/sheets-sync.ts — o espelho executivo no Google Sheets (V2 §6–§7).
//
// Supabase é a fonte da verdade; a planilha é reescrita inteira a cada sincronização e nunca é
// lida de volta. Quatro abas: Prospects (1 linha por empresa), Interações, Reuniões, Dashboard.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ProspectRow, ProspectMessageRow } from "./tipos";
import { estadoGoogle, planilhaId, escreverAba } from "./google";
import { etapaPipeline, ROTULO_ESTAGIO } from "./maquina";
import { rotuloFaixa } from "./score";
import { cnpjFormatado, nomeProprio } from "./normalizar";
import { dataCurtaSP, horaCurtaSP } from "./tempo";

const dt = (iso: string | null | undefined) => (iso ? `${dataCurtaSP(iso)} ${horaCurtaSP(iso)}` : "");
const d = (iso: string | null | undefined) => (iso ? dataCurtaSP(iso) : "");

export function linhasProspects(ps: ProspectRow[]): (string | number | null)[][] {
  const cab = ["ID", "Data entrada", "Empresa", "Razão social", "CNPJ", "CNAE", "Segmento", "Cidade", "UF", "Distância (km)", "Modalidade",
    "Telefone", "WhatsApp verificado", "Instagram", "Site", "Google nota", "Google avaliações", "Unidades", "Porte", "Faturamento (estimativa)", "Confiança estimativa",
    "Decisor", "Cargo", "Confiança decisor", "Fontes decisor", "Telefone decisor", "Score", "Classe", "Etapa", "Estágio", "Owner",
    "Primeira abordagem", "Última interação", "Próxima ação", "Próxima ação em", "Motivo próxima ação", "Objeções", "Resumo",
    "Reunião", "Tipo reunião", "Meet", "Resultado reunião", "Motivo perda", "Origem", "Precisa humano", "Atualizado em"];
  const linhas = ps.map((p) => [
    p.id, dt(p.created_at), p.nome, p.razao_social ?? "", cnpjFormatado(p.cnpj), p.cnae ?? "", p.segmento ?? "", p.cidade ?? "", p.uf ?? "",
    p.distancia_km ?? "", p.modalidade_preferida ?? "", p.telefone ?? "", p.whatsapp_verificado === null ? "" : p.whatsapp_verificado ? "sim" : "não",
    p.instagram ? `@${p.instagram}` : "", p.site ?? "", p.google_nota ?? "", p.google_avaliacoes ?? "", p.unidades ?? "", p.porte ?? "",
    p.faturamento_sinal ? rotuloFaixa[p.faturamento_sinal.faixa] : "", p.faturamento_sinal ? `${Math.round(p.faturamento_sinal.confianca * 100)}%` : "",
    p.decisor_nome ? nomeProprio(p.decisor_nome) : "", p.decisor_cargo ?? "", p.decisor_confianca !== null ? `${Math.round(p.decisor_confianca * 100)}%` : "",
    (p.decisor_fontes ?? []).join(" + "), p.decisor_telefone ?? "", p.score ?? "", p.classe ?? "", etapaPipeline(p.estagio), ROTULO_ESTAGIO[p.estagio] ?? p.estagio, p.owner,
    dt(p.primeira_abordagem_em), dt(p.ultima_interacao_em), p.next_action_type ?? "", dt(p.next_action_at), p.next_action_reason ?? "",
    (p.objecoes ?? []).join("; "), p.contexto_comercial?.resumo ?? "",
    dt(p.reuniao_em), p.reuniao_tipo ?? "", p.meet_url ?? "", p.resultado_reuniao ?? "", p.motivo_perda ?? "", p.origem ?? "", p.precisa_humano ? "sim" : "", dt(p.updated_at),
  ]);
  return [cab, ...linhas];
}

export function linhasInteracoes(ms: (ProspectMessageRow & { nome?: string })[], nomes: Map<string, string>): (string | number | null)[][] {
  const cab = ["Data", "Empresa", "Lead ID", "Direção", "Quem", "Mensagem", "Intenção", "Etapa anterior", "Etapa nova", "Enviada"];
  return [cab, ...ms.map((m) => [
    dt(m.created_at), nomes.get(m.prospect_id) ?? "", m.prospect_id, m.direcao === "in" ? "recebida" : "enviada", m.autor,
    m.texto.slice(0, 500), m.intent?.intent ?? "", m.estagio_antes ?? "", m.estagio_depois ?? "", m.enviado ? "sim" : `não (${m.erro ?? ""})`,
  ])];
}

export function linhasReunioes(ps: ProspectRow[]): (string | number | null)[][] {
  const cab = ["Empresa", "Decisor", "Telefone", "Formato", "Data", "Horário", "Meet", "Endereço", "Responsável", "Estágio", "Resultado"];
  return [cab, ...ps.filter((p) => p.reuniao_em).map((p) => [
    p.nome, p.decisor_nome ? nomeProprio(p.decisor_nome) : "", p.decisor_telefone ?? p.telefone ?? "", p.reuniao_tipo === "visita" ? "Visita" : "Google Meet",
    d(p.reuniao_em), horaCurtaSP(p.reuniao_em!), p.meet_url ?? "", p.reuniao_tipo === "visita" ? (p.endereco ?? "") : "", "Roberto", ROTULO_ESTAGIO[p.estagio], p.resultado_reuniao ?? "",
  ])];
}

export function linhasDashboard(ps: ProspectRow[], msgs: ProspectMessageRow[]): (string | number | null)[][] {
  const n = (f: (p: ProspectRow) => boolean) => ps.filter(f).length;
  const prospectados = n((p) => !!p.primeira_abordagem_em);
  const respostas = new Set(msgs.filter((m) => m.direcao === "in").map((m) => m.prospect_id)).size;
  const decisores = n((p) => ["decisor_contatado", "interesse", "horario_proposto", "aguardando_confirmacao", "reuniao_agendada", "handoff", "reuniao_realizada", "no_show", "proposta", "cliente"].includes(p.estagio));
  const interesse = n((p) => ["interesse", "horario_proposto", "aguardando_confirmacao", "reuniao_agendada", "handoff", "reuniao_realizada", "no_show", "proposta", "cliente"].includes(p.estagio));
  const reunioes = n((p) => !!p.reuniao_em && p.reuniao_tipo === "online");
  const visitas = n((p) => !!p.reuniao_em && p.reuniao_tipo === "visita");
  const realizadas = n((p) => ["reuniao_realizada", "proposta", "cliente"].includes(p.estagio));
  const propostas = n((p) => ["proposta", "cliente"].includes(p.estagio));
  const clientes = n((p) => p.estagio === "cliente");
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return [
    ["Indicador", "Valor"],
    ["Empresas mapeadas", ps.length],
    ["ICP aprovados (A/B)", n((p) => p.classe === "A" || p.classe === "B")],
    ["Prospectados (1ª abordagem)", prospectados],
    ["Respostas", respostas],
    ["Decisores alcançados", decisores],
    ["Interessados", interesse],
    ["Reuniões online", reunioes],
    ["Visitas", visitas],
    ["Realizadas", realizadas],
    ["Propostas", propostas],
    ["Clientes", clientes],
    ["Taxa de resposta", pct(respostas, prospectados)],
    ["Taxa de reunião", pct(reunioes + visitas, prospectados)],
    ["Taxa de venda", pct(clientes, prospectados)],
    ["Atualizado em", dt(new Date().toISOString())],
  ];
}

export async function sincronizarPlanilha(): Promise<{ ok: boolean; error?: string; linhas?: number; url?: string }> {
  const g = await estadoGoogle();
  if (!g.conectado) return { ok: false, error: "Google não conectado" };
  const id = await planilhaId();
  if (!id) return { ok: false, error: "planilha não criada (Configuração → criar planilha)" };
  const { data: ps } = await supabaseAdmin.from("prospects").select("*").order("created_at", { ascending: true }).limit(5000);
  const { data: ms } = await supabaseAdmin.from("prospect_messages").select("*").order("created_at", { ascending: true }).limit(20000);
  const prospects = (ps ?? []) as ProspectRow[];
  const msgs = (ms ?? []) as ProspectMessageRow[];
  const nomes = new Map(prospects.map((p) => [p.id, p.nome]));
  const abas: [string, (string | number | null)[][]][] = [
    ["Prospects", linhasProspects(prospects)],
    ["Interações", linhasInteracoes(msgs, nomes)],
    ["Reuniões", linhasReunioes(prospects)],
    ["Dashboard", linhasDashboard(prospects, msgs)],
  ];
  for (const [aba, linhas] of abas) {
    const r = await escreverAba(id, aba, linhas);
    if (!r.ok) return { ok: false, error: `${aba}: ${r.error}` };
  }
  return { ok: true, linhas: prospects.length, url: `https://docs.google.com/spreadsheets/d/${id}` };
}
