export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/clients/pausa";
import { lerEstadoDaConta } from "@/lib/trafego/mudancas-server";
import { faltaNoBanco } from "@/lib/trafego/anuncios-server";

// POST /api/system/estado-campanhas — Leva 7A (N2). O RETRATO do dia: status e orçamento de cada
// campanha e conjunto de cada conta, logo depois da meia-noite (00h10 em São Paulo). É o que a aba
// "O que mudou" (Tráfego) compara com o retrato do dia anterior. Só grava — não avisa ninguém.
//
// O retrato do dia é o do COMEÇO do dia: rodar de novo durante o dia não sobrescreve (senão o "ontem"
// passaria a incluir mudanças de hoje). ?forcar=1 regrava · ?dry=1 lê sem gravar · ?clientId= um só.

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const forcar = req.nextUrl.searchParams.get("forcar") !== null;
  const soCliente = req.nextUrl.searchParams.get("clientId") || "";

  const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "meta_token").maybeSingle();
  const token = cfg?.value as string | undefined;
  if (!token) return NextResponse.json({ error: "meta_token ausente" }, { status: 500 });

  let q = supabaseAdmin.from("clients")
    .select("id, name, meta_ad_account_id, active, churned_at, paused_at, paused_until")
    .not("meta_ad_account_id", "is", null).neq("meta_ad_account_id", "");
  if (soCliente) q = q.eq("id", soCliente);
  const { data: clientes, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dia = hojeSP();
  const agora = new Date().toISOString();
  let linhas = 0, contas = 0;
  const falhas: { cliente: string; erro: string }[] = [];

  // Pausado também entra: é justamente quando alguém mexe (despausa, sobe verba) que o retrato importa.
  for (const c of (clientes ?? []).filter((x) => x.active !== false && !x.churned_at)) {
    const acc = c.meta_ad_account_id as string;
    try {
      const estado = await lerEstadoDaConta(acc, token);
      contas++;
      linhas += estado.length;
      if (dry || !estado.length) continue;
      const registros = estado.map((e) => ({ ...e, dia, client_id: c.id, meta_ad_account_id: acc, captured_at: agora }));
      for (let i = 0; i < registros.length; i += 500) {
        const { error: e } = await supabaseAdmin.from("meta_campaign_estado")
          .upsert(registros.slice(i, i + 500), { onConflict: "entity_id,dia", ignoreDuplicates: !forcar });
        if (e) {
          if (faltaNoBanco(e)) return NextResponse.json({ error: "tabela meta_campaign_estado ainda não existe (migração 20260925120000)" }, { status: 503 });
          throw new Error(e.message);
        }
      }
    } catch (e) {
      falhas.push({ cliente: c.name as string, erro: (e instanceof Error ? e.message : String(e)).slice(0, 160) });
    }
  }

  const status = falhas.length === 0 ? "ok" : contas > 0 ? "parcial" : "falhou";
  return NextResponse.json({ ok: falhas.length === 0, status, dry, dia, contas, linhas, falhas },
    { status: status === "falhou" && (clientes?.length ?? 0) > 0 ? 502 : 200 });
}
