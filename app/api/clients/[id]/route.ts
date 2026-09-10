// GET /api/clients/[id] — registro COMPLETO de 1 cliente (logins, PII, docs, tokens de link
// público) pra tela de detalhe. Gated: exige usuário logado. A lista geral (/api/data/clients)
// vem MAGRA de propósito — os campos sensíveis só saem daqui, 1 cliente por vez, sob demanda.
// (Senhas de plataforma continuam fora; admin revela via /api/client-vault/reveal.)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { fetchClientById } from "@/lib/supabase/queries";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const client = await fetchClientById(id);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  return NextResponse.json({ client });
}

// DELETE /api/clients/[id] — apaga o cadastro DE VEZ.
//
// Roberto (10/09): "na aba onde ficam os arquivados não tem como excluir cadastro."
//
// Só ADMIN, e só cliente já ARQUIVADO. As duas travas juntas são o ponto: apagar um cliente que
// ainda trabalha com a gente não pode ser um clique de distância, e a exclusão leva junto reunião,
// card, demanda e histórico — coisas que o resto do sistema conta como número.
//
// A ficha faz isso hoje direto do navegador, com a senha "8822" escrita no código do front. Quem
// abrir o DevTools lê a senha; quem chamar o Supabase direto nem precisa dela. Aqui a decisão é do
// servidor: sessão válida, papel de admin, cliente arquivado.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Só administrador pode excluir um cadastro." }, { status: 403 });
  }

  const { id } = await params;
  const { supabaseAdmin } = await import("@/lib/supabase/server");

  const { data: cli } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, active, lifecycle").eq("id", id).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  if (cli.active !== false) {
    return NextResponse.json({
      error: "Este cliente ainda está ativo. Arquive primeiro — assim fica registrado por que ele saiu antes de o cadastro sumir.",
    }, { status: 409 });
  }

  const nome = (cli.nome_fantasia as string) || (cli.name as string) || "Cliente";

  // O que vai junto. Contado ANTES para o log dizer o tamanho do que foi apagado — depois não há
  // mais como saber.
  const [reunioes, cards, demandas, historico] = await Promise.all([
    supabaseAdmin.from("meetings").select("id", { count: "exact", head: true }).eq("client_id", id),
    supabaseAdmin.from("content_cards").select("id", { count: "exact", head: true }).eq("client_id", id),
    supabaseAdmin.from("cs_demandas").select("id", { count: "exact", head: true }).eq("client_id", id),
    supabaseAdmin.from("timeline_entries").select("id", { count: "exact", head: true }).eq("client_id", id),
  ]);

  const { error } = await supabaseAdmin.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.warn(
    `[clients/DELETE] ${user.email} apagou "${nome}" (${id}) — junto foram `
    + `${reunioes.count ?? 0} reunião(ões), ${cards.count ?? 0} card(s), `
    + `${demandas.count ?? 0} pedido(s) e ${historico.count ?? 0} linha(s) de histórico.`,
  );

  return NextResponse.json({
    ok: true, nome,
    apagados: {
      reunioes: reunioes.count ?? 0, cards: cards.count ?? 0,
      demandas: demandas.count ?? 0, historico: historico.count ?? 0,
    },
  });
}
