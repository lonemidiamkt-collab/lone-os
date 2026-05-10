export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;

  const row: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updates)) {
    if (val === undefined || val === null) continue;
    const col = FIELD_MAP[key] ?? key;
    row[col] = val;
  }

  if (Object.keys(row).length === 0) return NextResponse.json({ success: true });

  try {
    const { error } = await supabaseAdmin.from("clients").update(row).eq("id", id as string);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
