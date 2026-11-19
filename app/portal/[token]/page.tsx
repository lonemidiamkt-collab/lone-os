import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { obterSnapshot } from "@/lib/portal/snapshotCache";
import { lerIgDoCache, paraOPortal } from "@/lib/meta/igSnapshot";
import type { SnapshotData } from "@/lib/portal/types";
import { WHATSAPP_EQUIPE } from "@/lib/portal/contato";
import PortalDashboard from "@/components/portal/PortalDashboard";
import { clienteDoLink, lerLinkDoPortal, type LinhaDeAcesso } from "@/lib/portal/token";
import { abaValida, abasDisponiveis, paraPeriodKind, periodoValido } from "@/lib/portal/navegacao";
import { FUNDO_PORTAL } from "@/lib/portal/manifesto";
import PortalIndisponivel from "@/components/portal/PortalIndisponivel";
import { temColunasGoogle } from "@/lib/google/colunas";
import { temGoogleNoRelatorio } from "@/lib/google/relatorio-dados";
import { clientesComCrm } from "@/lib/crm-externo/servidor";

export const dynamic = "force-dynamic";

// O portal é do CLIENTE (19/11/2026): título, ícone na tela inicial e manifesto próprios. Antes herdava tudo
// do painel do time — a aba do navegador dizia "Lone OS" e "Adicionar à tela inicial" criava um ícone
// "Lone OS" que abria o login da equipe (public/manifest.json tem start_url "/").
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const lido = await clienteDoLink(token).catch(() => null);
  const robots = { index: false, follow: false };
  if (lido?.estado !== "ok") return { title: "Painel de Resultados · Lone Mídia", robots };
  return {
    title: `${lido.linha.nome} · Painel de Resultados`,
    description: "Seus resultados com a Lone Mídia",
    manifest: `/portal/${encodeURIComponent(token)}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Resultados" },
    robots,
  };
}

// Zoom liberado no portal: o painel do time trava (app/layout.tsx), mas quem abre aqui é o dono da loja, no
// celular, e precisa poder ampliar um número. A barra do sistema acompanha o fundo da página, não o azul.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: true,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: FUNDO_PORTAL.escuro },
    { media: "(prefers-color-scheme: light)", color: FUNDO_PORTAL.claro },
  ],
};

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const busca = await searchParams;
  const daBusca = (k: string) => { const v = busca[k]; return typeof v === "string" ? v : undefined; };

  // Valida token
  // EX-CLIENTE NÃO VÊ MAIS (23/09): desativar/arquivar o cliente parava o sync, as mensagens e a
  // carteira do time — mas NÃO o link público. Três ex-clientes (Dinho Cell, Dr. Cauana Barboza,
  // Quero Tintas) seguiam com o painel de resultados aberto, servindo dado da conta deles.
  // BANCO QUE OSCILA NÃO É LINK INVÁLIDO (26/10/2026): a queda de 16/10 e o soluço de 22/10 deram
  // "página não encontrada" em links que funcionam — e o time ouviu "o link do painel não funciona".
  // Agora a falha de leitura mostra "não consegui abrir agora, tente de novo" (lib/portal/token.ts).
  // As colunas do Google só entram no select depois da migração aplicada (lib/google/colunas.ts): pedir coluna
  // que não existe derrubaria o portal de TODO cliente.
  const comGoogle = await temColunasGoogle();
  const lido = await lerLinkDoPortal<LinhaDeAcesso & Record<string, unknown> & { id: string }>(token,
    `id, name, nome_fantasia, whatsapp_team_phone, portal_welcome_message, service_type, meta_ad_account_id, ig_business_account_id, ig_public_username, status, join_date${comGoogle ? ", google_ads_customer_id, google_perfil_local" : ""}`);
  if (lido.estado === "indisponivel") return <PortalIndisponivel />;
  if (lido.estado === "invalido") notFound();
  const client = lido.linha;

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

  // Google: Perfil da Empresa sempre que vinculado; Google Ads só com contrato de tráfego (a regra do relatório).
  const g = comGoogle ? temGoogleNoRelatorio({
    id: client.id, service_type: (client.service_type as string) ?? null,
    google_ads_customer_id: (client.google_ads_customer_id as string) ?? null, google_perfil_local: (client.google_perfil_local as string) ?? null,
  }) : { ads: false, perfil: false };
  const hasGoogle = g.ads || g.perfil;
  // CRM conectado e ativo → aba "Atendimento e vendas". Falha ao conferir = sem a aba (o resto do portal abre).
  const hasCrm = await clientesComCrm([client.id as string]).then((s) => s.has(client.id as string)).catch(() => false);

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

  // Área e período do endereço (`?aba=google&p=14d`), validados contra o que este cliente tem.
  const abaInicial = abaValida(daBusca("aba"), abasDisponiveis({ hasAds, hasGoogle, hasCrm, hasSocial }));
  const periodoInicial = periodoValido(daBusca("p"), abaInicial);

  // Snapshot inicial (do período do endereço; 7 dias se não vier) pelo MESMO caminho da rota: respeita a
  // idade do cache. Falhou a Meta → vem "indisponivel" e a tela diz "atualizando".

  let initialData: SnapshotData | null = null;
  if (hasAds) {
    try {
      initialData = await obterSnapshot(client.id as string, paraPeriodKind(periodoInicial));
    } catch (err) {
      console.error("[portal] falhou o snapshot inicial:", client.id, String(err));
    }
  }

  // Instagram de 7 dias já no HTML, SÓ do que está guardado (04/11/2026): a aba "Crescimento nas redes"
  // abria em branco e esperava a Meta ao vivo. Sem cache, a geração começa por trás agora mesmo e o
  // navegador pega o resultado quando o cliente clicar na aba.
  let initialIg: ReturnType<typeof paraOPortal> | null = null;
  const temIg = !!client.ig_business_account_id || !!client.ig_public_username;
  if (hasSocial && temIg) {
    try {
      const ig = await lerIgDoCache(client.id as string, "7d");
      initialIg = ig ? paraOPortal(ig) : null;
    } catch (err) {
      console.error("[portal] falhou o Instagram inicial:", client.id, String(err));
    }
  }

  // Data do rodapé calculada aqui, em SP: `new Date()` no render divergia entre servidor (UTC) e celular.
  const mesRelatorio = new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

  return (
    <>
      <PortalDashboard
        token={token}
        clientId={client.id as string}
        clientName={(client.nome_fantasia as string) || (client.name as string)}
        whatsappPhone={(client.whatsapp_team_phone as string) || WHATSAPP_EQUIPE}
        welcomeMessage={(client.portal_welcome_message as string) || null}
        initialData={initialData}
        initialIg={initialIg}
        hasAds={hasAds}
        hasSocial={hasSocial}
        hasIg={!!client.ig_business_account_id}
        hasGoogle={hasGoogle}
        hasCrm={hasCrm}
        comecando={!hasAds && !temIg && !hasGoogle && !hasCrm}
        desde={(client.join_date as string) ?? null}
        aprovacaoLigada={process.env.PORTAL_APROVACAO_CLIENTE === "on"}
        mesRelatorio={mesRelatorio}
        abaInicial={abaInicial}
        periodoInicial={periodoInicial}
      />
    </>
  );
}
