export const runtime = "nodejs"; // cifra da senha usa crypto do Node
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { encryptVault } from "@/lib/crypto/vault";
import { espelharNoCofre } from "@/lib/cofre/espelhar";
import { criarLimite } from "@/lib/portal/limite";
import {
  ehStatus, FRASE_PEDIDO_FECHADO, infoPlataforma, pedidoAceitaEnvio, situacaoDoPedido, tokenValido, validarCredencial,
  type SituacaoPedido, type StatusAcesso,
} from "@/lib/clients/cofre";

// /api/onboarding/acesso — o PEDIDO DE ACESSO POR LINK (Leva 7C, N24). Público: quem autentica é o
// token (128 bits), como no link de onboarding/correção. Mora sob /api/onboarding porque esse caminho
// já é público no middleware — nenhuma regra nova de acesso foi aberta.
//
//   GET  ?token=…              → nome do cliente, plataforma e se o link ainda aceita envio (nada de senha)
//   POST { token, login, senha } → a senha entra CIFRADA em clients.*_password (e no espelho do
//                                   social, também cifrado); o status vira "recebido, falta testar";
//                                   a gestão é avisada no sino.
//
// 24/10/2026 (auditoria de erro recuperável, item 1.12): o link fechava no 1º envio e a senha errada
// não tinha conserto sem pedir outro link. Agora aceita REENVIO (o novo substitui o anterior) até o
// time marcar o acesso como "ok" depois do último envio — regra em lib/clients/cofre.ts.

// Reenviar é para corrigir, não para martelar: 10 envios por hora por link.
const LIMITE = criarLimite(10, 3600_000);

interface Pedido {
  id: string; client_id: string; plataforma: string; status: string; expira_em: string;
  recebido_em: string | null; recebido_ip: string | null;
  clients: { name: string; nome_fantasia: string | null } | null;
}

async function lerPedido(token: string) {
  const { data, error } = await supabaseAdmin.from("client_access_requests")
    .select("id, client_id, plataforma, status, expira_em, recebido_em, recebido_ip, clients(name, nome_fantasia)")
    .eq("token", token).maybeSingle();
  return { pedido: data as unknown as Pedido | null, error };
}

/** A conferência do time para este acesso. Falha de leitura = "não conferido" (só libera reenvio). */
async function lerConferencia(clientId: string, plataforma: string): Promise<{ status: StatusAcesso; atualizadoEm: string } | null> {
  const { data, error } = await supabaseAdmin.from("client_access_status")
    .select("status, atualizado_em").eq("client_id", clientId).eq("plataforma", plataforma).maybeSingle();
  if (error) { console.warn("[onboarding/acesso] conferência não lida:", error.message); return null; }
  return data && ehStatus(data.status) ? { status: data.status, atualizadoEm: data.atualizado_em as string } : null;
}

async function situacao(p: Pedido): Promise<SituacaoPedido> {
  const conferencia = p.status === "recebido" ? await lerConferencia(p.client_id, p.plataforma) : null;
  return situacaoDoPedido({ status: p.status, expiraEm: p.expira_em, recebidoEm: p.recebido_em }, conferencia);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!tokenValido(token)) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  const { pedido, error } = await lerPedido(token!);
  if (error) return NextResponse.json({ error: "Não consegui abrir o link agora. Tente de novo em instantes." }, { status: 500 });
  if (!pedido) return NextResponse.json({ error: "Link inválido ou já removido." }, { status: 404 });
  const info = infoPlataforma(pedido.plataforma);
  const sit = await situacao(pedido);
  return NextResponse.json({
    cliente: pedido.clients?.nome_fantasia || pedido.clients?.name || "sua empresa",
    plataforma: info?.rotulo ?? pedido.plataforma, dica: info?.dica ?? null,
    situacao: sit,
    aceitaEnvio: pedidoAceitaEnvio(sit),
    // Já mandou antes por este link: a página avisa que o novo envio substitui o anterior.
    jaRecebido: !!pedido.recebido_em,
    fechado: pedidoAceitaEnvio(sit) ? null : FRASE_PEDIDO_FECHADO[sit as keyof typeof FRASE_PEDIDO_FECHADO],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { token?: string; login?: unknown; senha?: unknown } | null;
  if (!tokenValido(body?.token)) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  const { pedido, error } = await lerPedido(body!.token!);
  if (error) return NextResponse.json({ error: "Não consegui salvar agora. Tente de novo em instantes." }, { status: 500 });
  if (!pedido) return NextResponse.json({ error: "Link inválido ou já removido." }, { status: 404 });
  const sit = await situacao(pedido);
  if (!pedidoAceitaEnvio(sit)) {
    return NextResponse.json({ error: FRASE_PEDIDO_FECHADO[sit as keyof typeof FRASE_PEDIDO_FECHADO] }, { status: 410 });
  }
  const info = infoPlataforma(pedido.plataforma);
  if (!info) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  const cred = validarCredencial(body?.login, body?.senha);
  if (!cred.ok) return NextResponse.json({ error: cred.erro }, { status: 400 });

  if (LIMITE.estourou(pedido.id)) {
    return NextResponse.json({ error: "Muitos envios por este link em pouco tempo. Tente de novo daqui a uma hora ou fale com a equipe." }, { status: 429 });
  }

  // Sem a chave do cofre, NÃO grava: senha em texto puro no banco é pior que pedir de novo.
  let cifrada: string | null;
  try { cifrada = encryptVault(cred.senha); } catch (e) {
    console.error("[onboarding/acesso] cofre sem chave:", e);
    return NextResponse.json({ error: "Não consegui guardar com segurança agora. Avise a equipe da Lone Mídia." }, { status: 500 });
  }

  // Marca o recebimento ANTES de gravar a senha, condicionado a o link ainda aceitar (aberto ou
  // recebido, dentro do prazo): cancelamento no meio do caminho não deixa gravar.
  const agora = new Date().toISOString();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  const reenvio = pedido.status === "recebido";
  const { data: marcado, error: eMarca } = await supabaseAdmin.from("client_access_requests")
    .update({ status: "recebido", recebido_em: agora, recebido_ip: ip })
    .eq("id", pedido.id).in("status", ["aberto", "recebido"]).gt("expira_em", agora).select("id");
  if (eMarca) return NextResponse.json({ error: "Não consegui salvar agora. Tente de novo em instantes." }, { status: 500 });
  if (!marcado?.length) return NextResponse.json({ error: "Este link não aceita mais envios. Peça um novo à equipe da Lone Mídia." }, { status: 410 });

  const { error: eCli } = await supabaseAdmin.from("clients")
    .update({ [info.colunaLogin]: cred.login, [info.colunaSenha]: cifrada }).eq("id", pedido.client_id);
  if (eCli) {
    // Volta o link como estava: o cliente pode tentar de novo pelo mesmo link.
    await supabaseAdmin.from("client_access_requests")
      .update({ status: pedido.status, recebido_em: pedido.recebido_em, recebido_ip: pedido.recebido_ip }).eq("id", pedido.id);
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
      ip, user_agent: req.headers.get("user-agent") ?? null,
    }).then(({ error: e }) => { if (e) console.warn("[onboarding/acesso] trilha:", e.message); }),
    supabaseAdmin.from("notifications").insert({
      type: "system", title: reenvio ? `Acesso reenviado: ${info.rotulo}` : `Acesso recebido: ${info.rotulo}`,
      body: reenvio
        ? `${nome} mandou de novo o acesso ao ${info.rotulo} pelo link (substitui o anterior). Falta testar e marcar no cofre.`
        : `${nome} mandou o acesso ao ${info.rotulo} pelo link. Falta testar e marcar no cofre.`,
      client_id: pedido.client_id,
    }).then(() => {}, () => {}),
    supabaseAdmin.from("timeline_entries").insert({
      client_id: pedido.client_id, type: "onboarding", actor: "Cliente",
      description: reenvio
        ? `Acesso ao ${info.rotulo} reenviado pelo link (substitui o anterior; falta testar)`
        : `Acesso ao ${info.rotulo} recebido pelo link (falta testar)`,
      timestamp: quando,
    }).then(() => {}, () => {}),
  ]);

  return NextResponse.json({ ok: true, reenvio });
}
