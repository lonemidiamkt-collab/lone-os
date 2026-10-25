export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { avaliar, type Offboarding } from "@/lib/clients/offboarding";
import { executarPassos, respostaDosPassos, type ResultadoGravacao } from "@/lib/clients/offboarding-passos";

// O ENCERRAMENTO DE UM CLIENTE, do pedido à conclusão.
//
// Uma rota com `acao` porque são passos do MESMO processo, quase sempre feitos em sequência sobre
// o mesmo registro. Cinco endpoints seriam cinco lugares para esquecer de mover o `lifecycle`.

type Acao =
  | "iniciar" | "atualizar" | "marcar_enviado" | "marcar_confirmado"
  | "concluir" | "desistir" | "reativar";

// Devolve o resultado (antes engolia): nos passos de concluir/iniciar/desistir/reativar, auditoria que
// não gravou vira pendência dita na tela (24/10/2026, auditoria 3.10).
async function auditar(e: {
  offboardingId?: string | null; clientId: string; acao: string; ator: string;
  detalhe?: Record<string, unknown>;
}): Promise<ResultadoGravacao> {
  try {
    const { error } = await supabaseAdmin.from("offboarding_events").insert({
      offboarding_id: e.offboardingId ?? null, client_id: e.clientId,
      acao: e.acao, ator: e.ator, detalhe: e.detalhe ?? null,
    });
    if (error) console.error("[offboarding_events]", e.acao, error.message);
    return { error };
  } catch (err) {
    console.error("[offboarding_events]", e.acao, err);
    return { error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/** Linha na memória do cliente (timeline_entries), como passo conferido. */
function naLinhaDoTempo(clientId: string, ator: string, description: string) {
  return () => supabaseAdmin.from("timeline_entries").insert({
    client_id: clientId, type: "status", actor: ator, description,
    timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  });
}

/** Linha do banco → o objeto que a regra pura entende. */
function paraRegra(r: Record<string, unknown>): Offboarding {
  return {
    id: r.id as string, clientId: r.client_id as string,
    iniciativa: r.iniciativa as Offboarding["iniciativa"],
    motivo: r.motivo as string, motivoDetalhe: (r.motivo_detalhe as string) ?? null,
    solicitadoEm: r.solicitado_em as string, encerraEm: r.encerra_em as string,
    financeiroOk: (r.financeiro_ok as boolean) ?? null,
    financeiroNota: (r.financeiro_nota as string) ?? null,
    entregasOk: (r.entregas_ok as boolean) ?? null,
    entregasNota: (r.entregas_nota as string) ?? null,
    estado: r.estado as Offboarding["estado"],
    termoPath: (r.termo_path as string) ?? null,
    enviadoEm: (r.enviado_em as string) ?? null,
    confirmadoEm: (r.confirmado_em as string) ?? null,
  };
}

export async function POST(req: NextRequest) {
  // Encerrar parceria é decisão de gestão; antes qualquer logado conseguia iniciar o distrato.
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;

  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const acao = b?.acao as Acao | undefined;
  if (!acao) return NextResponse.json({ error: "acao é obrigatória" }, { status: 400 });

  const { data: membro } = await supabaseAdmin
    .from("team_members").select("name").eq("email", user.email).maybeSingle();
  const quem = (membro?.name as string) || user.email;

  // ── INICIAR ─────────────────────────────────────────────────────────────
  //
  // Roberto (§27): pedir cancelamento e encerrar são dias diferentes. Aqui o cliente vai para
  // `encerrando`, NÃO para inativo — até a data efetiva a Lone ainda responde pela operação.
  if (acao === "iniciar") {
    const clientId = b?.clientId as string;
    const motivo = b?.motivo as string;
    const solicitado = b?.solicitadoEm as string;
    const encerra = b?.encerraEm as string;
    if (!clientId || !motivo || !solicitado || !encerra) {
      return NextResponse.json({ error: "clientId, motivo, solicitadoEm e encerraEm são obrigatórios" }, { status: 400 });
    }
    if (encerra < solicitado) {
      return NextResponse.json({
        error: "A data de encerramento não pode ser antes do pedido — o termo diria que a parceria acabou antes de alguém pedir.",
      }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from("client_offboardings").insert({
      client_id: clientId,
      iniciativa: (b?.iniciativa as string) || "cliente",
      motivo,
      motivo_detalhe: (b?.motivoDetalhe as string) || null,
      solicitado_em: solicitado,
      encerra_em: encerra,
      servicos: (b?.servicos as string[]) ?? [],
      estado: "rascunho",
      criado_por: quem,
    }).select("*").single();

    if (error) {
      const jaTem = /uniq_offboarding_vivo/.test(error.message);
      return NextResponse.json({
        error: jaTem ? "Já existe um encerramento em andamento para este cliente." : error.message,
      }, { status: jaTem ? 409 : 500 });
    }

    // O encerramento já existe; o resto é marcação e registro — o que falhar volta como pendência.
    const r = await executarPassos([
      { rotulo: "marcar o cliente como \"em encerramento\"", essencial: false,
        rodar: () => supabaseAdmin.from("clients").update({ lifecycle: "encerrando" }).eq("id", clientId) },
      { rotulo: "registrar na auditoria", essencial: false,
        rodar: () => auditar({ offboardingId: data.id, clientId, acao: "client_offboarding_started", ator: quem,
          detalhe: { motivo, solicitado, encerra, iniciativa: b?.iniciativa } }) },
      // Entra na memória do cliente no MESMO instante: o encerramento é parte da história dele,
      // não um sumiço.
      { rotulo: "registrar na linha do tempo do cliente", essencial: false,
        rodar: naLinhaDoTempo(clientId, quem, `Encerramento iniciado — efetivo em ${encerra.split("-").reverse().join("/")}`) },
    ]);
    const resp = respostaDosPassos(r, { semEfeito: "" });
    return NextResponse.json({ ...resp.corpo, offboarding: data }, { status: resp.status });
  }

  // As demais agem sobre um processo existente.
  const id = b?.id as string;
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  const { data: off } = await supabaseAdmin
    .from("client_offboardings").select("*").eq("id", id).maybeSingle();
  if (!off) return NextResponse.json({ error: "encerramento não encontrado" }, { status: 404 });
  const clientId = off.client_id as string;

  if (acao === "atualizar") {
    const patch: Record<string, unknown> = {};
    const campos: [string, string][] = [
      ["iniciativa", "iniciativa"], ["motivo", "motivo"], ["motivoDetalhe", "motivo_detalhe"],
      ["solicitadoEm", "solicitado_em"], ["encerraEm", "encerra_em"],
      ["financeiroOk", "financeiro_ok"], ["financeiroNota", "financeiro_nota"],
      ["entregasOk", "entregas_ok"], ["entregasNota", "entregas_nota"],
      ["servicos", "servicos"], ["entregasExtra", "entregas_extra"], ["estado", "estado"],
    ];
    // `undefined` não mexe; `null` limpa de propósito. Sem a diferença, salvar um formulário
    // parcial apagaria o que outra pessoa preencheu antes.
    for (const [de, para] of campos) if (b?.[de] !== undefined) patch[para] = b[de];
    if (!Object.keys(patch).length) return NextResponse.json({ ok: true, semMudanca: true });

    const { error } = await supabaseAdmin.from("client_offboardings").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar({ offboardingId: id, clientId, acao: "client_offboarding_updated", ator: quem,
      detalhe: { campos: Object.keys(patch) } });
    return NextResponse.json({ ok: true });
  }

  if (acao === "marcar_enviado") {
    const { error } = await supabaseAdmin.from("client_offboardings").update({
      estado: "termo_enviado",
      enviado_em: new Date().toISOString(), enviado_por: quem,
      enviado_canal: (b?.canal as string) || "manual",
      enviado_para: (b?.para as string) || null,
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar({ offboardingId: id, clientId, acao: "termination_term_sent", ator: quem,
      detalhe: { canal: b?.canal, para: b?.para } });
    return NextResponse.json({ ok: true });
  }

  if (acao === "marcar_confirmado") {
    const { error } = await supabaseAdmin.from("client_offboardings").update({
      estado: "confirmado",
      confirmado_em: new Date().toISOString(),
      confirmado_por: (b?.porQuem as string) || quem,
      confirmado_origem: (b?.origem as string) || "manual",
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar({ offboardingId: id, clientId, acao: "termination_acknowledged", ator: quem });
    return NextResponse.json({ ok: true });
  }

  // ── CONCLUIR: é aqui que o cliente sai de verdade ───────────────────────
  if (acao === "concluir") {
    const situacao = avaliar(paraRegra(off));
    // Roberto (§29): aviso forte, não bloqueio — mas exige a confirmação explícita de quem conclui.
    if (!situacao.completo && b?.mesmoAssim !== true) {
      return NextResponse.json({
        error: "faltam_itens",
        faltando: situacao.faltandoEssencial.map((i) => i.rotulo),
        aviso: "Este encerramento está incompleto. Concluir assim deixa o registro sem o que falta acima.",
      }, { status: 409 });
    }

    const hoje = new Date().toISOString().slice(0, 10);
    // 24/10/2026 (auditoria 3.10): a ordem importa. Antes o encerramento era marcado "concluído"
    // PRIMEIRO e as outras gravações não eram conferidas: se tirar o cliente da carteira falhasse, a
    // tela dizia "concluído" com ele ainda ativo. Agora tirar da carteira vem primeiro e é essencial;
    // o resto, se falhar, volta como pendência e a tela não fecha como se estivesse tudo certo.
    const r = await executarPassos([
      // O cliente NÃO é apagado: muda de estado e o ciclo se fecha com a data efetiva.
      { rotulo: "tirar o cliente da carteira ativa", essencial: true,
        rodar: () => supabaseAdmin.from("clients").update({
          lifecycle: "inativo", active: false,
          churned_at: off.encerra_em as string,
          churn_category: off.motivo as string,
          churn_reason: (off.motivo_detalhe as string) || null,
        }).eq("id", clientId) },
      { rotulo: "fechar o ciclo de parceria", essencial: false,
        rodar: () => supabaseAdmin.from("client_lifecycles")
          .update({ encerrou_em: (off.encerra_em as string) || hoje, offboarding_id: id, motivo: off.motivo as string })
          .eq("client_id", clientId).is("encerrou_em", null) },
      { rotulo: "marcar o encerramento como concluído", essencial: false,
        rodar: () => supabaseAdmin.from("client_offboardings").update({ estado: "concluido" }).eq("id", id) },
      { rotulo: "registrar na auditoria", essencial: false,
        rodar: () => auditar({ offboardingId: id, clientId, acao: "client_deactivated", ator: quem,
          detalhe: { incompleto: !situacao.completo, faltando: situacao.faltandoEssencial.map((i) => i.chave) } }) },
      { rotulo: "registrar na linha do tempo do cliente", essencial: false,
        rodar: naLinhaDoTempo(clientId, quem, `Parceria encerrada — ${off.motivo}${off.motivo_detalhe ? `: ${off.motivo_detalhe}` : ""}`) },
    ]);
    const resp = respostaDosPassos(r, { semEfeito: "O cliente continua ATIVO na carteira." });
    return NextResponse.json(resp.status === 200 ? { ...resp.corpo, incompleto: !situacao.completo } : resp.corpo, { status: resp.status });
  }

  if (acao === "desistir") {
    const r = await executarPassos([
      { rotulo: "cancelar o encerramento", essencial: true,
        rodar: () => supabaseAdmin.from("client_offboardings").update({ cancelado_em: new Date().toISOString() }).eq("id", id) },
      { rotulo: "voltar o cliente para \"ativo\"", essencial: false,
        rodar: () => supabaseAdmin.from("clients").update({ lifecycle: "ativo" }).eq("id", clientId) },
      { rotulo: "registrar na auditoria", essencial: false,
        rodar: () => auditar({ offboardingId: id, clientId, acao: "client_offboarding_cancelled", ator: quem }) },
    ]);
    const resp = respostaDosPassos(r, { semEfeito: "O encerramento continua em andamento." });
    return NextResponse.json(resp.corpo, { status: resp.status });
  }

  // ── REATIVAR: mesmo cliente, ciclo novo ─────────────────────────────────
  if (acao === "reativar") {
    const { data: ciclos, error: errCiclos } = await supabaseAdmin.from("client_lifecycles")
      .select("ciclo").eq("client_id", clientId).order("ciclo", { ascending: false }).limit(1);
    if (errCiclos) return NextResponse.json({ error: `Não consegui ler os ciclos do cliente (${errCiclos.message}). Nada foi feito.` }, { status: 500 });
    const proximo = ((ciclos?.[0]?.ciclo as number) ?? 0) + 1;
    const hoje = new Date().toISOString().slice(0, 10);

    // Trazer de volta é o essencial e vem primeiro (24/10/2026, auditoria 3.10): antes o ciclo novo
    // era aberto e a volta à carteira não era conferida — ciclo aberto com cliente ainda inativo.
    const r = await executarPassos([
      // O mesmo client_id, com o histórico inteiro atrás. Nada de cadastro novo.
      { rotulo: "trazer o cliente de volta para a carteira", essencial: true,
        rodar: () => supabaseAdmin.from("clients")
          .update({ lifecycle: "ativo", active: true, churned_at: null }).eq("id", clientId) },
      { rotulo: `abrir o ${proximo}º ciclo de parceria`, essencial: false,
        rodar: () => supabaseAdmin.from("client_lifecycles").insert({
          client_id: clientId, ciclo: proximo, iniciou_em: hoje, criado_por: quem,
        }) },
      { rotulo: "registrar na auditoria", essencial: false,
        rodar: () => auditar({ offboardingId: id, clientId, acao: "client_reactivated", ator: quem, detalhe: { ciclo: proximo } }) },
      { rotulo: "registrar na linha do tempo do cliente", essencial: false,
        rodar: naLinhaDoTempo(clientId, quem, `Cliente reativado — ${proximo}º ciclo de parceria`) },
    ]);
    const resp = respostaDosPassos(r, { semEfeito: "O cliente continua fora da carteira." });
    return NextResponse.json(resp.status === 200 ? { ...resp.corpo, ciclo: proximo } : resp.corpo, { status: resp.status });
  }

  return NextResponse.json({ error: `ação desconhecida: ${acao}` }, { status: 400 });
}
