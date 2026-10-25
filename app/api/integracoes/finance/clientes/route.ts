export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CAMINHO_CLIENTES, montarClientesParaFinance, type LinhaCliente, type LinhaSaida } from "@/lib/integracoes/finance-clientes";
import { recusarLeituraFinance } from "@/lib/integracoes/finance-porta";

// GET /api/integracoes/finance/clientes — a situação de cada cliente para o sistema financeiro privado dos sócios
// conferir com os contratos (lib/integracoes/finance-clientes.ts explica o que vai e o que nunca vai).
//
// Rota pública, protegida só pela ASSINATURA (lib/integracoes/finance-porta.ts). Só leitura: esta rota não grava nada.

const COLUNAS_CLIENTE = "id, name, service_type, lifecycle, active, draft_status, join_date, activated_at, paused_at, paused_until, churned_at, churn_category, churn_reason, source_lead_id, faturamento_faixa";
const COLUNAS_SAIDA = "client_id, estado, iniciativa, motivo, solicitado_em, encerra_em, cancelado_em, created_at";

export async function GET(req: NextRequest) {
  const recusa = recusarLeituraFinance(req, CAMINHO_CLIENTES);
  if (recusa) return recusa;

  const [cli, sai] = await Promise.all([
    supabaseAdmin.from("clients").select(COLUNAS_CLIENTE).order("name"),
    supabaseAdmin.from("client_offboardings").select(COLUNAS_SAIDA).is("cancelado_em", null),
  ]);
  if (cli.error || sai.error) {
    console.error("[integracoes/finance] erro ao ler:", cli.error?.message ?? sai.error?.message);
    return NextResponse.json({ error: "erro ao ler os clientes" }, { status: 500 });
  }

  const clientes = montarClientesParaFinance((cli.data ?? []) as LinhaCliente[], (sai.data ?? []) as LinhaSaida[]);
  console.log(`[integracoes/finance] leitura ok: ${clientes.length} clientes`);
  return NextResponse.json({ versao: 1, geradoEm: new Date().toISOString(), clientes }, { headers: { "Cache-Control": "no-store" } });
}
