// lib/clients/servico.ts — O QUE O CLIENTE COMPROU. Fonte única para "esse cliente tem tráfego?"
// e "esse cliente tem social?".
//
// Roberto, 11/09/2026: "você ainda segue mandando mensagem de avisos de tráfego pago para clientes
// que não são de anúncios e isso é muito prejudicial, eu já passei isso algumas vezes mas ainda não
// foi seguido. Esse erro aconteceu hoje com o cliente Dumar."
//
// A causa era real e específica: `app/api/system/client-messages/route.ts` decidia o texto por
//   c.meta_ad_account_id ? mensagemDeTrafego : mensagemSocial
// ou seja, por "existe uma conta de anúncio vinculada", não por "tráfego foi vendido". O Dumar é
// `assessoria_social` E tem `meta_ad_account_id = act_2350633382029247` — é o ÚNICO só-social do
// banco nessa situação, e por isso era o único a receber mensagem errada. Duas foram enviadas ao
// grupo dele: "…nosso lado anúncios…" (11/09) e "…de olho nas campanhas…" (09/09).
//
// Conta de anúncio vinculada NÃO significa tráfego contratado: ela pode existir de um contrato
// antigo, de leitura de métrica, ou de alguém ter vinculado para ver número. `assigned_traffic`
// também não serve — 3 clientes só-social têm gestor de tráfego preenchido.
//
// A ÚNICA fonte confiável é o que foi vendido: `clients.service_type`.

/** Pacotes vigentes no banco (11/09/2026: os 4 valores distintos em `clients.service_type`). */
export type TipoServico =
  | "lone_growth"          // tráfego + social + site
  | "assessoria_trafego"   // só tráfego
  | "assessoria_social"    // só social
  | "trafego_pago"         // só tráfego (nome legado)
  | "trafego_social_site"  // tráfego + social + site (nome legado)
  | "assessoria_design"    // só design
  | "site";                // só site

/** Pacotes que INCLUEM gestão de anúncios. */
const COM_TRAFEGO = new Set<string>([
  "lone_growth",
  "assessoria_trafego",
  "trafego_pago",
  "trafego_social_site",
]);

/** Pacotes que INCLUEM produção de conteúdo/social. */
const COM_SOCIAL = new Set<string>([
  "lone_growth",
  "assessoria_social",
  "trafego_social_site",
  "assessoria_design",
]);

/** O mínimo que a regra precisa saber do cliente. */
export interface ClienteServico {
  service_type?: string | null;
}

/**
 * O cliente contratou gestão de anúncios?
 *
 * Na dúvida devolve FALSE. É deliberado: falar de campanha com quem não tem campanha é o erro
 * caro — chega ao cliente e queima a agência. Não falar de campanha com quem tem é recuperável
 * pelo gestor, que conversa com ele todo dia.
 */
export function temTrafego(c: ClienteServico): boolean {
  const t = (c.service_type ?? "").trim().toLowerCase();
  return COM_TRAFEGO.has(t);
}

/** O cliente contratou social/conteúdo? Mesma regra de prudência: na dúvida, false. */
export function temSocial(c: ClienteServico): boolean {
  const t = (c.service_type ?? "").trim().toLowerCase();
  return COM_SOCIAL.has(t);
}

/**
 * Pode receber mensagem que fale de anúncio, campanha, verba ou resultado de mídia paga?
 *
 * Use ANTES de qualquer envio ao grupo do cliente que toque nesses assuntos. Um
 * `meta_ad_account_id` preenchido não autoriza — só o contrato autoriza.
 */
export function podeFalarDeAnuncio(c: ClienteServico): boolean {
  return temTrafego(c);
}

/** Rótulo curto para log e para a tela de vistoria. */
export function rotuloServico(c: ClienteServico): string {
  const trafego = temTrafego(c), social = temSocial(c);
  if (trafego && social) return "tráfego + social";
  if (trafego) return "só tráfego";
  if (social) return "só social";
  return "indefinido";
}
