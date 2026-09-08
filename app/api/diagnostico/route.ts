export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// GET /api/diagnostico — "o que EU deveria estar vendo, e por quê não estou vendo?"
//
// Roberto (08/09): "sinto que a página dos social midias tem muito bug em diversas áreas, parece
// que o login social media não conversa totalmente com o sistema."
//
// "Muito bug em diversas áreas" não dá para reproduzir de fora: eu não tenho a sessão deles, e
// cada tela filtra por um critério diferente. Esta rota responde da cadeira de quem abre — o que o
// servidor sabe sobre você e quantos itens cada área devolveria — para a conversa deixar de ser
// sobre impressão e passar a ser sobre número.
//
// O DEFEITO QUE ELA CAÇA: quase toda tela filtra por NOME ("assigned_social = 'Thiago'"), e o nome
// vem de três lugares que podem divergir — team_members, a lista de reserva do front, e o que está
// gravado em clients. Basta um acento ou um sobrenome a mais em qualquer um deles para a pessoa
// ver tudo vazio, com sessão válida e sem erro nenhum na tela.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({
      ok: false,
      problema: "SESSÃO NÃO RECONHECIDA",
      explicacao: "O servidor não identificou quem está logado. TODAS as telas apareceriam vazias, sem erro visível.",
      oQueFazer: "Sair e entrar de novo. Se persistir, me avise — o token do navegador expirou.",
    }, { status: 401 });
  }

  const { data: membro } = await supabaseAdmin
    .from("team_members").select("id, name, email, role, is_active").eq("email", user.email).maybeSingle();
  const nome = membro?.name ?? null;

  // Sem nome não adianta contar nada: todo filtro por pessoa devolveria zero.
  if (!nome) {
    const { data: todos } = await supabaseAdmin.from("team_members").select("name, email");
    return NextResponse.json({
      ok: false,
      problema: "SEU E-MAIL NÃO ESTÁ NO CADASTRO DA EQUIPE",
      voceE: { email: user.email, admin: user.isAdmin },
      explicacao:
        `O login funciona (a sessão é válida), mas ${user.email} não existe em team_members. `
        + "As telas filtram por NOME, e sem essa ligação elas mostram vazio — sem erro nenhum.",
      emails_cadastrados: (todos ?? []).map((t) => t.email),
    });
  }

  // Cada consulta é a MESMA que a tela correspondente faz.
  const [clientesSocial, clientesDesigner, clientesTraffic, tarefas, cards, reunioes, demandas] = await Promise.all([
    supabaseAdmin.from("clients").select("id", { count: "exact", head: true }).eq("assigned_social", nome),
    supabaseAdmin.from("clients").select("id", { count: "exact", head: true }).eq("assigned_designer", nome),
    supabaseAdmin.from("clients").select("id", { count: "exact", head: true }).eq("assigned_traffic", nome),
    supabaseAdmin.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", nome).neq("status", "done"),
    supabaseAdmin.from("content_cards").select("id", { count: "exact", head: true }).eq("social_media", nome).is("archived_at", null),
    supabaseAdmin.from("meetings").select("id", { count: "exact", head: true }).eq("responsavel", nome),
    supabaseAdmin.from("cs_demandas").select("id", { count: "exact", head: true }).eq("responsavel", nome).eq("status", "pendente"),
  ]);

  // Nomes parecidos com o seu em outros campos. É aqui que aparece o acento perdido, o sobrenome a
  // mais, o espaço no fim — a causa clássica de "está tudo vazio e não há erro".
  const primeiro = nome.split(/\s+/)[0];
  const [{ data: socialParecido }, { data: taskParecido }] = await Promise.all([
    supabaseAdmin.from("clients").select("assigned_social").ilike("assigned_social", `%${primeiro}%`),
    supabaseAdmin.from("tasks").select("assigned_to").ilike("assigned_to", `%${primeiro}%`),
  ]);
  const variantes = [...new Set([
    ...(socialParecido ?? []).map((x) => x.assigned_social as string),
    ...(taskParecido ?? []).map((x) => x.assigned_to as string),
  ].filter(Boolean))];
  const divergentes = variantes.filter((v) => v !== nome);

  const problemas: string[] = [];
  if (membro?.is_active === false) problemas.push("Seu cadastro está marcado como INATIVO em team_members.");
  if (divergentes.length) {
    problemas.push(
      `Existem nomes PARECIDOS com o seu gravados de forma diferente: ${divergentes.map((d) => `"${d}"`).join(", ")}. `
      + `Seu nome no cadastro é "${nome}". Os filtros comparam texto exato, então o que estiver com a outra grafia não aparece para você.`,
    );
  }
  const carteira = (clientesSocial.count ?? 0) + (clientesDesigner.count ?? 0) + (clientesTraffic.count ?? 0);
  if (carteira === 0 && membro?.role !== "admin" && membro?.role !== "manager" && membro?.role !== "comercial") {
    problemas.push(`Nenhum cliente está atribuído a "${nome}" em nenhuma função — por isso as telas de carteira aparecem vazias.`);
  }

  return NextResponse.json({
    ok: problemas.length === 0,
    voceE: {
      email: user.email,
      nomeNoSistema: nome,
      papel: membro?.role ?? null,
      ativo: membro?.is_active ?? null,
      adminNoServidor: user.isAdmin,
    },
    // O que cada área devolveria para você, agora.
    voceDeveriaVer: {
      clientes_como_social: clientesSocial.count ?? 0,
      clientes_como_designer: clientesDesigner.count ?? 0,
      clientes_como_trafego: clientesTraffic.count ?? 0,
      tarefas_abertas: tarefas.count ?? 0,
      cards_de_conteudo: cards.count ?? 0,
      reunioes: reunioes.count ?? 0,
      pedidos_de_cliente_pendentes: demandas.count ?? 0,
    },
    grafiasEncontradas: variantes,
    problemas,
    conclusao: problemas.length === 0
      ? "Seu acesso está ligado corretamente. Se alguma tela específica aparece vazia, me diga QUAL — o problema é dela, não do login."
      : "Encontrei o que está atrapalhando; veja em `problemas`.",
  });
}
