// app/api/clients/[id]/academy/route.ts — Lone Academy na ficha do cliente. Só gestão (admin/manager).
//
//   GET  → situação na Academy (convite do dono, assentos, quem estudou na semana). Se o cliente foi
//          encerrado aqui e a Academy ainda está aberta, fecha (o encerramento pode ter sido antes da
//          integração existir).
//   POST { acao: "liberar", gestorNome, gestorEmail, assentos? } → cria a empresa e manda o e-mail
//   POST { acao: "reenviar", gestorNome, gestorEmail }           → novo link (o anterior para de valer)
//
// Nome da empresa e id vêm do banco, não do navegador. O e-mail é o que a gestão confirmou na tela
// (pré-preenchido com o da aba Dados). Ver lib/academy/cliente.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { liberarNaAcademy, reenviarNaAcademy, situacaoEsperada, situacaoNaAcademy, statusNaAcademy } from "@/lib/academy/cliente";

const Corpo = z.object({
  acao: z.enum(["liberar", "reenviar"]),
  gestorNome: z.string().trim().min(2, "Escreva o nome de quem vai cuidar do time na Academy.").max(80),
  gestorEmail: z.string().trim().toLowerCase().email("E-mail inválido. Confira se está completo, ex.: nome@loja.com.br.").max(200),
  assentos: z.number().int().min(1, "Assentos: pelo menos 1.").max(5000, "Assentos: no máximo 5000.").optional(),
});

async function lerCliente(id: string) {
  const { data, error } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, contact_name, email, email_corporativo, active, churned_at")
    .eq("id", id).maybeSingle();
  return { cliente: data, erro: error?.message ?? null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Só a gestão vê a Lone Academy do cliente." }, { status: 403 });
  const { id } = await params;
  const { cliente, erro } = await lerCliente(id);
  if (erro) return NextResponse.json({ error: `Não consegui ler o cliente: ${erro}` }, { status: 500 });
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  let r = await statusNaAcademy(id);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status === 503 ? 503 : 502 });
  if (r.data?.existe && situacaoEsperada(cliente) === "closed" && r.data.situacao !== "closed") {
    const s = await situacaoNaAcademy(id, "closed");
    if (s.ok) r = { ...r, data: s.data };
  }
  return NextResponse.json({
    ...r.data,
    sugestao: {
      gestorNome: (cliente.contact_name as string) || "",
      gestorEmail: ([cliente.email_corporativo, cliente.email].find((e) => typeof e === "string" && e.trim()) as string | undefined)?.trim() ?? "",
    },
    clienteEncerrado: situacaoEsperada(cliente) === "closed",
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Só a gestão libera a Lone Academy." }, { status: 403 });
  const { id } = await params;
  const p = Corpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Dados inválidos." }, { status: 422 });

  const { cliente, erro } = await lerCliente(id);
  if (erro) return NextResponse.json({ error: `Não consegui ler o cliente: ${erro}` }, { status: 500 });
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (situacaoEsperada(cliente) === "closed") {
    return NextResponse.json({ error: "Parceria encerrada: reative o cliente antes de liberar a Lone Academy." }, { status: 409 });
  }

  const nome = ((cliente.nome_fantasia as string) || (cliente.name as string) || "").trim();
  const gestor = { nome: p.data.gestorNome, email: p.data.gestorEmail };
  const r = p.data.acao === "liberar"
    ? await liberarNaAcademy({ clienteId: id, nome, gestor, assentos: p.data.assentos })
    : await reenviarNaAcademy({ clienteId: id, nome, gestor });
  if (!r.ok || !r.data) return NextResponse.json({ error: r.erro }, { status: r.status === 503 ? 503 : 502 });

  // Linha do tempo: o que saiu para o cliente fica registrado com quem mandou (ERRO_RECUPERAVEL, ponto 7).
  try {
    const { registrarHistorico } = await import("@/lib/clients/historico");
    const { data: membro } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email).maybeSingle();
    const quem = (membro?.name as string) || user.email;
    const enviou = r.data.email?.enviado;
    const texto =
      r.data.resultado === "convite_enviado" || r.data.resultado === "convite_reenviado"
        ? `Lone Academy ${r.data.resultado === "convite_reenviado" ? "— acesso reenviado" : "liberada"} para ${gestor.email}${enviou ? "" : " (o e-mail não saiu; link copiado na tela)"}`
        : null;
    if (texto) await registrarHistorico({ clientId: id, tipo: "onboarding", ator: quem, descricao: texto });
  } catch { /* histórico é memória, não transação */ }

  return NextResponse.json(r.data);
}
