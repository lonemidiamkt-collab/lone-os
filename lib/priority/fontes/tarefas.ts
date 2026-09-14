// Tarefas do /tarefas vencidas e ainda pendentes. Dono = quem foi atribuído.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ItemBruto, PapelDono } from "../tipos";
import type { ClienteRef } from "./index";

const PAPEIS = new Set(["admin", "manager", "traffic", "social", "designer", "comercial"]);

export async function itensDeTarefas(clientes: { porId: Map<string, ClienteRef> }): Promise<ItemBruto[]> {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data, error } = await supabaseAdmin.from("tasks")
    .select("id, title, client_id, client_name, assigned_to, role, due_date, priority")
    .eq("status", "pending").not("due_date", "is", null).lt("due_date", hoje)
    .order("due_date", { ascending: true }).limit(200);
  if (error) throw new Error(`tasks: ${error.message}`);
  const out: ItemBruto[] = [];
  for (const t of data ?? []) {
    const dias = Math.max(1, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${t.due_date}T12:00:00Z`)) / 864e5));
    const c = t.client_id ? clientes.porId.get(t.client_id as string) ?? null : null;
    const papel = PAPEIS.has(String(t.role)) ? (t.role as PapelDono) : "social";
    out.push({
      fonte: "tarefa", clientId: c?.id ?? null, cliente: c?.nome ?? (t.client_name as string) ?? "Lone",
      entityRef: t.id as string, motivo: "tarefa_atrasada",
      titulo: `Tarefa "${String(t.title).slice(0, 60)}" vencida há ${dias} dia${dias === 1 ? "" : "s"}`,
      fato: [`Prazo era ${String(t.due_date).slice(8, 10)}/${String(t.due_date).slice(5, 7)} e continua pendente`],
      recomendacao: "Concluir ou repactuar o prazo em /tarefas",
      acaoProposta: { tipo: "abrir_tarefa", taskId: t.id },
      severidade: Math.min(100, 40 + dias * 5 + (t.priority === "critical" ? 20 : t.priority === "high" ? 10 : 0)),
      urgencia: 85, confianca: 0.95, exposicaoRs: null, reversivel: true,
      ownerRole: papel, owner: (t.assigned_to as string) || null, nivelPolicy: "C",
    });
  }
  return out;
}
