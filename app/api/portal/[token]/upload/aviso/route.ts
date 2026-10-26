export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { clienteDoLink, FRASE_INDISPONIVEL } from "@/lib/portal/token";
import { criarLimite } from "@/lib/portal/limite";
import { loteValido } from "@/lib/portal/envio-material";
import { avisarTimeDoMaterial, registroDeLotes } from "@/lib/portal/envio-material-server";

// POST /api/portal/[token]/upload/aviso — { lote, ids } — UM aviso no grupo do time com todos os
// arquivos de um envio do portal (24/10/2026, item 1.11). Antes cada arquivo virava uma mensagem.
// Pedido repetido do mesmo lote não avisa de novo; se o aviso falhar, a página pode pedir outra vez.

const LIMITE = criarLimite(20, 3600_000);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Banco que oscila não é link inválido (26/10/2026): 503 com "tente de novo", não 404.
  const lido = await clienteDoLink(token);
  if (lido.estado === "indisponivel") return NextResponse.json({ error: FRASE_INDISPONIVEL }, { status: 503 });
  if (lido.estado === "invalido") return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  const cliente = lido.linha;
  if (LIMITE.estourou(cliente.id)) return NextResponse.json({ error: "Muitos avisos seguidos. Tente daqui a pouco." }, { status: 429 });

  const body = await req.json().catch(() => null) as { lote?: unknown; ids?: unknown } | null;
  if (!loteValido(body?.lote)) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  const lote = body!.lote as string;
  const ids = Array.isArray(body?.ids)
    ? (body!.ids as unknown[]).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50)
    : [];

  const registro = registroDeLotes();
  const doServidor = registro.concluir(lote, cliente.id);
  if (doServidor === null) return NextResponse.json({ ok: true, jaAvisado: true });

  // Os ids que o servidor viu chegar + os que a página diz ter mandado (servidor reiniciado no meio).
  // avisarTimeDoMaterial só lê os que são DESTE cliente.
  const todos = [...new Set([...doServidor, ...ids])];
  const r = await avisarTimeDoMaterial(cliente.id, todos);
  if (!r.ok) {
    // A página pode pedir de novo; se não pedir, o automático tenta daqui a alguns minutos.
    registro.esquecer(lote, cliente.id);
    for (const id of todos) registro.chegou(lote, cliente.id, id);
    console.error("[portal/upload/aviso] aviso falhou:", cliente.id, r.erro);
    return NextResponse.json({ error: "Seus arquivos estão guardados, mas não consegui avisar o time agora." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, avisados: r.quantos });
}
