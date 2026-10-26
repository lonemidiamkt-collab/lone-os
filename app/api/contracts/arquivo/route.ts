export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { lerArquivo } from "@/lib/contracts/arquivo-ler";
import { mesDe, mesesDoArquivo } from "@/lib/contracts/arquivo-d4sign";

/**
 * GET /api/contracts/arquivo?mes=2026-10
 * Os meses com contratos assinados (quantos e quantos já têm PDF) e os contratos do mês pedido (padrão: o
 * mais recente). Só admin — é a mesma regra da tela de Contratos. Nenhum valor financeiro sai daqui.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const lido = await lerArquivo();
  if (!lido.ok) return NextResponse.json({ error: lido.erro }, { status: 500 });
  const meses = mesesDoArquivo(lido.itens);
  const pedido = req.nextUrl.searchParams.get("mes");
  const mes = pedido && /^\d{4}-\d{2}$/.test(pedido) ? pedido : meses[0]?.mes ?? null;
  const itens = mes ? lido.itens.filter((i) => mesDe(i.assinadoEm) === mes) : [];
  return NextResponse.json({ meses, mes, itens });
}
