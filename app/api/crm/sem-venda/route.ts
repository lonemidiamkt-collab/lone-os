export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { registrarEtapa } from "@/lib/crm/etapas-historico";
import { jobDispensa, lerClientesSemVenda } from "@/lib/crm/sem-venda";

// GET  /api/crm/sem-venda — clientes que entraram no Lone OS sem venda no Comercial (lib/crm/sem-venda.ts).
// POST /api/crm/sem-venda { acao: "registrar", clientId, valorMensal, valorImplantacao?, fechadoEm? }
//        cria o lead Ganho ligado ao cadastro (o cadastro não muda; nada vai para grupo).
//      { acao: "dispensar", clientId, motivo } — "não foi venda" (segunda loja, contrato duplo, cliente antigo).
//      { acao: "desfazer", clientId } — volta para a lista.

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const r = await lerClientesSemVenda();
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 500 });
  return NextResponse.json({ clientes: r.clientes });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => ({}));
  const clientId = String(body?.clientId ?? "");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  if (body?.acao === "dispensar" || body?.acao === "desfazer") {
    const job = jobDispensa(clientId);
    const r = body.acao === "dispensar"
      ? await supabaseAdmin.from("automation_settings").upsert({ job, enabled: false, updated_by: `${gate.user.email} · ${String(body?.motivo ?? "não foi venda").slice(0, 80)}`, updated_at: new Date().toISOString() }, { onConflict: "job" })
      : await supabaseAdmin.from("automation_settings").delete().eq("job", job);
    if (r.error) return NextResponse.json({ error: `Não gravei: ${r.error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body?.acao !== "registrar") return NextResponse.json({ error: "acao= registrar, dispensar ou desfazer" }, { status: 400 });
  const valorMensal = Number(body?.valorMensal);
  if (!(valorMensal > 0)) return NextResponse.json({ error: "Informe a mensalidade vendida." }, { status: 400 });
  const implantacao = body?.valorImplantacao === "" || body?.valorImplantacao == null ? null : Number(body.valorImplantacao);
  if (implantacao != null && !(implantacao >= 0)) return NextResponse.json({ error: "Implantação inválida." }, { status: 400 });
  const fechadoEm = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.fechadoEm ?? "")) ? String(body.fechadoEm) : null;

  const { data: cli, error: eCli } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, contact_name, phone, email, lead_source, created_at, source_lead_id").eq("id", clientId).maybeSingle();
  if (eCli) return NextResponse.json({ error: "Não consegui ler o cliente agora. Tente de novo." }, { status: 503 });
  if (!cli) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (cli.source_lead_id) return NextResponse.json({ error: "Este cliente já tem venda ligada no Comercial." }, { status: 409 });

  const empresa = String(cli.nome_fantasia || cli.name || "Cliente");
  const dia = fechadoEm ?? new Date(cli.created_at as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let lead;
  try {
    lead = await db.insertCrmLead({
      contatoNome: (cli.contact_name as string) || empresa, empresa,
      telefone: (cli.phone as string) || null, email: (cli.email as string) || null,
      origem: (cli.lead_source as string) || "indicacao",
      valorOrcamento: valorMensal, valorImplantacao: implantacao,
      estagio: "ganho", probabilidade: 1, fechadoEm: dia, etapaDesde: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui criar a venda: ${e instanceof Error ? e.message : "erro"}` }, { status: 500 });
  }
  // Liga só se o cadastro continua sem venda (outra aba pode ter ligado no meio); senão desfaz o lead criado.
  const { data: ligado, error: eLiga } = await supabaseAdmin.from("clients")
    .update({ source_lead_id: lead.id }).eq("id", clientId).is("source_lead_id", null).select("id");
  if (eLiga || !ligado?.length) {
    await supabaseAdmin.from("crm_leads").delete().eq("id", lead.id);
    return NextResponse.json({ error: eLiga ? `Não liguei a venda ao cadastro: ${eLiga.message}. Nada ficou gravado.` : "Este cliente ganhou uma venda ligada agora há pouco. Recarregue." }, { status: eLiga ? 500 : 409 });
  }
  await registrarEtapa({ leadId: lead.id, de: null, para: "ganho", autor: gate.user.email, origem: "criacao" });
  const nota = await supabaseAdmin.from("crm_lead_activities").insert({
    lead_id: lead.id, tipo: "nota", texto: `Venda registrada depois: o cliente já estava no Lone OS desde ${dia.split("-").reverse().join("/")}.`, autor: gate.user.email,
  });
  return NextResponse.json({ ok: true, leadId: lead.id, ...(nota.error ? { aviso: "a nota da venda não gravou" } : {}) });
}
