export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/api/require-role";
import { estadoMarketing, normalizarIdAds } from "@/lib/google/marketing-auth";
import { listarContasAds } from "@/lib/google/ads-api";
import { listarPerfis } from "@/lib/google/perfil-api";
import { listarPropriedades, PROPRIEDADE_VALIDA } from "@/lib/google/analytics-api";
import { sincronizarCliente, detectarVinculos } from "@/lib/google/sincronizar";
import { temColunasGoogle, temColunasAnalytics } from "@/lib/google/colunas";

// /api/clients/[id]/google — o Google do cliente na ficha (Admin › Google): conta do Google Ads e Perfil da Empresa.
//   GET  → o que está vinculado, a última leitura (quando, até que dia, o que falhou) e se a conexão está pronta.
//   POST { acao: "listar_ads" | "listar_perfis" } → as contas/perfis que a conexão enxerga, com quem já usa cada um
//   POST { acao: "vincular_ads", id, nome, loginId } | { acao: "vincular_perfil", local, nome }
//   POST { acao: "listar_analytics" } | { acao: "vincular_analytics", propriedade, nome } | { acao: "desvincular_analytics" }
//        → o site do cliente no Google Analytics (19/11/2026; precisa da migração 20261119100000)
//   POST { acao: "desvincular_ads" | "desvincular_perfil" }
//   POST { acao: "sincronizar" } → lê o Google agora (o mesmo da rotina das 7h) e devolve o resultado
// Vincular já dispara a primeira leitura (120 dias de Ads, 400 de Perfil): o próximo relatório já sai com número.
// Conta/perfil de OUTRO cliente: recusa (409) sem `transferir: true` — os números de um iriam para o outro.

const PAPEIS = ["admin", "manager", "traffic"] as const;
type Papel = (typeof PAPEIS)[number];

interface ClienteFicha {
  id: string; name: string | null; nome_fantasia: string | null;
  google_ads_customer_id: string | null; google_ads_nome: string | null; google_ads_login_id: string | null;
  google_perfil_local: string | null; google_perfil_nome: string | null;
  google_analytics_propriedade?: string | null; google_analytics_nome?: string | null;
}

async function lerCliente(id: string): Promise<{ data: ClienteFicha | null; error: { message: string } | null }> {
  const ga = await temColunasAnalytics();
  const r = await supabaseAdmin.from("clients")
    .select(`id, name, nome_fantasia, google_ads_customer_id, google_ads_nome, google_ads_login_id, google_perfil_local, google_perfil_nome${ga ? ", google_analytics_propriedade, google_analytics_nome" : ""}`)
    .eq("id", id).maybeSingle();
  return { data: (r.data ?? null) as unknown as ClienteFicha | null, error: r.error };
}

/** O que a rotina de leitura precisa do cliente. */
const paraLer = (c: ClienteFicha) => ({
  id: c.id, google_ads_customer_id: c.google_ads_customer_id, google_ads_login_id: c.google_ads_login_id,
  google_perfil_local: c.google_perfil_local, google_analytics_propriedade: c.google_analytics_propriedade ?? null,
});

const semMigracao = NextResponse.json({ error: "O Google ainda não foi ligado no banco: falta aplicar a migração 20261118120000_google_relatorios.sql." }, { status: 503 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, [...PAPEIS]);
  if (gate instanceof NextResponse) return gate;
  if (!(await temColunasGoogle())) return semMigracao;
  const { id } = await params;
  const [{ data: c, error }, { data: s }, conexao, { data: sug }, ga] = await Promise.all([
    lerCliente(id),
    supabaseAdmin.from("google_sincronia").select("*").eq("client_id", id).maybeSingle(),
    estadoMarketing(),
    supabaseAdmin.from("google_sugestoes").select("tipo, chave, nome, login_id, motivo").eq("client_id", id),
    temColunasAnalytics(),
  ]);
  if (error) return NextResponse.json({ error: `Não consegui ler o cliente: ${error.message}` }, { status: 500 });
  if (!c) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  return NextResponse.json({
    ads: c.google_ads_customer_id ? { id: c.google_ads_customer_id, nome: c.google_ads_nome, loginId: c.google_ads_login_id } : null,
    perfil: c.google_perfil_local ? { local: c.google_perfil_local, nome: c.google_perfil_nome } : null,
    analytics: c.google_analytics_propriedade ? { propriedade: c.google_analytics_propriedade, nome: c.google_analytics_nome ?? null } : null,
    /** false = banco sem a migração do Analytics: a ficha não mostra o bloco. */
    analyticsDisponivel: ga,
    sincronia: s ?? null,
    // O que a procura automática achou e não vinculou sozinha (dúvida): a pessoa confirma.
    sugestoes: ((sug ?? []) as { tipo: string; chave: string; nome: string | null; login_id: string | null; motivo: string | null }[])
      .filter((x) => (x.tipo === "ads" ? !c.google_ads_customer_id : x.tipo === "perfil" ? !c.google_perfil_local : !c.google_analytics_propriedade)),
    conexao: { conectado: conexao.conectado, ads: conexao.ads, perfil: conexao.perfil, analytics: conexao.analytics, email: conexao.email },
    podeAlterar: PAPEIS.includes(gate.papel as Papel),
  });
}

/** Clientes (ativos ou não) que já usam esta conta/perfil, menos este. */
async function donos(coluna: "google_ads_customer_id" | "google_perfil_local" | "google_analytics_propriedade", valores: string[], menos: string) {
  if (!valores.length) return new Map<string, string[]>();
  const { data } = await supabaseAdmin.from("clients").select(`id, name, nome_fantasia, ${coluna}`).in(coluna, valores);
  const m = new Map<string, string[]>();
  for (const r of (data ?? []) as unknown as Record<string, string | null>[]) {
    if (r.id === menos) continue;
    const k = r[coluna] as string;
    m.set(k, [...(m.get(k) ?? []), (r.nome_fantasia || r.name || "outro cliente") as string]);
  }
  return m;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, [...PAPEIS]);
  if (gate instanceof NextResponse) return gate;
  if (!(await temColunasGoogle())) return semMigracao;
  const { id } = await params;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const acao = String(b?.acao ?? "");

  const { data: c, error } = await lerCliente(id);
  if (error) return NextResponse.json({ error: `Não consegui ler o cliente: ${error.message}` }, { status: 500 });
  if (!c) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  if (acao === "procurar") {
    // A mesma procura da rotina das 7h, agora (para o cliente que acabou de dar acesso à Lone).
    const d = await detectarVinculos();
    const deste = d.vinculados.filter((v) => v.clientId === id);
    if (deste.length) {
      const atual = await lerCliente(id);
      if (atual.data) await sincronizarCliente(paraLer(atual.data));
    }
    return NextResponse.json({ ok: !d.erros.length, vinculadosAqui: deste, vinculadosNaBase: d.vinculados.length, sugestoes: d.sugestoes, ...(d.erros.length ? { error: d.erros.join(" · ") } : {}) }, { status: d.erros.length && !deste.length ? 502 : 200 });
  }
  if (acao === "listar_ads") {
    const r = await listarContasAds();
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 502 });
    const d = await donos("google_ads_customer_id", r.dados.map((x) => x.id), id);
    return NextResponse.json({ contas: r.dados.map((x) => ({ ...x, outros: d.get(x.id) ?? [] })) });
  }
  if (acao === "listar_perfis") {
    const r = await listarPerfis();
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 502 });
    const d = await donos("google_perfil_local", r.dados.map((x) => x.local), id);
    return NextResponse.json({ perfis: r.dados.map((x) => ({ ...x, outros: d.get(x.local) ?? [] })) });
  }

  if (acao === "listar_analytics") {
    if (!(await temColunasAnalytics())) return NextResponse.json({ error: "Falta aplicar a migração 20261119100000_google_analytics.sql no banco." }, { status: 503 });
    const r = await listarPropriedades();
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 502 });
    const d = await donos("google_analytics_propriedade", r.dados.map((x) => x.propriedade), id);
    return NextResponse.json({ propriedades: r.dados.map((x) => ({ ...x, outros: d.get(x.propriedade) ?? [] })) });
  }

  const gravar = async (campos: Record<string, unknown>) => {
    const { error: e } = await supabaseAdmin.from("clients").update(campos).eq("id", id);
    return e ? `Não consegui gravar na ficha: ${e.message}` : null;
  };

  if (acao === "vincular_ads") {
    const conta = normalizarIdAds(String(b?.id ?? ""));
    if (!conta) return NextResponse.json({ error: "ID da conta do Google Ads inválido (são 10 dígitos, como 123-456-7890)." }, { status: 400 });
    const login = b?.loginId ? normalizarIdAds(String(b.loginId)) : null;
    const outros = (await donos("google_ads_customer_id", [conta], id)).get(conta) ?? [];
    if (outros.length && b?.transferir !== true) {
      return NextResponse.json({ error: `Esta conta já está na ficha de ${outros.join(", ")}. Transferir para cá tira os números do Google de lá.`, outros }, { status: 409 });
    }
    if (outros.length) {
      const { error: e } = await supabaseAdmin.from("clients").update({ google_ads_customer_id: null, google_ads_nome: null, google_ads_login_id: null }).eq("google_ads_customer_id", conta).neq("id", id);
      if (e) return NextResponse.json({ error: `Não consegui tirar a conta do outro cliente: ${e.message}` }, { status: 500 });
    }
    const erro = await gravar({ google_ads_customer_id: conta, google_ads_nome: String(b?.nome ?? "").slice(0, 200) || null, google_ads_login_id: login });
    if (erro) return NextResponse.json({ error: erro }, { status: 500 });
    // Conta nova: zera o estado de leitura do Ads para a primeira leitura ser a longa (120 dias).
    if (c.google_ads_customer_id !== conta) await supabaseAdmin.from("google_sincronia").upsert({ client_id: id, ads_sincronizado_em: null, ads_erro: null, ads_moeda: null }, { onConflict: "client_id" });
    const s = await sincronizarCliente({ id, google_ads_customer_id: conta, google_ads_login_id: login, google_perfil_local: null });
    return NextResponse.json({ ok: true, leitura: s.ads });
  }
  if (acao === "vincular_perfil") {
    const local = String(b?.local ?? "");
    if (!/^locations\/\d+$/.test(local)) return NextResponse.json({ error: "Perfil da Empresa inválido." }, { status: 400 });
    const outros = (await donos("google_perfil_local", [local], id)).get(local) ?? [];
    if (outros.length && b?.transferir !== true) {
      return NextResponse.json({ error: `Este perfil já está na ficha de ${outros.join(", ")}. Transferir para cá tira os números do perfil de lá.`, outros }, { status: 409 });
    }
    if (outros.length) {
      const { error: e } = await supabaseAdmin.from("clients").update({ google_perfil_local: null, google_perfil_nome: null }).eq("google_perfil_local", local).neq("id", id);
      if (e) return NextResponse.json({ error: `Não consegui tirar o perfil do outro cliente: ${e.message}` }, { status: 500 });
    }
    const erro = await gravar({ google_perfil_local: local, google_perfil_nome: String(b?.nome ?? "").slice(0, 200) || null });
    if (erro) return NextResponse.json({ error: erro }, { status: 500 });
    if (c.google_perfil_local !== local) await supabaseAdmin.from("google_sincronia").upsert({ client_id: id, perfil_sincronizado_em: null, perfil_erro: null, perfil_ultimo_dia: null }, { onConflict: "client_id" });
    const s = await sincronizarCliente({ id, google_ads_customer_id: null, google_ads_login_id: null, google_perfil_local: local });
    return NextResponse.json({ ok: true, leitura: s.perfil });
  }
  if (acao === "vincular_analytics") {
    if (!(await temColunasAnalytics())) return NextResponse.json({ error: "Falta aplicar a migração 20261119100000_google_analytics.sql no banco." }, { status: 503 });
    const prop = String(b?.propriedade ?? "");
    if (!PROPRIEDADE_VALIDA.test(prop)) return NextResponse.json({ error: "Propriedade do Google Analytics inválida." }, { status: 400 });
    const outros = (await donos("google_analytics_propriedade", [prop], id)).get(prop) ?? [];
    if (outros.length && b?.transferir !== true) {
      return NextResponse.json({ error: `Esta propriedade já está na ficha de ${outros.join(", ")}. Transferir para cá tira os números do site de lá.`, outros }, { status: 409 });
    }
    if (outros.length) {
      const { error: e } = await supabaseAdmin.from("clients").update({ google_analytics_propriedade: null, google_analytics_nome: null }).eq("google_analytics_propriedade", prop).neq("id", id);
      if (e) return NextResponse.json({ error: `Não consegui tirar a propriedade do outro cliente: ${e.message}` }, { status: 500 });
    }
    const erro = await gravar({ google_analytics_propriedade: prop, google_analytics_nome: String(b?.nome ?? "").slice(0, 200) || null });
    if (erro) return NextResponse.json({ error: erro }, { status: 500 });
    // Propriedade nova: a primeira leitura é a longa (400 dias).
    if (c.google_analytics_propriedade !== prop) await supabaseAdmin.from("google_sincronia").upsert({ client_id: id, analytics_sincronizado_em: null, analytics_erro: null }, { onConflict: "client_id" });
    const s = await sincronizarCliente({ id, google_ads_customer_id: null, google_ads_login_id: null, google_perfil_local: null, google_analytics_propriedade: prop });
    return NextResponse.json({ ok: true, leitura: s.analytics ?? null });
  }
  if (acao === "desvincular_analytics") {
    const erro = await gravar({ google_analytics_propriedade: null, google_analytics_nome: null });
    return erro ? NextResponse.json({ error: erro }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (acao === "desvincular_ads") {
    const erro = await gravar({ google_ads_customer_id: null, google_ads_nome: null, google_ads_login_id: null });
    return erro ? NextResponse.json({ error: erro }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (acao === "desvincular_perfil") {
    const erro = await gravar({ google_perfil_local: null, google_perfil_nome: null });
    return erro ? NextResponse.json({ error: erro }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (acao === "sincronizar") {
    if (!c.google_ads_customer_id && !c.google_perfil_local && !c.google_analytics_propriedade) return NextResponse.json({ error: "Nada do Google vinculado a este cliente." }, { status: 400 });
    const s = await sincronizarCliente(paraLer(c), { refazerTudo: b?.refazerTudo === true });
    const falhou = [
      s.ads && !s.ads.ok ? `Google Ads: ${s.ads.erro}` : null,
      s.perfil && !s.perfil.ok ? `Perfil: ${s.perfil.erro}` : null,
      s.analytics && !s.analytics.ok ? `Analytics: ${s.analytics.erro}` : null,
    ].filter(Boolean);
    return NextResponse.json({ ok: !falhou.length, resultado: s, ...(falhou.length ? { error: falhou.join(" · ") } : {}) }, { status: falhou.length ? 502 : 200 });
  }
  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}
