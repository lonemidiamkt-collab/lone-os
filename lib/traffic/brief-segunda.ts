// lib/traffic/brief-segunda.ts — MONDAY TRAFFIC BRIEF. Função pura. Cinco linhas por conta e UMA
// proposta concreta no fim, terminando em ação — como o plano V2 adotou e o brief de 14/09 imaginou:
// "Júlio, encontrei três alterações importantes. (...) Posso mandar para o designer?"

export interface ContaDoBrief {
  cliente: string;
  status: string | null;                    // good | average | at_risk | onboarding
  gasto7d: number; conversas7d: number; cpl7d: number | null; cplMeta: number | null;
  vencedor: { adName: string; evidencia: string; adId: string; variacao?: { nome: string; muda: string; mantem: string; testa: string } | null } | null;
  atencao: { adName: string; evidencia: string }[];     // críticos / cansaço
  oportunidade: string | null;                           // do feed (recomendação de tráfego)
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const STATUS: Record<string, string> = { good: "bons resultados", average: "resultado médio", at_risk: "resultado ruim", onboarding: "onboarding" };

export function linhasDaConta(c: ContaDoBrief): string {
  const estado = `${STATUS[c.status ?? ""] ?? "sem status"} · ${brl(c.gasto7d)} em 7d · ${c.conversas7d} conversas${c.cpl7d != null ? ` · ${brl(c.cpl7d)}/conversa${c.cplMeta ? ` (meta ${brl(c.cplMeta)})` : ""}` : ""}`;
  const venc = c.vencedor ? `🏆 ${c.vencedor.adName}: ${c.vencedor.evidencia}` : "🏆 sem vencedor com amostra esta semana";
  const at = c.atencao.length ? `⚠️ ${c.atencao.slice(0, 2).map((a) => `${a.adName}: ${a.evidencia}`).join(" | ")}` : "⚠️ nada crítico";
  const op = c.oportunidade ? `💡 ${c.oportunidade}` : "💡 sem oportunidade nova no feed";
  const faz = c.vencedor?.variacao ? `→ testar "${c.vencedor.variacao.nome}" (${c.vencedor.variacao.muda})` : c.atencao.length ? "→ revisar os anúncios em atenção" : c.oportunidade ? "→ agir na oportunidade do feed" : "→ manter";
  return [`*${c.cliente}*`, estado, venc, at, op, faz].join("\n");
}

export interface Proposta { adId: string; cliente: string; adName: string; variacao: { nome: string; muda: string; mantem: string; testa: string } }

/** A proposta da semana: o melhor vencedor com hipótese pronta (uma só — o "posso mandar?"). */
export function escolherProposta(contas: ContaDoBrief[]): Proposta | null {
  for (const c of contas) if (c.vencedor?.variacao) return { adId: c.vencedor.adId, cliente: c.cliente, adName: c.vencedor.adName, variacao: c.vencedor.variacao };
  return null;
}

export function montarBrief(p: { contas: ContaDoBrief[]; semanaLabel: string; nomeGestor: string; proposta: Proposta | null; maxContas?: number }): string {
  const ordenadas = [...p.contas].sort((a, b) => Number(!!b.vencedor) - Number(!!a.vencedor) || b.atencao.length - a.atencao.length || b.gasto7d - a.gasto7d);
  const mostradas = ordenadas.slice(0, p.maxContas ?? 12);
  const mudancas = [
    ...ordenadas.filter((c) => c.vencedor).slice(0, 2).map((c) => `• ${c.cliente}: vencedor — ${c.vencedor!.adName}`),
    ...ordenadas.filter((c) => c.atencao.length).slice(0, 2).map((c) => `• ${c.cliente}: ${c.atencao[0].adName} — ${c.atencao[0].evidencia}`),
  ].slice(0, 3);
  const cabeca = `📋 *Brief de tráfego — semana de ${p.semanaLabel}*\n${p.nomeGestor}, ${mudancas.length ? `encontrei ${mudancas.length} coisa${mudancas.length === 1 ? "" : "s"} que importa${mudancas.length === 1 ? "" : "m"} esta semana:\n${mudancas.join("\n")}` : "semana sem grandes mudanças."}`;
  const contas = mostradas.map(linhasDaConta).join("\n\n");
  const resto = ordenadas.length - mostradas.length;
  const proposta = p.proposta
    ? `\n\n🧬 *Proposta:* ${p.proposta.cliente} — o "${p.proposta.adName}" continua vencendo. A variação pronta muda só *${p.proposta.variacao.muda}* e mantém o resto (${p.proposta.variacao.mantem}). Testa: ${p.proposta.variacao.testa}.\n*Posso mandar para o designer?* Responde *pode* nesta mensagem que eu crio a demanda; *não* e eu deixo quieto.`
    : "";
  return `${cabeca}\n\n${contas}${resto > 0 ? `\n\n_+${resto} contas sem mudança relevante._` : ""}${proposta}\n\n_Detalhes: Tráfego › Saúde dos Criativos._`;
}

export function ehAprovacaoDeProposta(texto: string): boolean {
  const t = (texto ?? "").trim().toLowerCase();
  return /^(pode|pode sim|pode mandar|manda|vai|bora|ok|sim|aprovado|fechou)\b/.test(t);
}
export function ehRecusaDeProposta(texto: string): boolean {
  const t = (texto ?? "").trim().toLowerCase();
  return /^(n[aã]o|nao|nope|deixa|segura|ainda n[aã]o|espera)\b/.test(t);
}
