export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { mesSP } from "@/lib/crm/meta";
import * as db from "@/lib/supabase/queries";

// Meta mensal do comercial (MRR novo vendido + metas de esforço). Só quem entra no comercial
// (lib/crm/acesso.ts) — antes bastava estar logado, e qualquer pessoa da equipe lia e mudava a meta.
//   GET ?mes=YYYY-MM  → { meta } (null se não definida; mês de São Paulo por padrão)
//   PUT { mes, metaValor?, metaLeads?, metaContatosSemana?, metaPropostasMes? } → { meta } (upsert;
//       campo ausente não muda, "" ou null limpa)

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function numeroOuNulo(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === "" || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const mes = req.nextUrl.searchParams.get("mes") ?? mesSP(new Date());
  if (!MES.test(mes)) return NextResponse.json({ error: "Mês inválido (use AAAA-MM)." }, { status: 400 });
  // Meta que não carregou não é "sem meta" (24/10/2026): 503, e a tela diz que não leu em vez de mostrar R$ 0.
  try {
    const meta = await db.fetchCrmMeta(mes);
    return NextResponse.json({ meta });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não consegui ler a meta do mês." }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  if (!body?.mes || !MES.test(String(body.mes))) return NextResponse.json({ error: "Mês inválido (use AAAA-MM)." }, { status: 400 });
  const campos = {
    metaValor: numeroOuNulo(body.metaValor),
    metaLeads: numeroOuNulo(body.metaLeads),
    metaContatosSemana: numeroOuNulo(body.metaContatosSemana),
    metaPropostasMes: numeroOuNulo(body.metaPropostasMes),
  };
  try {
    const meta = await db.upsertCrmMeta(String(body.mes), campos);
    return NextResponse.json({ meta });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    // Sem a migration da Leva 1, as metas de esforço não têm coluna: diz isso em vez de "erro".
    if (/meta_contatos_semana|meta_propostas_mes|column|schema cache/i.test(msg)) {
      return NextResponse.json({ error: "As metas de esforço precisam da atualização do banco (migration do comercial)." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
