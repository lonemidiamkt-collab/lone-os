// components/planejamento/pauta-card.ts — pauta do Radar → card de conteúdo pré-preenchido.
// "Vou usar" só marcava a pauta; a ideia morria ali e o social tinha que redigitar tudo no quadro.

export interface PautaParaCard {
  client_id: string;
  cliente_nome: string;
  ideia: string;
  hook: string | null;
  formato: string | null;
  roteiro: string[] | null;
  cta: string | null;
  porque_funciona: string | null;
  referencias: { url: string; perfil?: string }[];
}

/** O formato do Radar é texto livre ("Reels de 30s com…"); o quadro usa a lista curta. */
export function formatoDoCard(formato: string | null): string {
  const f = (formato ?? "").toLowerCase();
  if (/reel|v[ií]deo/.test(f)) return "Reels";
  if (/carross/.test(f)) return "Carrossel";
  if (/stor(y|ies)/.test(f)) return "Story";
  return "Post";
}

export function briefingDaPauta(p: PautaParaCard): string {
  const partes: string[] = [`**Pauta do Radar:** ${p.ideia}`];
  if (p.hook) partes.push(`**Gancho:** "${p.hook}"`);
  if (p.formato) partes.push(`**Formato sugerido:** ${p.formato}`);
  if (p.roteiro?.length) partes.push(`**Roteiro:**\n${p.roteiro.map((l, i) => `${i + 1}. ${l}`).join("\n")}`);
  if (p.cta) partes.push(`**CTA:** ${p.cta}`);
  if (p.porque_funciona) partes.push(`**Por que funciona:** ${p.porque_funciona}`);
  if (p.referencias.length) {
    partes.push(`**Referências:**\n${p.referencias.map((r) => `- [@${r.perfil ?? "perfil"}](${r.url})`).join("\n")}`);
  }
  return partes.join("\n\n");
}

/** Corpo para /api/content-cards/create. Entra em "ideias": o social decide data e ajusta. */
export function cardDaPauta(p: PautaParaCard, socialMedia: string | null, criadoPor: string) {
  return {
    clientId: p.client_id,
    clientName: p.cliente_nome,
    title: p.ideia.slice(0, 120),
    format: formatoDoCard(p.formato),
    status: "ideas",
    priority: "medium",
    briefing: briefingDaPauta(p),
    socialMedia: socialMedia || null,
    createdBy: criadoPor,
  };
}
