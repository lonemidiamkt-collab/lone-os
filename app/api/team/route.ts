// app/api/team/route.ts — equipe de verdade: cria, edita, desativa, remove e restaura em team_members.
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
// SAIR TAMBÉM TEM VOLTA (25/10/2026, onda 6 da auditoria de erro recuperável, 8.1 e 8.2). Desativar e
// remover tiravam a pessoa da lista sem caminho de volta pela tela; remover APAGAVA o login e recriar
// com o mesmo e-mail dava 409. Agora: a lista traz ativos, desativados e removidos; ninguém desativa
// ou remove a si mesmo nem o último admin; remover BLOQUEIA o login (ban) em vez de apagar, e
// `POST { acao: "restaurar" }` desfaz — o mesmo caminho do "Desfazer" da tela.
//
// GET    — lista a equipe inteira (gestão), com quem tem login, quem tem duas etapas e quem é admin fixo
// POST   — cria membro + usuário no Auth com a senha inicial; `{ acao: "restaurar", id }` desfaz a remoção
// PATCH  — edita nome, papel, disponibilidade, WhatsApp; desativa/reativa
// DELETE — remove (login bloqueado, WhatsApp zerado, histórico fica)
//
// Só gestão: papel define o que a pessoa enxerga do sistema inteiro.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { _limparCacheEquipe } from "@/lib/supabase/auth-server";
import { validarWhatsapp, mesmoWhatsapp } from "@/lib/team/whatsapp";
import { ehAdminFixo } from "@/lib/auth/admins-fixos";
import { normalizarEmail, padraoExatoIlike } from "@/lib/equipe/email";
import {
  avisoAdminFixo, contarAdminsAtivos, podeMudarAcesso, situacaoDoMembro, SENHA_MINIMA, type MembroDaEquipe,
} from "@/lib/equipe/gestao";
import type { User } from "@supabase/supabase-js";

const PAPEIS = ["admin", "manager", "traffic", "social", "designer", "comercial"] as const;
type Papel = (typeof PAPEIS)[number];

/** Bloqueio do login de quem foi removido: ~100 anos. "none" tira o bloqueio (restaurar). */
const BLOQUEIO_LOGIN = "876000h";

const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

const COLS = "id, name, email, role, initials, is_active, unavailable_until, created_at, deleted_at, whatsapp_phone";

/** O login de cada e-mail (o Auth não filtra por e-mail na listagem; a equipe cabe numa página). */
async function loginsPorEmail(): Promise<{ mapa: Map<string, User>; erro: string | null }> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return { mapa: new Map(), erro: error.message };
  return { mapa: new Map((data?.users ?? []).map((u) => [normalizarEmail(u.email), u] as const)), erro: null };
}

const bloqueado = (u: User | undefined) => !!u?.banned_until && new Date(u.banned_until).getTime() > Date.now();
const temDuasEtapas = (u: User | undefined) => (u?.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");

/** Formato que a tela recebe. O WhatsApp sai só com o final (a lista é vista por gerente também). */
function paraTela(m: Record<string, unknown>, login: { mapa: Map<string, User>; erro: string | null }) {
  const u = login.mapa.get(normalizarEmail(m.email as string));
  const { whatsapp_phone, ...resto } = m;
  return {
    ...resto,
    whatsappFinal: whatsapp_phone ? String(whatsapp_phone).slice(-4) : null,
    situacao: situacaoDoMembro(m as unknown as MembroDaEquipe),
    // null = não consegui consultar os logins agora (a tela diz isso, em vez de "sem login" para todos).
    temLogin: login.erro ? null : !!u,
    loginBloqueado: login.erro ? null : bloqueado(u),
    duasEtapas: login.erro ? null : temDuasEtapas(u),
    adminFixo: ehAdminFixo(m.email as string),
  };
}

async function lerEquipe(): Promise<{ lista: MembroDaEquipe[]; erro: string | null }> {
  const { data, error } = await supabaseAdmin.from("team_members").select("id, name, email, role, is_active, deleted_at");
  return { lista: (data ?? []) as MembroDaEquipe[], erro: error?.message ?? null };
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const { data, error } = await supabaseAdmin.from("team_members").select(COLS).order("name");
  if (error) return NextResponse.json({ error: `Não consegui ler a equipe agora (${error.message}). Tente de novo.` }, { status: 503 });

  // Diz quem tem login de verdade — é a diferença entre "está na lista" e "consegue entrar".
  const login = await loginsPorEmail();
  if (login.erro) console.error("[team] logins não lidos:", login.erro);

  return NextResponse.json({
    team: (data ?? []).map((m) => paraTela(m as Record<string, unknown>, login)),
    ...(login.erro ? { avisoLogins: "Não consegui consultar os logins agora — quem tem acesso aparece como desconhecido." } : {}),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.acao === "restaurar") return restaurar(req, body);

  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const name = (body?.name as string ?? "").trim();
  const email = normalizarEmail(body?.email as string);
  const role = body?.role as Papel;
  const password = (body?.password as string ?? "").trim();

  if (!name) return NextResponse.json({ error: "nome obrigatório" }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "e-mail inválido" }, { status: 400 });
  if (!PAPEIS.includes(role)) return NextResponse.json({ error: `papel deve ser um de: ${PAPEIS.join(", ")}` }, { status: 400 });
  if (password.length < SENHA_MINIMA) return NextResponse.json({ error: `senha inicial precisa de ao menos ${SENHA_MINIMA} caracteres` }, { status: 400 });
  const wa = validarWhatsapp(body?.whatsapp_phone);
  if (!wa.ok) return NextResponse.json({ error: wa.erro }, { status: 400 });
  if (wa.numero) {
    const { data: todos } = await supabaseAdmin.from("team_members").select("name, whatsapp_phone").not("whatsapp_phone", "is", null);
    const dono = (todos ?? []).find((t) => mesmoWhatsapp(t.whatsapp_phone as string, wa.numero));
    if (dono) return NextResponse.json({ error: `esse WhatsApp já é de ${dono.name}` }, { status: 409 });
  }

  // E-mail que já existiu na equipe: devolve QUEM é e em que situação, para a tela oferecer
  // "Reativar" / "Restaurar" em vez de um beco sem saída (8.2).
  const { data: existentes, error: eExiste } = await supabaseAdmin
    .from("team_members").select("id, name, email, is_active, deleted_at").ilike("email", padraoExatoIlike(email));
  if (eExiste) return NextResponse.json({ error: `Não consegui conferir a equipe agora (${eExiste.message}). Nada foi criado.` }, { status: 503 });
  const jaTem = (existentes ?? []).find((m) => normalizarEmail(m.email as string) === email);
  if (jaTem) {
    const situacao = situacaoDoMembro(jaTem as unknown as MembroDaEquipe);
    return NextResponse.json({
      error: situacao === "ativo" ? `${jaTem.name} já está na equipe com esse e-mail.`
        : situacao === "desativado" ? `${jaTem.name} já existiu na equipe e está desativado. Reative em vez de criar de novo.`
        : `${jaTem.name} foi removido da equipe. Restaure em vez de criar de novo — o histórico volta junto.`,
      membro: { id: jaTem.id, nome: jaTem.name, situacao },
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
    .insert({ name, email, role, initials: iniciais(name), is_active: true, whatsapp_phone: wa.numero })
    .select(COLS)
    .single();

  if (dbErr) {
    // Desfaz o login recém-criado: usuário no Auth sem linha na equipe é o mesmo fantasma pelo
    // outro lado — entra no sistema e não tem papel nenhum.
    await supabaseAdmin.auth.admin.deleteUser(criado.user.id).catch(() => {});
    return NextResponse.json({ error: `não salvei na equipe: ${dbErr.message}` }, { status: 500 });
  }

  // Auditoria: o trigger audit_team_members grava a linha com o autor vindo do JWT da request
  // (lib/obs/ator.ts). O insert manual que ficava aqui usava colunas que audit_log nunca teve
  // (type/actor/description) — falhava em silêncio desde que nasceu.
  _limparCacheEquipe(email);
  return NextResponse.json({ ok: true, member: paraTela(membro as Record<string, unknown>, { mapa: new Map([[email, criado.user]]), erro: null }) });
}

/**
 * POST { acao: "restaurar", id, password?, whatsapp_phone? } — desfaz a remoção (8.2).
 * Tira o bloqueio do login (ou recria, se o login foi apagado no modelo antigo — aí precisa de senha),
 * limpa `deleted_at` e reativa. O WhatsApp volta se vier (o "Desfazer" da tela manda o que tinha).
 */
async function restaurar(req: NextRequest, body: Record<string, unknown>) {
  const gate = await requireRole(req, ["admin"]);
  if (gate instanceof NextResponse) return gate;
  const id = body?.id as string;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { data: m, error: eLer } = await supabaseAdmin.from("team_members").select(COLS).eq("id", id).maybeSingle();
  if (eLer) return NextResponse.json({ error: `Não consegui ler a equipe agora (${eLer.message}). Nada mudou.` }, { status: 503 });
  if (!m) return NextResponse.json({ error: "Essa pessoa não está mais no cadastro." }, { status: 404 });
  if (!m.deleted_at) return NextResponse.json({ error: `${m.name} não está removido — use Reativar.` }, { status: 409 });

  const email = normalizarEmail(m.email as string);
  const avisos: string[] = [];

  // WhatsApp de volta só se ninguém pegou o número no meio-tempo.
  let whatsapp: string | null = null;
  if (body?.whatsapp_phone) {
    const v = validarWhatsapp(body.whatsapp_phone);
    if (v.ok && v.numero) {
      const { data: todos } = await supabaseAdmin.from("team_members").select("id, name, whatsapp_phone").not("whatsapp_phone", "is", null).neq("id", id);
      const dono = (todos ?? []).find((t) => mesmoWhatsapp(t.whatsapp_phone as string, v.numero));
      if (dono) avisos.push(`o WhatsApp não voltou: o número agora é de ${dono.name}`);
      else whatsapp = v.numero;
    }
  }

  // 1. Login: tira o bloqueio; se não existe mais (removido antes de 25/10/2026, quando o login era apagado), recria.
  const login = await loginsPorEmail();
  if (login.erro) return NextResponse.json({ error: `Não consegui consultar os logins agora (${login.erro}). Nada mudou.` }, { status: 503 });
  const u = login.mapa.get(email);
  if (u) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(u.id, { ban_duration: "none" });
    if (error) return NextResponse.json({ error: `Não consegui desbloquear o login: ${error.message}. Nada mudou.` }, { status: 500 });
  } else {
    const senha = typeof body?.password === "string" ? body.password.trim() : "";
    if (senha.length < SENHA_MINIMA) {
      return NextResponse.json({
        error: `O login de ${m.name} foi apagado na remoção. Defina uma senha nova (mínimo ${SENHA_MINIMA} caracteres) para recriar.`,
        precisaSenha: true,
      }, { status: 409 });
    }
    const { error } = await supabaseAdmin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error) return NextResponse.json({ error: `Não consegui recriar o login: ${error.message}. Nada mudou.` }, { status: 500 });
  }

  // 2. Equipe de volta.
  const patch: Record<string, unknown> = { deleted_at: null, is_active: true };
  if (whatsapp) patch.whatsapp_phone = whatsapp;
  const { data: volta, error: eVolta } = await supabaseAdmin.from("team_members").update(patch).eq("id", id).select(COLS).single();
  if (eVolta) {
    // O login já foi desbloqueado, mas o servidor continua barrando (deleted_at). Diz o que ficou.
    return NextResponse.json({ error: `Desbloqueei o login, mas não consegui marcar na equipe: ${eVolta.message}. Tente Restaurar de novo.` }, { status: 500 });
  }
  _limparCacheEquipe(email);
  const depois = await loginsPorEmail();
  return NextResponse.json({ ok: true, member: paraTela(volta as Record<string, unknown>, depois), ...(avisos.length ? { aviso: avisos.join("; ") } : {}) });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  // O e-mail é o login (e o elo com a equipe). Trocar aqui deixaria a lista com um e-mail que não entra
  // e a troca de senha procurando o login errado (8.6). Recusa com frase em vez de ignorar calado.
  if (typeof body?.email === "string") {
    return NextResponse.json({ error: "O e-mail é o login da pessoa e não muda por aqui. Para trocar, remova e cadastre de novo com o e-mail novo." }, { status: 400 });
  }

  const { data: atual, error: eAtual } = await supabaseAdmin.from("team_members").select("id, name, email, role, is_active, deleted_at").eq("id", id).maybeSingle();
  if (eAtual) return NextResponse.json({ error: `Não consegui ler a equipe agora (${eAtual.message}). Nada mudou.` }, { status: 503 });
  if (!atual) return NextResponse.json({ error: "Essa pessoa não está mais no cadastro." }, { status: 404 });
  const alvo = atual as unknown as MembroDaEquipe;

  const patch: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
    patch.initials = iniciais(body.name);
  }
  if (body?.role !== undefined) {
    if (!PAPEIS.includes(body.role)) return NextResponse.json({ error: "papel inválido" }, { status: 400 });
    patch.role = body.role;
  }
  if (typeof body?.is_active === "boolean") {
    if (body.is_active && alvo.deleted_at) {
      return NextResponse.json({ error: `${alvo.name} foi removido — use Restaurar (o login precisa voltar junto).` }, { status: 409 });
    }
    patch.is_active = body.is_active;
  }
  if (body?.unavailable_until !== undefined) patch.unavailable_until = body.unavailable_until;
  // WhatsApp da pessoa = a credencial dela perante o agente (lib/cs/autoridade.ts): quem manda
  // "Lone, cria a demanda" só executa se o número estiver aqui. Vazio apaga; inválido recusa.
  if (body?.whatsapp_phone !== undefined) {
    const v = validarWhatsapp(body.whatsapp_phone);
    if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
    if (v.numero) {
      const { data: todos } = await supabaseAdmin.from("team_members").select("id, name, whatsapp_phone").not("whatsapp_phone", "is", null).neq("id", id);
      const dono = (todos ?? []).find((t) => mesmoWhatsapp(t.whatsapp_phone as string, v.numero));
      if (dono) return NextResponse.json({ error: `esse WhatsApp já é de ${dono.name}` }, { status: 409 });
    }
    patch.whatsapp_phone = v.numero;
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: "nada pra alterar" }, { status: 400 });

  // Ninguém tranca a si mesmo nem deixa a equipe sem admin (8.1): vale para desativar e para rebaixar.
  const desativando = patch.is_active === false && situacaoDoMembro(alvo) === "ativo";
  const rebaixando = patch.role !== undefined && alvo.role === "admin" && patch.role !== "admin";
  if (desativando || rebaixando) {
    const equipe = await lerEquipe();
    if (equipe.erro) return NextResponse.json({ error: `Não consegui conferir os administradores agora (${equipe.erro}). Nada mudou.` }, { status: 503 });
    for (const mudanca of [desativando ? "desativar" : null, rebaixando ? "rebaixar" : null] as const) {
      if (!mudanca) continue;
      const r = podeMudarAcesso({ alvo, euEmail: gate.user.email, adminsAtivos: contarAdminsAtivos(equipe.lista), mudanca });
      if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("team_members").update(patch).eq("id", id)
    .select(COLS).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // O servidor guarda "quem está bloqueado / qual a função" por 60 s: esquece esta pessoa para a
  // mudança valer na próxima chamada dela, não em até um minuto.
  _limparCacheEquipe(alvo.email);
  const aviso = patch.role !== undefined ? avisoAdminFixo((data?.name as string) ?? alvo.name, alvo.email, patch.role as string) : null;
  const login = await loginsPorEmail();
  return NextResponse.json({ ok: true, member: paraTela(data as Record<string, unknown>, login), ...(aviso ? { aviso } : {}) });
}

/**
 * DELETE /api/team  body: { id }
 * DESLIGA DE VERDADE, COM VOLTA (25/10/2026, 8.2). O login é BLOQUEADO no Auth (não apagado: apagar
 * tornava a remoção sem volta), a equipe marca deleted_at + is_active=false (o histórico de quem fez o
 * quê fica) e o WhatsApp é zerado — número de quem saiu não pode continuar valendo como credencial
 * perante o agente. A resposta devolve o número para o "Desfazer" da tela poder pôr de volta.
 * Só admin. Não remove a si mesmo nem o último admin.
 */
export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, ["admin"]);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { data: membro, error: e1 } = await supabaseAdmin.from("team_members")
    .select("id, name, email, role, is_active, deleted_at, whatsapp_phone").eq("id", id).maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!membro) return NextResponse.json({ error: "essa pessoa não está na equipe" }, { status: 404 });
  if (membro.deleted_at) return NextResponse.json({ ok: true, nome: membro.name, jaRemovido: true });

  const equipe = await lerEquipe();
  if (equipe.erro) return NextResponse.json({ error: `Não consegui conferir os administradores agora (${equipe.erro}). Nada mudou.` }, { status: 503 });
  const pode = podeMudarAcesso({ alvo: membro as unknown as MembroDaEquipe, euEmail: gate.user.email, adminsAtivos: contarAdminsAtivos(equipe.lista), mudanca: "remover" });
  if (!pode.ok) return NextResponse.json({ error: pode.erro }, { status: 400 });

  // 1. Login: bloqueia no Auth (renovar a sessão e entrar de novo param de funcionar). Sem login, segue.
  const login = await loginsPorEmail();
  if (login.erro) return NextResponse.json({ error: `não consegui consultar os logins: ${login.erro}` }, { status: 500 });
  const alvo = login.mapa.get(normalizarEmail(membro.email as string));
  let loginBloqueado = false;
  if (alvo) {
    const { error: eBan } = await supabaseAdmin.auth.admin.updateUserById(alvo.id, { ban_duration: BLOQUEIO_LOGIN });
    if (eBan) return NextResponse.json({ error: `não consegui bloquear o login: ${eBan.message}. Nada mudou.` }, { status: 500 });
    loginBloqueado = true;
  }

  // 2. Equipe: baixa lógica + WhatsApp zerado (trigger de auditoria grava quem fez).
  const { error: e2 } = await supabaseAdmin.from("team_members")
    .update({ is_active: false, deleted_at: new Date().toISOString(), whatsapp_phone: null, unavailable_until: null })
    .eq("id", id);
  if (e2) {
    // Não deixa meio removido: o login volta a funcionar e a pessoa segue como estava.
    if (alvo) await supabaseAdmin.auth.admin.updateUserById(alvo.id, { ban_duration: "none" }).catch(() => {});
    return NextResponse.json({ error: `não consegui marcar na equipe: ${e2.message}. Nada mudou.` }, { status: 500 });
  }
  _limparCacheEquipe(membro.email as string);

  return NextResponse.json({ ok: true, nome: membro.name, loginBloqueado, whatsapp: (membro.whatsapp_phone as string) ?? null });
}
