export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { clientesIlegiveis } from "@/lib/cs/sem-postar";
import {
  fecharSocial, fecharDesigner, rotuloMes,
  type ClienteMes, type ArteEntregue,
} from "@/lib/scores/fechamento-mensal";

// GET /api/scores/mensal[?mes=2026-08] — o fechamento do mês, por pessoa e por cliente.
//
// Roberto (02/09): "tem que mostrar se teve um cliente que não recebeu artes… quantos clientes
// teve arte, quantos não teve, quanto foi tempo de atraso."
//
// Padrão é o mês PASSADO, não o corrente: fechamento de mês em andamento compara meta cheia com
// período parcial e faz todo mundo parecer atrasado no dia 2.

export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  const par = req.nextUrl.searchParams.get("mes");
  const hoje = new Date();
  // Sem ?mes=, o padrão é o MÊS ATUAL — era o anterior, e a tela abria em agosto no dia 11 de setembro.
  const base = par && /^\d{4}-\d{2}$/.test(par)
    ? new Date(`${par}-15T12:00:00Z`)
    : new Date(hoje.getFullYear(), hoje.getMonth(), 15);
  const ano = base.getFullYear();
  const mes = base.getMonth() + 1;
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimDate = new Date(Date.UTC(ano, mes, 1));
  const fim = fimDate.toISOString().slice(0, 10);

  const [clientesQ, postsQ, cardsQ, reunioesQ, ilegiveis] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, status, active, assigned_social, assigned_designer, posts_goal, service_type")
      .or("active.is.null,active.eq.true"),
    supabaseAdmin.from("client_ig_posts").select("client_id, posted_at")
      .gte("posted_at", inicio).lt("posted_at", fim),
    supabaseAdmin.from("content_cards")
      .select("client_id, title, designer_delivered_at, designer_delivered_by, due_date")
      .not("designer_delivered_at", "is", null)
      .gte("designer_delivered_at", inicio).lt("designer_delivered_at", fim)
      .is("archived_at", null),
    // REUNIÕES DO MÊS. Roberto: "o sistema identificar que é uma reunião e adicionar no histórico
    // do cliente e nas OKRs, para podermos ver quem teve ou não teve reunião." Conta só as que
    // ACONTECERAM: marcada e cancelada não é reunião tida.
    supabaseAdmin.from("meetings")
      .select("client_id, responsavel, estado, start_at, transcricao_palavras")
      .gte("start_at", inicio).lt("start_at", fim)
      .in("estado", ["agendada", "realizada"]),
    clientesIlegiveis(),
  ]);

  const clientes = (clientesQ.data ?? [])
    .filter((c) => !/\(teste\)/i.test((c.name as string) || ""))
    .filter((c) => c.status !== "onboarding");
  const nomePorId = new Map(clientes.map((c) => [c.id as string,
    (c.nome_fantasia as string) || (c.name as string) || "Cliente"]));
  const idsIlegiveis = new Set(ilegiveis.map((i) => i.clientId));

  const postsPorCliente = new Map<string, number>();
  for (const p of postsQ.data ?? []) {
    const id = p.client_id as string;
    postsPorCliente.set(id, (postsPorCliente.get(id) ?? 0) + 1);
  }

  const cards = cardsQ.data ?? [];
  const artesPorCliente = new Map<string, number>();
  for (const k of cards) {
    const id = k.client_id as string;
    if (id) artesPorCliente.set(id, (artesPorCliente.get(id) ?? 0) + 1);
  }

  // ── SÓ QUEM TEM SOCIAL CONTRATADO ────────────────────────────────────────
  // Cobrar post de cliente que só contratou anúncio inventa uma falha que não existe — e enche a
  // lista de "sem post" com gente que nunca foi para postar.
  const cuidaDoSocial = (st: string | null) => (st ?? "") !== "trafego_pago" && (st ?? "") !== "assessoria_trafego";

  const porCliente: ClienteMes[] = clientes
    .filter((c) => cuidaDoSocial(c.service_type as string))
    .map((c) => {
      const id = c.id as string;
      const publicados = postsPorCliente.get(id) ?? 0;
      return {
        clientId: id,
        cliente: nomePorId.get(id) ?? "Cliente",
        responsavelSocial: (c.assigned_social as string) || null,
        responsavelDesigner: (c.assigned_designer as string) || null,
        publicados,
        meta: Number(c.posts_goal ?? 12),
        artesRegistradas: artesPorCliente.get(id) ?? 0,
        atrasadas: 0,
        diasAtrasoTotal: 0,
        semNenhumPost: publicados === 0,
        ilegivel: idsIlegiveis.has(id),
      };
    });

  const artes: ArteEntregue[] = cards.map((k) => ({
    cliente: nomePorId.get(k.client_id as string) ?? "—",
    titulo: (k.title as string) || "(sem título)",
    designer: (k.designer_delivered_by as string) || null,
    entregueEm: k.designer_delivered_at as string,
    prazo: (k.due_date as string) || null,
  }));

  // ── QUEM TEVE E QUEM NÃO TEVE REUNIÃO ──────────────────────────────────
  const reunioesMes = reunioesQ.data ?? [];
  const clientesComReuniao = new Set(reunioesMes.map((r) => r.client_id as string));
  // Realizada = já passou da data. Uma marcada para o fim do mês ainda não "teve".
  const agoraIso = new Date().toISOString();
  const clientesComReuniaoFeita = new Set(
    reunioesMes.filter((r) => r.estado === "realizada" || (r.start_at as string) < agoraIso)
      .map((r) => r.client_id as string),
  );

  const social = fecharSocial(porCliente);
  const designer = fecharDesigner(artes);

  const publicadosTotal = porCliente.reduce((s, c) => s + c.publicados, 0);

  return NextResponse.json({
    ok: true,
    mes: `${ano}-${String(mes).padStart(2, "0")}`,
    rotulo: rotuloMes(ano, mes),
    social,
    designer,
    // A lista por cliente, ordenada pelo que mais precisa de atenção.
    clientes: porCliente
      .sort((a, b) => Number(b.semNenhumPost) - Number(a.semNenhumPost) || (a.publicados - a.meta) - (b.publicados - b.meta))
      .map((c) => ({
        cliente: c.cliente, social: c.responsavelSocial, publicados: c.publicados, meta: c.meta,
        artesRegistradas: c.artesRegistradas, semNenhumPost: c.semNenhumPost, ilegivel: c.ilegivel,
      })),
    reunioes: {
      no_mes: reunioesMes.length,
      clientes_com_reuniao_marcada: clientesComReuniao.size,
      clientes_com_reuniao_realizada: clientesComReuniaoFeita.size,
      // Nomeados: é o que permite cobrar hoje, em vez de olhar um percentual.
      clientes_sem_reuniao: porCliente
        .filter((c) => !clientesComReuniao.has(c.clientId))
        .map((c) => ({ cliente: c.cliente, social: c.responsavelSocial })),
      com_transcricao: reunioesMes.filter((r) => (r.transcricao_palavras ?? 0) > 0).length,
      por_pessoa: [...new Set(reunioesMes.map((r) => (r.responsavel as string) || "sem responsável"))]
        .map((p) => ({
          pessoa: p,
          reunioes: reunioesMes.filter((r) => ((r.responsavel as string) || "sem responsável") === p).length,
        })),
    },
    totais: {
      clientes: porCliente.length,
      publicados: publicadosTotal,
      artes_registradas: cards.length,
      // A diferença é o tamanho do buraco de registro — o número que explica por que os dois
      // painéis (Instagram e board) nunca batem.
      diferenca_registro: publicadosTotal - cards.length,
      clientes_sem_post: porCliente.filter((c) => !c.ilegivel && c.semNenhumPost).length,
      clientes_ilegiveis: porCliente.filter((c) => c.ilegivel).length,
    },
  });
}
