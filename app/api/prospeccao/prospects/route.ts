export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";

import { funil, conversas, aging, sla, type ProspectMin, type EventoMin, type MensagemMin } from "@/lib/prospeccao/metricas";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual } from "@/lib/prospeccao/piloto";

const COLS_MIN = "id, nome, estagio, owner, modo_agente, precisa_humano, primeira_abordagem_em, ultima_msg_de, ultima_interacao_em, next_action_at, next_action_type, score, classe, ranking_dia, ranking_pos, updated_at, reuniao_em";

/**
 * Filtros do cockpit que não são coluna: quem ALCANÇOU um passo do funil, quem espera a Lone/o
 * prospect, faixa de aging, SLA estourado. Resolvidos em memória (mesmas funções do dashboard) e
 * devolvidos como lista de ids para a query principal.
 */
async function idsDoCockpit(q: URLSearchParams): Promise<string[] | null> {
  const alcancou = q.get("alcancou"), aguardando = q.get("aguardando"), agingFaixa = q.get("aging"), slaFora = q.get("sla");
  if (!alcancou && !aguardando && !agingFaixa && !slaFora) return null;
  const campanha = await campanhaAtual();
  const inicio = campanha?.iniciado_em ?? "2026-01-01";
  const [{ data: psRaw }, { data: evRaw }, { data: msRaw }] = await Promise.all([
    supabaseAdmin.from("prospects").select(COLS_MIN).limit(10000),
    supabaseAdmin.from("prospect_events").select("prospect_id, tipo, para, created_at").gte("created_at", inicio).limit(50000),
    supabaseAdmin.from("prospect_messages").select("prospect_id, direcao, autor, enviado, eh_primeira_abordagem, created_at").gte("created_at", inicio).limit(50000),
  ]);
  const ps = (psRaw ?? []) as ProspectMin[], ev = (evRaw ?? []) as EventoMin[], ms = (msRaw ?? []) as MensagemMin[];
  if (alcancou) return funil(ps, ev, ms).find((x) => x.chave === alcancou)?.ids ?? [];
  if (aguardando) {
    const c = conversas(ps, ms);
    return aguardando === "lone" ? c.ids_aguardando_lone : aguardando === "prospect" ? c.ids_aguardando_prospect : c.ids_sem_resposta;
  }
  if (agingFaixa) return aging(ps, ev).find((x) => x.chave === agingFaixa)?.ids ?? [];
  const cfg = await carregarConfig();
  return sla(ps, ms, cfg, campanha).ids_fora_agora;
}

// GET /api/prospeccao/prospects?estagio=&classe=&cidade=&segmento=&q=&humano=1&limite=&pagina=
//   + filtros do cockpit: alcancou=<passo do funil> · aguardando=lone|prospect|sem_resposta · aging=<faixa> · sla=fora · ids=a,b,c
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const q = req.nextUrl.searchParams;
  const limite = Math.min(500, Number(q.get("limite") ?? "") || 200);
  const pagina = Math.max(0, Number(q.get("pagina") ?? "") || 0);
  const idsCockpit = await idsDoCockpit(q);
  const idsParam = q.get("ids")?.split(",").filter(Boolean);
  const ids = idsCockpit && idsParam ? idsCockpit.filter((i) => idsParam.includes(i)) : (idsCockpit ?? idsParam ?? null);
  if (ids && ids.length === 0) return NextResponse.json({ ok: true, prospects: [], total: 0, filtros: { cidades: [], segmentos: [] } });
  let query = supabaseAdmin.from("prospects").select(
    "id, nome, cidade, uf, segmento, classe, score, estagio, etapa_pipeline, owner, modo_agente, precisa_humano, motivo_humano, decisor_nome, decisor_confianca, distancia_km, modalidade_preferida, telefone, whatsapp_verificado, instagram, next_action_type, next_action_at, next_action_owner, ultima_interacao_em, ultima_msg_de, reuniao_em, reuniao_tipo, ranking_dia, ranking_pos, primeira_abordagem_em, origem, created_at, updated_at",
    { count: "exact" },
  );
  if (ids) query = query.in("id", ids.slice(0, 2000));
  const estagios = q.get("estagio")?.split(",").filter(Boolean);
  if (estagios?.length) query = query.in("estagio", estagios);
  const classes = q.get("classe")?.split(",").filter(Boolean);
  if (classes?.length) query = query.in("classe", classes);
  if (q.get("cidade")) query = query.eq("cidade", q.get("cidade")!);
  if (q.get("segmento")) query = query.eq("segmento", q.get("segmento")!);
  if (q.get("humano")) query = query.eq("precisa_humano", true);
  if (q.get("modalidade")) query = query.eq("modalidade_preferida", q.get("modalidade")!);
  const busca = q.get("q")?.trim();
  if (busca) query = query.or(`nome.ilike.%${busca}%,razao_social.ilike.%${busca}%,decisor_nome.ilike.%${busca}%,telefone.ilike.%${busca.replace(/\D/g, "") || busca}%,instagram.ilike.%${busca}%`);
  const ordem = q.get("ordem") ?? "score";
  if (ordem === "recentes") query = query.order("updated_at", { ascending: false });
  else if (ordem === "proxima") query = query.order("next_action_at", { ascending: true, nullsFirst: false });
  else query = query.order("score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const { data, error, count } = await query.range(pagina * limite, pagina * limite + limite - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: cidades } = await supabaseAdmin.from("prospects").select("cidade").not("cidade", "is", null).limit(5000);
  const { data: segmentos } = await supabaseAdmin.from("prospects").select("segmento").not("segmento", "is", null).limit(5000);
  const uniq = (xs: unknown[]) => Array.from(new Set(xs.map((x) => String(x)))).sort();
  return NextResponse.json({ ok: true, prospects: data ?? [], total: count ?? 0, filtros: { cidades: uniq((cidades ?? []).map((c) => c.cidade)), segmentos: uniq((segmentos ?? []).map((s) => s.segmento)) } });
}
