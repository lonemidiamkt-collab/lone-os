export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { estadoGoogle, googleConfigurado, urlDeAutorizacao, desconectarGoogle, planilhaId, urlDaPlanilha, calendarioId } from "@/lib/prospeccao/google";
import { gravarSetting } from "@/lib/prospeccao/config";

// GET    /api/prospeccao/google → estado (configurado? conectado? e-mail, planilha, calendário)
// POST   { acao: "iniciar" } → URL de consentimento (a página redireciona); { acao: "calendario", id } salva o calendário
// DELETE → desconecta (apaga o refresh token)
//
// O `state` é assinado (HMAC com CRON_SECRET) e vale 10 min: o callback é público no middleware
// (o navegador volta do Google sem header de auth), então é o state que prova que o fluxo começou aqui.

function assinarState(): string {
  const segredo = process.env.CRON_SECRET || process.env.VAULT_KEY || "lone";
  const ts = Date.now().toString(36);
  const mac = createHmac("sha256", segredo).update(ts).digest("hex").slice(0, 32);
  return `${ts}.${mac}`;
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const [estado, sheet, cal] = await Promise.all([estadoGoogle(), planilhaId(), calendarioId()]);
  return NextResponse.json({ ok: true, ...estado, planilha_id: sheet, planilha_url: sheet ? urlDaPlanilha(sheet) : null, calendario_id: cal, redirect_uri: `${(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://painel.lonemidia.com").replace(/\/+$/, "")}/api/auth/google/callback` });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => null)) as { acao?: string; id?: string } | null;
  if (body?.acao === "iniciar") {
    if (!googleConfigurado()) return NextResponse.json({ error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados no servidor" }, { status: 400 });
    return NextResponse.json({ ok: true, url: urlDeAutorizacao(assinarState()) });
  }
  if (body?.acao === "calendario") {
    await gravarSetting("prospect_calendar_id", body.id?.trim() || null);
    return NextResponse.json({ ok: true, calendario_id: await calendarioId() });
  }
  if (body?.acao === "planilha_existente") {
    const id = (body.id ?? "").trim().match(/[-\w]{25,}/)?.[0] ?? null;
    if (!id) return NextResponse.json({ error: "id/URL da planilha inválido" }, { status: 400 });
    await gravarSetting("prospect_sheet_id", id);
    return NextResponse.json({ ok: true, planilha_id: id, planilha_url: urlDaPlanilha(id) });
  }
  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  await desconectarGoogle();
  return NextResponse.json({ ok: true });
}
