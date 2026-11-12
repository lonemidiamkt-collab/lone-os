export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { COLUNAS_DO_CLIENTE, nomeDoCliente, type ClienteParaAncora, type EstadoDoCliente } from "@/lib/integracoes/ancora";
import { ancoraLigada, lerEstadosNoAncora } from "@/lib/integracoes/ancora-server";

// GET /api/ancora — a aba Âncora: os clientes ativos e o estado de cada um no Âncora CRM, lido agora.
// Só gestão (admin e gestor — decisão do Roberto, 12/11/2026). Nunca devolve segredo.
//
// FALHA ≠ "SEM ACESSO": se o Âncora não responder, os clientes saem com `estado: null` e `ancora.erro` diz o
// motivo. A tela mostra "não consegui perguntar", não uma lista de "sem acesso" que seria mentira.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const { data, error } = await supabaseAdmin.from("clients").select(COLUNAS_DO_CLIENTE)
    .eq("active", true).order("name", { ascending: true }).limit(500);
  if (error) return NextResponse.json({ error: "Não consegui ler os clientes." }, { status: 500 });
  const clientes = (data ?? []) as unknown as ClienteParaAncora[];

  const ligada = ancoraLigada();
  const estados = new Map<string, EstadoDoCliente>();
  let erro: string | null = null;
  if (ligada && clientes.length) {
    const r = await lerEstadosNoAncora(clientes.map((c) => c.id));
    if (r.ok) for (const e of r.data) estados.set(e.ref_externa, e);
    else erro = r.mensagem;
  }

  return NextResponse.json({
    ancora: { ligada, erro, lidoEm: ligada && !erro ? new Date().toISOString() : null },
    clientes: clientes.map((c) => ({
      id: c.id,
      nome: nomeDoCliente(c) || "Sem nome",
      // só o que a tela precisa para dizer se dá para gerar o link — o resto do cadastro não sai daqui
      temEmail: !!(c.email ?? "").trim(),
      estado: ligada && !erro ? (estados.get(c.id) ?? null) : null,
    })),
  });
}
