// app/api/system/comparar-modelos — leva 1-M (26/11/2026). Só admin.
//   POST { origem, candidato, limite? } → começa um lote (reenvia até 50 amostras reais ao candidato).
//   GET ?lote=<id> → números do lote (sem texto de cliente).
// Gasta chamada de OpenAI: por isso só admin e no máximo 50 por lote.

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrRole } from "@/lib/api/cron-guard";
import { iniciarLote, MAX_POR_LOTE, resumir } from "@/lib/ai/comparar";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MODELO_VALIDO = /^(gpt-[\w.-]+|o\d[\w.-]*)$/;

export async function POST(req: NextRequest) {
  const negado = await requireCronOrRole(req, ["admin"]);
  if (negado) return negado;
  const b = (await req.json().catch(() => null)) as { origem?: unknown; candidato?: unknown; limite?: unknown } | null;
  const origem = typeof b?.origem === "string" ? b.origem.trim() : "";
  const candidato = typeof b?.candidato === "string" ? b.candidato.trim() : "";
  if (!origem || !MODELO_VALIDO.test(candidato)) return NextResponse.json({ ok: false, erro: "Informe origem (etiqueta do agente) e candidato (ex.: gpt-6-luna)." }, { status: 400 });
  const limite = Math.min(MAX_POR_LOTE, Math.max(1, Number(b?.limite) || 20));
  const r = await iniciarLote({ origem, candidato, limite });
  return NextResponse.json(r, { status: r.ok ? 202 : 409 });
}

export async function GET(req: NextRequest) {
  const negado = await requireCronOrRole(req, ["admin"]);
  if (negado) return negado;
  const lote = req.nextUrl.searchParams.get("lote") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(lote)) return NextResponse.json({ ok: false, erro: "lote inválido" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("llm_comparacoes").select("candidato, ok, json_valido, campos_iguais, duracao_ms, custo_usd").eq("lote", lote);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 503 });
  return NextResponse.json({ ok: true, ...resumir(lote, data ?? []) });
}
