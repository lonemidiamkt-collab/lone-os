export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { normalizarEmail, mensagemDadosInvalidos } from "@/lib/clients/email";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { dispararLinkDoPortal } from "@/lib/portal/link-automatico";

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
  nomeFantasia: "nome_fantasia", nicho: "nicho",
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

  const { id, ...updates } = parsed.data;

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

  try {
    const { data: updated, error } = await supabaseAdmin
      .from("clients")
      .update(row)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Desvincular: o gatilho trg_sincronizar_ad_account só espelha conta preenchida, então a linha
    // em ad_accounts (que o alerta de verba e o digest leem) sai aqui.
    if (row.meta_ad_account_id === null) {
      const { error: unlinkErr } = await supabaseAdmin.from("ad_accounts").delete().eq("client_id", id);
      if (unlinkErr) return NextResponse.json({ error: `Conta desvinculada do cliente, mas não da carteira de tráfego: ${unlinkErr.message}` }, { status: 500 });
    }

    // Sincroniza ad_accounts quando meta_ad_account_id muda
    if (row.meta_ad_account_id) {
      const accountId = String(row.meta_ad_account_id);
      // Remove entradas antigas deste cliente (evita duplicatas que quebram .single())
      await supabaseAdmin.from("ad_accounts").delete().eq("client_id", id).neq("meta_account_id", accountId);
      // Upsert da entrada correta
      await supabaseAdmin.from("ad_accounts").upsert(
        { client_id: id, meta_account_id: accountId },
        { onConflict: "meta_account_id" },
      );
    }

    // Rascunho saindo (draft_status apagado) = o cliente virou cliente: link do portal + aviso no grupo
    // de cadastro. A função manda uma vez só por cliente — cliente que já era ativo não recebe de novo.
    if ("draft_status" in row && row.draft_status === null) dispararLinkDoPortal(id, "aprovacao");

    return NextResponse.json({ success: true, client: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
