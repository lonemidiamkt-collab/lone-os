export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { papelDoUsuario, GESTAO } from "@/lib/api/require-role";
import { nivelDoCliente, scoreDoCliente, diasQuietoDoCliente, situacaoDaSaude } from "@/lib/saude/carteira";
import { estaPausado } from "@/lib/clients/pausa";
import { historicoNps } from "@/lib/cs/nps-server";
import { checkinsRecentes } from "@/lib/cs/checkin";
import type { ResumoCliente } from "@/components/client/ficha/tipos";

// GET /api/clients/[id]/resumo — o que a aba Resumo (e Relacionamento) da ficha precisa, numa ida:
//   · saúde com o porquê — LIDA do escritor único (/api/scores → clients.current_health_* e o
//     breakdown do dia em client_health_scores) e lida pela MESMA régua da Saúde da carteira
//     (lib/saude/carteira.ts → situacaoDaSaude). Nada é recalculado aqui.
//   · (a próxima ação NÃO vem daqui: a ficha lê GET /api/clientes/proxima-acao, o mesmo da Saúde da
//     carteira — uma fonte só, com confirmar/editar/feita.)
//   · o que está pendente do lado do cliente (Jornada CS) e a pergunta dele sem resposta no grupo.
//   · NPS pós-reunião (lib/cs/nps-server.ts) e, só para gestão, os check-ins.
//
// Quem pode ver a ficha pode ver isto. A nota de handoff (client_journey.notas) NÃO sai daqui.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const papel = await papelDoUsuario(user);
  if (!papel) return NextResponse.json({ error: "Sem permissão para esta área." }, { status: 403 });
  const { id } = await params;

  const [cliQ, saudeQ, jornadaQ, pergQ, nps, checkins] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, current_health_score, current_health_level, last_client_msg_at, agente_ativo, paused_at, paused_until")
      .eq("id", id).maybeSingle(),
    supabaseAdmin.from("client_health_scores")
      .select("breakdown, computed_for_date")
      .eq("client_id", id).order("computed_for_date", { ascending: false }).limit(1).maybeSingle(),
    // Só as pendências do cliente — `notas` (handoff do comercial) nunca sai desta rota.
    supabaseAdmin.from("client_journey").select("pendencias_cliente").eq("client_id", id).maybeSingle(),
    supabaseAdmin.from("customer_requests")
      .select("origin_text, author_name, created_at")
      .eq("client_id", id).eq("status", "aberta")
      .order("created_at", { ascending: true }).limit(1).maybeSingle(),
    historicoNps(id),
    GESTAO.includes(papel) ? checkinsRecentes(id, 6).catch(() => []) : Promise.resolve(null),
  ]);

  if (cliQ.error) return NextResponse.json({ error: `clients: ${cliQ.error.message}` }, { status: 500 });
  const c = cliQ.data;
  if (!c) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // ── Saúde (lida, não calculada — a régua é a da Saúde da carteira) ─────────
  const breakdown = (saudeQ.data?.breakdown ?? null) as { motivos?: string[]; cobertura?: number } | null;
  const cobertura = typeof breakdown?.cobertura === "number" ? breakdown.cobertura : null;
  const sit = situacaoDaSaude({
    nivel: nivelDoCliente(c),
    score: scoreDoCliente(c),
    motivos: Array.isArray(breakdown?.motivos) ? breakdown!.motivos : [],
    diasQuieto: diasQuietoDoCliente(c, Date.now()),
    cobertura,
    pausado: estaPausado(c as never),
  });

  const j = jornadaQ.data as Record<string, unknown> | null;
  const pend = pergQ.data;
  const corpo: ResumoCliente = {
    saude: {
      nivel: sit.nivel,
      score: sit.nivel === "sem_dado" ? null : sit.score === null ? null : Math.round(sit.score),
      motivos: sit.motivos,
      cobertura,
      calculadaEm: (saudeQ.data?.computed_for_date as string) ?? null,
      diasQuieto: sit.diasQuieto,
      esfriando: sit.esfriando && !sit.pausado,
    },
    pendenciasCliente: Array.isArray(j?.pendencias_cliente) ? (j!.pendencias_cliente as ResumoCliente["pendenciasCliente"]) : [],
    perguntaAberta: pend ? {
      texto: ((pend.origin_text as string) ?? "").slice(0, 280),
      autor: (pend.author_name as string) ?? null,
      desde: pend.created_at as string,
    } : null,
    nps,
    checkins: checkins as ResumoCliente["checkins"],
  };
  return NextResponse.json(corpo);
}
