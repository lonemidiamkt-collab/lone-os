export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/api/require-role";
import { estadoMarketing, normalizarIdAds } from "@/lib/google/marketing-auth";
import { listarContasAds } from "@/lib/google/ads-api";
import { listarPerfis } from "@/lib/google/perfil-api";
import { sincronizarCliente, detectarVinculos } from "@/lib/google/sincronizar";
import { temColunasGoogle } from "@/lib/google/colunas";

// /api/clients/[id]/google — o Google do cliente na ficha (Admin › Google): conta do Google Ads e Perfil da Empresa.
//   GET  → o que está vinculado, a última leitura (quando, até que dia, o que falhou) e se a conexão está pronta.
//   POST { acao: "listar_ads" | "listar_perfis" } → as contas/perfis que a conexão enxerga, com quem já usa cada um
//   POST { acao: "vincular_ads", id, nome, loginId } | { acao: "vincular_perfil", local, nome }
//   POST { acao: "desvincular_ads" | "desvincular_perfil" }
//   POST { acao: "sincronizar" } → lê o Google agora (o mesmo da rotina das 7h) e devolve o resultado
// Vincular já dispara a primeira leitura (120 dias de Ads, 400 de Perfil): o próximo relatório já sai com número.
// Conta/perfil de OUTRO cliente: recusa (409) sem `transferir: true` — os números de um iriam para o outro.

const PAPEIS = ["admin", "manager", "traffic"] as const;
type Papel = (typeof PAPEIS)[number];

async function lerCliente(id: string) {
  return supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, google_ads_customer_id, google_ads_nome, google_ads_login_id, google_perfil_local, google_perfil_nome")
    .eq("id", id).maybeSingle();
}

const semMigracao = NextResponse.json({ error: "O Google ainda não foi ligado no banco: falta aplicar a migração 20261118120000_google_relatorios.sql." }, { status: 503 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, [...PAPEIS]);
  if (gate instanceof NextResponse) return gate;
  if (!(await temColunasGoogle())) return semMigracao;
  const { id } = await params;
  const [{ data: c, error }, { data: s }, conexao, { data: sug }] = await Promise.all([
    lerCliente(id),
    supabaseAdmin.from("google_sincronia").select("*").eq("client_id", id).maybeSingle(),
    estadoMarketing(),
    supabaseAdmin.from("google_sugestoes").select("tipo, chave, nome, login_id, motivo").eq("client_id", id),
  ]);
  if (error) return NextResponse.json({ error: `Não consegui ler o cliente: ${error.message}` }, { status: 500 });
  if (!c) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  return NextResponse.json({
    ads: c.google_ads_customer_id ? { id: c.google_ads_customer_id, nome: c.google_ads_nome, loginId: c.google_ads_login_id } : null,
    perfil: c.google_perfil_local ? { local: c.google_perfil_local, nome: c.google_perfil_nome } : null,
    sincronia: s ?? null,
    // O que a procura automática achou e não vinculou sozinha (dúvida): a pessoa confirma.
    sugestoes: ((sug ?? []) as { tipo: string; chave: string; nome: string | null; login_id: string | null; motivo: string | null }[])
      .filter((x) => (x.tipo === "ads" ? !c.google_ads_customer_id : !c.google_perfil_local)),
    conexao: { conectado: conexao.conectado, ads: conexao.ads, perfil: conexao.perfil, email: conexao.email },
    podeAlterar: PAPEIS.includes(gate.papel as Papel),
  });
}

/** Clientes (ativos ou não) que já usam esta conta/perfil, menos este. */
async function donos(coluna: "google_ads_customer_id" | "google_perfil_local", valores: string[], menos: string) {
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
      if (atual.data) await sincronizarCliente({ id, google_ads_customer_id: atual.data.google_ads_customer_id, google_ads_login_id: atual.data.google_ads_login_id, google_perfil_local: atual.data.google_perfil_local });
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
  if (acao === "desvincular_ads") {
    const erro = await gravar({ google_ads_customer_id: null, google_ads_nome: null, google_ads_login_id: null });
    return erro ? NextResponse.json({ error: erro }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (acao === "desvincular_perfil") {
    const erro = await gravar({ google_perfil_local: null, google_perfil_nome: null });
    return erro ? NextResponse.json({ error: erro }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (acao === "sincronizar") {
    if (!c.google_ads_customer_id && !c.google_perfil_local) return NextResponse.json({ error: "Nada do Google vinculado a este cliente." }, { status: 400 });
    const s = await sincronizarCliente({ id, google_ads_customer_id: c.google_ads_customer_id, google_ads_login_id: c.google_ads_login_id, google_perfil_local: c.google_perfil_local }, { refazerTudo: b?.refazerTudo === true });
    const falhou = [s.ads && !s.ads.ok ? `Google Ads: ${s.ads.erro}` : null, s.perfil && !s.perfil.ok ? `Perfil: ${s.perfil.erro}` : null].filter(Boolean);
    return NextResponse.json({ ok: !falhou.length, resultado: s, ...(falhou.length ? { error: falhou.join(" · ") } : {}) }, { status: falhou.length ? 502 : 200 });
  }
  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}
