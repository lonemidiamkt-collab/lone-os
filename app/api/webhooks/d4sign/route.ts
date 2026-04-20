import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://supabase-kong-1:8000";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

// D4Sign status codes:
// 1 = Aguardando assinatura
// 2 = Assinado por completo
// 3 = Cancelado
// 4 = Aguardando (parcial)

const STATUS_MAP: Record<string, string> = {
  "1": "sent",
  "2": "signed",
  "3": "cancelled",
  "4": "partial",
};

export async function POST(req: NextRequest) {
  try {
    // Verify webhook authenticity via query param token
    const webhookSecret = process.env.D4SIGN_WEBHOOK_SECRET;
    if (webhookSecret) {
      const token = req.nextUrl.searchParams.get("token");
      if (token !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();

    const documentId = body.uuid || body.document_uuid;
    const statusCode = String(body.type_post || body.status || "");

    if (!documentId) {
      return NextResponse.json({ ok: true, message: "No document ID" });
    }

    const newStatus = STATUS_MAP[statusCode] || statusCode;

    // Update contract status
    const { data: contract } = await supabase
      .from("contracts")
      .update({ d4sign_status: statusCode, status: newStatus === "signed" ? "active" : newStatus === "cancelled" ? "expired" : "active" })
      .eq("d4sign_document_id", documentId)
      .select("id, client_id, version, service_type")
      .maybeSingle();

    if (contract) {
      const statusLabel = newStatus === "signed" ? "assinado" : newStatus === "cancelled" ? "cancelado" : "atualizado";

      await supabase.from("timeline_entries").insert({
        client_id: contract.client_id,
        type: "manual",
        actor: "D4Sign",
        description: `Contrato V${contract.version} ${statusLabel} via assinatura digital.`,
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });

      if (newStatus === "signed") {
        await supabase.from("notifications").insert({
          type: "system",
          title: "Contrato Assinado",
          body: `O contrato V${contract.version} foi assinado com sucesso.`,
          client_id: contract.client_id,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[D4Sign Webhook] Error:", err);
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ status: "D4Sign webhook active" });
}
