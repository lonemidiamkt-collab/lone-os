export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// Escrita na Meta Ads: pausar/ativar campanha e ajustar orçamento diário — direto do Lone OS,
// sem abrir o Gerenciador. Ação que gasta dinheiro do cliente: exige usuário autenticado (staff),
// usa o token server-side (agency_settings.meta_token — o mesmo com escopo ads_management) e nunca
// confia num token vindo do navegador. Cada ação é logada com quem executou.

const GRAPH = "https://graph.facebook.com/v21.0";

async function getMetaToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const token = map.get("meta_token");
  const expiresAt = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!token) return null;
  if (expiresAt && expiresAt < Date.now()) return null;
  return token;
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const campaignId = body?.campaignId as string | undefined;
  const action = body?.action as "pause" | "activate" | undefined;
  const dailyBudget = body?.dailyBudget as number | undefined; // em REAIS

  if (!campaignId) return NextResponse.json({ error: "campaignId obrigatório" }, { status: 400 });
  if (!action && dailyBudget === undefined) {
    return NextResponse.json({ error: "informe action (pause/activate) ou dailyBudget" }, { status: 400 });
  }

  const token = await getMetaToken();
  if (!token) return NextResponse.json({ error: "Token Meta não configurado ou expirado. Reconecte o Meta Ads." }, { status: 400 });

  // Monta o corpo do POST à Graph API conforme a ação.
  const params = new URLSearchParams();
  if (action) {
    params.set("status", action === "pause" ? "PAUSED" : "ACTIVE");
  }
  if (dailyBudget !== undefined) {
    if (!(dailyBudget > 0)) return NextResponse.json({ error: "Orçamento diário inválido" }, { status: 400 });
    // A Meta espera o orçamento na menor unidade da moeda (centavos). AdCampaign.dailyBudget é em reais.
    params.set("daily_budget", String(Math.round(dailyBudget * 100)));
  }
  params.set("access_token", token);

  try {
    const res = await fetch(`${GRAPH}/${campaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || json?.error) {
      const err = json?.error;
      const code = err?.code as number | undefined;
      // 190 = token expirado/inválido · 200/10 = sem permissão de gestão (papel só-leitura na conta)
      const needsReconnect = code === 190 || code === 200 || code === 10;
      return NextResponse.json({
        error: err?.message || `HTTP ${res.status}`,
        code,
        needsReconnect,
      }, { status: 502 });
    }

    const label = action ? (action === "pause" ? "pausou" : "ativou") : `ajustou orçamento p/ R$ ${dailyBudget?.toFixed(2)}`;
    console.log(`[meta/campaign] ${user.email} ${label} a campanha ${campaignId}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
