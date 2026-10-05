export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/avisos/audio { texto } → audio/mpeg com a voz natural (lib/avisos/audio-server.ts).
// 204 quando não deu pra gerar: o painel cai na voz do navegador (lib/avisos/tocar.ts).

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { audioDoAviso, TEXTO_MAX } from "@/lib/avisos/audio-server";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { texto } = await req.json().catch(() => ({}));
  if (typeof texto !== "string" || !texto.trim()) return NextResponse.json({ error: "texto obrigatório" }, { status: 400 });
  if (texto.length > TEXTO_MAX) return NextResponse.json({ error: `texto acima de ${TEXTO_MAX} caracteres` }, { status: 400 });
  const mp3 = await audioDoAviso(texto);
  if (!mp3) return new NextResponse(null, { status: 204 });
  return new NextResponse(new Uint8Array(mp3), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" },
  });
}
