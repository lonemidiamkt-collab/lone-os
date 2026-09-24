import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { obterSnapshot } from "@/lib/portal/snapshotCache";
import type { SnapshotData } from "@/lib/portal/types";
import { WHATSAPP_EQUIPE } from "@/lib/portal/contato";
import PortalDashboard from "@/components/portal/PortalDashboard";
import { estaPausado } from "@/lib/clients/pausa";

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
    .select("id, name, nome_fantasia, whatsapp_team_phone, portal_welcome_message, public_report_enabled, public_report_token_revoked_at, service_type, meta_ad_account_id, ig_business_account_id, status, join_date, active, churned_at, paused_at, paused_until")
    .eq("public_report_token", token)
    .single();

  // EX-CLIENTE NÃO VÊ MAIS (23/09): desativar/arquivar o cliente parava o sync, as mensagens e a
  // carteira do time — mas NÃO o link público. Três ex-clientes (Dinho Cell, Dr. Cauana Barboza,
  // Quero Tintas) seguiam com o painel de resultados aberto, servindo dado da conta deles.
  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at
      || client.active === false || client.churned_at || estaPausado(client)) {
    notFound();
  }

  // Pacote do cliente decide as seções do portal. Anúncios aparecem POR PADRÃO (retrocompatível e à
  // prova de valores legados/desconhecidos como "trafego_pago") — só escondemos o tráfego pra pacote
  // 100% social/design. Social/artes aparece pra quem tem social ou design no pacote.
  const st = (client.service_type as string) || "lone_growth";
  const socialOnly = ["assessoria_social", "assessoria_design"].includes(st);
  // Anúncios só aparece se o pacote permite E existe conta de anúncio DE VERDADE — senão o botão vinha
  // vazio (ex.: Dumar, pacote lone_growth mas sem conta de anúncio → só social). Robusto p/ todos.
  const hasAds = !socialOnly && !!client.meta_ad_account_id;
  // Instagram/artes aparecem quando o PACOTE prevê OU quando existe Instagram vinculado DE VERDADE.
  // Mesma lição do hasAds logo acima: lista fixa de pacote escondia valor que já estava pronto —
  // 6 clientes (assessoria_trafego e trafego_pago) tinham perfil vinculado, com seguidores e alcance
  // guardados, e o portal deles simplesmente não mostrava a aba. Do lado do cliente isso parecia
  // "o Instagram caiu". A seção de artes some sozinha quando não há entrega, então liberar aqui não
  // cria tela vazia pra quem só tem tráfego.
  const hasSocial = ["lone_growth", "assessoria_social", "assessoria_design", "trafego_social_site"].includes(st)
    || !!client.ig_business_account_id;

  // Log de acesso
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipTruncated = ip.split(".").slice(0, 3).join(".");
  const userAgent = hdrs.get("user-agent") ?? "";

  await supabaseAdmin.from("public_report_access_log").insert({
    client_id: client.id,
    token_used: token,
    // A coluna se chama ip_prefix. Com o nome errado o insert falhava calado (supabase-js devolve
    // erro, não lança) e o log de acesso do portal ficou VAZIO desde sempre — a gente não sabia se
    // o cliente tinha aberto o link nem quando.
    ip_prefix: ipTruncated || null,
    user_agent: userAgent || null,
    was_valid: true,
  });

  // Snapshot inicial (last_week) pelo MESMO caminho da rota: respeita a idade do cache. Antes pegava
  // o último gravado, de qualquer idade. Falhou a Meta → vem "indisponivel" e a tela diz "atualizando".
  let initialData: SnapshotData | null = null;
  if (hasAds) {
    try {
      initialData = await obterSnapshot(client.id as string, "last_week");
    } catch (err) {
      console.error("[portal] falhou o snapshot inicial:", client.id, String(err));
    }
  }

  // Data do rodapé calculada aqui, em SP: `new Date()` no render divergia entre servidor (UTC) e celular.
  const mesRelatorio = new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <PortalDashboard
        token={token}
        clientId={client.id as string}
        clientName={(client.nome_fantasia as string) || (client.name as string)}
        whatsappPhone={(client.whatsapp_team_phone as string) || WHATSAPP_EQUIPE}
        welcomeMessage={(client.portal_welcome_message as string) || null}
        initialData={initialData}
        hasAds={hasAds}
        hasSocial={hasSocial}
        hasIg={!!client.ig_business_account_id}
        comecando={!hasAds && !client.ig_business_account_id}
        desde={(client.join_date as string) ?? null}
        aprovacaoLigada={process.env.PORTAL_APROVACAO_CLIENTE === "on"}
        mesRelatorio={mesRelatorio}
      />
    </>
  );
}
