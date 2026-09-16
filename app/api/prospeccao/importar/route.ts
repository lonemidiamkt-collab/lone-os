export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual } from "@/lib/prospeccao/piloto";
import { importarCsv } from "@/lib/prospeccao/providers/importacao";
import { inserirCandidatos } from "@/lib/prospeccao/descoberta";

// POST /api/prospeccao/importar — CSV (Driva ou planilha) em texto. { csv, origem?, dry? }
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => null)) as { csv?: string; origem?: string; dry?: boolean } | null;
  if (!body?.csv?.trim()) return NextResponse.json({ error: "csv vazio" }, { status: 400 });
  if (body.csv.length > 5_000_000) return NextResponse.json({ error: "arquivo grande demais (5 MB)" }, { status: 413 });
  const cfg = await carregarConfig();
  const imp = importarCsv(body.csv, cfg.base.uf, (body.origem || "csv").slice(0, 40));
  if (!imp.candidatos.length) return NextResponse.json({ ok: true, ...imp, novos: 0, duplicados: 0, excluidos: 0, aviso: "nenhuma linha com nome de empresa reconhecida" });
  const campanha = await campanhaAtual();
  const r = await inserirCandidatos(imp.candidatos, { campanhaId: campanha?.id, ufPadrao: cfg.base.uf, dry: !!body.dry });
  return NextResponse.json({ ok: true, total: imp.total, ignoradas: imp.ignoradas, colunas: imp.colunas, reconhecidos: imp.candidatos.length, novos: r.novos, duplicados: r.duplicados, excluidos: r.excluidos, motivos: r.motivos.slice(0, 20) });
}
