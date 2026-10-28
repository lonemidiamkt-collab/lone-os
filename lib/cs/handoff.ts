// lib/cs/handoff.ts — handoff COMERCIAL→CS: quando o SDR fecha um lead (estágio "ganho") e ele vira
// cliente, o contexto da venda (SDR, origem, valor, o que foi prometido, histórico) ANTES se perdia —
// o CS começava do zero e o cliente ouvia "o comercial prometeu X e vocês nem sabiam". Aqui esse
// contexto é montado em (1) uma NOTA pra ficha da jornada (client_journey.notas) e (2) uma MENSAGEM
// pro grupo interno do CS. Funções puras (testáveis) — não tocam banco nem rede.
//
// SEM DINHEIRO (out/2026): a nota vai para a ficha do cliente, que a equipe e o agente leem, e a
// mensagem vai para o grupo interno. A linha "Valor negociado" saiu e toda quantia escrita nas
// observações/histórico vira "[valor]" (lib/texto/mascarar-valores.ts). O valor fica no comercial.

import { mascararValores } from "@/lib/texto/mascarar-valores";

export interface LeadHandoff {
  empresa?: string | null;
  contato_nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  origem?: string | null;
  responsavel?: string | null; // o SDR que fechou
  observacoes?: string | null;
}

export interface AtividadeHandoff {
  tipo: string; // nota | ligacao | whatsapp | email | reuniao | etapa
  texto: string;
  created_at?: string | null;
}

// Só o histórico com CONTEÚDO (nota/ligação/whatsapp/reunião) — "etapa" é ruído de movimentação de card.
const RELEVANTE = new Set(["nota", "ligacao", "whatsapp", "reuniao", "email"]);
function historicoUtil(atividades: AtividadeHandoff[]): string[] {
  return atividades
    .filter((a) => RELEVANTE.has(a.tipo) && (a.texto || "").trim())
    .map((a) => mascararValores(a.texto.trim()))
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
  const contato = [lead.contato_nome, lead.telefone].filter(Boolean).join(" · ");
  if (contato) linhas.push(`Contato: ${contato}`);
  if (lead.email) linhas.push(`E-mail: ${lead.email}`);
  if (lead.observacoes?.trim()) linhas.push(`\nObservações do comercial:\n${mascararValores(lead.observacoes.trim())}`);
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
    partes.push(`\n📋 O comercial registrou:\n_${mascararValores(lead.observacoes.trim()).slice(0, 400)}_`);
  }
  partes.push(
    `\n👉 Próximo passo: *iniciar o onboarding*. Quando ele entrar no grupo, me avise: ` +
    `_"Lone, entrou o cliente ${nome} no grupo <nome do grupo>"_ que eu conduzo as perguntas.`,
  );
  return partes.join("\n");
}

/**
 * O link de cadastro no grupo de cadastro (28/10/2026). O Roberto descreve o fluxo como "o sistema prepara o
 * pré-cadastro com o nome, manda o link no grupo de cadastro, eu mando ao cliente" — e o link só ia para a área de
 * transferência e para o WhatsApp do lead. Agora fica no grupo, para quem for mandar. Pura.
 */
export function blocoDoLinkDeCadastro(url: string): string {
  return `🔗 *Link de cadastro* — mande para o cliente preencher:\n${url}\n_Quando ele terminar, aviso aqui._`;
}

/** Cadastro aberto fora do Comercial ("Novo cliente"): só o link, com o nome. Pura. */
export function mensagemLinkDeCadastro(nome: string, url: string): string {
  return `📝 *Pré-cadastro criado: ${nome.trim() || "cliente"}*\n${blocoDoLinkDeCadastro(url)}`;
}

