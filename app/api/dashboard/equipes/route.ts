export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { postsMes, postsSemana } from "@/lib/metrics/producao";

// GET /api/dashboard/equipes — quem é de cada equipe (pelo PAPEL, não deduzido dos clientes) e o
// que cada um entregou.
//
// Dois bugs que isto corrige:
//  1) A lista da "Equipe Social" era derivada de `clients.assigned_social`. Como 1 cliente tinha
//     "Julio" (que é manager de tráfego) e 7 estavam com o campo vazio, a tela mostrava o Julio como
//     social e um membro fantasma "6 clientes" sem nome. A verdade dos papéis está em team_members.
//  2) "Suporte hoje" lia `traffic_routine_checks`, que ninguém alimenta desde 16/jul — enquanto o
//     cron client-messages MANDA o suporte nos grupos e registra em `client_group_message_log`.
//     Resultado: 42 suportes enviados hoje e a tela mostrando 0/31. Agora lê onde o dado existe.
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const hoje = ymd(spNow());

  const [{ data: membros }, { data: clients }, { data: suporte }, mes, semana] = await Promise.all([
    supabaseAdmin.from("team_members").select("name, role").eq("is_active", true),
    supabaseAdmin.from("clients").select("id, assigned_social, assigned_traffic")
      .is("draft_status", null).neq("active", false).neq("status", "onboarding"),
    supabaseAdmin.from("client_group_message_log")
      .select("client_id").eq("date_key", hoje).eq("kind", "support").eq("status", "sent"),
    postsMes(),
    postsSemana(),
  ]);

  const clientesDe = (campo: "assigned_social" | "assigned_traffic", nome: string) =>
    (clients ?? []).filter((c) => ((c[campo] as string) || "").trim() === nome);

  const social = (membros ?? [])
    .filter((m) => m.role === "social")
    .map((m) => {
      const nome = (m.name as string) || "";
      return {
        name: nome,
        clientCount: clientesDe("assigned_social", nome).length,
        published: mes.byMember[nome] ?? 0,
        publishedWeek: semana.byMember[nome] ?? 0,
      };
    })
    .sort((a, b) => b.published - a.published);

  // Suporte do dia: o cron atende TODOS os clientes com grupo; conta por gestor de tráfego.
  const atendidosHoje = new Set((suporte ?? []).map((s) => s.client_id as string));
  const trafego = (membros ?? [])
    .filter((m) => m.role === "traffic" || m.role === "manager")
    .map((m) => {
      const nome = (m.name as string) || "";
      const meus = clientesDe("assigned_traffic", nome);
      return {
        name: nome,
        clientCount: meus.length,
        supportDone: meus.filter((c) => atendidosHoje.has(c.id as string)).length,
        supportTotal: meus.length,
      };
    })
    .filter((t) => t.clientCount > 0)
    .sort((a, b) => b.clientCount - a.clientCount);

  // Clientes sem responsável — não somem numa linha fantasma; viram um aviso explícito.
  const semSocial = (clients ?? []).filter((c) => !((c.assigned_social as string) || "").trim()).length;

  return NextResponse.json({ social, trafego, semSocial });
}
