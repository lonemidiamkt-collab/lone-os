// app/api/team/route.ts — equipe de verdade: cria, edita e desativa em team_members.
//
// POR QUE EXISTE (10/08). A tela /ceo mexia a equipe SÓ na memória do navegador. O Roberto
// cadastrou o Thiago, a tela mostrou ele na lista, e ao tentar definir a senha veio "Usuário não
// encontrado no Auth" — porque o Thiago nunca existiu: nem em team_members, nem no Auth. A própria
// tela avisava isso num rodapé, o que não ajuda: ela aceitou o cadastro e pareceu ter funcionado.
//
// ENTRAR NA EQUIPE SÃO DUAS COISAS, E AS DUAS TÊM QUE ACONTECER: a linha em `team_members` (que dá
// papel e aparece nas carteiras) e o usuário no Auth (que permite entrar). Fazer só uma cria
// exatamente o fantasma que apareceu aqui — alguém que a tela lista e o sistema não conhece.
//
// GET    — lista a equipe (gestão)
// POST   — cria membro + usuário no Auth com a senha inicial
// PATCH  — edita nome, papel, disponibilidade; desativa/reativa
//
// Só gestão: papel define o que a pessoa enxerga do sistema inteiro.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";

const PAPEIS = ["admin", "manager", "traffic", "social", "designer", "comercial"] as const;
type Papel = (typeof PAPEIS)[number];

const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const { data, error } = await supabaseAdmin
    .from("team_members").select("id, name, email, role, initials, is_active, unavailable_until, created_at")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Diz quem tem login de verdade — é a diferença entre "está na lista" e "consegue entrar".
  const { data: auth } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const comLogin = new Set((auth?.users ?? []).map((u) => (u.email ?? "").toLowerCase()));

  return NextResponse.json({
    team: (data ?? []).map((m) => ({ ...m, temLogin: comLogin.has((m.email as string).toLowerCase()) })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string ?? "").trim();
  const email = (body?.email as string ?? "").trim().toLowerCase();
  const role = body?.role as Papel;
  const password = (body?.password as string ?? "").trim();

  if (!name) return NextResponse.json({ error: "nome obrigatório" }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "e-mail inválido" }, { status: 400 });
  if (!PAPEIS.includes(role)) return NextResponse.json({ error: `papel deve ser um de: ${PAPEIS.join(", ")}` }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "senha inicial precisa de ao menos 6 caracteres" }, { status: 400 });

  const { data: jaTem } = await supabaseAdmin
    .from("team_members").select("id, is_active").eq("email", email).maybeSingle();
  if (jaTem) {
    return NextResponse.json({
      error: jaTem.is_active ? "já existe alguém com esse e-mail na equipe"
                             : "esse e-mail já existiu na equipe e está desativado — reative em vez de criar de novo",
    }, { status: 409 });
  }

  // AUTH PRIMEIRO. Se o Auth falhar (e-mail repetido lá, senha fraca), nada foi criado e a pessoa
  // vê o erro. Na ordem inversa sobraria a linha órfã — o fantasma que causou este bug.
  const { data: criado, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (authErr || !criado?.user) {
    return NextResponse.json({ error: `não criei o login: ${authErr?.message ?? "erro"}` }, { status: 400 });
  }

  const { data: membro, error: dbErr } = await supabaseAdmin
    .from("team_members")
    .insert({ name, email, role, initials: iniciais(name), is_active: true })
    .select("id, name, email, role, initials, is_active")
    .single();

  if (dbErr) {
    // Desfaz o login recém-criado: usuário no Auth sem linha na equipe é o mesmo fantasma pelo
    // outro lado — entra no sistema e não tem papel nenhum.
    await supabaseAdmin.auth.admin.deleteUser(criado.user.id).catch(() => {});
    return NextResponse.json({ error: `não salvei na equipe: ${dbErr.message}` }, { status: 500 });
  }

  await supabaseAdmin.from("audit_log").insert({
    type: "team", actor: gate.user.email ?? "sistema",
    description: `${name} (${role}) entrou na equipe, com login criado.`,
  }).then(undefined, () => {});

  return NextResponse.json({ ok: true, member: { ...membro, temLogin: true } });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
    patch.initials = iniciais(body.name);
  }
  if (body?.role !== undefined) {
    if (!PAPEIS.includes(body.role)) return NextResponse.json({ error: "papel inválido" }, { status: 400 });
    patch.role = body.role;
  }
  if (typeof body?.is_active === "boolean") patch.is_active = body.is_active;
  if (body?.unavailable_until !== undefined) patch.unavailable_until = body.unavailable_until;

  if (!Object.keys(patch).length) return NextResponse.json({ error: "nada pra alterar" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("team_members").update(patch).eq("id", id)
    .select("id, name, email, role, initials, is_active, unavailable_until").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("audit_log").insert({
    type: "team", actor: gate.user.email ?? "sistema",
    description: `${data.name}: ${Object.keys(patch).join(", ")} alterado(s).`,
  }).then(undefined, () => {});

  return NextResponse.json({ ok: true, member: data });
}
