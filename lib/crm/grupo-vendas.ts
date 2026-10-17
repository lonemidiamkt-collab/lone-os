// lib/crm/grupo-vendas.ts — o que o comercial manda no GRUPO DE VENDAS do WhatsApp ("Lone - Comercial -
// vendas", criado pelo Roberto em 17/10/2026). Módulo PURO, testado.
//
// Pedido dele: "ele deve sempre mandar os cadastros certinhos com o número do cliente assim que for
// feito o cadastro". Vai pelo número do atendimento (o mesmo do Loninho), para o JID em
// CS_VENDAS_GROUP_JID. O grupo NÃO está na allowlist do Loninho: ele só manda, não lê nem responde.
// Nunca leva dinheiro da agência (mensalidade, meta) — só dado do cliente e o que fazer.

import { formatarWhatsapp } from "@/lib/team/whatsapp";
import type { PacoteSite } from "@/lib/crm/site-lead";

export interface CadastroParaGrupo {
  empresa: string | null;
  contatoNome: string;
  telefone: string | null;          // E.164 sem "+" (5522998765432) ou null quando veio errado
  telefoneDigitado?: string | null; // o que a pessoa digitou, quando está errado
  email?: string | null;
  segmento?: string | null;
  origem?: string | null;
  desafio?: string | null;
  faturamento?: string | null;
  campanha?: string | null;
}

const linha = (rotulo: string, valor: string | null | undefined) => (valor && valor.trim() ? `*${rotulo}:* ${valor.trim()}` : null);
const curto = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

export function textoCadastroGrupo(c: CadastroParaGrupo): string {
  const zap = c.telefone ? `${formatarWhatsapp(c.telefone)} — wa.me/${c.telefone}` : c.telefoneDigitado ? `${c.telefoneDigitado} (veio errado — conferir pelo e-mail)` : null;
  const titulo = c.origem === "Anúncio → site" ? "*Novo cadastro — anúncio → site*" : "*Novo cadastro pelo site*";
  return [
    titulo,
    linha("Empresa", c.empresa),
    linha("Contato", c.contatoNome),
    linha("WhatsApp", zap),
    linha("E-mail", c.email),
    linha("Segmento", c.segmento),
    linha("Faturamento informado", c.faturamento),
    linha("Desafio", curto(c.desafio, 300)),
    linha("Campanha", c.campanha),
    "Já está no Comercial → Hoje, com a mensagem de primeiro contato pronta. Responder em até 1 hora.",
  ].filter(Boolean).join("\n");
}

/** Do pacote do site para a mensagem do grupo (o telefone já passou pelo filtro de lixo). */
export function cadastroDoPacote(p: PacoteSite, v: { telefone: string | null; telefoneDigitado?: string | null }, origem: string): CadastroParaGrupo {
  const l = p.lead;
  const a = p.atribuicao ?? {};
  return {
    empresa: l.empresa?.trim() || null,
    contatoNome: l.nomeCompleto.trim(),
    telefone: v.telefone,
    telefoneDigitado: v.telefoneDigitado ?? null,
    email: l.emailCorporativo?.trim() || null,
    segmento: l.segmento?.trim() || null,
    origem,
    desafio: l.maiorDesafio ?? null,
    faturamento: (l.faturamentoRotulo || l.faturamento)?.trim() || null,
    campanha: [a.utm_source, a.utm_medium, a.utm_campaign].filter(Boolean).join(" / ") || null,
  };
}

export function textoVoltouGrupo(c: { empresa: string | null; contatoNome: string; telefone: string | null; desafio?: string | null }): string {
  return [
    "*Voltou pelo site* (já estava no funil)",
    linha("Empresa", c.empresa || c.contatoNome),
    linha("WhatsApp", c.telefone ? `${formatarWhatsapp(c.telefone)} — wa.me/${c.telefone}` : null),
    linha("Desafio", curto(c.desafio, 200)),
    "Responder em até 1 hora.",
  ].filter(Boolean).join("\n");
}

export function textoClienteGrupo(cliente: string, ex: boolean, c: { telefone: string | null; desafio?: string | null }): string {
  return [
    `*${ex ? "Ex-cliente" : "Cliente"} preencheu o formulário do site:* ${cliente}`,
    linha("WhatsApp", c.telefone ? `${formatarWhatsapp(c.telefone)} — wa.me/${c.telefone}` : null),
    linha("Desafio", curto(c.desafio, 200)),
    ex ? "Pode ser uma chance de reativar." : "Pode ser pedido de algo a mais (upsell) ou dúvida — vale um contato.",
  ].filter(Boolean).join("\n");
}

export interface ItemFollowup {
  empresa: string | null;
  contatoNome: string;
  motivo: string;
}

/** Lista do dia (8h): até 15 itens, sem valor; o resto fica no painel. */
export function textoFollowupsGrupo(itens: ItemFollowup[], decisoes = 0): string | null {
  if (!itens.length && !decisoes) return null;
  const mostrados = itens.slice(0, 15).map((i) => `• ${i.empresa || i.contatoNome} — ${i.motivo}`);
  const resto = itens.length > 15 ? `\n…e mais ${itens.length - 15} no painel.` : "";
  const dec = decisoes ? `\n${decisoes} régua(s) encerrada(s) esperando decisão (perdido ou retomar).` : "";
  return `*Follow-ups de hoje (${itens.length})*\n${mostrados.join("\n")}${resto}${dec}\nMensagens prontas no Comercial → Hoje.`;
}

export interface LojaVisitadaGrupo {
  empresa: string;
  contatoNome: string | null;
  telefone: string | null;
  cidade: string | null;
  segmento: string | null;
  por: string | null;
}

/** Lojas da rota que acabaram de entrar no funil (uma mensagem por rodada, até 10 lojas listadas). */
export function textoRotaGrupo(lojas: LojaVisitadaGrupo[]): string | null {
  if (!lojas.length) return null;
  const itens = lojas.slice(0, 10).map((l) => [
    `• *${l.empresa}*${l.cidade ? ` (${l.cidade})` : ""}`,
    l.contatoNome && l.contatoNome !== l.empresa ? `  Contato: ${l.contatoNome}` : null,
    l.telefone ? `  WhatsApp: ${formatarWhatsapp(l.telefone)} — wa.me/${l.telefone}` : "  Sem telefone na rota: pegar pelo Instagram",
    l.por ? `  Visitada por ${l.por}` : null,
  ].filter(Boolean).join("\n"));
  const resto = lojas.length > 10 ? `\n…e mais ${lojas.length - 10} no painel.` : "";
  return `*Rota: ${lojas.length} loja(s) visitada(s) entraram no funil*\n${itens.join("\n")}${resto}\nEstão em Comercial → Contato feito; a régua de follow-up conta do dia da visita.`;
}
