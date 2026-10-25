// lib/crm/reuniao-loninho.ts — o Loninho do grupo de vendas PERGUNTA antes de marcar reunião (24/10/2026, auditoria 4.8).
// Módulo PURO, testado.
//
// Antes: "Loninho, marca reunião com a X quinta 15h" criava o evento no Google na hora e o lead recebia o convite —
// sem ninguém conferir se a IA entendeu o dia, a hora e o formato. Convite é o que sai para fora: errou, o lead já viu.
// Agora o Loninho responde com o que entendeu (dia, hora, duração, formato, quem recebe o convite) e pede "ok".
// Só cria com a resposta que CITA essa pergunta (o mesmo desenho da reunião mensal, lib/cs/agendar-reuniao.ts),
// e só de sócio. A pergunta carrega tudo o que vai ser criado — inclusive a referência do lead —, então não há
// estado guardado: o que vale é exatamente o texto que o sócio viu e confirmou.

import { ROTULO_FORMATO, type Formato } from "@/lib/crm/reunioes";

export interface PropostaReuniao {
  /** Começo do id do lead (8 caracteres): a referência que volta na resposta. */
  ref: string;
  data: string;        // AAAA-MM-DD
  hora: string;        // HH:MM
  duracao: number;     // minutos
  formato: Formato;
  convidados: string[];
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const refDoLead = (leadId: string) => leadId.replace(/-/g, "").slice(0, 8).toLowerCase();

/** A pergunta que vai ao grupo. `conflito`: o que a conferência da agenda achou nesse horário. */
export function textoPerguntaReuniao(p: PropostaReuniao & { nome: string; contato?: string | null; conflito?: "ocupado" | "nao_conferi" | null }): string {
  const dia = DIAS[new Date(`${p.data}T12:00:00Z`).getUTCDay()];
  const [a, m, d] = p.data.split("-");
  return [
    "📅 *Confirma a reunião?*",
    `*${p.nome}*${p.contato && p.contato !== p.nome ? ` (${p.contato})` : ""}`,
    `Quando: ${dia}, ${d}/${m}/${a} às ${p.hora} (${p.duracao} min)`,
    `Formato: ${ROTULO_FORMATO[p.formato]}`,
    `Convite por e-mail para: ${p.convidados.length ? p.convidados.join(", ") : "ninguém (o lead não tem e-mail no cadastro)"}`,
    p.conflito === "ocupado" ? "⚠️ Esse horário bate com outro compromisso na agenda da Lone." : null,
    p.conflito === "nao_conferi" ? "⚠️ Não consegui conferir a agenda da Lone agora — veja se o horário está livre antes de confirmar." : null,
    `Ref.: ${p.ref}`,
    "Responde *ok* nesta mensagem que eu crio o evento no Google Agenda e mando o convite. Se algo estiver errado, me pede de novo com o certo — nada foi criado ainda.",
  ].filter(Boolean).join("\n");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FORMATO_DO_ROTULO: Record<string, Formato> = { "google meet": "meet", presencial: "presencial", ligacao: "ligacao" };

/**
 * A mensagem citada é uma pergunta de reunião do Loninho? Devolve o que ela propôs — ou null (não é, ou o texto não
 * fecha: aí nada é criado).
 */
export function lerPerguntaReuniao(citado: string | null | undefined): PropostaReuniao | null {
  const t = norm(citado);
  if (!t.includes("confirma a reuniao?") || !t.includes("responde *ok* nesta mensagem")) return null;
  const q = /quando: [a-z]+, (\d{2})\/(\d{2})\/(\d{4}) as (\d{2}):(\d{2}) \((\d{2,3}) min\)/.exec(t);
  const f = /formato: (google meet|presencial|ligacao)/.exec(t);
  const c = /convite por e-mail para: ([^\n]+)/.exec(t);
  const r = /ref\.: ([0-9a-f]{8})\b/.exec(t);
  if (!q || !f || !c || !r) return null;
  const convidados = c[1].trim().startsWith("ninguem") ? [] : c[1].split(",").map((e) => e.trim()).filter(Boolean);
  if (convidados.some((e) => !EMAIL.test(e))) return null;
  return {
    ref: r[1], data: `${q[3]}-${q[2]}-${q[1]}`, hora: `${q[4]}:${q[5]}`, duracao: Number(q[6]),
    formato: FORMATO_DO_ROTULO[f[1]], convidados,
  };
}

/**
 * A resposta à pergunta: "sim" (ok, confirma, pode marcar…), "nao" (não, cancela, errado…) ou null (não deu para
 * entender — o Loninho pergunta de novo e não cria nada). Só frase curta: texto longo citando a pergunta é outra conversa.
 */
export function respostaAPergunta(texto: string | null | undefined): "sim" | "nao" | null {
  const t = norm(texto).replace(/^\s*@?lon(e|inho|ezinho)\b[\s,:!-]*/, "").trim();
  if (!t || t.length > 60) return null;
  if (/^(nao|n|cancela|cancelar|errado|esta errado|ta errado|espera|pera|deixa)\b/.test(t)) return "nao";
  // "Sim" só com a frase INTEIRA de confirmação: "marca às 16h" citando a pergunta é pedido de outro horário, não ok.
  const limpo = t.replace(/[!.,;:]+/g, " ").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ").replace(/\s+/g, " ").trim();
  if (!limpo) return /👍|✅/u.test(texto ?? "") ? "sim" : null;
  const SIM = /^(ok|okay|okk|sim|s|confirma|confirmo|confirmado|pode|pode marcar|pode criar|pode mandar|marca|manda|fechado|certo|isso|perfeito|blz|beleza|show|bora)( (ok|sim|pode|pode marcar|confirmado|obrigado|valeu|isso|perfeito|marca))*$/;
  return SIM.test(limpo) ? "sim" : null;
}

export const TEXTO_PERGUNTA_NAO_ENTENDIDA = "Não entendi 🤔 Para marcar, responde *ok* na minha pergunta. Se algo estiver errado, me pede de novo com o dia, a hora e o formato certos. Não criei nada.";
export const TEXTO_PERGUNTA_RECUSADA = "Combinado, não marquei. Quando quiser, me pede de novo com o dia e a hora certos.";
export const TEXTO_PERGUNTA_SEM_LEAD = "Não achei o lead dessa pergunta no funil (pode ter sido excluído ou fechado). Não criei nada — marque pela Agenda do Comercial.";
