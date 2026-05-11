export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

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
  draftStatus: "draft_status",
};

const ClientUpdateSchema = z.object({
  id: z.string().uuid("id deve ser um UUID válido"),
  name: z.string().min(1).max(256).optional(),
  status: z.enum(["good", "average", "at_risk", "onboarding", "churned"]).optional(),
  industry: z.string().max(128).optional(),
  logo: z.string().max(512).optional(),
  attentionLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  tags: z.array(z.string()).optional(),
  monthlyBudget: z.number().nonnegative().optional(),
  paymentMethod: z.string().max(64).optional(),
  joinDate: z.string().optional(),
  contractEnd: z.string().optional(),
  lastPostDate: z.string().optional(),
  notes: z.string().max(4096).optional(),
  assignedTraffic: z.string().max(128).optional(),
  assignedSocial: z.string().max(128).optional(),
  assignedDesigner: z.string().max(128).optional(),
  toneOfVoice: z.string().max(128).optional(),
  driveLink: z.string().max(512).optional(),
  instagramUser: z.string().max(128).optional(),
  postsThisMonth: z.number().int().nonnegative().optional(),
  postsGoal: z.number().int().nonnegative().optional(),
  campaignBriefing: z.string().max(4096).optional(),
  fixedBriefing: z.string().max(4096).optional(),
  metaAdAccountId: z.string().max(64).optional(),
  metaAdAccountName: z.string().max(256).optional(),
  leadSource: z.string().max(128).optional(),
  facebookLogin: z.string().max(256).optional(),
  googleAdsLogin: z.string().max(256).optional(),
  instagramLogin: z.string().max(256).optional(),
  nomeFantasia: z.string().max(256).optional(),
  nicho: z.string().max(128).optional(),
  clientFinancePhone: z.string().max(32).optional(),
  clientPixKey: z.string().max(256).optional(),
  cpfCnpj: z.string().max(32).optional(),
  birthDate: z.string().optional(),
  phone: z.string().max(32).optional(),
  email: z.string().email().max(256).optional(),
  draftStatus: z.string().max(64).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const rawBody = await req.json().catch(() => null);
  const parsed = ClientUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { id, ...updates } = parsed.data;

  const row: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updates)) {
    if (val === undefined || val === null) continue;
    const col = FIELD_MAP[key] ?? key;
    row[col] = val;
  }

  if (Object.keys(row).length === 0) {
    // Nothing to update — return current row
    const { data } = await supabaseAdmin.from("clients").select("*").eq("id", id).single();
    return NextResponse.json({ success: true, client: data });
  }

  try {
    const { data: updated, error } = await supabaseAdmin
      .from("clients")
      .update(row)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, client: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
