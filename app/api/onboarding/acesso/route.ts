export const runtime = "nodejs"; // cifra da senha usa crypto do Node
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { encryptVault } from "@/lib/crypto/vault";
import { espelharNoCofre } from "@/lib/cofre/espelhar";
import { infoPlataforma, tokenValido, validarCredencial } from "@/lib/clients/cofre";

// /api/onboarding/acesso — o PEDIDO DE ACESSO POR LINK (Leva 7C, N24). Público: quem autentica é o
// token (128 bits), como no link de onboarding/correção. Mora sob /api/onboarding porque esse caminho
// já é público no middleware — nenhuma regra nova de acesso foi aberta.
//
//   GET  ?token=…              → nome do cliente, plataforma e se o link ainda vale (nada de senha)
//   POST { token, login, senha } → a senha entra CIFRADA em clients.*_password (e no espelho do
//                                   social, também cifrado); o link fecha; o status vira "recebido,
//                                   falta testar"; a gestão é avisada no sino.
//
// O link serve UMA vez: depois de recebido, reenviar exige um link novo (quem pediu vê no cofre).

async function lerPedido(token: string) {
  const { data, error } = await supabaseAdmin.from("client_access_requests")
    .select("id, client_id, plataforma, status, expira_em, clients(name, nome_fantasia)")
    .eq("token", token).maybeSingle();
  return { pedido: data as null | {
    id: string; client_id: string; plataforma: string; status: string; expira_em: string;
    clients: { name: string; nome_fantasia: string | null } | null;
  }, error };
}

function situacao(p: { status: string; expira_em: string }): "aberto" | "recebido" | "cancelado" | "vencido" {
  if (p.status === "recebido") return "recebido";
  if (p.status === "cancelado") return "cancelado";
  return new Date(p.expira_em).getTime() > Date.now() ? "aberto" : "vencido";
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!tokenValido(token)) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  const { pedido, error } = await lerPedido(token!);
  if (error) return NextResponse.json({ error: "Não consegui abrir o link agora. Tente de novo em instantes." }, { status: 500 });
  if (!pedido) return NextResponse.json({ error: "Link inválido ou já removido." }, { status: 404 });
  const info = infoPlataforma(pedido.plataforma);
  return NextResponse.json({
    cliente: pedido.clients?.nome_fantasia || pedido.clients?.name || "sua empresa",
    plataforma: info?.rotulo ?? pedido.plataforma, dica: info?.dica ?? null,
    situacao: situacao(pedido),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { token?: string; login?: unknown; senha?: unknown } | null;
  if (!tokenValido(body?.token)) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  const { pedido, error } = await lerPedido(body!.token!);
  if (error) return NextResponse.json({ error: "Não consegui salvar agora. Tente de novo em instantes." }, { status: 500 });
  if (!pedido) return NextResponse.json({ error: "Link inválido ou já removido." }, { status: 404 });
  const sit = situacao(pedido);
  if (sit !== "aberto") {
    const frase = sit === "recebido" ? "Recebemos este acesso. Se precisar mandar outro, peça um link novo à equipe."
      : sit === "vencido" ? "Este link venceu. Peça um novo à equipe da Lone Mídia." : "Este link foi cancelado pela equipe.";
    return NextResponse.json({ error: frase }, { status: 410 });
  }
  const info = infoPlataforma(pedido.plataforma);
  if (!info) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  const cred = validarCredencial(body?.login, body?.senha);
  if (!cred.ok) return NextResponse.json({ error: cred.erro }, { status: 400 });

  // Sem a chave do cofre, NÃO grava: senha em texto puro no banco é pior que pedir de novo.
  let cifrada: string | null;
  try { cifrada = encryptVault(cred.senha); } catch (e) {
    console.error("[onboarding/acesso] cofre sem chave:", e);
    return NextResponse.json({ error: "Não consegui guardar com segurança agora. Avise a equipe da Lone Mídia." }, { status: 500 });
  }

  // Fecha o link ANTES de gravar a senha: dois envios simultâneos não gravam duas vezes.
  const agora = new Date().toISOString();
  const { data: fechado, error: eFecha } = await supabaseAdmin.from("client_access_requests")
    .update({ status: "recebido", recebido_em: agora, recebido_ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null })
    .eq("id", pedido.id).eq("status", "aberto").select("id");
  if (eFecha) return NextResponse.json({ error: "Não consegui salvar agora. Tente de novo em instantes." }, { status: 500 });
  if (!fechado?.length) return NextResponse.json({ error: "Recebemos este acesso há pouco. Obrigado!" }, { status: 410 });

  const { error: eCli } = await supabaseAdmin.from("clients")
    .update({ [info.colunaLogin]: cred.login, [info.colunaSenha]: cifrada }).eq("id", pedido.client_id);
  if (eCli) {
    // Reabre o link: o cliente pode tentar de novo sem pedir outro.
    await supabaseAdmin.from("client_access_requests").update({ status: "aberto", recebido_em: null }).eq("id", pedido.id);
    return NextResponse.json({ error: "Não consegui salvar agora. Tente de novo em instantes." }, { status: 500 });
  }

  // O social/gestor usam o espelho (client_access) — sem isto a senha chegava só no cadastro do admin.
  if (info.id === "instagram" || info.id === "meta") {
    const esp = await espelharNoCofre(pedido.client_id, info.id === "instagram"
      ? { instagram_login: cred.login, instagram_password: cred.senha }
      : { facebook_login: cred.login, facebook_password: cred.senha });
    if (!esp.ok) console.error("[onboarding/acesso] espelho do cofre falhou:", esp.erro);
  }

  const nome = pedido.clients?.nome_fantasia || pedido.clients?.name || "Cliente";
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await Promise.all([
    // Trilha do cofre: quem alterou (aqui, o próprio cliente pelo link).
    supabaseAdmin.from("vault_access_log").insert({
      user_id: null, user_email: "cliente (link de acesso)", client_id: pedido.client_id,
      resource_type: `credential:${info.colunaSenha}`, resource_path: null, action: "update",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null, user_agent: req.headers.get("user-agent") ?? null,
    }).then(({ error: e }) => { if (e) console.warn("[onboarding/acesso] trilha:", e.message); }),
    supabaseAdmin.from("notifications").insert({
      type: "system", title: `Acesso recebido: ${info.rotulo}`,
      body: `${nome} mandou o acesso ao ${info.rotulo} pelo link. Falta testar e marcar no cofre.`, client_id: pedido.client_id,
    }).then(() => {}, () => {}),
    supabaseAdmin.from("timeline_entries").insert({
      client_id: pedido.client_id, type: "onboarding", actor: "Cliente",
      description: `Acesso ao ${info.rotulo} recebido pelo link (falta testar)`, timestamp: quando,
    }).then(() => {}, () => {}),
  ]);

  return NextResponse.json({ ok: true });
}
