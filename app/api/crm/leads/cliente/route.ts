export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { clientesParecidos } from "@/lib/crm/fechados";

// Venda ganha que JÁ É cliente no Lone OS (cadastrado antes, sem ligação com o lead): ligar em vez de criar outro.
//   GET  ?leadId=          → { parecidos, outros }: clientes sem lead ligado (os de nome parecido primeiro)
//   POST { leadId, clientId, autor } → grava clients.source_lead_id (um lead, um cliente) e registra no histórico
// Só sócios (PAPEIS_COMERCIAL). Não cria cliente, não mexe em contrato nem em valor.

type ClienteLivre = { id: string; nome: string };

async function clientesSemLead(): Promise<ClienteLivre[]> {
  const { data, error } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia").is("source_lead_id", null).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ id: c.id as string, nome: ((c.nome_fantasia as string) || (c.name as string) || "(sem nome)").trim() }));
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId obrigatório" }, { status: 400 });
  const lead = await db.fetchCrmLeadById(leadId);
  if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  try {
    const livres = await clientesSemLead();
    const parecidos = clientesParecidos(lead.empresa || lead.contatoNome || "", livres);
    const ids = new Set(parecidos.map((c) => c.id));
    return NextResponse.json({ parecidos, outros: livres.filter((c) => !ids.has(c.id)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro ao ler os clientes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const b = (await req.json().catch(() => null)) as { leadId?: string; clientId?: string; autor?: string | null } | null;
  if (!b?.leadId || !b.clientId) return NextResponse.json({ error: "leadId e clientId obrigatórios" }, { status: 400 });
  const lead = await db.fetchCrmLeadById(b.leadId);
  if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const { data: ja } = await supabaseAdmin.from("clients").select("id, name").eq("source_lead_id", b.leadId).maybeSingle();
  if (ja) return NextResponse.json({ error: `Este lead já está ligado ao cliente ${ja.name as string}.`, clientId: ja.id }, { status: 409 });
  const { data: cli } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia, source_lead_id").eq("id", b.clientId).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (cli.source_lead_id) return NextResponse.json({ error: "Esse cliente já está ligado a outro lead." }, { status: 409 });

  // Só grava se continuar sem lead (corrida com outra aba): o índice único clients_source_lead_unico segura o resto.
  const { data: atualizado, error } = await supabaseAdmin.from("clients").update({ source_lead_id: b.leadId }).eq("id", b.clientId).is("source_lead_id", null).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Este lead já está ligado a outro cliente." : `Não consegui ligar: ${error.message}` }, { status: error.code === "23505" ? 409 : 500 });
  if (!atualizado) return NextResponse.json({ error: "Esse cliente acabou de ser ligado a outro lead. Recarregue." }, { status: 409 });

  const nome = ((cli.nome_fantasia as string) || (cli.name as string) || "").trim();
  await db.insertLeadActivity({ leadId: lead.id, tipo: "nota", autor: b.autor ?? null, texto: `Ligado ao cliente que já existia no Lone OS: ${nome}. Nenhum cliente novo foi criado.` }).catch(() => {});
  return NextResponse.json({ ok: true, clienteId: cli.id, nome });
}
