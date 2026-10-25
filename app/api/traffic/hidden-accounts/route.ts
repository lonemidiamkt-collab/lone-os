export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { alternarNaLista, lerListaOcultas } from "@/lib/trafego/contas-ocultas";

// Contas de anúncio "ocultas" na tela de Tráfego. Antes viviam no localStorage (por navegador/
// dispositivo) — ocultar numa máquina não refletia nas outras. Agora ficam em agency_settings
// (compartilhado por todo o time). Preferência de exibição, baixa sensibilidade: qualquer staff logado.
//
// 25/10/2026 (auditoria 9.7): o POST recebia a lista INTEIRA e substituía. Se a tela não tinha
// conseguido ler as ocultas, mandava só a nova — e as outras voltavam ao Início, Hoje, Anúncios e
// vigia. Duas pessoas ao mesmo tempo: a última apagava a da outra. Agora o POST mexe numa conta só
// ({acao, id}) e grava com compara-e-troca (só grava se o valor ainda é o que foi lido).

const KEY = "hidden_ad_accounts";

type Lida = { ok: true; existe: boolean; bruto: string | null; ids: string[] } | { ok: false; erro: string };

async function lerLinha(): Promise<Lida> {
  const { data, error } = await supabaseAdmin.from("agency_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) return { ok: false, erro: error.message };
  const bruto = (data?.value as string | null | undefined) ?? null;
  const lida = lerListaOcultas(bruto);
  if (!lida.ok) return { ok: false, erro: lida.erro };
  return { ok: true, existe: !!data, bruto, ids: lida.ids };
}

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const r = await lerLinha();
  if (!r.ok) return NextResponse.json({ error: `Não consegui ler as contas ocultas: ${r.erro}` }, { status: 500 });
  return NextResponse.json({ ids: r.ids });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null) as { acao?: unknown; id?: unknown; ids?: unknown } | null;
  if (Array.isArray(body?.ids)) {
    // Tela antiga (mandava a lista inteira): não aceita mais — era assim que uma pessoa apagava a outra.
    return NextResponse.json({ error: "Recarregue a página de Contas & Verba e tente de novo." }, { status: 409 });
  }
  const acao = body?.acao;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if ((acao !== "ocultar" && acao !== "mostrar") || !id) {
    return NextResponse.json({ error: "Informe a conta e se é para ocultar ou mostrar." }, { status: 400 });
  }

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const atual = await lerLinha();
    if (!atual.ok) return NextResponse.json({ error: `Não consegui ler as contas ocultas (${atual.erro}). Nada mudou.` }, { status: 500 });
    const ids = alternarNaLista(atual.ids, id, acao === "ocultar");
    const valor = JSON.stringify(ids);
    if (atual.existe) {
      let q = supabaseAdmin.from("agency_settings").update({ value: valor }).eq("key", KEY);
      q = atual.bruto == null ? q.is("value", null) : q.eq("value", atual.bruto);
      const { data, error } = await q.select("key");
      if (error) return NextResponse.json({ error: `Não consegui gravar (${error.message}). Nada mudou.` }, { status: 500 });
      if (data?.length) return NextResponse.json({ ok: true, ids });
      // 0 linhas: alguém mexeu entre a leitura e a gravação — relê e tenta de novo.
    } else {
      const { error } = await supabaseAdmin.from("agency_settings").insert({ key: KEY, value: valor });
      if (!error) return NextResponse.json({ ok: true, ids });
      if (error.code !== "23505") return NextResponse.json({ error: `Não consegui gravar (${error.message}). Nada mudou.` }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Outra pessoa está mexendo nas contas ocultas agora. Tente de novo em instantes." }, { status: 409 });
}
