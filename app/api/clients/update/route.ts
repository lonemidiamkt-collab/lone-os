export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { normalizarEmail, mensagemDadosInvalidos } from "@/lib/clients/email";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { dispararLinkDoPortal } from "@/lib/portal/link-automatico";
import { decidirVinculo, normalizarContaMeta, type DonoConta } from "@/lib/clients/conta-meta";
import { devolverConta, donosDaConta, espelharConta, soltarConta } from "@/lib/clients/conta-meta-server";
import { registrarHistorico } from "@/lib/clients/historico";

// camelCase → snake_case mapping for Client fields
const FIELD_MAP: Record<string, string> = {
  name: "name", status: "status", industry: "industry", logo: "logo",
  attentionLevel: "attention_level", tags: "tags",
  monthlyBudget: "monthly_budget", paymentMethod: "payment_method",
  joinDate: "join_date", contractEnd: "contract_end",
  lastPostDate: "last_post_date", notes: "notes",
  assignedTraffic: "assigned_traffic", assignedSocial: "assigned_social",
  assignedDesigner: "assigned_designer", toneOfVoice: "tone_of_voice",
  driveLink: "drive_link", instagramUser: "instagram_user",
  postsThisMonth: "posts_this_month", postsGoal: "posts_goal",
  campaignBriefing: "campaign_briefing", fixedBriefing: "fixed_briefing",
  metaAdAccountId: "meta_ad_account_id", metaAdAccountName: "meta_ad_account_name",
  leadSource: "lead_source", facebookLogin: "facebook_login",
  googleAdsLogin: "google_ads_login", instagramLogin: "instagram_login",
  nomeFantasia: "nome_fantasia", nicho: "nicho", faturamentoFaixa: "faturamento_faixa",
  clientFinancePhone: "client_finance_phone", clientPixKey: "client_pix_key",
  cpfCnpj: "cpf_cnpj", birthDate: "birth_date", phone: "phone", email: "email",
  draftStatus: "draft_status", agenteAtivo: "agente_ativo",
  perfilConteudo: "perfil_conteudo",
  razaoSocial: "razao_social", cnpj: "cnpj", contactName: "contact_name", contactRole: "contact_role",
  emailCorporativo: "email_corporativo", endereco: "endereco",
  enderecoRua: "endereco_rua", enderecoNumero: "endereco_numero", enderecoBairro: "endereco_bairro",
  enderecoCidade: "endereco_cidade", enderecoEstado: "endereco_estado", enderecoCep: "endereco_cep",
  serviceType: "service_type", idade: "idade",
  docLogo: "doc_logo", docContratoSocial: "doc_contrato_social", docIdentidade: "doc_identidade",
  companyPhone: "company_phone", contactPhone: "contact_phone",
  lastKanbanActivity: "last_kanban_activity",
};

// Texto opcional que aceita null (= apagar o campo). Antes só `.optional()`: não havia como limpar.
const txt = (max: number) => z.string().max(max).nullable().optional();
// E-mail: limpa espaço/ponto final colado antes de validar; vazio vira null (lib/clients/email.ts).
const emailOpc = z.preprocess(normalizarEmail, z.string().email().max(256).nullable().optional());

const ClientUpdateSchema = z.object({
  id: z.string().uuid("id deve ser um UUID válido"),
  name: z.string().min(1).max(256).optional(),
  status: z.enum(["good", "average", "at_risk", "onboarding", "churned"]).optional(),
  industry: z.string().max(128).optional(),
  logo: txt(512),
  attentionLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  tags: z.array(z.string()).optional(),
  monthlyBudget: z.number().nonnegative().optional(),
  paymentMethod: z.string().max(64).optional(),
  joinDate: z.string().optional(),
  contractEnd: txt(32),
  lastPostDate: txt(32),
  notes: txt(4096),
  assignedTraffic: txt(128),
  assignedSocial: txt(128),
  assignedDesigner: txt(128),
  toneOfVoice: txt(128),
  driveLink: txt(512),
  instagramUser: txt(128),
  postsThisMonth: z.number().int().nonnegative().optional(),
  postsGoal: z.number().int().nonnegative().optional(),
  campaignBriefing: txt(4096),
  fixedBriefing: txt(4096),
  metaAdAccountId: txt(64),
  metaAdAccountName: txt(256),
  leadSource: txt(128),
  facebookLogin: txt(256),
  googleAdsLogin: txt(256),
  instagramLogin: txt(256),
  nomeFantasia: txt(256),
  nicho: txt(128),
  // Só as chaves da lista (o banco também tem a trava): texto livre aqui vira faixa que nenhum gráfico agrupa.
  faturamentoFaixa: z.enum(["ate_30k", "30k_50k", "50k_100k", "100k_200k", "200k_500k", "acima_500k", "nao_informado"]).nullable().optional(),
  clientFinancePhone: txt(32),
  clientPixKey: txt(256),
  cpfCnpj: txt(32),
  birthDate: txt(32),
  phone: txt(32),
  email: emailOpc,
  draftStatus: txt(64),
  agenteAtivo: z.boolean().optional(),
  perfilConteudo: z.enum(["so_arte", "video", "completo"]).nullable().optional(),
  razaoSocial: txt(256),
  cnpj: txt(32),
  contactName: txt(256),
  contactRole: txt(128),
  emailCorporativo: emailOpc,
  endereco: txt(512),
  enderecoRua: txt(256),
  enderecoNumero: txt(32),
  enderecoBairro: txt(128),
  enderecoCidade: txt(128),
  enderecoEstado: txt(32),
  enderecoCep: txt(16),
  serviceType: z.enum(["lone_growth", "assessoria_trafego", "assessoria_social", "assessoria_design"]).optional(),
  idade: txt(16),
  docLogo: txt(1024),
  docContratoSocial: txt(1024),
  docIdentidade: txt(1024),
  companyPhone: txt(32),
  contactPhone: txt(32),
  lastKanbanActivity: z.string().max(64).optional(),
  // Não é campo: é a confirmação de "esta conta é do cliente X — transferir para cá" (21/10/2026).
  transferirContaMeta: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const rawBody = await req.json().catch(() => null);
  const parsed = ClientUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: mensagemDadosInvalidos(parsed.error.issues.map((i) => i.path[0])), issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { id, transferirContaMeta, ...updates } = parsed.data;

  // Campos SENSÍVEIS (credenciais, financeiro/PII, lifecycle) só admin altera. Os operacionais
  // (notes, conta Meta, briefings, posts, assigned…) seguem liberados — tráfego/design editam esses.
  const SENSITIVE_FIELDS = new Set([
    "facebookLogin", "googleAdsLogin", "instagramLogin",
    "clientPixKey", "cpfCnpj", "clientFinancePhone", "monthlyBudget", "paymentMethod",
    "contractEnd", "birthDate", "phone", "email", "status",
    "razaoSocial", "cnpj", "emailCorporativo", "endereco", "enderecoRua", "enderecoNumero",
    "enderecoBairro", "enderecoCidade", "enderecoEstado", "enderecoCep", "idade",
    "docContratoSocial", "docIdentidade", "companyPhone", "contactPhone",
  ]);
  if (!user.isAdmin && Object.keys(updates).some((k) => SENSITIVE_FIELDS.has(k))) {
    return NextResponse.json(
      { error: "Só admin pode alterar credenciais, dados financeiros/PII ou o status do cliente." },
      { status: 403 },
    );
  }

  const row: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updates)) {
    if (val === undefined) continue;
    const col = FIELD_MAP[key];
    if (!col) continue;
    // "" e null apagam; o form manda vazio quando alguém limpa o campo.
    row[col] = val === "" ? null : val;
  }
  // Desvincular a conta Meta leva o nome junto (o nome sozinho fazia a tela jurar que havia conta).
  if (row.meta_ad_account_id === null) row.meta_ad_account_name = null;
  // Status vindo por aqui é gente arrastando no kanban: marca como MANUAL. A rotina de sexta
  // (status-clientes) grava "auto" por outro caminho e respeita o manual por 7 dias — o Julio
  // olhou e decidiu; a régua automática espera a próxima semana. Decidido no servidor, não no
  // cliente, para ninguém conseguir se passar por rotina.
  if (updates.status !== undefined) {
    row.status_origem = "manual";
    row.status_atualizado_em = new Date().toISOString();
    row.status_motivo = `definido à mão por ${user.email ?? "alguém"}`;
  }

  // Nada gravável: responder "salvo" aqui fazia a tela confirmar um save que não aconteceu.
  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: "Nenhum campo válido para salvar." }, { status: 400 });
  }

  // CONTA META NÃO MUDA DE DONO EM SILÊNCIO (21/10/2026). Antes, vincular uma conta que já era de
  // outro cliente passava a linha de ad_accounts para este (upsert + gatilho): alerta de verba,
  // digest e portal de um cliente iam para o outro, e o antigo seguia com a conta na ficha. Agora:
  // mesma conta = não mexe em ninguém; conta de outro = 409 com o nome dele, a menos que a tela
  // mande `transferirContaMeta` depois de mostrar isso a quem clicou.
  let transferidaDe: DonoConta[] = [];
  let contaParaEspelhar: string | null = null;
  if (typeof row.meta_ad_account_id === "string") {
    const conta = normalizarContaMeta(row.meta_ad_account_id as string)!;
    const { data: atual, error: errAtual } = await supabaseAdmin
      .from("clients").select("meta_ad_account_id").eq("id", id).maybeSingle();
    if (errAtual) return NextResponse.json({ error: `Não consegui conferir a conta atual do cliente: ${errAtual.message}` }, { status: 500 });
    if (!atual) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    let donos: DonoConta[];
    try {
      donos = await donosDaConta(conta);
    } catch (e) {
      // Sem saber de quem é, não vincula: "não consegui ler" não pode virar "está livre".
      console.error("[clients/update] dono da conta:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Não consegui conferir de quem é esta conta de anúncio agora. Nada foi salvo — tente de novo em instantes." }, { status: 503 });
    }
    const decisao = decidirVinculo({ clientId: id, contaAtual: atual.meta_ad_account_id as string | null, contaNova: conta, donos, transferir: transferirContaMeta === true });
    if (decisao.acao === "recusar") {
      return NextResponse.json({
        error: decisao.erro, codigo: "conta_de_outro_cliente",
        donos: decisao.donos.map((d) => ({ clientId: d.clientId, nome: d.nome, ativo: d.ativo })),
      }, { status: 409 });
    }
    if (decisao.acao === "manter") {
      // Fora do UPDATE: com a coluna no SET, o gatilho rodava de novo e tomava a linha de quem a tivesse.
      delete row.meta_ad_account_id;
    } else {
      row.meta_ad_account_id = conta;
      contaParaEspelhar = conta;
      // Conta nova sem nome vindo junto: o nome da antiga não pode ficar contando outra história.
      if (updates.metaAdAccountName === undefined) row.meta_ad_account_name = null;
      if (decisao.acao === "transferir") transferidaDe = decisao.de;
    }
    // Só a conta (repetida) veio: já está gravada — dizer "salvo" é verdade.
    if (Object.keys(row).length === 0) return NextResponse.json({ success: true, semMudanca: true });
  }

  try {
    if (transferidaDe.length && contaParaEspelhar) {
      const erroSoltar = await soltarConta(contaParaEspelhar, transferidaDe);
      if (erroSoltar) return NextResponse.json({ error: `Não consegui tirar a conta de ${transferidaDe.map((d) => d.nome).join(" e ")}: ${erroSoltar}. Nada foi transferido.` }, { status: 500 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from("clients")
      .update(row)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (transferidaDe.length) await devolverConta(transferidaDe);
      // 23505 = o gatilho (20261021150000) recusou: a conta é de outro cliente ativo.
      if (error.code === "23505") return NextResponse.json({ error: error.message, codigo: "conta_de_outro_cliente" }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Verba numa fonte só (25/10/2026): o alerta de saldo, o ritmo da verba e os alarmes leem
    // ad_accounts.monthly_budget; esta tela gravava só no cadastro e as duas divergiam (MAX Contabilidade:
    // R$ 1.000 na ficha, nada na conta). Zero ou vazio = sem verba.
    if ("monthly_budget" in row) {
      const v = Number(row.monthly_budget);
      const { error: verbaErr } = await supabaseAdmin.from("ad_accounts")
        .update({ monthly_budget: Number.isFinite(v) && v > 0 ? v : null }).eq("client_id", id);
      if (verbaErr) return NextResponse.json({ error: `Verba gravada na ficha, mas não no alerta de verba: ${verbaErr.message}. Salve de novo.` }, { status: 500 });
    }

    // Desvincular: o gatilho trg_sincronizar_ad_account só espelha conta preenchida, então a linha
    // em ad_accounts (que o alerta de verba e o digest leem) sai aqui.
    if (row.meta_ad_account_id === null) {
      const { error: unlinkErr } = await supabaseAdmin.from("ad_accounts").delete().eq("client_id", id);
      if (unlinkErr) return NextResponse.json({ error: `Conta desvinculada do cliente, mas não da carteira de tráfego: ${unlinkErr.message}` }, { status: 500 });
    }

    // Conta nova (já liberada acima): o espelho em ad_accounts fica com este cliente. Antes os dois
    // passos aqui não conferiam erro — a ficha dizia "vinculada" e o alerta de verba não sabia.
    if (contaParaEspelhar) {
      const erroEspelho = await espelharConta(id, contaParaEspelhar, (row.meta_ad_account_name as string | null) ?? null);
      if (erroEspelho) {
        return NextResponse.json({ error: `Conta gravada na ficha, mas não entrou no alerta de verba/saldo: ${erroEspelho}. Vincule de novo.` }, { status: 500 });
      }
    }

    if (transferidaDe.length && contaParaEspelhar) {
      const para = ((updated?.nome_fantasia as string) || (updated?.name as string) || "outro cliente");
      const ator = user.email ?? "alguém";
      console.warn(`[clients/update] ${ator} transferiu ${contaParaEspelhar} de ${transferidaDe.map((d) => d.nome).join(", ")} para ${para}`);
      await Promise.all([
        ...transferidaDe.map((d) => registrarHistorico({
          clientId: d.clientId, tipo: "manual", ator,
          descricao: `Conta de anúncio ${contaParaEspelhar} transferida para ${para}`,
        })),
        registrarHistorico({
          clientId: id, tipo: "manual", ator,
          descricao: `Conta de anúncio ${contaParaEspelhar} veio de ${transferidaDe.map((d) => d.nome).join(" e ")}`,
        }),
      ]);
    }

    // Rascunho saindo (draft_status apagado) = o cliente virou cliente: link do portal + aviso no grupo
    // de cadastro. A função manda uma vez só por cliente — cliente que já era ativo não recebe de novo.
    if ("draft_status" in row && row.draft_status === null) dispararLinkDoPortal(id, "aprovacao");

    return NextResponse.json({
      success: true, client: updated,
      ...(transferidaDe.length ? { transferidaDe: transferidaDe.map((d) => ({ clientId: d.clientId, nome: d.nome })) } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
