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
      .select("id, client_id, title, start_at, end_at, estado, status, responsavel, attendees, link_reuniao, proposto_em, confirmado_por, resumo, realizada_em, meeting_type, mes_referencia")
      .gte("start_at", `${mes}-01T00:00:00-03:00`)
      .lt("start_at", proximoMes)
      .order("start_at", { ascending: true, nullsFirst: false }),
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, assigned_social, assigned_traffic, assigned_designer, status, active, agente_ativo")
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
    colaboradores: string[]; link: string | null;
    /**
     * POR QUE esta reunião aparece para você.
     *
     * Roberto (08/09): a reunião tem que estar "bem vinculada à conta do social mídia e do gestor
     * de tráfego, cada um com seu histórico". Sem dizer o papel, o gestor de tráfego abriria a
     * agenda e veria reuniões que ele não marcou, sem entender se deve ir — e ou vai a todas, ou
     * não vai a nenhuma. Preenchido só na resposta, por leitor.
     */
    papel?: "responsavel" | "convidado" | "social" | "trafego" | "designer";
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
      colaboradores: (m?.attendees as string[]) ?? [],
      link: (m?.link_reuniao as string) ?? null,
    };
  });

  // As de FORA do ciclo (marcadas à mão ou avulsas) entram como linhas próprias: são compromissos
  // reais com hora marcada, e a agenda existe para mostrar compromisso.
  // De TODOS os clientes, não só dos elegíveis do ciclo: um cliente sem social atribuído fica de
  // fora do ciclo mas pode ter reunião marcada pelo gestor de tráfego — e ela apareceria sem nome.
  const nomePorId = new Map((clientes ?? []).map((c) => [c.id as string,
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
      colaboradores: (m.attendees as string[]) ?? [],
      link: (m.link_reuniao as string) ?? null,
    }));
  linhas.push(...foraDoCiclo);

  // ── QUEM VÊ O QUÊ ───────────────────────────────────────────────────────
  //
  // `ServerUser` só traz email, então o nome vem de team_members — a mesma fonte que resolve as
  // menções no WhatsApp.
  //
  // Roberto (08/09): "além de também estar bem vinculada à conta do social mídia e do gestor de
  // tráfego, com cada um com seu histórico."
  //
  // Antes, a reunião aparecia para o RESPONSÁVEL (que é sempre o social) e para quem foi
  // convidado à mão. O gestor de tráfego do cliente não via nada: a reunião mensal daquele
  // cliente — a mesma em que a verba e o resultado dos anúncios são discutidos — passava sem ele
  // saber que existia. Agora quem cuida do cliente em QUALQUER função vê a agenda dele.
  const quemCuida = new Map<string, { social: string | null; trafego: string | null; designer: string | null }>(
    (clientes ?? []).map((c) => [c.id as string, {
      social: (c.assigned_social as string) || null,
      trafego: (c.assigned_traffic as string) || null,
      designer: (c.assigned_designer as string) || null,
    }]),
  );

  const papelNa = (l: LinhaAgenda, nome: string): LinhaAgenda["papel"] | null => {
    if (l.responsavel === nome) return "responsavel";
    if ((l.colaboradores ?? []).includes(nome)) return "convidado";
    const t = quemCuida.get(l.clientId);
    if (t?.social === nome) return "social";
    if (t?.trafego === nome) return "trafego";
    if (t?.designer === nome) return "designer";
    return null;
  };

  let meu = linhas;
  let nomeUsuario = "";
  if (!user.isAdmin) {
    const { data: membro } = await supabaseAdmin
      .from("team_members").select("name").eq("email", user.email).maybeSingle();
    nomeUsuario = (membro?.name as string) || "";
    // Sem nome resolvido, mostra vazio em vez da carteira inteira: ver a agenda dos outros por
    // acidente é pior que não ver a própria.
    meu = nomeUsuario
      ? linhas
          .map((l) => ({ ...l, papel: papelNa(l, nomeUsuario) }))
          .filter((l): l is LinhaAgenda & { papel: NonNullable<LinhaAgenda["papel"]> } => l.papel !== null)
          // Quem cuida do cliente em OUTRA função vê as reuniões que existem — não a lista de
          // "quem falta marcar". Marcar a reunião do ciclo é tarefa do social: despejar a
          // cobrança dele na tela do gestor de tráfego seria cobrar a pessoa errada, e é assim
          // que um painel vira ruído que ninguém lê.
          .filter((l) => l.papel === "responsavel" || l.papel === "convidado" || l.papel === "social"
            || !!l.reuniaoId)
      : [];
  }

  // ── O HISTÓRICO DA PESSOA ───────────────────────────────────────────────
  //
  // Roberto: "com cada um com seu histórico." Até aqui só existiam as futuras — a agenda dizia o
  // que vem, e o que JÁ aconteceu só era encontrável abrindo cliente por cliente. Quem tem 17
  // clientes não faz isso: chega na reunião sem lembrar o que foi combinado na anterior, que é
  // exatamente o que a reunião mensal existe para evitar.
  //
  // Últimos 6 meses, das que aconteceram, pelo mesmo critério de quem vê o quê.
  const desde = new Date(agora.getTime() - 183 * 86400_000).toISOString();
  const { data: passadas } = await supabaseAdmin.from("meetings")
    .select("id, client_id, title, start_at, responsavel, attendees, estado, resumo, transcricao_em, pdf_path")
    .lt("start_at", agora.toISOString())
    .gte("start_at", desde)
    .neq("estado", "cancelada")
    .order("start_at", { ascending: false })
    .limit(200);

  const historico = (passadas ?? [])
    .map((m) => ({
      reuniaoId: m.id as string,
      clientId: m.client_id as string,
      cliente: nomePorId.get(m.client_id as string) ?? (m.title as string) ?? "Cliente",
      quando: m.start_at as string,
      responsavel: (m.responsavel as string) || null,
      colaboradores: (m.attendees as string[]) ?? [],
      estado: (m.estado as string) || "realizada",
      resumo: (m.resumo as string) ?? null,
      // O que existe de registro dela — é o que diz se dá para consultar o que foi dito.
      temTranscricao: !!m.transcricao_em,
      temAta: !!m.pdf_path,
      papel: undefined as LinhaAgenda["papel"],
    }))
    .filter((h) => {
      if (user.isAdmin) return true;
      if (!nomeUsuario) return false;
      const papel = papelNa(h as unknown as LinhaAgenda, nomeUsuario);
      if (!papel) return false;
      h.papel = papel;
      return true;
    });

  const agendadas = meu.filter((l) => l.estado === "agendada");
  return NextResponse.json({
    ok: true,
    mes,
    historico,
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
