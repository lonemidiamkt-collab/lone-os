// lib/cs/handoff.ts — handoff COMERCIAL→CS: quando o SDR fecha um lead (estágio "ganho") e ele vira
// cliente, o contexto da venda (SDR, origem, valor, o que foi prometido, histórico) ANTES se perdia —
// o CS começava do zero e o cliente ouvia "o comercial prometeu X e vocês nem sabiam". Aqui esse
// contexto é montado em (1) uma NOTA pra ficha da jornada (client_journey.notas) e (2) uma MENSAGEM
// pro grupo interno do CS. Funções puras (testáveis) — não tocam banco nem rede.

export interface LeadHandoff {
  empresa?: string | null;
  contato_nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  valor_orcamento?: number | null;
  origem?: string | null;
  responsavel?: string | null; // o SDR que fechou
  observacoes?: string | null;
}

export interface AtividadeHandoff {
  tipo: string; // nota | ligacao | whatsapp | email | reuniao | etapa
  texto: string;
  created_at?: string | null;
}

const brl = (v?: number | null): string =>
  typeof v === "number" && v > 0
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : "";

// Só o histórico com CONTEÚDO (nota/ligação/whatsapp/reunião) — "etapa" é ruído de movimentação de card.
const RELEVANTE = new Set(["nota", "ligacao", "whatsapp", "reuniao", "email"]);
function historicoUtil(atividades: AtividadeHandoff[]): string[] {
  return atividades
    .filter((a) => RELEVANTE.has(a.tipo) && (a.texto || "").trim())
    .map((a) => a.texto.trim())
    .slice(0, 8);
}

export function nomeDoLead(lead: LeadHandoff): string {
  return (lead.empresa || lead.contato_nome || "Novo cliente").trim();
}

/** Nota persistida em client_journey.notas — a memória do que o comercial vendeu, pro CS ler na ficha. */
export function montarNotaHandoff(lead: LeadHandoff, atividades: AtividadeHandoff[] = []): string {
  const linhas: string[] = ["🤝 Handoff do comercial (cliente recém-fechado)."];
  if (lead.responsavel) linhas.push(`Fechado por: ${lead.responsavel}`);
  if (lead.origem) linhas.push(`Origem: ${lead.origem}`);
  const val = brl(lead.valor_orcamento);
  if (val) linhas.push(`Valor negociado: ${val}`);
  const contato = [lead.contato_nome, lead.telefone].filter(Boolean).join(" · ");
  if (contato) linhas.push(`Contato: ${contato}`);
  if (lead.email) linhas.push(`E-mail: ${lead.email}`);
  if (lead.observacoes?.trim()) linhas.push(`\nObservações do comercial:\n${lead.observacoes.trim()}`);
  const hist = historicoUtil(atividades);
  if (hist.length) {
    linhas.push(`\nHistórico do comercial:`);
    hist.forEach((t) => linhas.push(`• ${t}`));
  }
  return linhas.join("\n");
}

/** Mensagem no grupo interno do CS — avisa que entrou cliente novo e como iniciar o onboarding. */
export function montarMensagemGrupoHandoff(lead: LeadHandoff): string {
  const nome = nomeDoLead(lead);
  const partes: string[] = [`🤝 *Cliente novo fechado pelo comercial: ${nome}*`];
  const linha2 = [
    lead.responsavel ? `Vendido por *${lead.responsavel}*` : "",
    lead.origem ? `origem ${lead.origem}` : "",
  ].filter(Boolean).join(" · ");
  if (linha2) partes.push(linha2 + ".");
  if (lead.observacoes?.trim()) {
    partes.push(`\n📋 O comercial registrou:\n_${lead.observacoes.trim().slice(0, 400)}_`);
  }
  partes.push(
    `\n👉 Próximo passo: *iniciar o onboarding*. Quando ele entrar no grupo, me avise: ` +
    `_"Lone, entrou o cliente ${nome} no grupo <nome do grupo>"_ que eu conduzo as perguntas.`,
  );
  return partes.join("\n");
}
