export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { enviarParaAssinatura, preverEnvio } from "@/lib/contracts/enviar-d4sign";

// POST /api/contracts/d4sign/enviar — "Cliente concordou → enviar para assinatura" (lib/contracts/enviar-d4sign.ts).
//   { contractId, acao: "prever" }                     → quem assina, e-mails, cofres (nada sai)
//   { contractId, acao: "enviar", cofre, email }       → sobe o PDF, cadastra quem assina e manda (ou continua)
// Só gestão. Cada envio gasta 3 das 10 chamadas da hora e 1 dos envios do mês do plano da D4Sign.

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => ({}));
  const contractId = String(body?.contractId ?? "");
  if (!contractId) return NextResponse.json({ error: "contractId obrigatório" }, { status: 400 });

  if (body?.acao === "prever") {
    const r = await preverEnvio(contractId);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.erro }, { status: 409 });
  }
  if (body?.acao !== "enviar") return NextResponse.json({ error: "acao= prever ou enviar" }, { status: 400 });
  const r = await enviarParaAssinatura({
    contractId, cofre: String(body?.cofre ?? ""), email: String(body?.email ?? ""), quem: gate.user.email || "gestão",
  });
  if (!r.ok) {
    console.error(`[contracts/d4sign/enviar] ${contractId}: ${r.erro}`);
    return NextResponse.json({ error: r.erro, etapa: r.etapa, documento: r.documento }, { status: r.limite ? 429 : 502 });
  }
  console.log(`[contracts/d4sign/enviar] ${contractId} enviado (documento ${r.documento})`);
  return NextResponse.json(r);
}
