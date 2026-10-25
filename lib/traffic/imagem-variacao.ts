// lib/traffic/imagem-variacao.ts — o prompt que trava o que não muda numa variação de anúncio, e a chave
// que liga a geração de imagem (agency_settings.ia_imagem).
//
// A geração em si mora em lib/ia/arte-do-cliente.ts (usada pelo designer na demanda e pelo gestor de
// tráfego na prévia). A versão antiga daqui, gerarVariacoesImagem, não tinha mais quem chamasse e saiu
// na faxina dos agentes de 25/10/2026.

export function promptTravado(mantem: string, muda: string): string {
  return [
    `Crie uma VARIAÇÃO deste anúncio de loja local para teste A/B.`,
    `MANTER EXATAMENTE (elementos travados): ${mantem || "todos os textos, preço, produto, logo, hierarquia e chamada para ação"}.`,
    `ALTERAR APENAS: ${muda || "o cenário/fundo"}.`,
    `Não invente textos novos, não mude preços, não remova a logo, não troque o produto. Mesmo formato vertical de anúncio, mesma legibilidade. Estilo de peça publicitária brasileira de comércio local.`,
  ].join("\n");
}

export async function flagImagemLigada(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { data } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "ia_imagem").maybeSingle();
  return data?.value === "on";
}
