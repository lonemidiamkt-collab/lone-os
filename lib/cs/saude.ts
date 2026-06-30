// lib/cs/saude.ts — 3ª função do agente: saúde/risco de churn do cliente. Avalia sinais (reclamação,
// status, sem postagem, retração) e gera um digest dos clientes em risco pra equipe. Puro/testável.

export interface SinaisSaude {
  status: string;              // clients.status (good|average|at_risk|onboarding)
  reclamacaoRecente: boolean;  // reclamou nos últimos 14d
  retracaoRecente: boolean;    // cancelou/pausou pauta nos últimos 14d
  diasSemPost: number | null;  // dias desde a última postagem publicada (null = nunca postou)
}

export interface AvaliacaoSaude {
  cliente: string;
  risco: "alto" | "medio" | "baixo";
  motivos: string[];
}

export function avaliarSaude(cliente: string, s: SinaisSaude): AvaliacaoSaude {
  const motivos: string[] = [];
  let alto = false;
  if (s.reclamacaoRecente) { motivos.push("reclamou nos últimos 14 dias"); alto = true; }
  if (s.status === "at_risk") { motivos.push("marcado como 'em risco'"); alto = true; }
  if (s.retracaoRecente) { motivos.push("cancelou/pausou pauta recentemente"); alto = true; }
  // "Parou de postar" só conta pra quem JÁ postou e ficou em silêncio (>21d). Quem nunca teve post
  // publicado NÃO é flag — o rastreio de posts é incompleto (nem tudo é marcado "published"), seria ruído.
  if (s.diasSemPost !== null && s.diasSemPost > 30) { motivos.push(`${s.diasSemPost} dias sem postagem`); alto = true; }
  else if (s.diasSemPost !== null && s.diasSemPost > 21) { motivos.push(`${s.diasSemPost} dias sem postagem`); }

  const risco: AvaliacaoSaude["risco"] = alto ? "alto" : motivos.length ? "medio" : "baixo";
  return { cliente, risco, motivos };
}

const EMOJI = { alto: "🔴", medio: "🟡", baixo: "🟢" } as const;

export function formatSaudeDigest(avaliacoes: AvaliacaoSaude[], periodoLabel: string): string {
  const emRisco = avaliacoes
    .filter((a) => a.risco !== "baixo")
    .sort((a, b) => (a.risco === "alto" ? 0 : 1) - (b.risco === "alto" ? 0 : 1));
  if (emRisco.length === 0) {
    return `🩺 *Saúde dos clientes* — ${periodoLabel}\n\nNenhum cliente em risco aparente. Carteira saudável! 🟢`;
  }
  const linhas = [
    `🩺 *Saúde dos clientes* — ${periodoLabel}`,
    ``,
    `${emRisco.length} cliente${emRisco.length === 1 ? "" : "s"} pedindo atenção:`,
    ``,
  ];
  for (const a of emRisco) {
    linhas.push(`${EMOJI[a.risco]} *${a.cliente}* — ${a.motivos.join("; ")}`);
  }
  linhas.push(``, `_Vale um contato proativo com os 🔴 antes que vire churn._`);
  return linhas.join("\n");
}
