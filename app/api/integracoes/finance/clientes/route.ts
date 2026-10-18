export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { conferirAssinatura } from "@/lib/crm/site-lead";
import { CAMINHO_CLIENTES, mensagemAssinada, montarClientesParaFinance, type LinhaCliente, type LinhaSaida } from "@/lib/integracoes/finance-clientes";

// GET /api/integracoes/finance/clientes — a situação de cada cliente para o sistema financeiro privado dos sócios
// conferir com os contratos (lib/integracoes/finance-clientes.ts explica o que vai e o que nunca vai).
//
// Rota pública, protegida só pela ASSINATURA: HMAC-SHA256 de `${x-lone-timestamp}.GET ${caminho}` com o segredo
// LONEOS_FINANCE_READ_SECRET, carimbo de no máximo 5 min — o mesmo esquema do cadastro do site. Sem o segredo
// configurado a porta fica fechada (503). Só leitura: esta rota não grava nada.

const COLUNAS_CLIENTE = "id, name, service_type, lifecycle, active, draft_status, join_date, activated_at, paused_at, paused_until, churned_at, churn_category, churn_reason, source_lead_id, faturamento_faixa";
const COLUNAS_SAIDA = "client_id, estado, iniciativa, motivo, solicitado_em, encerra_em, cancelado_em, created_at";

export async function GET(req: NextRequest) {
  const segredo = process.env.LONEOS_FINANCE_READ_SECRET ?? "";
  if (segredo.length < 32) return NextResponse.json({ error: "integração desligada" }, { status: 503 });

  const conf = conferirAssinatura({
    segredo,
    timestamp: req.headers.get("x-lone-timestamp"),
    assinatura: req.headers.get("x-lone-signature"),
    corpo: mensagemAssinada(CAMINHO_CLIENTES),
    agora: Date.now(),
  });
  if (!conf.ok) {
    console.warn(`[integracoes/finance] leitura recusada: ${conf.motivo}`);
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

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
