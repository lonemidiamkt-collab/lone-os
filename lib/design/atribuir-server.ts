// lib/design/atribuir-server.ts — busca o que a regra de lib/design/atribuicao.ts precisa e decide.
//
// Separado da regra de propósito: a regra é pura e testada, isto aqui é só consulta. Quando a
// Fase 2 transformar "solicitar design" em operação de domínio, é esta função que ela chama.

import { supabaseAdmin } from "@/lib/supabase/server";
import { escolherDesigner, type EscolhaDesigner, type DesignerDisponivel } from "@/lib/design/atribuicao";

/** Contas de QA criadas pelos scripts de teste não entram na fila de ninguém. */
const ehContaDeTeste = (email: string) => /^qa-/i.test(email);

/**
 * Quem recebe a demanda que está sendo criada para `clientId`.
 *
 * Nunca lança: se qualquer consulta falhar, devolve `null` e o chamador segue sem dono — criar a
 * demanda é mais importante que atribuí-la.
 */
export async function designerDaDemanda(clientId: string): Promise<EscolhaDesigner | null> {
  try {
    const [cliRes, timeRes, histRes, cargaRes] = await Promise.all([
      supabaseAdmin.from("clients").select("assigned_designer").eq("id", clientId).maybeSingle(),
      supabaseAdmin.from("team_members").select("name, email, unavailable_until")
        .eq("role", "designer").eq("is_active", true).is("deleted_at", null),
      supabaseAdmin.from("design_requests").select("assigned_designer").eq("client_id", clientId),
      supabaseAdmin.from("design_requests").select("assigned_designer").neq("status", "done"),
    ]);

    const daCarteira = ((cliRes.data?.assigned_designer as string) ?? "").trim();
    if (daCarteira) return { designer: daCarteira, motivo: "carteira" };

    const contar = (linhas: { assigned_designer: unknown }[] | null) => {
      const m = new Map<string, number>();
      for (const l of linhas ?? []) {
        const n = String(l.assigned_designer ?? "").trim();
        if (n) m.set(n, (m.get(n) ?? 0) + 1);
      }
      return m;
    };
    const historicoDoCliente = contar(histRes.data);
    const abertasPorDesigner = contar(cargaRes.data);

    const disponiveis: DesignerDisponivel[] = (timeRes.data ?? [])
      .filter((m) => !ehContaDeTeste(String(m.email ?? "")))
      .map((m) => ({
        nome: String(m.name),
        abertas: abertasPorDesigner.get(String(m.name)) ?? 0,
        indisponivelAte: (m.unavailable_until as string) ?? null,
      }));

    return escolherDesigner({
      daCarteira: null,
      historico: [...historicoDoCliente].map(([designer, entregas]) => ({ designer, entregas })),
      disponiveis,
    });
  } catch (e) {
    console.error("[design/atribuir] não consegui escolher designer:", e);
    return null;
  }
}
