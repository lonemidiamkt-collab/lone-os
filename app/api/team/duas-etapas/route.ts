// app/api/team/duas-etapas/route.ts — admin zera a verificação em duas etapas de OUTRA pessoa.
//
// POR QUE (25/10/2026, onda 6 da auditoria de erro recuperável, item 8.9). Quem perdia o celular ficava
// trancado: o servidor recusa a sessão sem o código (auth-server.ts) e o "Desligar" de Configurações só
// remove o autenticador da própria conta — e exige estar com o código na mão. Só saía por SQL.
//
// POST { id } (só admin): apaga os autenticadores (TOTP) do login dessa pessoa pela API de admin do Auth
// e REGISTRA em audit_log quem zerou, de quem e quando. Depois, a pessoa entra só com a senha e configura
// de novo em Configurações › Segurança. A própria conta não passa por aqui (lá é "Desligar", com o código).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizarEmail } from "@/lib/equipe/email";

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin"]);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { data: m, error: eLer } = await supabaseAdmin.from("team_members").select("id, name, email").eq("id", id).maybeSingle();
  if (eLer) return NextResponse.json({ error: `Não consegui ler a equipe agora (${eLer.message}). Nada mudou.` }, { status: 503 });
  if (!m) return NextResponse.json({ error: "Essa pessoa não está no cadastro." }, { status: 404 });
  const email = normalizarEmail(m.email as string);
  if (email === normalizarEmail(gate.user.email)) {
    return NextResponse.json({ error: "Para a sua própria conta, use Configurações › Segurança › Desligar (pede o código)." }, { status: 400 });
  }

  const { data: lista, error: eLista } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (eLista) return NextResponse.json({ error: `Não consegui consultar os logins agora (${eLista.message}). Nada mudou.` }, { status: 503 });
  const login = (lista?.users ?? []).find((u) => normalizarEmail(u.email) === email);
  if (!login) return NextResponse.json({ error: `${m.name} não tem login no sistema.` }, { status: 404 });

  const { data: fatores, error: eFat } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: login.id });
  if (eFat) return NextResponse.json({ error: `Não consegui ler os autenticadores de ${m.name} (${eFat.message}). Nada mudou.` }, { status: 503 });
  const totp = (fatores?.factors ?? []).filter((f) => f.factor_type === "totp");
  if (!totp.length) return NextResponse.json({ ok: true, nome: m.name, removidos: 0, aviso: `${m.name} não tinha verificação em duas etapas.` });

  const apagados: string[] = [];
  for (const f of totp) {
    const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: login.id, id: f.id });
    if (error) {
      return NextResponse.json({
        error: `Apaguei ${apagados.length} de ${totp.length} autenticadores de ${m.name}; o resto falhou (${error.message}). Tente de novo.`,
      }, { status: 500 });
    }
    apagados.push(f.id);
  }

  // Registro: quem zerou, de quem, quando. Falhar aqui não desfaz o que já foi feito — mas a tela diz.
  const { error: eReg } = await supabaseAdmin.from("audit_log").insert({
    table_name: "auth.mfa_factors",
    operation: "DELETE",
    record_id: m.id as string,
    user_role: "admin",
    user_name: gate.user.email,
    old_data: { pessoa: m.name, email, autenticadores: apagados.length },
    new_data: { acao: "zerar_duas_etapas", por: gate.user.email, em: new Date().toISOString() },
  });
  if (eReg) console.error("[team/duas-etapas] registro não gravado:", eReg.message);

  return NextResponse.json({
    ok: true, nome: m.name, removidos: apagados.length,
    ...(eReg ? { aviso: "A verificação foi zerada, mas o registro de auditoria não gravou." } : {}),
  });
}
