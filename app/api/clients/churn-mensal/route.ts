export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { rotuloMotivo } from "@/lib/clients/offboarding";

// GET /api/clients/churn-mensal[?meses=12]
//
// Roberto (10/09): "deveria ter um banco com churns de cada mês, com datas certinha do início ao
// fim do cliente."
//
// O banco já existe — é `client_lifecycles`, com um ciclo por passagem do cliente pela Lone.
// Faltava a leitura. Aqui ela sai por mês, com quem saiu, quanto ficou e por quê.
//
// A CONTA DE CHURN QUE FAZ SENTIDO: saídas do mês sobre a base ATIVA NO INÍCIO daquele mês. Usar
// a base de hoje como divisor faria o churn de janeiro ser calculado sobre a carteira de setembro
// — e um mês ruim de dois anos atrás pareceria melhor do que foi só porque a agência cresceu.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const meses = Math.min(Number(req.nextUrl.searchParams.get("meses") ?? 12) || 12, 36);

  const [{ data: ciclos }, { data: clientes }] = await Promise.all([
    supabaseAdmin.from("client_lifecycles")
      .select("client_id, ciclo, iniciou_em, encerrou_em, motivo"),
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, assigned_social, churn_reason, service_type")
      .is("draft_status", null),
  ]);

  const info = new Map((clientes ?? []).map((c) => [c.id as string, c]));
  const todos = ciclos ?? [];

  const chaveMes = (iso: string) => iso.slice(0, 7);
  const hoje = new Date();
  const listaMeses: string[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    listaMeses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  /** Quantos ciclos estavam ABERTOS no primeiro dia do mês — a base sobre a qual o churn incide. */
  const baseNoInicio = (mes: string) => {
    const primeiro = `${mes}-01`;
    return todos.filter((c) =>
      (c.iniciou_em as string) < primeiro &&
      (!c.encerrou_em || (c.encerrou_em as string) >= primeiro)).length;
  };

  const porMes = listaMeses.map((mes) => {
    const saidas = todos.filter((c) => c.encerrou_em && chaveMes(c.encerrou_em as string) === mes);
    const entradas = todos.filter((c) => chaveMes(c.iniciou_em as string) === mes);
    const base = baseNoInicio(mes);

    const dias = (a: string, b: string) =>
      Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400_000));
    const permanencias = saidas.map((c) => dias(c.iniciou_em as string, c.encerrou_em as string));

    return {
      mes,
      base,
      saidas: saidas.length,
      entradas: entradas.length,
      // Sem base no início, o percentual não existe — e mostrar 0% seria dizer que foi um mês bom.
      churnPct: base ? Math.round((saidas.length / base) * 1000) / 10 : null,
      permanenciaMediaMeses: permanencias.length
        ? Math.round((permanencias.reduce((s, d) => s + d, 0) / permanencias.length / 30.4) * 10) / 10
        : null,
      // Reentradas: ciclo 2 ou maior começando neste mês. É a taxa de reativação do §23.
      reativados: entradas.filter((c) => (c.ciclo as number) > 1).length,
      clientes: saidas.map((c) => {
        const cli = info.get(c.client_id as string);
        return {
          clientId: c.client_id as string,
          nome: (cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente",
          responsavel: (cli?.assigned_social as string) ?? null,
          servico: (cli?.service_type as string) ?? null,
          entrada: c.iniciou_em as string,
          saida: c.encerrou_em as string,
          diasComoCliente: dias(c.iniciou_em as string, c.encerrou_em as string),
          ciclo: c.ciclo as number,
          motivo: c.motivo ? rotuloMotivo(c.motivo as string) : null,
          motivoDetalhe: (cli?.churn_reason as string) ?? null,
        };
      }).sort((a, b) => a.saida.localeCompare(b.saida)),
    };
  });

  // Agregados do período inteiro — as perguntas do §23.
  const todasSaidas = porMes.flatMap((m) => m.clientes);
  const porMotivo = new Map<string, number>();
  const porResponsavel = new Map<string, number>();
  for (const s of todasSaidas) {
    const m = s.motivo ?? "Sem motivo registrado";
    porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
    const r = s.responsavel ?? "(sem responsável)";
    porResponsavel.set(r, (porResponsavel.get(r) ?? 0) + 1);
  }

  return NextResponse.json({
    ok: true,
    meses: porMes,
    total: {
      saidas: todasSaidas.length,
      reativados: porMes.reduce((s, m) => s + m.reativados, 0),
      permanenciaMediaMeses: todasSaidas.length
        ? Math.round((todasSaidas.reduce((s, c) => s + c.diasComoCliente, 0) / todasSaidas.length / 30.4) * 10) / 10
        : null,
      porMotivo: [...porMotivo.entries()].map(([motivo, n]) => ({ motivo, clientes: n }))
        .sort((a, b) => b.clientes - a.clientes),
      porResponsavel: [...porResponsavel.entries()].map(([responsavel, n]) => ({ responsavel, clientes: n }))
        .sort((a, b) => b.clientes - a.clientes),
      // O passivo: quem saiu sem ninguém registrar por quê.
      semMotivo: todasSaidas.filter((s) => !s.motivo).length,
    },
  }, { headers: { "cache-control": "no-store" } });
}
