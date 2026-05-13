import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildSnapshot } from "@/lib/portal/buildSnapshot";
import PortalDashboard from "@/components/portal/PortalDashboard";

export const dynamic = "force-dynamic";

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Valida token
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, whatsapp_team_phone, portal_welcome_message, public_report_enabled, public_report_token_revoked_at")
    .eq("public_report_token", token)
    .single();

  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at) {
    notFound();
  }

  // Log de acesso
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipTruncated = ip.split(".").slice(0, 3).join(".");
  const userAgent = hdrs.get("user-agent") ?? "";

  await supabaseAdmin.from("public_report_access_log").insert({
    client_id: client.id,
    token_used: token,
    ip_truncated: ipTruncated || null,
    user_agent: userAgent || null,
    was_valid: true,
  });

  // Busca snapshot inicial (last_week) — com fallback para dados vazios
  let initialData = null;
  try {
    const { data: cached } = await supabaseAdmin
      .from("client_report_snapshots")
      .select("data")
      .eq("client_id", client.id as string)
      .eq("period_kind", "last_week")
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      initialData = cached.data;
    } else {
      initialData = await buildSnapshot({ clientId: client.id as string, periodKind: "last_week" });
    }
  } catch {}

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <PortalDashboard
        token={token}
        clientName={(client.nome_fantasia as string) || (client.name as string)}
        whatsappPhone={(client.whatsapp_team_phone as string) || "5522981530700"}
        welcomeMessage={(client.portal_welcome_message as string) || null}
        initialData={initialData}
      />
    </>
  );
}
