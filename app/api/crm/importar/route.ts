export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { assinaturaDoPlano, planejarImportacao, type DadosIniciais } from "@/lib/crm/importar";
import { hojeSP } from "@/lib/crm/meta";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { gravarPlano } from "@/lib/crm/gravar-plano";

// POST /api/crm/importar — importa lojas da rota, oportunidades (com mensalidade) e a planilha de
// leads do site. Só quem entra no comercial. Os valores chegam aqui pelo arquivo que o Roberto
// escolhe na tela — nunca pelo repositório (que é público).
//   { dados?: DadosIniciais, csv?: string }                  → { plano, assinatura } (prévia, não grava nada)
//   { dados?, csv?, confirmar: true, assinatura }            → { plano, resultado } (grava)
// Idempotente: rodar de novo não duplica (lib/crm/importar.ts casa loja, cadastro, empresa e WhatsApp).
//
// 24/10/2026 (auditoria 4.10): leitura do funil ou dos clientes que falha ABORTA (antes virava lista vazia e
// o "Importar" criava o funil inteiro de novo), e só se grava o plano que a prévia mostrou: o servidor
// recalcula e compara a assinatura; mudou → 409 e a tela mostra a prévia nova.

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null) as { dados?: DadosIniciais; csv?: string; confirmar?: boolean; assinatura?: string } | null;
  if (!body || (!body.dados && !body.csv)) return NextResponse.json({ error: "Envie o arquivo de dados ou o CSV da planilha." }, { status: 400 });
  if (body.csv && body.csv.length > 2_000_000) return NextResponse.json({ error: "CSV grande demais." }, { status: 413 });

  const [existentes, clientesQ] = await Promise.all([
    db.fetchCrmLeads().catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
    supabaseAdmin.from("clients").select("name, phone, contact_phone, company_phone, whatsapp_team_phone").limit(3000),
  ]);
  if (existentes instanceof Error) {
    return NextResponse.json({ error: "Não consegui ler o funil agora, então não dá para saber quem já está nele. Nada foi importado — tente de novo em instantes." }, { status: 503 });
  }
  if (clientesQ.error) {
    return NextResponse.json({ error: "Não consegui ler a lista de clientes (para não importar quem já é cliente). Nada foi importado — tente de novo em instantes." }, { status: 503 });
  }
  const plano = planejarImportacao({
    dados: body.dados ?? null,
    csvPlanilha: body.csv ?? null,
    // A negociação atual vai junto: é por ela que a prévia mostra "de → para" e que reimportar não
    // regride etapa nem troca valor já acertado (compararNegociacao, 21/10/2026).
    existentes: existentes.map((l) => ({
      id: l.id, empresa: l.empresa, contatoNome: l.contatoNome, telefone: l.telefone, rotaLojaId: l.rotaLojaId, externoId: l.externoId,
      estagio: l.estagio, valorOrcamento: l.valorOrcamento, probabilidade: l.probabilidade, retomarEm: l.retomarEm,
    })),
    clientes: (clientesQ.data ?? []).map((c) => ({ nome: c.name as string, telefones: [c.phone, c.contact_phone, c.company_phone, c.whatsapp_team_phone] as (string | null)[] })),
    hoje: hojeSP(),
  });
  const assinatura = assinaturaDoPlano(plano);
  if (!body.confirmar) return NextResponse.json({ plano, assinatura });
  if (!body.assinatura) return NextResponse.json({ error: "Veja a prévia antes de importar." }, { status: 400 });
  if (body.assinatura !== assinatura) {
    return NextResponse.json({
      error: "O funil mudou desde a prévia (alguém mexeu num lead ou outra importação rodou). Nada foi importado: confira a prévia nova e importe de novo.",
    }, { status: 409 });
  }

  const { criados, atualizados, erros } = await gravarPlano(plano.linhas, gate.user.email);
  const resultado = { criados, atualizados, erros };
  return NextResponse.json({ plano, resultado });
}
