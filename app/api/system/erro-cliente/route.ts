export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// CAIXA-PRETA DO NAVEGADOR (16/09). "Clico e nada acontece" não deixa rastro no servidor: o erro
// fica no console do usuário. Este endpoint recebe erro JS / promessa rejeitada da tela e grava
// no log do app (docker logs) com quem, onde e o quê — para eu achar em minutos, sem print.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  const body = await req.json().catch(() => null) as { msg?: string; stack?: string; url?: string; acao?: string } | null;
  if (!body?.msg) return NextResponse.json({ ok: false }, { status: 400 });
  console.error(`[erro-cliente] ${user?.email ?? "anon"} @ ${String(body.url ?? "").slice(0, 120)}${body.acao ? ` (${body.acao})` : ""}: ${String(body.msg).slice(0, 300)}${body.stack ? `\n  ${String(body.stack).slice(0, 600).replace(/\n/g, "\n  ")}` : ""}`);
  return NextResponse.json({ ok: true });
}
