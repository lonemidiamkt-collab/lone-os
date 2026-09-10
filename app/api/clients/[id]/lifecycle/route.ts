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
import { getServerUser } from "@/lib/supabase/auth-server";
import { MOTIVOS_SAIDA } from "@/lib/clients/churn";

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
  z.object({ action: z.literal("reactivate") }),
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
  const row =
    d.action === "archive"
      ? {
          active: false, churned_at: new Date().toISOString(),
          churn_category: d.category,
          churn_reason: d.reason?.trim() || null,
        }
      : { active: true, churned_at: null, churn_category: null, churn_reason: null };

  const { data, error } = await supabaseAdmin
    .from("clients")
    .update(row)
    .eq("id", id)
    .select("id, name, active, churned_at, churn_category, churn_reason")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
    } else {
      await supabaseAdmin.from("clients").update({ lifecycle: "ativo" }).eq("id", id);
      await registrarHistorico({ clientId: id, tipo: "status", ator: quem, descricao: "Cliente reativado" });
    }
  } catch (e) {
    // Aviso é consequência, não a operação: o arquivamento já aconteceu e não pode ser desfeito
    // porque o WhatsApp falhou.
    console.error("[lifecycle] pós-arquivamento:", e);
  }

  return NextResponse.json({ success: true, client: data });
}
