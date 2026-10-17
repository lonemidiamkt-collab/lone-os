export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { planejarImportacao, type DadosIniciais } from "@/lib/crm/importar";
import { hojeSP } from "@/lib/crm/meta";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";

// POST /api/crm/importar — importa lojas da rota, oportunidades (com mensalidade) e a planilha de
// leads do site. Só quem entra no comercial. Os valores chegam aqui pelo arquivo que o Roberto
// escolhe na tela — nunca pelo repositório (que é público).
//   { dados?: DadosIniciais, csv?: string }                  → { plano } (prévia, não grava nada)
//   { dados?, csv?, confirmar: true }                        → { plano, resultado } (grava)
// Idempotente: rodar de novo não duplica (lib/crm/importar.ts casa loja, cadastro, empresa e WhatsApp).

const CAMPOS_DE_NEGOCIACAO = ["valorOrcamento", "estagio", "probabilidade", "retomarEm", "etapaDesde"];

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null) as { dados?: DadosIniciais; csv?: string; confirmar?: boolean } | null;
  if (!body || (!body.dados && !body.csv)) return NextResponse.json({ error: "Envie o arquivo de dados ou o CSV da planilha." }, { status: 400 });
  if (body.csv && body.csv.length > 2_000_000) return NextResponse.json({ error: "CSV grande demais." }, { status: 413 });

  const [existentes, clientesQ] = await Promise.all([
    db.fetchCrmLeads(),
    supabaseAdmin.from("clients").select("name, phone, contact_phone, company_phone, whatsapp_team_phone").limit(3000),
  ]);
  const plano = planejarImportacao({
    dados: body.dados ?? null,
    csvPlanilha: body.csv ?? null,
    existentes: existentes.map((l) => ({ id: l.id, empresa: l.empresa, contatoNome: l.contatoNome, telefone: l.telefone, rotaLojaId: l.rotaLojaId, externoId: l.externoId })),
    clientes: (clientesQ.data ?? []).map((c) => ({ nome: c.name as string, telefones: [c.phone, c.contact_phone, c.company_phone, c.whatsapp_team_phone] as (string | null)[] })),
    hoje: hojeSP(),
  });
  if (!body.confirmar) return NextResponse.json({ plano });

  const resultado = { criados: 0, atualizados: 0, erros: [] as { titulo: string; erro: string }[] };
  for (const linha of plano.linhas) {
    if (linha.acao === "ignorar") continue;
    try {
      let leadId = linha.leadId;
      if (linha.acao === "criar") {
        const lead = await db.insertCrmLead(linha.campos);
        leadId = lead.id;
        resultado.criados++;
      } else if (leadId) {
        const patch = Object.fromEntries(Object.entries(linha.campos).filter(([k]) => CAMPOS_DE_NEGOCIACAO.includes(k)));
        await db.updateCrmLead(leadId, patch);
        resultado.atualizados++;
      }
      if (leadId && linha.atividades.length) {
        await supabaseAdmin.from("crm_lead_activities").insert(linha.atividades.map((a) => ({
          lead_id: leadId, tipo: a.tipo, texto: a.texto, autor: a.autor, ...(a.quando ? { created_at: a.quando } : {}),
        })));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro";
      resultado.erros.push({
        titulo: linha.titulo,
        erro: /column|schema cache/i.test(msg) ? "Falta aplicar a atualização do banco do comercial (migration 20261017100000)." : msg,
      });
      // Coluna faltando vale para todas as linhas: para na primeira em vez de repetir o mesmo erro 48 vezes.
      if (/column|schema cache/i.test(msg)) break;
    }
  }
  return NextResponse.json({ plano, resultado });
}
