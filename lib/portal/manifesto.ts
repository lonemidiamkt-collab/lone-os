// lib/portal/manifesto.ts — o "aplicativo" do Painel de Resultados na tela inicial do cliente (19/11/2026).
//
// O manifesto do site (public/manifest.json) é o do time: chama "Lone OS" e abre em "/", a tela de login da
// equipe. O cliente que tocava em "Adicionar à tela inicial" a partir do portal ganhava um ícone "Lone OS"
// que abria o login interno — um aplicativo que ele não consegue usar. Aqui cada link tem o próprio
// manifesto: abre no painel DELE e leva o nome da empresa dele.

/** Cores de fundo do portal (as mesmas de --background em app/globals.css) — manifesto não lê CSS. */
export const FUNDO_PORTAL = { escuro: "#111318", claro: "#f4f5f8" } as const;

export interface ManifestoDoPortal {
  name: string;
  short_name: string;
  description: string;
  lang: string;
  start_url: string;
  scope: string;
  id: string;
  display: "standalone";
  orientation: "portrait-primary";
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: "any" | "maskable" }[];
}

export function manifestoDoPortal(token: string, nomeDoCliente: string): ManifestoDoPortal {
  const inicio = `/portal/${encodeURIComponent(token)}`;
  const nome = nomeDoCliente.trim() || "Cliente";
  return {
    name: `Resultados · ${nome}`,
    // Embaixo do ícone cabem ~12 letras: o nome da empresa cortaria. "Resultados" diz o que é.
    short_name: "Resultados",
    description: `Painel de resultados da ${nome} com a Lone Mídia`,
    lang: "pt-BR",
    start_url: inicio,
    // Só o painel deste link: um toque em link de fora (WhatsApp da equipe) abre no navegador, não dentro do app.
    scope: inicio,
    id: inicio,
    display: "standalone",
    orientation: "portrait-primary",
    background_color: FUNDO_PORTAL.escuro,
    theme_color: FUNDO_PORTAL.escuro,
    // "any" e "maskable" separados: juntos, o Android recorta o ícone comum como se fosse mascarável.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
