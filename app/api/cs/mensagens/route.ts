export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/api/require-role";

// GET /api/cs/mensagens?clientId=…&n=5 — as últimas mensagens do CLIENTE no grupo dele (Leva 7C, N26).
// É a gaveta do feed do Agente: ler o que o cliente disse sem sair da lista. Lê o corpus que o
// inbound já grava (cs_message_corpus, client_id resolvido pelo trigger do grupo). Só leitura.
//
// /api/cs é público no middleware (o webhook mora aqui) — o portão de papel é daqui mesmo.
// Designer e comercial não leem a conversa do cliente (mesma regra da ficha).

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["admin", "manager", "social", "traffic"]);
  if (gate instanceof NextResponse) return gate;

  const clientId = req.nextUrl.searchParams.get("clientId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: "clientId inválido" }, { status: 400 });
  const n = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get("n") ?? 5) || 5));
  const comTime = req.nextUrl.searchParams.get("comTime") === "1";

  let q = supabaseAdmin.from("cs_message_corpus").select("created_at, author_name, text, is_team")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(n);
  if (!comTime) q = q.eq("is_team", false);
  const [{ data, error }, { data: cli }] = await Promise.all([
    q,
    supabaseAdmin.from("clients").select("name, nome_fantasia, whatsapp_group_name, last_client_msg_at").eq("id", clientId).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: `Não consegui ler as mensagens: ${error.message}` }, { status: 500 });

  return NextResponse.json({
    cliente: (cli?.nome_fantasia as string) || (cli?.name as string) || null,
    grupo: (cli?.whatsapp_group_name as string) || null,
    ultimaDoClienteEm: (cli?.last_client_msg_at as string) || null,
    // Mais antiga primeiro: lê-se como conversa.
    mensagens: (data ?? []).reverse().map((m) => ({
      em: m.created_at as string, autor: (m.author_name as string) || null, texto: ((m.text as string) || "").slice(0, 1000), doTime: !!m.is_team,
    })),
  });
}
