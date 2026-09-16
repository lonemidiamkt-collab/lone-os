export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { carregarConfig } from "@/lib/prospeccao/config";
import { decidirEResponder } from "@/lib/prospeccao/conversa";
import { abordagemInicial } from "@/lib/prospeccao/mensagens";
import { etapaPipeline } from "@/lib/prospeccao/maquina";
import type { ProspectRow, Estagio } from "@/lib/prospeccao/tipos";

// POST /api/prospeccao/simular — o Roberto faz o papel do prospect; o agente decide SEM enviar
// nem gravar. Corpo: { prospect: {nome, cidade, segmento, decisor_nome, distancia_km, ...},
// estagio, historico: [{autor, texto}], mensagem, contexto_comercial }.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => null)) as {
    prospect?: Partial<ProspectRow>; estagio?: Estagio; historico?: { autor: string; texto: string }[]; mensagem?: string; contexto_comercial?: Record<string, unknown>;
  } | null;
  if (!body?.mensagem?.trim()) return NextResponse.json({ error: "mensagem obrigatória" }, { status: 400 });
  const cfg = await carregarConfig();
  const agora = new Date();
  const p: ProspectRow = {
    id: "00000000-0000-0000-0000-000000000000", campanha_id: null, nome: "Casa do Piso (simulação)", razao_social: null, cnpj: null, cnae: null, cnae_descricao: null,
    segmento: "Pisos e revestimentos", cidade: "Cabo Frio", uf: "RJ", endereco: "Av. Principal, 100", cep: null, lat: null, lng: null, distancia_km: 45, modalidade_preferida: "visita",
    site: null, instagram: "casadopiso", telefone: "5522999990000", whatsapp_jid: "5522999990000@s.whatsapp.net", whatsapp_lid: null, whatsapp_verificado: true, email: null,
    google_maps_url: null, google_nota: 4.6, google_avaliacoes: 320, unidades: 2, porte: "EPP", capital_social: 200000, abertura: "2010-03-01", fontes: {}, dados_cnpj: null,
    presenca: { instagram_followers: 12000, posts_por_semana: 3, anuncia: true, anuncia_fonte: "simulação" }, faturamento_sinal: null,
    diagnostico: { oportunidades: ["2 lojas e 320 avaliações no Google", "Instagram com 12 mil seguidores"], por_que_prospectar: "Estrutura para absorver demanda.", abordagem_recomendada: "geração de demanda pelo WhatsApp", gancho: "Vi que vocês têm duas lojas e mais de 300 avaliações no Google" },
    score: 88, score_detalhe: null, classe: "A", decisor_nome: "Marcelo Ferreira", decisor_cargo: "Sócio administrador", decisor_confianca: 0.9, decisor_fontes: ["CNPJ"], decisor_telefone: null, decisor_instagram: null,
    estagio: body.estagio ?? "abordado", etapa_pipeline: etapaPipeline(body.estagio ?? "abordado"), owner: "SDR_AI", modo_agente: "ativo", pausado_ate: null, precisa_humano: false, motivo_humano: null,
    next_action_type: null, next_action_at: null, next_action_owner: null, next_action_reason: null, ultima_interacao_em: null, ultima_msg_de: null, followups: 0, cadencia_cancelada: false,
    contexto_comercial: (body.contexto_comercial ?? {}) as ProspectRow["contexto_comercial"], objecoes: [], gift_reserved: false, gift_type: null, gift_status: null,
    reuniao_em: null, reuniao_tipo: null, meeting_id: null, google_event_id: null, meet_url: null, crm_lead_id: null, resultado_reuniao: null, motivo_perda: null, variante_abordagem: null,
    primeira_abordagem_em: agora.toISOString(), ranking_dia: null, ranking_pos: null, quality_gate: null, origem: "simulacao", origem_query: null, created_at: agora.toISOString(), updated_at: agora.toISOString(),
    ...(body.prospect ?? {}),
  } as ProspectRow;
  const historico = body.historico?.length ? body.historico : [{ autor: "agente", texto: abordagemInicial(p, cfg) }];
  return comExecucao({ origem: "prospeccao:simulador", ator: gate.user.email }, async () => {
    const r = await decidirEResponder(p, body.mensagem!.trim(), { dry: true, cfg, historico, agora });
    return NextResponse.json({
      ok: true, resposta: r.resposta ?? null, respondeu: r.respondeu, intent: r.intent ?? null, estagio_antes: r.estagio_antes, estagio_depois: r.estagio_depois,
      motivo: r.motivo ?? null, precisa_humano: !!r.precisa_humano, contexto_comercial: r.prospect.contexto_comercial, abordagem: historico[0]?.texto,
    });
  });
}
