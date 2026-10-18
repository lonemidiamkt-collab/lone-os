// lib/crm/assistente.ts — o LONINHO NO GRUPO DE VENDAS (out/2026). Pedido do Roberto: a IA "ajuda a
// gente a relembrar follow-ups, a marcar follow-ups para serem feitos", pelo número do atendimento.
//
// Divisão do trabalho (a mesma do resto do agente: a IA interpreta, o CÓDIGO decide):
//   • a OpenAI só transforma a frase em ações estruturadas (agendar, registrar, consultar, cadastrar),
//     escolhendo o lead por número numa lista que mandamos e a data num calendário que mandamos;
//   • aqui, sem IA, cada ação é conferida — o lead existe? é um só? a data é real, de hoje a 1 ano? —
//     e vira um passo que o servidor executa (lib/crm/assistente-server.ts);
//   • as respostas são texto fixo daqui, nunca texto da IA, e NUNCA levam valor (mensalidade, meta).
// Módulo PURO, testado.

import { formatarWhatsapp } from "@/lib/team/whatsapp";
import { mesmoTelefone, normalizarNome } from "@/lib/crm/importar";
import { telefoneDaRota } from "@/lib/crm/rota";
import { ROTULO_ETAPA, ehAberta, normalizarEtapa } from "@/lib/crm/etapas";
import type { CrmAtividadeTipo } from "@/lib/types";
import { horaPorFrase as horaDaFrase } from "@/lib/crm/reunioes";

// ─── Quando ouvir ───────────────────────────────────────────────────────────────────────────────

/** Mesma regra do resto do agente: só age quando é chamado pelo nome (lone, loninho, lonezinho). */
export function chamaOLoninho(texto: string): boolean {
  const t = (texto ?? "").toLowerCase();
  return /\blon(e|inho|ezinho)\b/.test(t) && !/\blone\s*m[íi]dia\b/.test(t);
}

/** A mensagem COMEÇA chamando o Loninho ("Loninho, …", "@Lone …")? Só aí ele explica o que faz quando não entendeu. */
export function chamadaDireta(texto: string): boolean {
  return /^\s*@?lon(e|inho|ezinho)\b/i.test(texto ?? "") && chamaOLoninho(texto);
}

// ─── Contrato com a IA ──────────────────────────────────────────────────────────────────────────

export type TipoAcao = "agendar" | "registrar" | "consultar_lead" | "consultar_hoje" | "cadastrar" | "reuniao" | "nada";
export type CanalAcao = "whatsapp" | "ligacao" | "visita" | "reuniao" | "email" | "nota";

export interface AcaoIA {
  tipo: TipoAcao;
  lead_num: number | null;
  lead_texto: string | null;
  data: string | null;
  canal: CanalAcao | null;
  resumo: string | null;
  empresa: string | null;
  contato: string | null;
  telefone: string | null;
  hora?: string | null;              // "15:00" — só na reunião
  formato?: "meet" | "presencial" | "ligacao" | null;
}
export interface RespostaIA { acoes: AcaoIA[] }

const nulo = (tipo: string | string[]) => ({ type: Array.isArray(tipo) ? [...tipo, "null"] : [tipo, "null"] });
export const SCHEMA_ASSISTENTE: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["acoes"],
  properties: {
    acoes: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "lead_num", "lead_texto", "data", "canal", "resumo", "empresa", "contato", "telefone", "hora", "formato"],
        properties: {
          tipo: { type: "string", enum: ["agendar", "registrar", "consultar_lead", "consultar_hoje", "cadastrar", "reuniao", "nada"] },
          hora: nulo("string"),
          formato: { type: ["string", "null"], enum: ["meet", "presencial", "ligacao", null] },
          lead_num: nulo("integer"),
          lead_texto: nulo("string"),
          data: nulo("string"),
          canal: { type: ["string", "null"], enum: ["whatsapp", "ligacao", "visita", "reuniao", "email", "nota", null] },
          resumo: nulo("string"),
          empresa: nulo("string"),
          contato: nulo("string"),
          telefone: nulo("string"),
        },
      },
    },
  },
};

export interface LeadAssistente {
  id: string;
  empresa: string | null;
  contatoNome: string;
  telefone: string | null;
  estagio: string;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const somaDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaDaSemana = (ymd: string) => DIAS[new Date(`${ymd}T12:00:00Z`).getUTCDay()];

/** "quinta, 23/10" */
export function diaPorExtenso(ymd: string): string {
  return `${diaDaSemana(ymd)}, ${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

/** Leads que a IA pode citar: os ABERTOS, numerados na ordem em que vão no pedido. */
export function leadsDoPedido<L extends LeadAssistente>(leads: L[]): L[] {
  return leads
    .filter((l) => ehAberta(l.estagio))
    .sort((a, b) => (a.empresa || a.contatoNome).localeCompare(b.empresa || b.contatoNome, "pt-BR"))
    .slice(0, 200);
}

export function montarPedido(p: { texto: string; autor: string; hoje: string; leads: LeadAssistente[] }): { system: string; user: string } {
  const calendario = Array.from({ length: 21 }, (_, i) => {
    const d = somaDias(p.hoje, i);
    return `${d} = ${diaDaSemana(d)}${i === 0 ? " (HOJE)" : i === 1 ? " (amanhã)" : ""}`;
  }).join("\n");
  // Datas relativas já resolvidas: no ensaio de 17/10 (sábado) a IA leu "semana que vem" como 26/10, não 19/10.
  const atalhos = [`amanhã = ${somaDias(p.hoje, 1)}`, `depois de amanhã = ${somaDias(p.hoje, 2)}`, `semana que vem (sem dia) = ${proximaSegunda(p.hoje)}`, `daqui a 15 dias = ${somaDias(p.hoje, 15)}`].join("\n");
  const lista = p.leads.map((l, i) => `${i + 1}. ${l.empresa || l.contatoNome}${l.empresa && l.contatoNome !== l.empresa ? ` — ${l.contatoNome}` : ""} (${ROTULO_ETAPA[normalizarEtapa(l.estagio)]})`).join("\n");
  const system = `Você interpreta pedidos do time comercial da Lone Mídia, feitos no grupo de vendas do WhatsApp, e devolve AÇÕES em JSON. Você não conversa: só preenche o JSON.

Ações:
- "agendar": marcar o próximo contato (follow-up) com um lead numa data. Ex.: "marca follow-up com a Loja Alfa quinta", "lembra de falar com a Telhas Beta dia 3", "volta na Ferragens Gama semana que vem".
- "registrar": anotar um contato que JÁ aconteceu ou uma observação. Ex.: "liguei pra X, pediram proposta" (canal ligacao), "mandei mensagem pra Y" (whatsapp), "visitei a Z" (visita), "reunião com W hoje" (reuniao), "anota na X que o dono viaja" (nota). "resumo" = o RESULTADO do contato em uma frase curta, sem repetir o nome do lead nem "liguei/visitei" (ex.: "Pediram proposta", "A Daniela gostou; pediu mensagem na semana que vem"), sem valores em dinheiro.
- "consultar_lead": perguntar como está um lead. Ex.: "como está a Madeireira Delta?".
- "consultar_hoje": perguntar o que fazer hoje / quais follow-ups. Ex.: "o que tem pra hoje?".
- "cadastrar": lead NOVO que não está na lista. Preencha "empresa", "contato" e "telefone" com o que foi dito.
- "reuniao": MARCAR UMA REUNIÃO com horário (vira evento no Google Agenda). Ex.: "marca reunião com a X quinta 15h no Meet", "visita na Y sexta às 10" (formato "presencial"), "liga pra Z amanhã 9h30" (formato "ligacao"). Preencha "data", "hora" (HH:MM, 24h) e "formato" ("meet" se não disser). Follow-up sem horário continua sendo "agendar".
- "nada": não é pedido para você.
Uma frase pode ter mais de uma ação (ex.: "liguei pra X, volta dia 3" = registrar + agendar), no máximo 3.

Lead: use "lead_num" com o NÚMERO da lista abaixo quando tiver certeza de qual é; se não tiver certeza, deixe null e copie em "lead_texto" o nome como foi dito. Nunca invente número.
Data ("data", formato AAAA-MM-DD): use SÓ as datas abaixo. Dia da semana sozinho ("quinta") = a próxima quinta DEPOIS de hoje. "dia N" = o próximo dia N a partir de hoje (se já passou neste mês, o do mês seguinte). Sem data dita = null.

Atalhos (já calculados, use exatamente):
${atalhos}

Calendário:
${calendario}

Leads abertos no funil:
${lista || "(nenhum)"}`;
  return { system, user: `${p.autor}: ${p.texto}` };
}

// ─── Decisão (sem IA) ───────────────────────────────────────────────────────────────────────────

const CANAL_PARA_TIPO: Record<CanalAcao, CrmAtividadeTipo> = {
  whatsapp: "whatsapp", ligacao: "ligacao", visita: "visita", reuniao: "reuniao", email: "email", nota: "nota",
};
const ROTULO_CANAL: Record<CrmAtividadeTipo, string> = {
  whatsapp: "WhatsApp", ligacao: "ligação", visita: "visita", reuniao: "reunião", email: "e-mail", nota: "anotação", pulado: "passo pulado", etapa: "etapa",
};

export type Passo<L extends LeadAssistente = LeadAssistente> =
  | { tipo: "agendar"; lead: L; data: string; resumo: string | null }
  | { tipo: "registrar"; lead: L; atividade: CrmAtividadeTipo; resumo: string }
  | { tipo: "consultar_lead"; lead: L }
  | { tipo: "consultar_hoje" }
  | { tipo: "cadastrar"; empresa: string; contato: string; telefone: string | null }
  | { tipo: "reuniao"; lead: L; data: string; hora: string; formato: "meet" | "presencial" | "ligacao" }
  | { tipo: "responder"; texto: string };

export const AJUDA = [
  "Não entendi o que fazer. Exemplos do que eu faço aqui:",
  "• \"Loninho, marca follow-up com a Loja Alfa quinta\"",
  "• \"Loninho, liguei pra Telhas Beta, pediram proposta\"",
  "• \"Loninho, como está a Madeireira Delta?\"",
  "• \"Loninho, o que tem pra hoje?\"",
  "• \"Loninho, cadastra a Loja Exemplo, Ana, (22) 99999-9999\"",
].join("\n");

/** Próxima segunda DEPOIS de hoje. */
export function proximaSegunda(hoje: string): string {
  return Array.from({ length: 7 }, (_, i) => somaDias(hoje, i + 1)).find((d) => diaDaSemana(d) === "segunda")!;
}

const DIA_NUM: Record<string, number> = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, domingo: 0 };

/**
 * A DATA DO FOLLOW-UP, decidida no código para as formas comuns de falar. A IA errou "semana que vem"
 * (26/10 e 24/10 num sábado, o certo era 19/10) e "semana que vem na quarta" (26/10, o certo era 21/10)
 * no ensaio de 17/10. Ordem: "DD/MM" → "dia N" → "semana que vem na X" → dia da semana → "semana que vem"
 * → "depois de amanhã"/"amanhã". "Hoje" fica de fora de propósito: em "visitei hoje, volta quinta" ele é
 * o dia da visita, não do follow-up. Mais de um dia da semana na frase = ambíguo → null (fica com a IA).
 */
export function dataPorFrase(texto: string, hoje: string): string | null {
  const t = (texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const ymd = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return dt.getUTCDate() === d && dt.getUTCMonth() === m - 1 ? dt.toISOString().slice(0, 10) : null; // 31/11 não existe
  };
  const dm = /\b(\d{1,2})\/(\d{1,2})\b/.exec(t);
  if (dm) {
    const d = Number(dm[1]), m = Number(dm[2]);
    const este = ymd(ano, m, d);
    return este && este >= hoje ? este : ymd(ano + 1, m, d);
  }
  const dn = /\bdia (\d{1,2})\b/.exec(t);
  if (dn) {
    const d = Number(dn[1]);
    return d >= dia ? ymd(ano, mes, d) : mes === 12 ? ymd(ano + 1, 1, d) : ymd(ano, mes + 1, d);
  }
  const semanas = [...t.matchAll(/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/g)].map((x) => x[1]);
  const unicos = [...new Set(semanas)];
  if (unicos.length > 1) return null;
  const proxima = /\b(semana que vem|proxima semana)\b/.test(t);
  if (unicos.length === 1) {
    const alvo = DIA_NUM[unicos[0]];
    if (proxima) return somaDias(proximaSegunda(hoje), (alvo + 6) % 7); // segunda +0 … domingo +6
    for (let i = 1; i <= 7; i++) { const d = somaDias(hoje, i); if (new Date(`${d}T12:00:00Z`).getUTCDay() === alvo) return d; }
  }
  if (proxima) return proximaSegunda(hoje);
  if (/\bdepois de amanha\b/.test(t)) return somaDias(hoje, 2);
  if (/\bamanha\b/.test(t)) return somaDias(hoje, 1);
  return null;
}

export function dataValida(data: string | null, hoje: string): boolean {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const t = Date.parse(`${data}T12:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== data) return false; // 31/02
  return data >= hoje && data <= somaDias(hoje, 366);
}

/** Acha o lead da ação: pelo número da lista (conferido) ou pelo nome. */
export function resolverLead<L extends LeadAssistente>(a: Pick<AcaoIA, "lead_num" | "lead_texto">, lista: L[]):
  { lead: L } | { candidatos: L[] } | { nenhum: string } {
  if (a.lead_num != null && Number.isInteger(a.lead_num) && a.lead_num >= 1 && a.lead_num <= lista.length) {
    const l = lista[a.lead_num - 1];
    // A IA escolheu o número; se ela também disse o nome, os dois têm que bater (número errado é o erro clássico).
    if (!a.lead_texto || bateNome(l, a.lead_texto)) return { lead: l };
  }
  const txt = (a.lead_texto ?? "").trim();
  if (!txt) return { nenhum: "" };
  const achados = lista.filter((l) => bateNome(l, txt));
  if (achados.length === 1) return { lead: achados[0] };
  if (achados.length > 1) {
    const exato = achados.filter((l) => normalizarNome(l.empresa || l.contatoNome) === normalizarNome(txt));
    return exato.length === 1 ? { lead: exato[0] } : { candidatos: achados.slice(0, 5) };
  }
  return { nenhum: txt };
}

const PALAVRAS_VAZIAS = new Set(["a", "o", "as", "os", "da", "do", "de", "das", "dos", "e", "loja", "materiais", "material", "construcao", "madeireira", "madeiras"]);
function bateNome(l: LeadAssistente, texto: string): boolean {
  const alvo = normalizarNome(texto);
  if (!alvo) return false;
  const nomes = [l.empresa, l.contatoNome].map((n) => normalizarNome(n)).filter(Boolean);
  if (nomes.some((n) => n === alvo || n.includes(alvo) || alvo.includes(n))) return true;
  // "a jc coelho" ~ "JC Coelho Madeireira": todas as palavras que importam do que foi dito aparecem no nome.
  const palavras = alvo.split(" ").filter((p) => p.length > 1 && !PALAVRAS_VAZIAS.has(p));
  return palavras.length > 0 && nomes.some((n) => palavras.every((p) => n.split(" ").includes(p)));
}

const nomeDe = (l: LeadAssistente) => l.empresa || l.contatoNome;

/** As ações da IA viram passos conferidos. Registrar vem antes de agendar (registrar limpa a retomada vencida). */
export function planejarPassos<L extends LeadAssistente>(p: {
  resposta: RespostaIA | null | undefined;
  lista: L[];          // a MESMA lista numerada que foi no pedido
  todos: L[];          // todos os leads (para conferir duplicado no cadastro)
  clientes: { nome: string; telefones: (string | null)[] }[];
  hoje: string;
  texto?: string;      // a frase original: algumas datas o código resolve sozinho (dataPorFrase)
}): Passo<L>[] {
  // Só com UM agendamento na frase: com dois (leads e dias diferentes) não dá para saber qual data é de quem.
  const dataFixa = p.texto && (p.resposta?.acoes ?? []).filter((a) => a?.tipo === "agendar").length === 1 ? dataPorFrase(p.texto, p.hoje) : null;
  const acoes = (p.resposta?.acoes ?? []).filter((a) => a && a.tipo !== "nada").slice(0, 3);
  if (!acoes.length) return []; // quem chama decide: ajuda se foi chamado direto, silêncio se só citou o nome
  const ordem: Record<TipoAcao, number> = { registrar: 0, reuniao: 1, agendar: 2, consultar_lead: 3, consultar_hoje: 4, cadastrar: 5, nada: 9 };
  const passos: Passo<L>[] = [];
  for (const a of [...acoes].sort((x, y) => ordem[x.tipo] - ordem[y.tipo])) {
    if (a.tipo === "consultar_hoje") { passos.push({ tipo: "consultar_hoje" }); continue; }
    if (a.tipo === "cadastrar") {
      const empresa = (a.empresa ?? "").trim().slice(0, 120);
      const contato = (a.contato ?? "").trim().slice(0, 120);
      const telefone = telefoneDaRota(a.telefone);
      if (!empresa && !contato) { passos.push({ tipo: "responder", texto: "Para cadastrar, me diga pelo menos o nome da empresa (e, se tiver, o contato e o WhatsApp)." }); continue; }
      const nome = empresa || contato;
      const dup = p.todos.find((l) => (telefone && mesmoTelefone(l.telefone, telefone)) || normalizarNome(nomeDe(l)) === normalizarNome(nome));
      if (dup) { passos.push({ tipo: "responder", texto: `*${nomeDe(dup)}* já está no funil (${ROTULO_ETAPA[normalizarEtapa(dup.estagio)]}). Não cadastrei de novo.` }); continue; }
      const cli = p.clientes.find((c) => (telefone && c.telefones.some((t) => mesmoTelefone(t, telefone))) || normalizarNome(c.nome) === normalizarNome(nome));
      if (cli) { passos.push({ tipo: "responder", texto: `*${cli.nome}* já é cliente da Lone. Não cadastrei como lead.` }); continue; }
      passos.push({ tipo: "cadastrar", empresa: nome, contato: contato || nome, telefone });
      continue;
    }
    const r = resolverLead(a, p.lista);
    if ("candidatos" in r) {
      passos.push({ tipo: "responder", texto: `Achei mais de um lead para "${a.lead_texto}": ${r.candidatos.map((l, i) => `${i + 1}) ${nomeDe(l)}`).join(" · ")}. Repete com o nome completo.` });
      continue;
    }
    if ("nenhum" in r) {
      passos.push({ tipo: "responder", texto: r.nenhum ? `Não achei "${r.nenhum}" entre os leads abertos. Se é lead novo: "Loninho, cadastra ${r.nenhum}, contato, WhatsApp".` : "Não entendi de qual lead você está falando. Repete com o nome da empresa." });
      continue;
    }
    const lead = r.lead;
    if (a.tipo === "consultar_lead") { passos.push({ tipo: "consultar_lead", lead }); continue; }
    if (a.tipo === "registrar") {
      const atividade = CANAL_PARA_TIPO[a.canal ?? "nota"] ?? "nota";
      const resumo = (a.resumo ?? "").trim().slice(0, 400) || "registrado pelo grupo de vendas";
      passos.push({ tipo: "registrar", lead, atividade, resumo });
      continue;
    }
    if (a.tipo === "reuniao") {
      const data = (p.texto ? dataPorFrase(p.texto, p.hoje) : null) ?? a.data;
      const hora = (p.texto ? horaDaFrase(p.texto) : null) ?? (a.hora && /^\d{2}:\d{2}$/.test(a.hora) ? a.hora : null);
      if (!dataValida(data, p.hoje)) { passos.push({ tipo: "responder", texto: `Para que dia marco a reunião com *${nomeDe(lead)}*?` }); continue; }
      if (!hora) { passos.push({ tipo: "responder", texto: `Que horas marco a reunião com *${nomeDe(lead)}* (${diaPorExtenso(data!)})?` }); continue; }
      const formato = a.formato === "presencial" || a.formato === "ligacao" ? a.formato : "meet";
      passos.push({ tipo: "reuniao", lead, data: data!, hora, formato });
      continue;
    }
    if (a.tipo === "agendar") {
      if (dataFixa) a.data = dataFixa;
      if (!dataValida(a.data, p.hoje)) {
        passos.push({ tipo: "responder", texto: `Para quando marco o follow-up com *${nomeDe(lead)}*? Diga o dia (ex.: "quinta" ou "dia 3").` });
        continue;
      }
      passos.push({ tipo: "agendar", lead, data: a.data!, resumo: (a.resumo ?? "").trim().slice(0, 300) || null });
    }
  }
  return passos;
}

// ─── Respostas (texto fixo, sem valor) ──────────────────────────────────────────────────────────

const zap = (tel: string | null) => (tel ? `${formatarWhatsapp(tel)} — wa.me/${tel}` : null);

export function textoAgendado(lead: LeadAssistente, data: string, hoje: string): string {
  const quando = data === hoje ? "hoje" : data === somaDias(hoje, 1) ? `amanhã (${diaPorExtenso(data)})` : diaPorExtenso(data);
  return `Marcado: follow-up com *${nomeDe(lead)}* ${data === hoje ? "hoje" : `para ${quando}`}.${data === hoje ? " Já está no Hoje." : " Sai do Hoje até lá e volta no dia, também na lista das 8h."}`;
}

export function textoRegistrado(lead: LeadAssistente, atividade: CrmAtividadeTipo, resumo: string, saiuDeNovo: boolean): string {
  return `Registrado em *${nomeDe(lead)}* (${ROTULO_CANAL[atividade]}): ${resumo}${saiuDeNovo ? "\nSaiu de Novo para Contato feito." : ""}`;
}

export function textoConsulta(p: {
  lead: LeadAssistente;
  ultimo: { tipo: string; quando: string } | null;
  proximo: string | null;
  hoje: string;
}): string {
  const l = p.lead;
  const ultimo = p.ultimo
    ? `${ROTULO_CANAL[p.ultimo.tipo as CrmAtividadeTipo] ?? p.ultimo.tipo} em ${p.ultimo.quando.slice(8, 10)}/${p.ultimo.quando.slice(5, 7)}`
    : "nenhum registrado";
  return [
    `*${nomeDe(l)}*${l.empresa && l.contatoNome !== l.empresa ? ` (${l.contatoNome})` : ""}`,
    `Etapa: ${ROTULO_ETAPA[normalizarEtapa(l.estagio)]}`,
    `Último contato: ${ultimo}`,
    `Próximo passo: ${p.proximo ?? "nenhum marcado — quer que eu marque?"}`,
    zap(l.telefone) ? `WhatsApp: ${zap(l.telefone)}` : null,
  ].filter(Boolean).join("\n");
}

export function textoCadastrado(empresa: string, contato: string, telefone: string | null): string {
  return [
    `Cadastrado: *${empresa}*${contato !== empresa ? ` (${contato})` : ""}`,
    telefone ? `WhatsApp: ${zap(telefone)}` : "Sem WhatsApp: complete no painel.",
    "Entrou em Novo, com a mensagem de primeiro contato pronta no Comercial → Hoje.",
  ].join("\n");
}

export const TEXTO_SEM_AUTORIDADE = "Só os sócios mexem no funil por aqui.";
export const TEXTO_IA_FORA = "Não consegui entender agora (a IA não respondeu). Tenta de novo em instantes ou usa o painel do Comercial.";
