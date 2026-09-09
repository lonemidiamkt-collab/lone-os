export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { paraUrlPublica } from "@/lib/supabase/url-publica";
import { getServerUser } from "@/lib/supabase/auth-server";

// GET /api/reunioes/ficha?id=…
//
// O registro inteiro de uma reunião. Serve o drawer aberto do calendário e o da ficha do cliente
// — as duas portas sobre o MESMO objeto.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const { data: m, error } = await supabaseAdmin
    .from("meetings")
    .select("id, client_id, start_at, end_at, estado, responsavel, duration_minutes, briefing, decisoes, proximos_passos, briefing_em, briefing_por, resumo, realizada_em, created_by, created_at, meeting_source, deleted_at")
    .eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!m || m.deleted_at) return NextResponse.json({ error: "reunião não encontrada" }, { status: 404 });

  const { data: anexos } = await supabaseAdmin
    .from("meeting_attachments")
    .select("id, nome_arquivo, nome_original, tamanho_bytes, storage_path, storage_bucket, enviado_por, created_at")
    .eq("meeting_id", id).is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Link assinado e curto. O bucket é privado: material de reunião com cliente não é público, e
  // a pasta nunca é a autorização — quem chegou aqui já passou pela sessão.
  const comUrl = await Promise.all((anexos ?? []).map(async (a) => {
    let url: string | null = null;
    try {
      const { data } = await supabaseAdmin.storage
        .from((a.storage_bucket as string) || "meeting-records")
        .createSignedUrl(a.storage_path as string, 600);
      url = paraUrlPublica(data?.signedUrl);
    } catch { /* arquivo some do bucket: a linha continua, sem link */ }
    return {
      id: a.id as string,
      nome: (a.nome_original as string) || (a.nome_arquivo as string),
      tamanho: (a.tamanho_bytes as number) ?? null,
      enviadoPor: (a.enviado_por as string) ?? null,
      em: a.created_at as string,
      url,
    };
  }));

  return NextResponse.json({
    ok: true,
    reuniao: { ...m, anexos: comUrl },
  }, { headers: { "cache-control": "no-store" } });
}
