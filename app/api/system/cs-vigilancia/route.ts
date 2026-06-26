export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { spNow, ymd, addDays, isBusinessDay, isBusinessHour, isPostingDay } from "@/lib/cs/vigilancia";

// POST /api/system/cs-vigilancia — "Vigilância de Fluxo" do Agente CS.
// FASE 0 = MODO SECO: avalia o fluxo e REGISTRA em cs_cobrancas (dry_run=true) o que cobraria,
// mas NÃO posta no WhatsApp. Serve pra calibrar sem incomodar a equipe. Cron sugerido: 10h30 e 15h.
// Vigilâncias ativas nesta fase: #2 (pauta no dia) e #1 (pauta D-1). As demais entram depois.

const DRY_RUN = true; // Fase 0. Só vira false (cobrança real) quando o Roberto aprovar a Fase 1.

interface Candidato {
  vigilancia: number;
  client_id: string;
  cliente: string;
  pessoa: string | null;
  chave: string;
  motivo: string;
}

/** Cliente ATIVO tem pelo menos 1 card "em movimento" (≠ ideias, não arquivado) pra a data dada? */
async function temPautaEmMovimento(clientId: string, dateKey: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("content_cards")
    .select("id")
    .eq("client_id", clientId)
    .eq("due_date", dateKey)
    .is("archived_at", null)
    .neq("status", "ideas")
    .limit(1);
  return !!data && data.length > 0;
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const now = spNow();
  // Fora de dia útil / horário comercial → acumula mas NÃO cobra (regra do PDF).
  if (!(await isBusinessDay(now)) || !isBusinessHour(now)) {
    return NextResponse.json({ ok: true, skip: "fora de dia útil/horário comercial (8h–18h)", dia: ymd(now), hora: now.getHours() });
  }

  // Clientes ATIVOS (active != false). assigned_social = quem seria cobrado.
  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, assigned_social, active")
    .or("active.is.null,active.eq.true");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ativos = clients ?? [];

  const hojeKey = ymd(now);
  const amanha = addDays(now, 1);
  const amanhaKey = ymd(amanha);
  const candidatos: Candidato[] = [];

  // ── Vigilância #2 — pauta NO DIA (só se HOJE é dia de postagem) ──
  if (isPostingDay(now)) {
    for (const c of ativos) {
      if (await temPautaEmMovimento(c.id as string, hojeKey)) continue;
      candidatos.push({
        vigilancia: 2, client_id: c.id as string, cliente: c.name as string,
        pessoa: (c.assigned_social as string) || null, chave: `2-${c.id}-${hojeKey}`,
        motivo: "hoje é dia de postagem e não há pauta em movimento",
      });
    }
  }

  // ── Vigilância #1 — pauta D-1 (só se AMANHÃ é dia de postagem) ──
  if (isPostingDay(amanha)) {
    for (const c of ativos) {
      if (await temPautaEmMovimento(c.id as string, amanhaKey)) continue;
      candidatos.push({
        vigilancia: 1, client_id: c.id as string, cliente: c.name as string,
        pessoa: (c.assigned_social as string) || null, chave: `1-${c.id}-${amanhaKey}`,
        motivo: "amanhã é dia de postagem e nada está planejado",
      });
    }
  }

  // Registra em cs_cobrancas (dedup pela `chave` UNIQUE → não cobra a mesma situação 2x no dia).
  // DRY_RUN: grava com dry_run=true e NÃO posta. (Fase 1 trocará isso por csSendGroupText.)
  for (const cand of candidatos) {
    await supabaseAdmin.from("cs_cobrancas").upsert({
      vigilancia: cand.vigilancia,
      client_id: cand.client_id,
      pessoa_cobrada: cand.pessoa,
      chave: cand.chave,
      mensagem: `[dry-run] ${cand.cliente}: ${cand.motivo}${cand.pessoa ? ` (@${cand.pessoa})` : ""}`,
      dry_run: DRY_RUN,
    }, { onConflict: "chave", ignoreDuplicates: true });
  }

  console.log(`[cs-vigilancia] dry_run=${DRY_RUN} dia=${hojeKey} postagem_hoje=${isPostingDay(now)} candidatos=${candidatos.length}`);
  return NextResponse.json({
    ok: true,
    dry_run: DRY_RUN,
    dia: hojeKey,
    dia_postagem_hoje: isPostingDay(now),
    amanha_postagem: isPostingDay(amanha),
    clientes_ativos: ativos.length,
    candidatos: candidatos.length,
    detalhe: candidatos,
  });
}
