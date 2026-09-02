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
    // client_id entra pra resolver papel genérico → pessoa pelo responsável daquele cliente.
    .select("id, title, assigned_to, client_id, client_name, due_date, priority, status, last_reminded_at")
    .neq("status", "done")
    .not("due_date", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // O dedup diário impede cobrar duas vezes — e também impede CONFERIR o formato depois que a
  // cobrança do dia já saiu. `?forcar=1` só faz sentido junto de `?preview=1`, que não envia nada.
  const ignorarDedup = req.nextUrl.searchParams.get("forcar") === "1" && previewOnly;
  const jaLembradaHoje = (iso: string | null) =>
    !ignorarDedup && !!iso && ymd(spNow(new Date(iso))) === hoje;

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

  // Agrupa por PESSOA — resolvendo papel genérico antes.
  //
  // A lista saía com "Rodrigo" e "designer" como se fossem duas pessoas, cada uma com metade das
  // tarefas dele. Das tarefas abertas, 14 estavam em papel genérico e TODAS tinham cliente: o dono
  // real vem do responsável daquele cliente por área.
  const { resolverDonos } = await import("@/lib/cs/dono-tarefa");
  const donos = await resolverDonos(aCobrar.map((it) => ({
    id: it.id,
    assigned_to: it.task.assigned_to as string | null,
    client_id: it.task.client_id as string | null,
  })));

  const porPessoa = new Map<string, Item[]>();
  for (const it of aCobrar) {
    // "sem dono" fica explícito: é pendência de cadastro, e escolher um nome faria a cobrança ir
    // para a pessoa errada.
    const p = donos.get(it.id) || "sem dono";
    (porPessoa.get(p) ?? porPessoa.set(p, []).get(p)!).push(it);
  }

  const rotulo = (tipo: Item["tipo"], due: string) =>
    tipo === "atrasada" ? `🔴 venceu ${due.slice(8, 10)}/${due.slice(5, 7)}`
      : tipo === "hoje" ? "🟡 vence hoje"
        : "🔔 vence amanhã";

  // ── O detalhe vai em PDF; no grupo fica só a manchete de cada um ────────────
  //
  // A mensagem antiga tinha 40+ linhas com tudo de todo mundo junto, e cada pessoa precisava caçar
  // a própria parte no meio da lista dos outros. Roberto: "seria melhor em PDF? separar por
  // funcionário e marcar eles".
  const { tarefasPdfHtml, legendaTarefas } = await import("@/lib/reports/tarefasPdf");
  const { mencionar } = await import("@/lib/cs/mencao");

  const diasDe = (due: string) => Math.floor(
    (new Date(`${hoje}T12:00:00Z`).getTime() - new Date(`${due}T12:00:00Z`).getTime()) / 864e5,
  );

  const blocosPdf = [...porPessoa.entries()]
    .map(([pessoa, itens]) => ({
      pessoa: pessoa === "sem dono" ? "Sem dono (falta atribuir)" : primeiroNome(pessoa),
      pessoaOriginal: pessoa,
      tarefas: itens
        .map((it) => ({
          titulo: it.task.title as string,
          cliente: (it.task.client_name as string) || null,
          vencimento: (it.task.due_date as string).slice(0, 10),
          diasAtraso: diasDe((it.task.due_date as string).slice(0, 10)),
        }))
        .sort((a, b) => b.diasAtraso - a.diasAtraso),
    }))
    // Quem tem mais atraso primeiro — é onde o dia começa.
    .sort((a, b) => (b.tarefas[0]?.diasAtraso ?? 0) - (a.tarefas[0]?.diasAtraso ?? 0));

  // Menção de verdade: nome escrito não notifica ninguém.
  const mencoes = new Map<string, string>();
  const jidsTodos: string[] = [];
  for (const b of blocosPdf) {
    if (b.pessoaOriginal === "sem dono") continue;
    const m = await mencionar(b.pessoaOriginal).catch(() => ({ trecho: "", jids: [], notifica: false }));
    if (m.trecho) mencoes.set(b.pessoa, m.trecho);
    jidsTodos.push(...m.jids);
  }

  const legenda = legendaTarefas(blocosPdf, mencoes);

  if (previewOnly) {
    return NextResponse.json({
      ok: true, cobrar: aCobrar.length, hora,
      pessoas: blocosPdf.map((b) => ({ pessoa: b.pessoa, tarefas: b.tarefas.length, marcado: mencoes.has(b.pessoa) })),
      legenda,
    });
  }

  const dest = process.env.CS_TEAM_GROUP_JID || process.env.CS_INTERNAL_GROUP_JID;
  if (dest) {
    try {
      const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
      const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
      const { csSendGroupDocument } = await import("@/lib/cs/notify");
      const logo = await loadLoneLogo().catch(() => "");
      const pdf = await htmlToPdf(tarefasPdfHtml(blocosPdf, logo, hoje));

      if (pdf.ok && pdf.buffer) {
        await csSendGroupDocument(
          dest, pdf.buffer.toString("base64"),
          `Tarefas ${hoje.split("-").reverse().join("-")}.pdf`,
          legenda, "application/pdf", jidsTodos,
        );
      } else {
        // PDF falhou: manda a manchete mesmo assim. Cobrança que some porque o render caiu é pior
        // que cobrança feia.
        await csSendGroupText(dest, legenda, undefined, { origem: "task-reminders", destino: "interno" }, jidsTodos);
      }
    } catch {
      await csSendGroupText(dest, legenda, undefined, { origem: "task-reminders", destino: "interno" }, jidsTodos).catch(() => {});
    }
  }

  // Marca last_reminded_at (dedup 1x/dia).
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("tasks").update({ last_reminded_at: nowIso }).in("id", aCobrar.map((i) => i.id));

  return NextResponse.json({ ok: true, cobrado: aCobrar.length, pessoas: porPessoa.size, hora });
}
