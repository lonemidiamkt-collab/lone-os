// lib/navegacao/casco.ts — COMERCIAL.LONEMIDIA.COM (out/2026): o mesmo Lone OS, com entrada e casco
// próprios para vender. Pedido do Roberto: "um subdomínio, ligado junto com o Lone Rota".
// O nginx manda os dois endereços para o mesmo app; quem decide o que aparece é o endereço:
//   • no comercial só existe o /crm (e as subpáginas: rota, importar); o resto volta para o início;
//   • "/" mostra o Comercial direto (rewrite, a barra de endereço continua limpa);
//   • API, arquivos públicos e o login funcionam igual (o login é o mesmo do Lone OS, mas a sessão é
//     de cada endereço — o navegador guarda separado).
// Módulo PURO, testado.

export function ehHostComercial(host: string | null | undefined): boolean {
  return /^comercial\./i.test((host ?? "").trim());
}

export type DestinoComercial = { tipo: "seguir" } | { tipo: "reescrever"; para: string } | { tipo: "redirecionar"; para: string };

/** O que fazer com uma PÁGINA pedida no endereço do comercial (API e arquivos públicos não passam aqui). */
export function destinoNoComercial(pathname: string): DestinoComercial {
  if (pathname === "/" || pathname === "") return { tipo: "reescrever", para: "/crm" };
  if (pathname === "/crm" || pathname.startsWith("/crm/")) return { tipo: "seguir" };
  return { tipo: "redirecionar", para: "/" };
}

/** Abas do casco do comercial. As do /crm trocam a aba da página; as outras são páginas próprias. */
export const ABAS_COMERCIAL = [
  { id: "hoje", rotulo: "Hoje", href: "/crm" },
  { id: "dashboard", rotulo: "Dashboard", href: "/crm" },
  { id: "funil", rotulo: "Funil", href: "/crm" },
  { id: "agenda", rotulo: "Agenda", href: "/crm" },
  { id: "relatorios", rotulo: "Relatórios", href: "/crm" },
  { id: "rota", rotulo: "Rota", href: "/crm/rota" },
  { id: "importar", rotulo: "Importar", href: "/crm/importar" },
] as const;
export type AbaComercial = (typeof ABAS_COMERCIAL)[number]["id"];
export const ABAS_DA_PAGINA_CRM: readonly string[] = ["hoje", "dashboard", "funil", "agenda", "relatorios"];
