// app/ficha/[token]/page.tsx — página PÚBLICA da Ficha Viva. Valida só a existência do token
// (sem revelar nada do cliente) e entrega o componente, que pede o PIN antes de mostrar dados.
// Token inválido/revogado → 404 (not-found co-localizado).

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import FichaVivaClient from "@/components/fichaviva/FichaVivaClient";

export const dynamic = "force-dynamic";

export default async function FichaVivaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Toca uma API dinâmica por request (com o not-found.tsx co-localizado, garante 404 real).
  await headers();

  // Token é sempre UUID — valida antes do .or() (evita injeção de filtro no PostgREST)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound();

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("ficha_viva_enabled, ficha_viva_token_revoked_at")
    .or(`ficha_viva_token.eq.${token},ficha_viva_raiox_token.eq.${token}`)
    .single();

  if (!client || !client.ficha_viva_enabled || client.ficha_viva_token_revoked_at) {
    notFound();
  }

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <FichaVivaClient token={token} />
    </>
  );
}
