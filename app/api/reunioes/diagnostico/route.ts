export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// GET /api/reunioes/diagnostico — por que EU não estou vendo reunião?
//
// Roberto (04/09): "ainda não aparece para eles". Do meu lado tudo respondia certo, e sem uma
// sessão real de um social não havia como saber onde quebrava. Em vez de continuar adivinhando,
// esta rota responde da perspectiva de QUEM ABRE: quem o servidor acha que você é, se o seu nome
// foi encontrado, quantas reuniões existem e quantas você veria — com o motivo, quando é zero.
//
// Cada linha elimina uma hipótese. Basta a pessoa abrir a URL logada e mandar o print.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);

  // Sem sessão a resposta já É o diagnóstico: era exatamente isto que o componente engolia em
  // silêncio, deixando a tela idêntica a "não há reunião nenhuma".
  if (!user) {
    return NextResponse.json({
      ok: false,
      problema: "SESSÃO NÃO RECONHECIDA",
      explicacao: "O servidor não identificou quem está logado. Nenhuma reunião apareceria, e a tela ficaria igual a 'não há reunião'.",
      oQueFazer: "Sair e entrar de novo no sistema. Se persistir, o token do navegador expirou.",
    }, { status: 401 });
  }

  const { data: membro } = await supabaseAdmin
    .from("team_members").select("name, role, is_active").eq("email", user.email).maybeSingle();

  const [{ count: totalReunioes }, { data: minhas }, { data: clientesMeus }] = await Promise.all([
    supabaseAdmin.from("meetings").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("meetings")
      .select("id, title, start_at, responsavel, estado, client_id")
      .eq("responsavel", membro?.name ?? " ")
      .order("start_at", { ascending: false }).limit(10),
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia")
      .eq("assigned_social", membro?.name ?? " ").limit(200),
  ]);

  // Reuniões dos clientes da carteira, independentemente de quem é o responsável na reunião: é o
  // que a ABA do cliente mostra, e ela não filtra por pessoa.
  const idsMeus = (clientesMeus ?? []).map((c) => c.id as string);
  const { data: naCarteira } = idsMeus.length
    ? await supabaseAdmin.from("meetings")
        .select("id, title, start_at, responsavel, estado, client_id")
        .in("client_id", idsMeus).order("start_at", { ascending: false }).limit(10)
    : { data: [] };

  const problemas: string[] = [];
  if (!membro) {
    problemas.push(
      `Seu e-mail (${user.email}) não está em team_members. O calendário e o Meu Trabalho filtram por NOME, `
      + "e sem essa ligação eles mostram vazio — mesmo havendo reuniões. A aba do cliente continua funcionando.",
    );
  }
  if (membro && membro.is_active === false) {
    problemas.push("Seu cadastro está marcado como inativo em team_members.");
  }
  if ((totalReunioes ?? 0) === 0) {
    problemas.push("Não existe NENHUMA reunião cadastrada no sistema ainda — não é um problema de acesso.");
  }
  if (membro && (totalReunioes ?? 0) > 0 && !(minhas ?? []).length && !(naCarteira ?? []).length) {
    problemas.push(
      `Existem ${totalReunioes} reunião(ões), mas nenhuma tem você como responsável nem é de cliente da sua carteira `
      + `(você é responsável social por ${idsMeus.length} cliente(s)).`,
    );
  }

  return NextResponse.json({
    ok: problemas.length === 0,
    voceE: {
      email: user.email,
      admin: user.isAdmin,
      nomeNoSistema: membro?.name ?? null,
      papel: membro?.role ?? null,
      ativo: membro?.is_active ?? null,
    },
    numeros: {
      reunioes_no_sistema_inteiro: totalReunioes ?? 0,
      reunioes_com_voce_como_responsavel: (minhas ?? []).length,
      reunioes_de_clientes_da_sua_carteira: (naCarteira ?? []).length,
      clientes_na_sua_carteira_como_social: idsMeus.length,
    },
    // Só o essencial de cada uma: serve para conferir se a que você procurava está aqui.
    exemplos: [...(minhas ?? []), ...(naCarteira ?? [])]
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
      .slice(0, 8)
      .map((m) => ({ titulo: m.title, quando: m.start_at, responsavel: m.responsavel, estado: m.estado })),
    problemas,
    ondeOlhar: problemas.length === 0
      ? ["A aba Reuniões do cliente", "O calendário (/calendar)", "Meu Trabalho (/my-work), aba Reuniões"]
      : undefined,
  });
}
