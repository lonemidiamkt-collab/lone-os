export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { papelDoUsuario } from "@/lib/api/require-role";
import {
  PLATAFORMAS, ehStatus, estadoDoAcesso, infoPlataforma, podeMexer,
  type PedidoResumo, type Plataforma, type StatusAcesso,
} from "@/lib/clients/cofre";

// /api/clients/[id]/acessos — O COFRE COM STATUS (Leva 7C, N24). Regras em lib/clients/cofre.ts.
//
//   GET                                         → estado de cada plataforma que o papel enxerga +
//                                                 (só gestão) quem revelou/alterou senha (vault_access_log)
//   POST { acao: "status", plataforma, status, nota? } → marca ok / pendente / inválido
//   POST { acao: "pedir", plataforma }          → link para o cliente mandar o acesso
//                                                 (/onboarding/acesso/<token>); reaproveita o aberto
//   POST { acao: "cancelar", plataforma }       → cancela o link aberto
//
// A SENHA NUNCA SAI DAQUI. Revelar continua em /api/client-vault, com as mesmas regras de antes.
// Sem a migration 20260926100000 as tabelas não existem: o GET devolve "não conferido" e avisa.

const semTabela = (msg?: string) => !!msg && /does not exist|schema cache|relation .* not found/i.test(msg);

async function quem(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) } as const;
  const papel = await papelDoUsuario(user);
  if (!papel || papel === "designer" || papel === "comercial") {
    return { erro: NextResponse.json({ error: "Sem permissão para o cofre." }, { status: 403 }) } as const;
  }
  const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email).maybeSingle();
  return { user, papel, nome: (tm?.name as string) || user.email.split("@")[0] } as const;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const q = await quem(req);
  if ("erro" in q) return q.erro;
  const { id } = await params;
  const gestao = q.papel === "admin" || q.papel === "manager";
  const visiveis = PLATAFORMAS.filter((p) => podeMexer(q.papel, p.id));

  const [cli, st, ped, log] = await Promise.all([
    supabaseAdmin.from("clients").select("facebook_login, instagram_login, google_ads_login").eq("id", id).maybeSingle(),
    supabaseAdmin.from("client_access_status").select("plataforma, status, nota, atualizado_por, atualizado_em").eq("client_id", id),
    supabaseAdmin.from("client_access_requests").select("plataforma, token, status, criado_em, expira_em, recebido_em, criado_por")
      .eq("client_id", id).order("criado_em", { ascending: false }).limit(30),
    gestao
      ? supabaseAdmin.from("vault_access_log").select("user_email, resource_type, action, created_at")
        .eq("client_id", id).like("resource_type", "credential:%").order("created_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (cli.error) return NextResponse.json({ error: `clients: ${cli.error.message}` }, { status: 500 });
  if (!cli.data) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  const migrationPendente = semTabela(st.error?.message) || semTabela(ped.error?.message);

  const agora = new Date();
  const plataformas = visiveis.map((p) => {
    const gravado = (st.data ?? []).find((r) => r.plataforma === p.id);
    const pedidoRow = (ped.data ?? []).find((r) => r.plataforma === p.id);
    const pedido: PedidoResumo | null = pedidoRow ? {
      status: pedidoRow.status as PedidoResumo["status"], criadoEm: pedidoRow.criado_em as string,
      expiraEm: pedidoRow.expira_em as string, recebidoEm: (pedidoRow.recebido_em as string) ?? null,
    } : null;
    const estado = estadoDoAcesso({
      temLogin: !!(cli.data as Record<string, unknown>)[p.colunaLogin],
      gravado: gravado && ehStatus(gravado.status) ? { status: gravado.status, atualizadoEm: gravado.atualizado_em as string } : null,
      pedido, agora,
    });
    return {
      plataforma: p.id, rotulo: p.rotulo, ...estado,
      nota: (gravado?.nota as string) ?? null,
      conferidoPor: (gravado?.atualizado_por as string) ?? null,
      conferidoEm: (gravado?.atualizado_em as string) ?? null,
      pedido: pedido ? { ...pedido, url: estado.pedidoAberto ? `/onboarding/acesso/${pedidoRow!.token}` : null, por: (pedidoRow!.criado_por as string) ?? null } : null,
    };
  });

  const ROTULO_CAMPO: Record<string, string> = {
    facebook_password: "Meta", instagram_password: "Instagram", google_ads_password: "Google Ads",
    meta_password: "Meta (cadastro)", google_password: "Google Ads (cadastro)",
  };
  const trilha = (log.data ?? []).map((r) => {
    const campo = String(r.resource_type ?? "").replace("credential:", "");
    return { quem: (r.user_email as string) || "—", acao: r.action === "reveal" ? "revelou" : "alterou", campo: ROTULO_CAMPO[campo] ?? campo, em: r.created_at as string };
  });

  return NextResponse.json({ plataformas, trilha: gestao ? trilha : null, migrationPendente });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const q = await quem(req);
  if ("erro" in q) return q.erro;
  const { id } = await params;
  const body = await req.json().catch(() => null) as { acao?: string; plataforma?: string; status?: string; nota?: string } | null;
  const info = infoPlataforma(body?.plataforma);
  if (!info) return NextResponse.json({ error: "Plataforma inválida." }, { status: 400 });
  if (!podeMexer(q.papel, info.id)) return NextResponse.json({ error: "Este acesso não é da sua área." }, { status: 403 });
  const plataforma: Plataforma = info.id;

  const { data: cli } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia").eq("id", id).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  const nomeCliente = (cli.nome_fantasia as string) || (cli.name as string);

  if (body?.acao === "status") {
    if (!ehStatus(body.status)) return NextResponse.json({ error: "Status inválido (ok, pendente ou invalido)." }, { status: 400 });
    const status: StatusAcesso = body.status;
    const nota = typeof body.nota === "string" ? body.nota.trim().slice(0, 300) || null : null;
    const { error } = await supabaseAdmin.from("client_access_status").upsert({
      client_id: id, plataforma, status, nota, atualizado_por: q.nome, atualizado_em: new Date().toISOString(),
    }, { onConflict: "client_id,plataforma" });
    if (error) {
      return NextResponse.json({ error: semTabela(error.message) ? "Falta aplicar a migration do cofre (20260926100000)." : error.message }, { status: semTabela(error.message) ? 503 : 500 });
    }
    // Acesso quebrado é fato do relacionamento: entra na linha do tempo.
    if (status === "invalido") {
      await supabaseAdmin.from("timeline_entries").insert({
        client_id: id, type: "status", actor: q.nome,
        description: `Acesso ao ${info.rotulo} marcado como inválido${nota ? `: ${nota}` : ""}`,
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      }).then(() => {}, () => {});
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.acao === "pedir") {
    const agoraIso = new Date().toISOString();
    const { data: aberto, error: e1 } = await supabaseAdmin.from("client_access_requests").select("token")
      .eq("client_id", id).eq("plataforma", plataforma).eq("status", "aberto").gt("expira_em", agoraIso)
      .order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (e1) return NextResponse.json({ error: semTabela(e1.message) ? "Falta aplicar a migration do cofre (20260926100000)." : e1.message }, { status: semTabela(e1.message) ? 503 : 500 });
    // Um link vivo por plataforma: dois links abertos são duas chances de a senha chegar pela metade.
    if (aberto?.token) return NextResponse.json({ url: `/onboarding/acesso/${aberto.token}`, reaproveitado: true, cliente: nomeCliente, plataforma: info.rotulo });
    const token = `ac-${randomBytes(16).toString("hex")}`;
    const { error } = await supabaseAdmin.from("client_access_requests").insert({ token, client_id: id, plataforma, criado_por: q.nome });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ url: `/onboarding/acesso/${token}`, reaproveitado: false, cliente: nomeCliente, plataforma: info.rotulo });
  }

  if (body?.acao === "cancelar") {
    const { error } = await supabaseAdmin.from("client_access_requests").update({ status: "cancelado" })
      .eq("client_id", id).eq("plataforma", plataforma).eq("status", "aberto");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
