export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const results: string[] = [];

  // 1. Find clients without interaction in 10+ days
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, nome_fantasia, assigned_traffic, assigned_social, status, draft_status")
    .is("draft_status", null)
    .neq("status", "onboarding");

  if (!clients || clients.length === 0) {
    return NextResponse.json({ message: "No active clients", results });
  }

  for (const client of clients) {
    // Check last interaction
    const { data: lastInteraction } = await supabase
      .from("interaction_logs")
      .select("logged_at")
      .eq("client_id", client.id)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check last timeline activity
    const { data: lastTimeline } = await supabase
      .from("timeline_entries")
      .select("created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastActivity = lastInteraction?.logged_at || lastTimeline?.created_at;
    if (!lastActivity) continue;

    const daysSince = Math.ceil((Date.now() - new Date(lastActivity).getTime()) / 86400000);

    if (daysSince >= 10) {
      // Check if followup already exists for this client
      const { data: existing } = await supabase
        .from("followup_tasks")
        .select("id")
        .eq("client_id", client.id)
        .eq("type", "inactivity")
        .eq("status", "pending")
        .maybeSingle();

      if (!existing) {
        const assignedTo = client.assigned_traffic || client.assigned_social || "Admin";
        const clientName = client.nome_fantasia || client.name;

        await supabase.from("followup_tasks").insert({
          client_id: client.id,
          type: "inactivity",
          assigned_to: assignedTo,
          auto_generated: true,
        });

        await supabase.from("notifications").insert({
          type: "system",
          title: `Cliente sem interacao: ${clientName}`,
          body: `${clientName} esta ha ${daysSince} dias sem contato. Agende um alinhamento.`,
          client_id: client.id,
        });

        await supabase.from("timeline_entries").insert({
          client_id: client.id,
          type: "manual",
          actor: "Sistema",
          description: `Alerta automatico: ${daysSince} dias sem interacao. Follow-up atribuido a ${assignedTo}.`,
          timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        });

        results.push(`${clientName}: ${daysSince}d sem contato → follow-up criado para ${assignedTo}`);
      }
    }
  }

  return NextResponse.json({ message: `Checked ${clients.length} clients`, results });
}
