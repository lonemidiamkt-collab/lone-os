export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { avaliar, tempoDeParceria, rotuloMotivo, type Offboarding } from "@/lib/clients/offboarding";

// GET /api/clients/offboarding/lista
//
// As abas "Em encerramento" e "Desativados", e os alertas operacionais — um cálculo só, o mesmo
// que a ficha do cliente usa.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [{ data: offs }, { data: clientes }, { data: ciclos }] = await Promise.all([
    supabaseAdmin.from("client_offboardings").select("*").is("cancelado_em", null),
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, assigned_social, lifecycle, join_date, churned_at, churn_category, churn_reason, active")
      .is("draft_status", null),
    supabaseAdmin.from("client_lifecycles").select("client_id, ciclo, iniciou_em, encerrou_em"),
  ]);

  const nome = new Map((clientes ?? []).map((c) => [c.id as string,
    (c.nome_fantasia as string) || (c.name as string) || "Cliente"]));
  const porCliente = new Map<string, Record<string, unknown>>();
  for (const o of offs ?? []) porCliente.set(o.client_id as string, o as Record<string, unknown>);

  const ciclosDe = new Map<string, { ciclo: number; iniciou: string; encerrou: string | null }[]>();
  for (const l of ciclos ?? []) {
    const arr = ciclosDe.get(l.client_id as string) ?? [];
    arr.push({ ciclo: l.ciclo as number, iniciou: l.iniciou_em as string, encerrou: (l.encerrou_em as string) ?? null });
    ciclosDe.set(l.client_id as string, arr);
  }

  const linha = (c: Record<string, unknown>) => {
    const id = c.id as string;
    const o = porCliente.get(id);
    const meus = (ciclosDe.get(id) ?? []).sort((a, b) => a.ciclo - b.ciclo);
    const primeiro = meus[0];
    const atual = meus[meus.length - 1];
    const situacao = o ? avaliar({
      id: o.id as string, clientId: id,
      iniciativa: o.iniciativa as Offboarding["iniciativa"],
      motivo: o.motivo as string, motivoDetalhe: (o.motivo_detalhe as string) ?? null,
      solicitadoEm: o.solicitado_em as string, encerraEm: o.encerra_em as string,
      financeiroOk: (o.financeiro_ok as boolean) ?? null,
      financeiroNota: (o.financeiro_nota as string) ?? null,
      entregasOk: (o.entregas_ok as boolean) ?? null,
      estado: o.estado as Offboarding["estado"],
      termoPath: (o.termo_path as string) ?? null,
      enviadoEm: (o.enviado_em as string) ?? null,
      confirmadoEm: (o.confirmado_em as string) ?? null,
    }) : null;

    return {
      clientId: id,
      nome: nome.get(id),
      responsavel: (c.assigned_social as string) ?? null,
      lifecycle: (c.lifecycle as string) ?? "ativo",
      entrada: primeiro?.iniciou ?? (c.join_date as string) ?? null,
      saida: (c.churned_at as string) ?? atual?.encerrou ?? null,
      tempo: primeiro ? tempoDeParceria(primeiro.iniciou, atual?.encerrou ?? undefined) : null,
      ciclos: meus.length,
      // Motivo do processo formal; sem ele, o que o arquivamento antigo deixou.
      motivo: o ? rotuloMotivo(o.motivo as string) : (c.churn_category ? rotuloMotivo(c.churn_category as string) : null),
      motivoDetalhe: (o?.motivo_detalhe as string) ?? (c.churn_reason as string) ?? null,
      iniciativa: (o?.iniciativa as string) ?? null,
      offboardingId: (o?.id as string) ?? null,
      estado: (o?.estado as string) ?? null,
      temTermo: !!o?.termo_path,
      enviado: !!o?.enviado_em,
      confirmado: !!o?.confirmado_em,
      financeiroOk: (o?.financeiro_ok as boolean) ?? null,
      completo: situacao?.completo ?? null,
      percentual: situacao?.percentual ?? null,
      alertas: situacao?.alertas ?? [],
      diasParaEncerrar: situacao?.diasParaEncerrar ?? null,
    };
  };

  const todos = (clientes ?? []).map(linha);
  const encerrando = todos.filter((l) => l.lifecycle === "encerrando")
    .sort((a, b) => (a.diasParaEncerrar ?? 99) - (b.diasParaEncerrar ?? 99));
  const desativados = todos.filter((l) => l.lifecycle === "inativo")
    .sort((a, b) => (b.saida ?? "").localeCompare(a.saida ?? ""));

  return NextResponse.json({
    ok: true,
    encerrando,
    desativados,
    alertas: [...encerrando, ...desativados]
      .filter((l) => l.alertas.length)
      .map((l) => ({ clientId: l.clientId, nome: l.nome, alertas: l.alertas })),
    resumo: {
      encerrando: encerrando.length,
      desativados: desativados.length,
      semTermo: desativados.filter((l) => l.offboardingId && !l.temTermo).length,
      semConfirmacao: desativados.filter((l) => l.enviado && !l.confirmado).length,
      comPendenciaFinanceira: todos.filter((l) => l.financeiroOk === false).length,
      // Saíram pelo caminho antigo, sem processo formal: é o passivo a regularizar.
      semProcesso: desativados.filter((l) => !l.offboardingId).length,
    },
  }, { headers: { "cache-control": "no-store" } });
}
