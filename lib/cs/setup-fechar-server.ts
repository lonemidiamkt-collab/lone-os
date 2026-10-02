// lib/cs/setup-fechar-server.ts — aplica lib/cs/setup-fechar.ts às tarefas de setup abertas.
//
// Roda no começo da cobrança de tarefas (task-reminders): o que já se resolveu sai ANTES de virar
// cobrança. Nunca derruba a cobrança — se der erro, ela segue com o que tem.

import { supabaseAdmin } from "@/lib/supabase/server";
import { PREFIXO } from "@/lib/cs/setup-7dias";
import { motivoFechamentoSetup, notaDeFechamento, escopoDe, type ClienteDoSetup } from "@/lib/cs/setup-fechar";

export interface FechamentoSetup {
  fechadas: { id: string; cliente: string; tarefa: string; motivo: string }[];
  erro?: string;
}

export async function fecharSetupResolvido(opts: { aplicar: boolean; agora?: Date }): Promise<FechamentoSetup> {
  const agora = opts.agora ?? new Date();
  try {
    const { data: tarefas, error } = await supabaseAdmin.from("tasks")
      .select("id, title, client_id, client_name, role, due_date, description")
      .neq("status", "done").ilike("title", `${PREFIXO}%`);
    if (error) throw new Error(`tasks: ${error.message}`);
    if (!tarefas?.length) return { fechadas: [] };

    const ids = [...new Set(tarefas.map((t) => t.client_id as string).filter(Boolean))];
    const trinta = new Date(agora.getTime() - 30 * 86400_000);
    const [{ data: clientes }, { data: posts }, { data: gastos }] = await Promise.all([
      supabaseAdmin.from("clients").select("id, name, active, churned_at, status, service_type, created_at").in("id", ids),
      supabaseAdmin.from("client_ig_posts").select("client_id").in("client_id", ids).gte("posted_at", trinta.toISOString()),
      supabaseAdmin.from("metric_snapshots").select("client_id").in("client_id", ids)
        .gte("metric_date", trinta.toISOString().slice(0, 10)).gt("spend", 0),
    ]);
    const postsPor = new Map<string, number>();
    for (const p of posts ?? []) postsPor.set(p.client_id as string, (postsPor.get(p.client_id as string) ?? 0) + 1);
    const gastou = new Set((gastos ?? []).map((g) => g.client_id as string));
    const cliente = new Map<string, ClienteDoSetup & { nome: string }>((clientes ?? []).map((c) => [c.id as string, {
      nome: c.name as string,
      ativo: c.active !== false && !c.churned_at,
      escopo: escopoDe(c.service_type as string),
      emOnboarding: c.status === "onboarding",
      postsIg30d: postsPor.get(c.id as string) ?? 0,
      gastou30d: gastou.has(c.id as string),
      diasDeCasa: Math.floor((agora.getTime() - new Date(c.created_at as string).getTime()) / 86400_000),
    }]));

    const dataBR = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    const fechadas: FechamentoSetup["fechadas"] = [];
    for (const t of tarefas) {
      const venc = t.due_date ? new Date(`${t.due_date}T12:00:00-03:00`).getTime() : agora.getTime();
      const motivo = motivoFechamentoSetup(
        { papel: String(t.role), diasVencida: Math.floor((agora.getTime() - venc) / 86400_000) },
        cliente.get(t.client_id as string) ?? null,
      );
      if (!motivo) continue;
      const nomeCli = cliente.get(t.client_id as string)?.nome ?? (t.client_name as string) ?? "?";
      const tarefa = String(t.title).replace(`${PREFIXO} `, "").replace(/ — .*$/, "");
      if (opts.aplicar) {
        const nota = notaDeFechamento(motivo, dataBR);
        const descricao = [t.description as string | null, nota].filter(Boolean).join("\n\n");
        const { error: eUp } = await supabaseAdmin.from("tasks")
          .update({ status: "done", description: descricao }).eq("id", t.id as string).neq("status", "done");
        if (eUp) { console.error("[setup-fechar]", t.id, eUp.message); continue; }
      }
      fechadas.push({ id: t.id as string, cliente: nomeCli, tarefa, motivo });
    }
    if (fechadas.length) console.log(`[setup-fechar] ${opts.aplicar ? "fechou" : "fecharia"} ${fechadas.length} tarefa(s) de setup`);
    return { fechadas };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[setup-fechar]", erro);
    return { fechadas: [], erro };
  }
}
