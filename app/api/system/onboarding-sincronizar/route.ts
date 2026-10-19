export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/system/onboarding-sincronizar — leva para a ficha o que os clientes já digitaram nos links
// de cadastro e ainda não enviaram. Ver lib/onboarding/sincronia.ts.
//
// Roberto (19/10/2026): "quem já tiver os dados, você recoloque dentro da plataforma". Desde a mesma
// data o salvamento automático do formulário já faz isso sozinho; esta rota recupera os rascunhos
// anteriores e serve de conferência.
//
//   sem parâmetro → ensaio (mostra o que gravaria) · ?aplicar=1 → grava

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sincronizarRascunho } from "@/lib/onboarding/sincronia-server";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const aplicar = req.nextUrl.searchParams.get("aplicar") === "1";

  const { data: subs, error } = await supabaseAdmin
    .from("client_onboarding_submissions").select("id, client_id, status, clients(name, nome_fantasia)")
    .neq("status", "submitted").not("client_id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const linhas: { cliente: string; campos: string[]; erro?: string }[] = [];
  for (const s of subs ?? []) {
    const c = (s.clients ?? {}) as { name?: string; nome_fantasia?: string };
    const r = await sincronizarRascunho({ id: s.id as string }, aplicar);
    if (r.campos.length || r.erro) linhas.push({ cliente: c.nome_fantasia || c.name || "?", campos: r.campos, ...(r.erro ? { erro: r.erro } : {}) });
  }
  return NextResponse.json({ ok: true, aplicar, cadastros_abertos: subs?.length ?? 0, com_dados_novos: linhas.length, linhas });
}
