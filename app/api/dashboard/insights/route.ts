export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { montarSnapshotCS } from "@/lib/cs/snapshot";

// GET /api/dashboard/insights — INSIGHTS ACIONÁVEIS pro dashboard (gestão). Transforma o que já
// calculamos (saúde/produção via snapshot do CS + crescimento no IG) em cards de AÇÃO. Só staff logado;
// os itens sensíveis (churn) só voltam pra admin/manager. Reusa montarSnapshotCS (não duplica lógica).

type Insight = {
  id: string;
  tone: "alerta" | "atencao" | "bom" | "info";
  icon: string;
  titulo: string;
  detalhe: string;
  href: string;
};

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Papel do usuário (team_members por email) — churn/financeiro só p/ gestão.
  const email = (user.email || "").toLowerCase();
  const { data: tm } = await supabaseAdmin.from("team_members").select("role").eq("email", email).maybeSingle();
  const role = (tm?.role as string) || "";
  const gestao = role === "admin" || role === "manager";

  const snap = await montarSnapshotCS();
  const insights: Insight[] = [];

  // 1) Clientes esfriando (sumiram do grupo) — risco de churn (só gestão).
  if (gestao && snap.esfriando.length > 0) {
    insights.push({
      id: "esfriando", tone: "alerta", icon: "🧊",
      titulo: `${snap.esfriando.length} cliente${snap.esfriando.length > 1 ? "s" : ""} esfriando`,
      detalhe: snap.esfriando.slice(0, 3).map((e) => `${e.cliente} (${e.dias}d)`).join(" · "),
      href: "/clients",
    });
  }
  // 2) Artes prontas paradas com o social (designer entregou, falta postar).
  if (snap.prontasPraPostar.length > 0) {
    insights.push({
      id: "prontas", tone: "atencao", icon: "📤",
      titulo: `${snap.prontasPraPostar.length} arte${snap.prontasPraPostar.length > 1 ? "s" : ""} pronta${snap.prontasPraPostar.length > 1 ? "s" : ""} pra postar`,
      detalhe: snap.prontasPraPostar.slice(0, 3).map((p) => `${p.cliente} — ${p.titulo} (${p.dias}d)`).join(" · "),
      href: "/social",
    });
  }
  // 3) Atrasados acionáveis.
  if (snap.atrasados.length > 0) {
    insights.push({
      id: "atrasados", tone: "alerta", icon: "⏰",
      titulo: `${snap.atrasados.length} card${snap.atrasados.length > 1 ? "s" : ""} atrasado${snap.atrasados.length > 1 ? "s" : ""}`,
      detalhe: snap.atrasados.slice(0, 3).map((a) => `${a.cliente}: ${a.titulo} (${a.dias}d)`).join(" · "),
      href: "/social",
    });
  }
  // 4) Clientes sem post planejado na semana.
  if (snap.semPostsSemana.length > 0) {
    insights.push({
      id: "sem-post", tone: "atencao", icon: "🗓️",
      titulo: `${snap.semPostsSemana.length} sem post planejado ${snap.semPostsLabel}`,
      detalhe: snap.semPostsSemana.slice(0, 4).map((c) => c.nome).join(" · "),
      href: "/social",
    });
  }
  // 5) Datas/promoções que os clientes marcaram (chegando).
  if (snap.eventosClientes.length > 0) {
    insights.push({
      id: "datas", tone: "info", icon: "📅",
      titulo: `${snap.eventosClientes.length} data${snap.eventosClientes.length > 1 ? "s" : ""}/promoç${snap.eventosClientes.length > 1 ? "ões" : "ão"} chegando`,
      detalhe: snap.eventosClientes.slice(0, 3).map((e) => `${e.cliente}: ${e.titulo} (${e.data})`).join(" · "),
      href: "/social",
    });
  }
  // 6) Destaque POSITIVO de crescimento no Instagram (30d) — o que celebrar.
  const { data: igSnaps } = await supabaseAdmin
    .from("client_ig_snapshots").select("client_id, data").eq("period_kind", "30d");
  const movers = (igSnaps ?? [])
    .map((s) => {
      const d = s.data as { conta?: { username?: string }; resumo?: { seguidoresGanhos?: number | null }; fonte?: string };
      return { user: d?.conta?.username || "", ganhos: d?.resumo?.seguidoresGanhos ?? null, owned: d?.fonte !== "publico", clientId: s.client_id as string };
    })
    .filter((m) => m.owned && m.ganhos != null && (m.ganhos as number) > 0)
    .sort((a, b) => (b.ganhos as number) - (a.ganhos as number));
  if (movers.length > 0) {
    const top = movers[0];
    const { data: cli } = await supabaseAdmin.from("clients").select("name, nome_fantasia").eq("id", top.clientId).maybeSingle();
    const nome = (cli?.nome_fantasia as string) || (cli?.name as string) || `@${top.user}`;
    insights.push({
      id: "ig-cresceu", tone: "bom", icon: "📈",
      titulo: `${nome} cresceu no Instagram`,
      detalhe: `+${(top.ganhos as number).toLocaleString("pt-BR")} seguidores em 30 dias · @${top.user}`,
      href: "/social",
    });
  }

  // Ordem: alerta → atenção → info → bom (o que precisa de ação primeiro).
  const ordem: Record<string, number> = { alerta: 0, atencao: 1, info: 2, bom: 3 };
  insights.sort((a, b) => ordem[a.tone] - ordem[b.tone]);

  return NextResponse.json({ insights, gestao });
}
