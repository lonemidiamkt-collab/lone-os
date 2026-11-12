export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { COLUNAS_DO_CLIENTE, PLANOS_ANCORA, montarPedidoDeLink, type ClienteParaAncora, type PlanoAncora } from "@/lib/integracoes/ancora";
import { cancelarLinkNoAncora, gerarLinkNoAncora } from "@/lib/integracoes/ancora-server";

// POST /api/ancora/link — gera (ou devolve o que já está de pé) o link de cadastro do cliente no Âncora CRM.
// Corpo: { clientId, plano, diasDeTeste, parceria }. Só gestão.
//
// O que vai para o Âncora sai do CADASTRO do cliente (lib/integracoes/ancora.ts → montarPedidoDeLink), não do
// que o navegador mandar: o corpo só escolhe o cliente e as condições.
//
// O SISTEMA NÃO ENVIA O LINK. Devolve para a tela; quem manda ao cliente é a pessoa.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  let b: { clientId?: unknown; plano?: unknown; diasDeTeste?: unknown; parceria?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Pedido inválido." }, { status: 400 }); }
  const clientId = typeof b.clientId === "string" ? b.clientId : "";
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  const plano = PLANOS_ANCORA.find((p) => p.id === b.plano)?.id as PlanoAncora | undefined;
  if (!plano) return NextResponse.json({ error: "Escolha o plano." }, { status: 400 });
  const dias = typeof b.diasDeTeste === "number" ? b.diasDeTeste : 14;

  const { data, error } = await supabaseAdmin.from("clients").select(COLUNAS_DO_CLIENTE).eq("id", clientId).maybeSingle();
  if (error) return NextResponse.json({ error: "Não consegui ler o cadastro do cliente." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const pedido = montarPedidoDeLink(data as unknown as ClienteParaAncora, {
    plano, diasDeTeste: dias, parceria: b.parceria === true, emitidoPor: gate.user.email,
  });
  if (!pedido.ok) {
    return NextResponse.json({ error: `Falta ${pedido.falta} no cadastro. Complete e tente de novo.`, falta: pedido.falta }, { status: 422 });
  }

  const r = await gerarLinkNoAncora(pedido.corpo);
  if (!r.ok) {
    // 409 = o cliente já se cadastrou: não é erro do sistema, é o estado dele
    const status = r.code === "already_registered" ? 409 : r.motivo === "recusado" ? 422 : 502;
    console.warn(`[ancora] link não gerado (${r.motivo}${r.code ? `/${r.code}` : ""})`);
    return NextResponse.json({ error: r.mensagem }, { status });
  }
  return NextResponse.json({ link: r.data.link, expiraEm: r.data.expira_em, criado: r.data.criado });
}

// DELETE /api/ancora/link — cancela o link que está de pé (gerou com o plano errado, mandou para a pessoa
// errada). Corpo: { clientId }. Depois disso dá para gerar outro. Quem já se cadastrou não é afetado.
export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  let b: { clientId?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Pedido inválido." }, { status: 400 }); }
  const clientId = typeof b.clientId === "string" ? b.clientId : "";
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  const r = await cancelarLinkNoAncora(clientId);
  if (!r.ok) {
    console.warn(`[ancora] link não cancelado (${r.motivo}${r.code ? `/${r.code}` : ""})`);
    return NextResponse.json({ error: r.mensagem }, { status: r.motivo === "recusado" ? 422 : 502 });
  }
  return NextResponse.json({ cancelado: r.data.cancelado });
}
