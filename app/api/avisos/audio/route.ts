export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/avisos/audio { texto } → áudio com a voz natural (lib/avisos/audio-server.ts): mp3 no modelo
// atual, WAV no de tempo real. { texto, amostra: true, voz? } (só admin) gera pelo modelo de tempo real,
// sem cache, para ouvir antes de trocar (leva 1-M, 26/11/2026).
// 204 quando não deu pra gerar: o painel cai na voz do navegador (lib/avisos/tocar.ts).

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { amostraTempoReal, audioDoAviso, TEXTO_MAX } from "@/lib/avisos/audio-server";
import { tipoDoAudio } from "@/lib/avisos/voz-tempo-real";
import { papelDoUsuario } from "@/lib/api/require-role";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { texto, amostra, voz } = await req.json().catch(() => ({}));
  if (typeof texto !== "string" || !texto.trim()) return NextResponse.json({ error: "texto obrigatório" }, { status: 400 });
  if (texto.length > TEXTO_MAX) return NextResponse.json({ error: `texto acima de ${TEXTO_MAX} caracteres` }, { status: 400 });
  if (amostra === true && (await papelDoUsuario(user)) !== "admin") return NextResponse.json({ error: "Só admin gera amostra" }, { status: 403 });
  const audio = amostra === true ? await amostraTempoReal(texto, typeof voz === "string" ? voz : undefined) : await audioDoAviso(texto);
  if (!audio) return new NextResponse(null, { status: 204 });
  return new NextResponse(new Uint8Array(audio), {
    headers: { "Content-Type": tipoDoAudio(audio), "Cache-Control": amostra === true ? "no-store" : "private, max-age=86400" },
  });
}
