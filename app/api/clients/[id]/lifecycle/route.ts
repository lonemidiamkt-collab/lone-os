// app/api/clients/[id]/lifecycle/route.ts
//
// Arquivar (churn) / reativar um cliente. Admin/manager apenas.
//   archive    → active=false, churned_at=now, churn_category=<motivo>, churn_reason=<detalhe>
//   reactivate → active=true,  churned_at=null, ambos limpos
//
// MOTIVO É OBRIGATÓRIO ao arquivar (Roberto: "gostei do motivo de saída obrigatório"). Antes era
// opcional e o resultado apareceu no banco: 6 clientes arquivados, 1 com motivo. Cinco saíram e
// ninguém sabe por quê. Sem isso não dá pra responder se a perda é por preço, por resultado ou por
// atendimento — e cada resposta dessas muda uma decisão diferente.
//
// Offboarding de ex-cliente NÃO apaga histórico — só tira da operação (todos os
// filtros de cliente ativo exigem active=true). Base das métricas de churn.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dispararLinkDoPortal } from "@/lib/portal/link-automatico";
import { getServerUser } from "@/lib/supabase/auth-server";
import { MOTIVOS_SAIDA } from "@/lib/clients/churn";
import { podeArquivar, podeReativar, textoArquivamentoDesfeito, type EstadoArquivo } from "@/lib/clients/arquivar";

const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("archive"),
    category: z.enum(Object.keys(MOTIVOS_SAIDA) as [string, ...string[]], {
      message: "Escolha o motivo da saída.",
    }),
    // Em "outro" o rótulo não explica nada sozinho, então o detalhe passa a ser exigido.
    reason: z.string().max(512).optional(),
  }).refine((d) => d.category !== "outro" || (d.reason?.trim().length ?? 0) >= 3, {
    message: "Com motivo \"Outro\", descreva o que aconteceu.", path: ["reason"],
  }),
  // desfazer = "Desfazer" do aviso da lista, logo depois de arquivar (24/10/2026, auditoria 3.7):
  // além de reativar, reabre o ciclo que o arquivamento fechou e avisa o grupo que foi engano.
  z.object({ action: z.literal("reactivate"), desfazer: z.boolean().optional() }),
  // PAUSA (23/09): estado novo, entre ativo e arquivado. Não recebe nada, mas CONTINUA na carteira
  // do time — que é a diferença para o arquivamento. Ver lib/clients/pausa.ts.
  z.object({
    action: z.literal("pause"),
    reason: z.string().trim().min(3, "Diga por que está pausando (o time lê isso no card).").max(512),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD.").optional(),
  }),
  z.object({ action: z.literal("resume") }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a admin/manager" }, { status: 403 });

  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 422 });
  }

  const d = parsed.data;
  if (d.action === "pause" || d.action === "resume") {
    const { data: membro } = await supabaseAdmin
      .from("team_members").select("name").eq("email", user.email).maybeSingle();
    const quem = (membro?.name as string) || user.email;
    const pausa = d.action === "pause"
      ? { paused_at: new Date().toISOString(), paused_reason: d.reason.trim(), paused_until: d.until ?? null, paused_by: quem }
      : { paused_at: null, paused_reason: null, paused_until: null, paused_by: null };
    const { data: cli, error: errPausa } = await supabaseAdmin
      .from("clients").update(pausa).eq("id", id)
      .select("id, name, nome_fantasia, paused_at, paused_reason, paused_until").single();
    if (errPausa) return NextResponse.json({ error: errPausa.message }, { status: 500 });
    // O time precisa saber: pausa que ninguém vê vira cobrança injusta no board.
    try {
      const { csSendGroupText } = await import("@/lib/cs/notify");
      const nome = (cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente";
      const ate = d.action === "pause" && d.until ? ` até ${d.until.split("-").reverse().join("/")}` : "";
      const texto = d.action === "pause"
        ? `⏸️ *${nome} pausado${ate}* por ${quem}\nMotivo: ${d.reason.trim()}\n\nEnquanto durar: sem relatório, sem mensagem no grupo, sem alerta de verba e sem painel de resultados. O cliente CONTINUA na carteira de vocês.`
        : `▶️ *${nome} voltou a operar* — ${quem} tirou a pausa. Relatórios, mensagens e alertas voltam ao normal.`;
      const jid = process.env.CS_TEAM_GROUP_JID;
      if (jid) await csSendGroupText(jid, texto, undefined, { origem: "cliente:pausa", destino: "interno" });
    } catch { /* aviso é secundário — a pausa já está gravada */ }
    return NextResponse.json({ ok: true, client: cli });
  }

  // 24/10/2026 (auditoria 3.7): arquivar o que já está arquivado regravava a data de saída e mandava
  // o aviso de churn de novo ao grupo. Confere o estado antes, e o update só pega quem ainda está no
  // estado esperado — dois cliques ao mesmo tempo não passam os dois.
  const { data: atual, error: errAtual } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, active, churned_at").eq("id", id).maybeSingle();
  if (errAtual) return NextResponse.json({ error: `Não consegui ler o cliente: ${errAtual.message}` }, { status: 500 });
  const desfazer = d.action === "reactivate" && d.desfazer === true;
  const decisao = d.action === "archive"
    ? podeArquivar(atual as EstadoArquivo | null)
    : podeReativar(atual as EstadoArquivo | null, { desfazer, agora: new Date() });
  if (!decisao.ok) return NextResponse.json({ error: decisao.erro }, { status: decisao.status });

  const row =
    d.action === "archive"
      ? {
          active: false, churned_at: new Date().toISOString(),
          churn_category: d.category,
          churn_reason: d.reason?.trim() || null,
        }
      : { active: true, churned_at: null, churn_category: null, churn_reason: null };

  const base = supabaseAdmin.from("clients").update(row).eq("id", id);
  const { data, error } = await (d.action === "archive" ? base.or("active.is.null,active.eq.true") : base.eq("active", false))
    .select("id, name, active, churned_at, churn_category, churn_reason")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({
      error: d.action === "archive" ? "Alguém acabou de arquivar este cliente — nada foi feito." : "Alguém acabou de reativar este cliente — nada foi feito.",
    }, { status: 409 });
  }

  // ── O TIME PRECISA SABER ────────────────────────────────────────────────
  //
  // Roberto (10/09): "ao ser feito um churn, deveria ser aviso no grupo com o motivo e as
  // observações." Hoje o cliente sai em silêncio: alguém arquiva pela tela e o resto descobre
  // quando estranha a ausência no board. Enquanto isso o tráfego segue gastando verba, o social
  // segue programando post e o designer segue produzindo arte para quem já foi embora.
  //
  // O `lifecycle` também acompanha: era só `active=false`, e a coluna nova ficava dizendo "ativo".
  try {
    const { registrarHistorico } = await import("@/lib/clients/historico");
    const { textoAvisoChurn } = await import("@/lib/clients/aviso-churn");
    const { csSendGroupText } = await import("@/lib/cs/notify");

    const { data: membro } = await supabaseAdmin
      .from("team_members").select("name").eq("email", user.email).maybeSingle();
    const quem = (membro?.name as string) || user.email;

    if (d.action === "archive") {
      await supabaseAdmin.from("clients").update({ lifecycle: "inativo" }).eq("id", id);
      // Fecha o ciclo aberto: sem isto, "há quanto tempo é cliente" continuaria contando.
      await supabaseAdmin.from("client_lifecycles")
        .update({ encerrou_em: new Date().toISOString().slice(0, 10), motivo: d.category })
        .eq("client_id", id).is("encerrou_em", null);

      const { data: cli } = await supabaseAdmin.from("clients")
        .select("nome_fantasia, name, assigned_social, join_date, service_type").eq("id", id).maybeSingle();
      const { data: ciclo } = await supabaseAdmin.from("client_lifecycles")
        .select("iniciou_em").eq("client_id", id).order("ciclo", { ascending: true }).limit(1).maybeSingle();

      const nome = (cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente";
      const texto = textoAvisoChurn({
        cliente: nome,
        motivo: d.category,
        motivoDetalhe: d.reason ?? null,
        entrada: (ciclo?.iniciou_em as string) || (cli?.join_date as string) || null,
        saida: new Date().toISOString().slice(0, 10),
        responsavel: (cli?.assigned_social as string) ?? null,
        porQuem: quem,
        // "Pausa temporária (pretende voltar)" muda a instrução: pausar não é desmontar.
        pretendeVoltar: d.category === "pausa",
      });

      // ── O GRUPO CERTO ────────────────────────────────────────────────
      //
      // Mandei o primeiro aviso para o CS_INTERNAL_GROUP_JID — o grupo geral de operação. Eu tinha
      // conferido que não era grupo de CLIENTE, e parei aí: não conferi se era o grupo CERTO.
      // Entrada e saída de cliente é assunto de cadastro, e é lá que ficam contrato e oferta.
      //
      // Cai no geral só se o de cadastro não estiver configurado — melhor no grupo errado que em
      // nenhum, porque cliente que sai em silêncio é o problema que este aviso existe para
      // resolver.
      const jid = process.env.CS_CADASTRO_GROUP_JID || process.env.CS_INTERNAL_GROUP_JID || null;
      if (jid) {
        await csSendGroupText(jid, texto, undefined, { origem: "churn-aviso", destino: "interno" })
          .catch((e) => console.error("[lifecycle] aviso de churn:", e));
      }

      await registrarHistorico({
        clientId: id, tipo: "status", ator: quem,
        descricao: `Cliente arquivado — ${d.category}${d.reason ? `: ${d.reason}` : ""}`,
      });
    } else if (desfazer) {
      await supabaseAdmin.from("clients").update({ lifecycle: "ativo" }).eq("id", id);
      // Reabre o ciclo que o arquivamento acabou de fechar: o cliente nunca saiu, e "há quanto tempo
      // é cliente" não pode recomeçar do zero por causa de um clique errado.
      const { data: fechado } = await supabaseAdmin.from("client_lifecycles")
        .select("id").eq("client_id", id).not("encerrou_em", "is", null).is("offboarding_id", null)
        .order("ciclo", { ascending: false }).limit(1).maybeSingle();
      if (fechado?.id) {
        const { error: errCiclo } = await supabaseAdmin.from("client_lifecycles")
          .update({ encerrou_em: null, motivo: null }).eq("id", fechado.id);
        if (errCiclo) console.error("[lifecycle] desfazer: ciclo não reaberto:", errCiclo.message);
      }
      // O aviso de saída já foi ao grupo: o time precisa saber que era engano.
      const antes = atual as EstadoArquivo | null;
      const nome = antes?.nome_fantasia || antes?.name || "Cliente";
      const jid = process.env.CS_CADASTRO_GROUP_JID || process.env.CS_INTERNAL_GROUP_JID || null;
      if (jid) {
        await csSendGroupText(jid, textoArquivamentoDesfeito({ cliente: nome, porQuem: quem }), undefined, { origem: "churn-desfeito", destino: "interno" })
          .catch((e) => console.error("[lifecycle] aviso de arquivamento desfeito:", e));
      }
      await registrarHistorico({ clientId: id, tipo: "status", ator: quem, descricao: "Arquivamento desfeito — o cliente continua ativo" });
    } else {
      await supabaseAdmin.from("clients").update({ lifecycle: "ativo" }).eq("id", id);
      await registrarHistorico({ clientId: id, tipo: "status", ator: quem, descricao: "Cliente reativado" });
    }
  } catch (e) {
    // Aviso é consequência, não a operação: o arquivamento já aconteceu e não pode ser desfeito
    // porque o WhatsApp falhou.
    console.error("[lifecycle] pós-arquivamento:", e);
  }

  // Voltou a ser cliente: se nunca teve link do portal, ganha agora (e o grupo de cadastro recebe uma
  // vez). Link revogado de propósito continua revogado. Desfazer não é "voltar": o cliente nunca saiu.
  if (d.action === "reactivate" && !desfazer) dispararLinkDoPortal(id, "reativacao");

  return NextResponse.json({ success: true, client: data });
}
