export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { janelaDoMes } from "@/lib/cs/reuniao-mensal";
import { spNow } from "@/lib/cs/vigilancia";

// GET /api/reunioes[?mes=2026-09] — a agenda do ciclo: o que está marcado e o que falta.
//
// É a "agenda do social media" que o Roberto pediu, sem Google Calendar: o compromisso vive aqui e
// o lembrete sai pelo WhatsApp. Filtra pelo usuário logado quando ele não é admin — cada um vê a
// própria agenda, gestão vê tudo.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const agora = spNow();
  const par = req.nextUrl.searchParams.get("mes");
  const mes = par && /^\d{4}-\d{2}$/.test(par) ? par : janelaDoMes(agora).mes;
  const janela = janelaDoMes(agora);
  // Primeiro dia do mês seguinte, para a janela de busca por data.
  const [ano, m] = mes.split("-").map(Number);
  const proximoMes = m === 12
    ? `${ano + 1}-01-01T00:00:00-03:00`
    : `${ano}-${String(m + 1).padStart(2, "0")}-01T00:00:00-03:00`;

  const [{ data: reunioes }, { data: clientes }] = await Promise.all([
    // ── TODAS as reuniões do mês, não só as do ciclo ────────────────────────
    //
    // A versão anterior filtrava `meeting_type = 'mensal' AND mes_referencia = mes`. Isso deixava
    // de fora exatamente duas coisas que precisam aparecer na agenda:
    //   • a reunião que o social marca À MÃO pelo botão "Agendar" (tipo 'alinhamento',
    //     'apresentacao'… e sem mes_referencia, que só o ciclo preenche);
    //   • a avulsa criada ao registrar uma transcrição.
    // Resultado: o calendário e o Meu Trabalho só mostravam o que o agente tinha marcado — e uma
    // agenda que ignora o que a pessoa marcou sozinha não é a agenda dela.
    //
    // A janela é por DATA, que é o que a agenda entende. O ciclo continua identificável pelo
    // `mes_referencia`, para quem precisa dele (a cobrança da janela 15–22).
    supabaseAdmin.from("meetings")
      .select("id, client_id, title, start_at, end_at, estado, status, responsavel, proposto_em, confirmado_por, resumo, realizada_em, meeting_type, mes_referencia")
      .gte("start_at", `${mes}-01T00:00:00-03:00`)
      .lt("start_at", proximoMes)
      .order("start_at", { ascending: true, nullsFirst: false }),
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, assigned_social, status, active, agente_ativo")
      .or("active.is.null,active.eq.true").neq("status", "onboarding"),
  ]);

  const elegiveis = (clientes ?? [])
    .filter((c) => !/\(teste\)/i.test((c.name as string) || "") && !!c.assigned_social);
  const nome = (id: string) => {
    const c = elegiveis.find((x) => x.id === id);
    return (c?.nome_fantasia as string) || (c?.name as string) || "Cliente";
  };

  // Só as do CICLO entram no "quem falta" — uma reunião avulsa de terça não significa que a do
  // ciclo foi marcada.
  const doCiclo = new Map((reunioes ?? [])
    .filter((m) => m.meeting_type === "mensal" && m.mes_referencia === mes)
    .map((m) => [m.client_id as string, m]));

  // Cada cliente elegível vira uma linha, marcada ou não. É a lista "quem falta" que o time usa
  // na janela — sem ela, a tela só mostraria quem já resolveu.
  interface LinhaAgenda {
    clientId: string; cliente: string; responsavel: string | null; estado: string;
    quando: string | null; propostoEm: string | null; confirmadoPor: string | null;
    reuniaoId: string | null; resumo: string | null; tipo: string;
  }

  const linhas: LinhaAgenda[] = elegiveis.map((c) => {
    const m = doCiclo.get(c.id as string);
    return {
      clientId: c.id as string,
      cliente: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      responsavel: (c.assigned_social as string) || null,
      estado: (m?.estado as string) ?? "pendente",
      quando: (m?.start_at as string) ?? null,
      propostoEm: (m?.proposto_em as string) ?? null,
      confirmadoPor: (m?.confirmado_por as string) ?? null,
      reuniaoId: (m?.id as string) ?? null,
      resumo: (m?.resumo as string) ?? null,
      tipo: "mensal",
    };
  });

  // As de FORA do ciclo (marcadas à mão ou avulsas) entram como linhas próprias: são compromissos
  // reais com hora marcada, e a agenda existe para mostrar compromisso.
  const nomePorId = new Map(elegiveis.map((c) => [c.id as string,
    (c.nome_fantasia as string) || (c.name as string) || "Cliente"]));
  const foraDoCiclo = (reunioes ?? [])
    .filter((m) => !(m.meeting_type === "mensal" && m.mes_referencia === mes))
    .filter((m) => !!m.start_at)
    .map((m) => ({
      clientId: m.client_id as string,
      cliente: nomePorId.get(m.client_id as string) ?? (m.title as string) ?? "Cliente",
      responsavel: (m.responsavel as string) || null,
      // Reunião antiga pode não ter `estado` (o agendador anterior não preenchia): se tem data e
      // não foi cancelada, está agendada — é o que a pessoa quis dizer ao marcar.
      estado: (m.estado as string) || (m.status === "cancelled" ? "cancelada" : "agendada"),
      quando: m.start_at as string,
      propostoEm: null as string | null,
      confirmadoPor: (m.confirmado_por as string) ?? null,
      reuniaoId: m.id as string,
      resumo: (m.resumo as string) ?? null,
      tipo: (m.meeting_type as string) || "avulsa",
    }));
  linhas.push(...foraDoCiclo);

  // Não-admin vê só a própria carteira. `ServerUser` só traz email, então o nome vem de
  // team_members — que é a mesma fonte que resolve as menções no WhatsApp.
  let meu = linhas;
  if (!user.isAdmin) {
    const { data: membro } = await supabaseAdmin
      .from("team_members").select("name").eq("email", user.email).maybeSingle();
    const nomeUsuario = (membro?.name as string) || "";
    // Sem nome resolvido, mostra vazio em vez da carteira inteira: ver a agenda dos outros por
    // acidente é pior que não ver a própria.
    meu = linhas.filter((l) => !!nomeUsuario && l.responsavel === nomeUsuario);
  }

  const agendadas = meu.filter((l) => l.estado === "agendada");
  return NextResponse.json({
    ok: true,
    mes,
    janela: { abre: janela.abre, fecha: janela.fecha, aberta: janela.aberta, diasParaFechar: janela.diasParaFechar },
    resumo: {
      total: meu.length,
      agendadas: agendadas.length,
      pendentes: meu.filter((l) => l.estado === "pendente").length,
      esperandoCliente: meu.filter((l) => l.estado === "proposta").length,
      realizadas: meu.filter((l) => l.estado === "realizada").length,
    },
    // Ordena: quem falta primeiro (é o que exige ação), depois as marcadas por data.
    reunioes: meu.sort((a, b) => {
      const peso = (x: typeof a) => (x.estado === "pendente" ? 0 : x.estado === "proposta" ? 1 : 2);
      if (peso(a) !== peso(b)) return peso(a) - peso(b);
      return (a.quando ?? "9").localeCompare(b.quando ?? "9");
    }),
  }, { headers: { "cache-control": "no-store" } });
}
