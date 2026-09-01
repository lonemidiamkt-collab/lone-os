export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// GET /api/clients/[id]/uploads — o material que o CLIENTE mandou pelo painel.
//
// Sem esta tela o arquivo ficaria no bucket sem ninguém abrir — exatamente o que acontecia com os
// alertas de queda, detectados e nunca vistos. Material que chega e ninguém olha é igual a material
// que não chegou, com o agravante de que o cliente acha que já mandou.
//
// O bucket é PRIVADO. Cada arquivo sai como URL assinada de 1 hora, gerada na hora do pedido por
// quem está logado — nunca um link permanente, que é como o storage vazou em junho.
// POST marca como visto.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabaseAdmin.from("client_uploads")
    .select("id, file_name, mime_type, size_bytes, observacao, enviado_por, created_at, visto_em, visto_por, storage_path")
    .eq("client_id", id).order("created_at", { ascending: false }).limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const itens = await Promise.all((data ?? []).map(async (u) => {
    const { data: assinada } = await supabaseAdmin.storage.from("client-uploads")
      .createSignedUrl(u.storage_path as string, 3600);
    const { storage_path: _omitido, ...resto } = u;
    return { ...resto, url: assinada?.signedUrl ?? null };
  }));

  return NextResponse.json({ itens, pendentes: itens.filter((i) => !i.visto_em).length });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { uploadId?: string };
  if (!body.uploadId) return NextResponse.json({ error: "uploadId obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin.from("client_uploads")
    .update({ visto_em: new Date().toISOString(), visto_por: user.email || "equipe" })
    .eq("id", body.uploadId).eq("client_id", id);   // o .eq(client_id) impede marcar arquivo de outro cliente
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
