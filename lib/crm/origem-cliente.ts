// Canal de venda do Comercial ↔ "Como conheceu?" do cadastro do cliente.
//
// O lead guarda o canal como TEXTO ("Indicação", "Anúncio → site", "Visita — Rota Lagos"…), mas a coluna
// clients.lead_source é um enum do banco com só 4 valores. Gravar o texto direto derrubava a conversão
// Ganho → cadastro com `invalid input value for enum lead_source: "Indicação"` (11/11/2026, Rop Parabrisas):
// nenhum cliente nascia, nenhum link saía. Tudo que cruza essa fronteira passa por aqui.
import type { LeadSource } from "@/lib/types";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Canal do lead → valor aceito pelo enum. Vazio → null (o cadastro fica sem origem); desconhecido → "outros". */
export function leadSourceDaOrigem(origem: string | null | undefined): LeadSource | null {
  const o = semAcento(origem ?? "");
  if (!o) return null;
  if (o === "indicacao" || o === "trafego" || o === "organico" || o === "outros") return o;
  if (/indica|parceri/.test(o)) return "indicacao";
  // "Anúncio → site" é tráfego mesmo terminando em site: confere o anúncio antes do site.
  if (/anuncio|trafego|meta ads|google ads|\bads\b/.test(o)) return "trafego";
  if (/site|instagram|whats|organic/.test(o)) return "organico";
  return "outros";
}

/** Caminho inverso (venda registrada depois para um cliente que já existia): enum → canal do Comercial. */
export function origemDoLeadSource(ls: string | null | undefined): string | null {
  switch (ls) {
    case "indicacao": return "Indicação";
    case "trafego": return "Tráfego pago";
    case "organico": return "Outro"; // não diz se foi site, Instagram ou WhatsApp
    case "outros": return "Outro";
    default: return null;
  }
}
