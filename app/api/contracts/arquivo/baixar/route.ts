export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { carregarConfigD4Sign } from "@/lib/contracts/d4sign-config";
import { guardarPdfAssinado } from "@/lib/contracts/arquivo-d4sign";
import { uuidValido } from "@/lib/contracts/assinatura";

/**
 * POST /api/contracts/arquivo/baixar { uuid }
 * Busca AGORA o PDF assinado de um documento que a rotina da madrugada ainda não trouxe. Gasta 1 das 10
 * chamadas da hora da D4Sign (origem "manual": não esbarra na reserva das rotinas). Só admin.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const uuid = String(body?.uuid ?? "");
  if (!uuidValido(uuid)) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  const cfg = await carregarConfigD4Sign();
  if (!cfg) return NextResponse.json({ error: "D4Sign não configurada (Configurações › Jurídico)." }, { status: 503 });
  const r = await guardarPdfAssinado(uuid, cfg, "manual");
  if (r.limite) return NextResponse.json({ error: "A D4Sign está no limite de chamadas desta hora. Tente de novo em alguns minutos." }, { status: 429 });
  if (!r.ok) return NextResponse.json({ error: `Não consegui trazer o PDF: ${r.motivo ?? "erro"}` }, { status: 502 });
  if (!r.pdf) return NextResponse.json({ error: r.motivo ?? "Outro processo está trazendo este PDF. Tente de novo em instantes." }, { status: 409 });
  return NextResponse.json({ ok: true, pdf: r.pdf });
}
