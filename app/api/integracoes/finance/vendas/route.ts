export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recusarLeituraFinance } from "@/lib/integracoes/finance-porta";
import { CAMINHO_VENDAS, montarVendasParaFinance, type LinhaClienteDaVenda, type LinhaLeadGanho } from "@/lib/integracoes/finance-vendas";

// GET /api/integracoes/finance/vendas — as vendas ganhas do Comercial (mensalidade, implantação, cadastro ligado) para o
// sistema financeiro privado dos sócios sugerir o contrato (lib/integracoes/finance-vendas.ts explica o que vai).
// Rota pública, protegida só pela ASSINATURA (lib/integracoes/finance-porta.ts). Só leitura: esta rota não grava nada.

export async function GET(req: NextRequest) {
  const recusa = recusarLeituraFinance(req, CAMINHO_VENDAS);
  if (recusa) return recusa;

  const [leads, cli] = await Promise.all([
    supabaseAdmin.from("crm_leads").select("id, empresa, contato_nome, estagio, valor_orcamento, valor_implantacao, fechado_em, updated_at").eq("estagio", "ganho"),
    supabaseAdmin.from("clients").select("id, source_lead_id, draft_status").not("source_lead_id", "is", null),
  ]);
  if (leads.error || cli.error) {
    console.error("[integracoes/finance] erro ao ler vendas:", leads.error?.message ?? cli.error?.message);
    return NextResponse.json({ error: "erro ao ler as vendas" }, { status: 500 });
  }

  const vendas = montarVendasParaFinance((leads.data ?? []) as LinhaLeadGanho[], (cli.data ?? []) as LinhaClienteDaVenda[]);
  console.log(`[integracoes/finance] leitura ok: ${vendas.length} vendas`);
  return NextResponse.json({ versao: 1, geradoEm: new Date().toISOString(), vendas }, { headers: { "Cache-Control": "no-store" } });
}
