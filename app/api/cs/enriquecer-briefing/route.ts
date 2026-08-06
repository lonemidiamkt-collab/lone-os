// GET /api/cs/enriquecer-briefing?clientId=... — gera o RASCUNHO de briefing estratégico de um
// cliente (junta toda a matéria-prima + IA). Suggest-only: retorna pra revisão, NÃO grava.
// Gated: admin. O salvar (nova versão em client_briefings) vem depois do DDL do diagnóstico.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { papelDoUsuario } from "@/lib/api/require-role";

/**
 * Gestão vê qualquer cliente; o SOCIAL só os da carteira dele.
 *
 * Antes a rota exigia isAdmin puro — e o briefing é justamente o que o social precisa manter
 * (é dele que sai roteiro e planejamento). Deixar só pra gestão obrigava o Roberto a ser o
 * gargalo de todo briefing.
 *
 * A checagem é por CLIENTE, não só por papel: sem isso um social poderia ler e reescrever o
 * briefing de cliente que não é dele mandando outro clientId na mão.
 */
async function podeMexerNoBriefing(
  user: { email: string; isAdmin: boolean },
  clientId: string,
): Promise<boolean> {
  if (user.isAdmin) return true;
  const papel = await papelDoUsuario(user as never);
  if (papel === "admin" || papel === "manager") return true;

  // CADA PAPEL TEM SUA COLUNA DE CARTEIRA. Checar sempre `assigned_social` daria 403 pro tráfego
  // e pro designer, que também mantêm briefing dos clientes deles.
  const coluna =
    papel === "social" ? "assigned_social"
    : papel === "traffic" ? "assigned_traffic"
    : papel === "designer" ? "assigned_designer"
    : null;
  if (!coluna) return false;

  const { data: membro } = await supabaseAdmin
    .from("team_members").select("name").eq("email", (user.email || "").toLowerCase()).maybeSingle();
  const nome = (membro?.name as string) || "";
  if (!nome) return false;
  const { data: cli } = await supabaseAdmin
    .from("clients").select(coluna).eq("id", clientId).maybeSingle();
  return ((cli as Record<string, unknown> | null)?.[coluna] as string | null) === nome;
}
import { supabaseAdmin } from "@/lib/supabase/server";
import { coletarMateriaPrima, enriquecerBriefing, type BriefingEstruturado } from "@/lib/cs/enriquecer-briefing";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  if (!(await podeMexerNoBriefing(user, clientId))) {
    return NextResponse.json({ error: "Este cliente não está na sua carteira." }, { status: 403 });
  }

  // ?atual=1 → devolve o briefing VIGENTE pra edição, sem passar pela IA. Corrigir uma linha
  // errada não deveria custar uma regeração inteira (nem o risco de a IA mudar o resto).
  if (req.nextUrl.searchParams.get("atual") === "1") {
    const { data: atual } = await supabaseAdmin
      .from("client_briefings").select("*").eq("client_id", clientId).eq("is_current", true).maybeSingle();
    if (!atual) return NextResponse.json({ error: "Este cliente ainda não tem briefing salvo." }, { status: 404 });
    return NextResponse.json({ rascunho: atual, versaoAtual: atual.version });
  }

  const mp = await coletarMateriaPrima(clientId);
  if (!mp) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // que material foi encontrado (pra UI mostrar a base do rascunho)
  const fontes = {
    fixedBriefing: !!mp.fixedBriefing, campanha: !!mp.campaignBriefing, onboarding: !!mp.onboarding,
    ficha: !!mp.ficha, notas: !!mp.notes, briefingAtual: !!mp.briefingAtual,
  };

  const res = await enriquecerBriefing(mp);
  if (!res.ok || !res.data) return NextResponse.json({ error: res.error ?? "Falha ao gerar rascunho" }, { status: 502 });

  return NextResponse.json({ cliente: mp.nome, fontes, rascunho: res.data });
}

// POST — dois modos:
//   { clientId, materialExtra? }  → GERA o rascunho (incluindo material novo colado pelo time).
//   { clientId, rascunho }        → SALVA o rascunho revisado como nova versão (human-gated).
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientId = body?.clientId as string;
  const b = body?.rascunho as BriefingEstruturado | undefined;
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  if (!(await podeMexerNoBriefing(user, clientId))) {
    return NextResponse.json({ error: "Este cliente não está na sua carteira." }, { status: 403 });
  }

  // Modo GERAR (sem rascunho): junta material (+ o novo colado) e devolve o rascunho.
  if (!b) {
    const mp = await coletarMateriaPrima(clientId, (body?.materialExtra as string) || undefined);
    if (!mp) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    const fontes = {
      fixedBriefing: !!mp.fixedBriefing, campanha: !!mp.campaignBriefing, onboarding: !!mp.onboarding,
      ficha: !!mp.ficha, notas: !!mp.notes, briefingAtual: !!mp.briefingAtual, materialNovo: !!mp.materialExtra,
    };
    const res = await enriquecerBriefing(mp);
    if (!res.ok || !res.data) return NextResponse.json({ error: res.error ?? "Falha ao gerar rascunho" }, { status: 502 });
    return NextResponse.json({ cliente: mp.nome, fontes, rascunho: res.data });
  }
  // Modo SALVAR (com rascunho):

  // próxima versão + desmarca a atual
  const { data: cur } = await supabaseAdmin.from("client_briefings")
    .select("version").eq("client_id", clientId).order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = ((cur?.version as number) ?? 0) + 1;
  await supabaseAdmin.from("client_briefings").update({ is_current: false }).eq("client_id", clientId).eq("is_current", true);

  const { error } = await supabaseAdmin.from("client_briefings").insert({
    client_id: clientId, version: nextVersion, is_current: true,
    resumo_estrategico: b.resumo_estrategico, posicionamento: b.posicionamento,
    publico_alvo: b.publico_alvo, produtos: b.produtos, produtos_destaque_atual: b.produtos_destaque_atual,
    dores: b.dores, desejos: b.desejos, objecoes: b.objecoes,
    crenca_atual: b.crenca_atual, crenca_desejada: b.crenca_desejada,
    diferenciais: b.diferenciais, angulos_concorrencia: b.angulos_concorrencia,
    maturidade_marca: b.maturidade_marca, mix_pilares: b.mix_pilares,
    ganchos: b.ganchos, ctas: b.ctas, tom_voz: b.tom_voz, pessoa_verbal: b.pessoa_verbal,
    palavras_proibidas: b.palavras_proibidas, concorrentes_evitar_mencionar: b.concorrentes_evitar_mencionar,
    hashtags_padrao: b.hashtags_padrao, contato: b.contato, observacoes_estrategicas: b.observacoes_estrategicas,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, version: nextVersion });
}
