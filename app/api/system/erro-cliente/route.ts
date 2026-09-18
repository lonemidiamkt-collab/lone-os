export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";

// CAIXA-PRETA + TRILHA DO NAVEGADOR. "Clico e nada acontece" não deixa rastro no servidor; aqui a
// tela manda erro JS e cada passo importante (criar, A fazer, anexar, entregar…). PERSISTIDO em
// trilha_navegador (18/09): o stdout do container era apagado a cada deploy — perdemos 45 registros.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  const body = await req.json().catch(() => null) as { msg?: string; stack?: string; url?: string; acao?: string } | null;
  if (!body?.msg) return NextResponse.json({ ok: false }, { status: 400 });
  const trilha = body.acao === "trilha";
  const msg = String(body.msg).slice(0, 600);
  // "acao {json}" → acao + detalhe
  const m = trilha ? msg.match(/^(\S+)\s*([\s\S]*)$/) : null;
  let detalhe: unknown = null;
  if (m?.[2]?.trim()) { try { detalhe = JSON.parse(m[2].trim()); } catch { detalhe = { bruto: m[2].trim().slice(0, 500) }; } }
  const linha = `${trilha ? "[trilha]" : "[erro-cliente]"} ${user?.email ?? "anon"} @ ${String(body.url ?? "").slice(0, 120)}: ${msg}${body.stack ? `\n  ${String(body.stack).slice(0, 600).replace(/\n/g, "\n  ")}` : ""}`;
  (trilha ? console.log : console.error)(linha);
  await supabaseAdmin.from("trilha_navegador").insert({
    quem: user?.email ?? null, pagina: String(body.url ?? "").slice(0, 120), tipo: trilha ? "trilha" : "erro",
    acao: trilha ? (m?.[1] ?? msg.slice(0, 80)) : "erro-js", detalhe: trilha ? detalhe : { msg, stack: body.stack?.slice(0, 1500) ?? null, acao: body.acao ?? null },
  }).then(({ error }) => { if (error) console.error("[trilha] não gravou:", error.message); });
  return NextResponse.json({ ok: true });
}
