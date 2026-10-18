// lib/crm/notificacoes.ts — quais avisos do sino são do COMERCIAL. No casco do comercial.lonemidia.com
// o sino mostra só estes; os da operação (demanda do Agente CS, arte entregue…) ficam no painel.
// Casa pelos títulos que o próprio comercial grava (site/lead, crm-followups, crm-lead-novo, crm-meta).

const TITULOS_DO_COMERCIAL = [
  /^comercial\b/i,                              // "Comercial: 20 contatos pra fazer hoje", "Comercial — semana começando"
  /^lead novo do site/i,
  /^voltou pelo site/i,
  /^(ex-)?cliente preencheu o formul[aá]rio do site/i,
  /^lead do site sem resposta/i,
  /^\d+ leads do site sem resposta/i,
  /^meta abaixo do ritmo/i,
  /^dia \d{1,2}: a proje[cç][aã]o/i,
];

export function ehNotificacaoComercial(n: { title?: string | null }): boolean {
  const t = (n.title ?? "").trim();
  return TITULOS_DO_COMERCIAL.some((r) => r.test(t));
}
