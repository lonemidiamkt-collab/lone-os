export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, addDays } from "@/lib/cs/vigilancia";

// POST /api/system/task-reminders — COBRANÇA de tarefas pelo Lone CS no grupo da Equipe.
// Regra (pedido do Roberto): véspera às 10h + dia do prazo às 9h; se estourar, cobra 1x/dia até
// marcarem como feita. Dedup por last_reminded_at (máx 1 cobrança/dia por tarefa). ?preview = não posta.
// Crons sugeridos: 9h BRT (12h UTC) e 10h BRT (13h UTC) → `0 12 * * *` e `0 13 * * *`.

const primeiroNome = (n: string) => (n || "").trim().split(/\s+/)[0] || n;

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const now = spNow();
  const hora = now.getHours();
  const hoje = ymd(now);
  const amanha = ymd(addDays(now, 1));

  const { data: tasks, error } = await supabaseAdmin
    .from("tasks")
    .select("id, title, assigned_to, client_name, due_date, priority, status, last_reminded_at")
    .neq("status", "done")
    .not("due_date", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jaLembradaHoje = (iso: string | null) => !!iso && ymd(spNow(new Date(iso))) === hoje;

  type Item = { id: string; tipo: "atrasada" | "hoje" | "vespera"; task: NonNullable<typeof tasks>[number] };
  const aCobrar: Item[] = [];
  for (const t of tasks ?? []) {
    const due = (t.due_date as string)?.slice(0, 10);
    if (!due || jaLembradaHoje(t.last_reminded_at as string | null)) continue;
    if (due < hoje && hora >= 9) aCobrar.push({ id: t.id as string, tipo: "atrasada", task: t });
    else if (due === hoje && hora >= 9) aCobrar.push({ id: t.id as string, tipo: "hoje", task: t });
    else if (due === amanha && hora >= 10) aCobrar.push({ id: t.id as string, tipo: "vespera", task: t });
  }

  if (aCobrar.length === 0) {
    return NextResponse.json({ ok: true, cobrar: 0, hora, hoje });
  }

  // Agrupa por colaborador pra cada um receber a SUA lista.
  const porPessoa = new Map<string, Item[]>();
  for (const it of aCobrar) {
    const p = (it.task.assigned_to as string) || "Alguém";
    (porPessoa.get(p) ?? porPessoa.set(p, []).get(p)!).push(it);
  }

  const rotulo = (tipo: Item["tipo"], due: string) =>
    tipo === "atrasada" ? `🔴 venceu ${due.slice(8, 10)}/${due.slice(5, 7)}`
      : tipo === "hoje" ? "🟡 vence hoje"
        : "🔔 vence amanhã";

  const blocos: string[] = [];
  for (const [pessoa, itens] of porPessoa) {
    const linhas = itens
      .sort((a, b) => (a.task.due_date as string).localeCompare(b.task.due_date as string))
      .map((it) => `${rotulo(it.tipo, (it.task.due_date as string).slice(0, 10))} — ${it.task.title as string}${it.task.client_name ? ` (${it.task.client_name})` : ""}`)
      .join("\n");
    blocos.push(`*${primeiroNome(pessoa)}*\n${linhas}`);
  }

  const msg = `⏰ *Tarefas pra fechar*\n\n${blocos.join("\n\n")}\n\n_Assim que concluir, marca como feita em *Tarefas* que eu paro de cobrar 🙂 (ou me avisa aqui que eu marco)._`;

  if (previewOnly) {
    return NextResponse.json({ ok: true, preview: msg, cobrar: aCobrar.length, hora });
  }

  const dest = process.env.CS_TEAM_GROUP_JID || process.env.CS_INTERNAL_GROUP_JID;
  if (dest) await csSendGroupText(dest, msg, undefined, { origem: "task-reminders", destino: "interno" }).catch(() => {});

  // Marca last_reminded_at (dedup 1x/dia).
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("tasks").update({ last_reminded_at: nowIso }).in("id", aCobrar.map((i) => i.id));

  return NextResponse.json({ ok: true, cobrado: aCobrar.length, pessoas: porPessoa.size, hora });
}
