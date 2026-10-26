export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import {
  CAMPOS_D4SIGN, ligarWebhookD4Sign, salvarConfigD4Sign, situacaoDaConfig, testarConfigD4Sign, type CampoD4Sign, type PainelD4Sign,
} from "@/lib/contracts/d4sign-config";

// /api/contracts/d4sign/config — as chaves da D4Sign pelo painel (Configurações › Jurídico). Só admin.
//   GET                                   situação: o que está configurado, de onde (painel/servidor), quando, por quem
//   POST { acao: "salvar", novos, apagar } grava cifrado o que veio preenchido; `apagar` volta a valer o .env
//   POST { acao: "testar" }               lê o cofre na D4Sign com a configuração de agora (1 chamada)
//   POST { acao: "webhook" }              cadastra o webhook 2.0 do cofre apontando para este painel (1 chamada)
// NENHUMA resposta devolve o valor de um segredo (lib/contracts/d4sign-config.ts).

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Só admin vê as chaves da D4Sign." }, { status: 403 });
  const r = await situacaoDaConfig();
  if (!r.ok) return NextResponse.json({ error: `Não consegui ler a configuração da D4Sign: ${r.erro}` }, { status: 503 });
  return NextResponse.json(r.situacao, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Só admin troca as chaves da D4Sign." }, { status: 403 });
  const corpo = (await req.json().catch(() => null)) as { acao?: string; novos?: Record<string, unknown>; apagar?: unknown } | null;
  const quem = user.email || "admin";

  if (corpo?.acao === "testar") {
    const r = await testarConfigD4Sign(quem);
    return NextResponse.json(r);
  }
  if (corpo?.acao === "webhook") {
    const r = await ligarWebhookD4Sign(quem);
    console.log(`[d4sign-config] ${quem} pediu o webhook do cofre: ${r.ok ? "ligado" : r.resultado}`);
    return NextResponse.json(r);
  }
  if (corpo?.acao !== "salvar") return NextResponse.json({ error: "acao precisa ser salvar ou testar" }, { status: 400 });

  const novos: PainelD4Sign = {};
  for (const c of CAMPOS_D4SIGN) {
    const v = corpo.novos?.[c];
    if (typeof v === "string" && v.trim()) novos[c] = v;
  }
  const apagar = (Array.isArray(corpo.apagar) ? corpo.apagar : []).filter((c): c is CampoD4Sign => CAMPOS_D4SIGN.includes(c as CampoD4Sign));
  const r = await salvarConfigD4Sign({ novos, apagar, quem });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  console.log(`[d4sign-config] ${quem} trocou ${Object.keys(novos).join(",") || "-"} e apagou ${apagar.join(",") || "-"}`);
  return NextResponse.json({ ok: true });
}
