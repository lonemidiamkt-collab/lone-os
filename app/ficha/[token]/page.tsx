// app/ficha/[token]/page.tsx — página PÚBLICA da Ficha Viva do cliente (sem login, por token).
// Espelha o portal de tráfego: valida o token, e mostra ao cliente (1) o crescimento dele
// (faturamento/ticket/saúde — dados que a Lone acompanha) e (2) o diagnóstico comercial de 10
// perguntas. Não expõe dado interno (investimento/ROI) — só o resultado do negócio do cliente.

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeGrowth, type GrowthRow } from "@/lib/fichaViva/growth";
import FichaVivaClient from "@/components/fichaviva/FichaVivaClient";

export const dynamic = "force-dynamic";

export default async function FichaVivaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Toca uma API dinâmica por request (como o portal). Combinado com o not-found.tsx
  // co-localizado, é o que faz o notFound() devolver HTTP 404 pra link inválido/revogado
  // (no Next 15, sem isso, o not-found renderiza mas responde 200).
  await headers();

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, whatsapp_team_phone, portal_welcome_message, ficha_viva_enabled, ficha_viva_token_revoked_at")
    .eq("ficha_viva_token", token)
    .single();

  if (!client || !client.ficha_viva_enabled || client.ficha_viva_token_revoked_at) {
    notFound();
  }

  // Crescimento (faturamento que a Lone acompanha) — só o que é do NEGÓCIO do cliente
  const { data: fin } = await supabaseAdmin
    .from("client_financial_results")
    .select("month, revenue, vendas, ticket")
    .eq("client_id", client.id as string)
    .order("month");
  const rows: GrowthRow[] = (fin ?? []).map((r) => ({
    month: r.month as string,
    revenue: Number(r.revenue) || 0,
    vendas: r.vendas != null ? Number(r.vendas) : null,
    ticket: r.ticket != null ? Number(r.ticket) : null,
  }));
  const growth = computeGrowth(rows);

  // Já respondeu o diagnóstico? (pra mostrar estado de "recebido")
  const { count } = await supabaseAdmin
    .from("client_diagnostics")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client.id as string);

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <FichaVivaClient
        token={token}
        clientName={(client.nome_fantasia as string) || (client.name as string)}
        whatsappPhone={(client.whatsapp_team_phone as string) || "5522981530700"}
        welcomeMessage={(client.portal_welcome_message as string) || null}
        growth={growth}
        alreadyAnswered={(count ?? 0) > 0}
      />
    </>
  );
}
