// components/planejamento/pauta-card.ts — pauta do Radar → card de conteúdo pré-preenchido.
// "Vou usar" só marcava a pauta; a ideia morria ali e o social tinha que redigitar tudo no quadro.
// Leva 5a: "Usar esta pauta" cria o card já com cliente, título, briefing, formato e DATA SUGERIDA
// (o próximo dia de postagem livre do cliente), e a pauta fica ligada ao card.

import { proximoSlot } from "@/components/kanban/lote";

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

/**
 * Data sugerida para o card: o próximo dia de postagem (seg/qua/sex) depois de hoje que ainda não
 * tem card desse cliente. `ocupadas` = datas "YYYY-MM-DD" que o cliente já tem no board (e as que
 * outras pautas acabaram de pegar nesta sessão). Olha até ~3 meses; depois disso devolve o 1º slot.
 */
export function dataSugerida(hoje: string, ocupadas: Iterable<string> = []): string {
  const tomadas = new Set(ocupadas);
  let d = proximoSlot(hoje);
  for (let i = 0; i < 40 && tomadas.has(d); i++) d = proximoSlot(d);
  return tomadas.has(d) ? proximoSlot(hoje) : d;
}

/** Chave de idempotência: repetir o clique (ou o retry depois de uma falha) não duplica o card. */
export const chaveDaPauta = (pautaId: string) => `radar-pauta|${pautaId}`;

/** Corpo para /api/content-cards/create. Entra em "ideias", já com a data sugerida; o social ajusta. */
export function cardDaPauta(p: PautaParaCard & { id?: string }, socialMedia: string | null, criadoPor: string, dueDate?: string | null) {
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
    dueDate: dueDate ?? null,
    ...(p.id ? { idempotencyKey: chaveDaPauta(p.id) } : {}),
  };
}
