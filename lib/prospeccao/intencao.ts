// lib/prospeccao/intencao.ts — o que o prospect quis dizer (§16).
//
// Ordem: regras determinísticas primeiro (opt-out, "é robô?", horário — o parser do CS já sabe
// ler "quarta às 15h"), IA depois (gpt-4o-mini, JSON estrito). A IA classifica; ela NÃO decide
// o que fazer — isso é a máquina (lib/prospeccao/maquina.ts) e a conversa (conversa.ts).

import type { Intent, IntentLida } from "./tipos";
import { lerIntencaoReuniao } from "@/lib/cs/agendar-reuniao";
import { telefoneDigitos } from "./normalizar";

// Os regexes abaixo casam com o texto SEM ACENTO e em minúsculas (ver `norm`): "robô?" com \b não
// fecha em JS porque "ô" não é \w — e metade das respostas reais vem sem acento mesmo.
const norm = (t: string) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const RX_OPT_OUT = /\b(nao (me )?(mande|manda|envie|envia|chame|chama|procure|procura)( mais)?|para(r)? de (mandar|enviar|me chamar)|me (tira|remove|exclui)( da lista)?|sai(a)? (da minha|do meu)|nao quero (mais )?(receber|contato|mensagem|conversa)|(remova|tirar|apagar) (meu|o meu) (numero|contato)|spam|denunci)/;
const RX_ROBO = /\b(robo|bot|automatic[oa]|automacao|automatizad[oa]|inteligencia artificial|ia|chatgpt|maquina|atendente virtual|assistente virtual|e gente|e uma pessoa|pessoa de verdade|humano)\b/;
const RX_PRECO = /\b(preco|quanto (custa|cobra|fica|sai|e)|valor(es)?|mensalidade|orcamento|tabela|investimento minimo)\b/;
const RX_JA_TEM = /\b(ja (tenho|temos|trabalho|trabalhamos) (com )?(agencia|uma agencia|marketing|alguem)|ja tem quem (cuida|faz)|minha agencia|nossa agencia)\b/;
const RX_SEM_INTERESSE = /\b(nao (tenho|temos|to|estou|estamos) interess\w*|sem interesse|nao (quero|queremos|preciso|precisamos)\b|nao (vai|vamos|vou) (contratar|precisar|querer)|obrigad[oa],? (mas )?nao\b|nao,? obrigad[oa])/;
const RX_DEPOIS = /\b(mes que vem|proxim[oa] (mes|semana|ano)|semana que vem|daqui (a|uns?) \d+|depois d[aeo] (reforma|inaugura\w*|mudan\w*|obra|festa|natal|carnaval)|mais (pra|para) frente|mais tarde|(me )?(chama|procura|liga|manda) (de novo|depois|em|daqui)|agora nao|momento (ruim|nao|dificil)|em (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))\b/;
const RX_SOU_DECISOR = /\b(sou (eu|o dono|a dona|o propriet\w*|a propriet\w*|o socio|a socia|o respons\w*|a respons\w*|o gerente|a gerente)|eu (mesmo|mesma)|pode falar|fala comigo|e comigo|aqui e (o|a) (dono|dona|propriet\w*|respons\w*))\b/;
const RX_NAO_E_DECISOR = /\b(nao (e|eh) comigo|nao sou (eu|o dono|a dona|respons)|(o|a) (dono|dona|propriet\w*|respons\w*|gerente|socio|chefe) (nao (esta|ta)|esta (ocupad|fora|viajando)|so (volta|chega))|vou passar (pra|para) (ele|ela)|deixa (eu )?(ver|perguntar|passar)|aqui (e|eh) (a|o) (recep|atend|loja|balc))/;
const RX_SOBRE_O_QUE = /\b(sobre o que|do que se trata|qual (o |seria o )?assunto|em relacao a que|(e|seria) (sobre|a respeito)|o que (voces|vcs) (fazem|oferecem|querem)|como (funciona|assim)|que empresa)\b/;
const RX_INTERESSE = /\b(tenho interesse|interessa\w*|gostei|pode ver( sim)?|pode olhar|ve (ai|sim|os horarios)|quero (saber|entender|conhecer|ver)|me (explica|conta|fala) (mais|melhor)|pode (me )?(explicar|mandar|passar) (mais|como)|vamos (conversar|marcar)|pode marcar|bora|topo|fechado|manda (ai|mais)|show|legal,? (pode|vamos))\b/;
const RX_QUER_VISITA = /\b(pode (vir|passar|aparecer)|vem (aqui|ai)|passa (aqui|ai)|presencial(mente)?|visita|aqui na loja|conhecer a loja)\b/;
const RX_QUER_MEET = /\b(online|meet|video ?chamada|chamada de video|call|zoom|pelo (google|computador|celular))\b/;
const RX_SAUDACAO = /^\s*(oi|ola|bom dia|boa tarde|boa noite|e ai|eai|opa|tudo bem\??|fala)[\s!.,]*$/;
const RX_NEGACAO = /\bnao\b/;

export const ehOptOut = (t: string) => RX_OPT_OUT.test(norm(t));

/** "sim", "isso", "pode", "claro", "fechado", "pode ver", "quero"… sem "não" no meio. */
export const ehAfirmativo = (t: string) => {
  const n = norm(t);
  if (RX_NEGACAO.test(n) && !/\bnao,? (pode|claro|fechado)\b/.test(n)) return false;
  return /^\W*(sim|isso|isso ai|exato|certo|certinho|correto|pode|pode ser|pode sim|pode ver|claro|claro que sim|ok|okay|beleza|blz|fechado|fechou|combinado|perfeito|show|bora|vamos|quero|com certeza|opa|aham|uhum|ta bom|tá bom|ta certo|tudo certo|confirmado|confirmo|positivo|isso mesmo|manda|pode mandar|pode marcar|ve ai|ve sim)\b/.test(n);
};

/** "manhã" / "tarde" (resposta à pergunta de período). */
export const lerPeriodo = (t: string): "manha" | "tarde" | null => {
  const n = norm(t);
  const manha = /\b(manha|de manha|pela manha|cedo)\b/.test(n), tarde = /\b(tarde|a tarde|de tarde|pela tarde|depois do almoco)\b/.test(n);
  if (manha && !tarde) return "manha";
  if (tarde && !manha) return "tarde";
  return null;
};

/** Parece um endereço ("Rua X, 120 - Centro", "Av. Brasil 45")? */
export const pareceEndereco = (t: string) => /\b(rua|r\.|av\.?|avenida|estrada|rodovia|rod\.|travessa|alameda|praca|praça|km)\b/i.test(t) && /\d/.test(t);
export const perguntaSeERobo = (t: string) => { const n = norm(t); return RX_ROBO.test(n) && /\?|\be\b|voce|vc|falando com/.test(n); };

interface Ctx {
  /** Horário que o agente propôs e ainda aguarda confirmação. */
  propostoIso?: string | null;
  perguntouHorario?: boolean;
  /** Estágio atual: muda a leitura ("sim" depois da oferta de horário ≠ "sim" na abordagem). */
  estagio?: string;
  agora?: Date;
}

/** Leitura determinística. Devolve null quando só a IA resolve. */
export function lerIntencaoRegras(texto: string, ctx: Ctx = {}): IntentLida | null {
  const original = (texto || "").trim();
  if (!original) return null;
  const t = norm(original);
  const agora = ctx.agora ?? new Date();
  const base = { confianca: 0.9, resumo: original.slice(0, 200) };

  if (ehOptOut(original)) return { intent: "OPT_OUT", ...base };
  if (perguntaSeERobo(original)) return { intent: "E_ROBO", ...base };

  // Agenda: o parser do CS lê "quarta às 15h", "pode ser amanhã 10h", "isso, pode confirmar".
  // Depois que o agente convidou para conversar, um horário solto JÁ é resposta (o parser exige
  // contexto para não engolir qualquer "segunda às 18h" de uma mensagem longa).
  const emAgenda = !!ctx.perguntouHorario || ["decisor_contatado", "interesse", "horario_proposto", "aguardando_confirmacao"].includes(ctx.estagio ?? "");
  const ag = lerIntencaoReuniao(original, agora, ctx.propostoIso ?? undefined, emAgenda);
  if (ag.tipo === "agendar") return { intent: "CONFIRMA_HORARIO", ...base, quando: ag.iso, contexto: ag.trecho };
  if (ag.tipo === "propor") return { intent: "PROPOE_HORARIO", ...base, quando: ag.iso, contexto: ag.trecho };
  if (ag.tipo === "recusa" && ctx.propostoIso) return { intent: "RECUSA_HORARIO", ...base };

  if (RX_PRECO.test(t)) return { intent: "PEDIU_PRECO", ...base };
  if (RX_JA_TEM.test(t)) return { intent: "JA_TEM_AGENCIA", ...base, objecao: "já tem agência" };
  if (RX_SEM_INTERESSE.test(t) && !RX_DEPOIS.test(t)) return { intent: "NAO_INTERESSADO", ...base };
  if (RX_DEPOIS.test(t)) return { intent: "RETORNAR_DEPOIS", ...base, quando: original.slice(0, 120), contexto: original.slice(0, 200) };
  if (RX_NAO_E_DECISOR.test(t)) return { intent: "DECISOR_INDISPONIVEL", ...base };
  if (RX_SOU_DECISOR.test(t)) return { intent: "SOU_O_DECISOR", ...base };
  if (RX_SOBRE_O_QUE.test(t)) return { intent: "QUER_SABER_MAIS", ...base };
  const tel = telefoneDigitos(original.match(/\+?\d[\d\s().-]{8,}\d/)?.[0] ?? null);
  if (tel) return { intent: "PASSOU_CONTATO", ...base, telefone: tel };
  if (RX_QUER_VISITA.test(t) && !RX_NEGACAO.test(t)) return { intent: "QUER_VISITA", ...base };
  if (RX_QUER_MEET.test(t) && !RX_NEGACAO.test(t)) return { intent: "QUER_REUNIAO", ...base };
  if (RX_INTERESSE.test(t) && !RX_NEGACAO.test(t)) return { intent: "INTERESSADO", ...base };
  if (RX_SAUDACAO.test(t)) return { intent: "SAUDACAO", confianca: 0.8, resumo: original };
  return null;
}

const SISTEMA_INTENT = `Você classifica a resposta de um empresário a uma abordagem comercial por WhatsApp feita pela equipe de uma agência de marketing (Lone Mídia). Devolva a intenção e SÓ as entidades que a mensagem diz explicitamente. Nunca deduza nome, telefone ou data que não estejam no texto.

Intenções:
- DECISOR_INDISPONIVEL: quem respondeu não é o decisor e ele não está disponível / vai avisar.
- DECISOR_IDENTIFICADO: informou quem é o decisor (nome e/ou cargo) sem ser ele.
- SOU_O_DECISOR: quem responde é o dono/sócio/responsável.
- PASSOU_CONTATO: passou telefone/WhatsApp de alguém.
- QUER_SABER_MAIS: pergunta do que se trata / como funciona / o que a agência faz.
- INTERESSADO: demonstra interesse em conversar.
- QUER_REUNIAO: pede/aceita reunião online.
- QUER_VISITA: pede/aceita visita presencial.
- NAO_INTERESSADO: recusa clara.
- RETORNAR_DEPOIS: pede contato em outro momento (informe "quando" com o texto que ele usou).
- PEDIU_PRECO: pergunta preço/valores.
- JA_TEM_AGENCIA: já tem agência/alguém cuidando.
- SEM_ORCAMENTO: diz que não tem verba agora.
- CLIENTE_NAO_E_ICP: a empresa não é do ramo (número errado, pessoa física, outro segmento).
- OPT_OUT: pede para não receber mais mensagens.
- E_ROBO: pergunta se é robô/automação.
- PROPOE_HORARIO: sugere um dia/horário CONCRETO (dia da semana, data ou hora). "pode ver os horários" NÃO é isso — é INTERESSADO.
- CONFIRMA_HORARIO: aceita um horário oferecido.
- RECUSA_HORARIO: recusa o horário oferecido.
- SAUDACAO: só cumprimento.
- OUTRO: nada disso.`;

const SCHEMA_INTENT = {
  type: "object", additionalProperties: false,
  properties: {
    intent: { type: "string", enum: [
      "DECISOR_INDISPONIVEL", "DECISOR_IDENTIFICADO", "SOU_O_DECISOR", "PASSOU_CONTATO", "QUER_SABER_MAIS", "INTERESSADO",
      "QUER_REUNIAO", "QUER_VISITA", "NAO_INTERESSADO", "RETORNAR_DEPOIS", "PEDIU_PRECO", "JA_TEM_AGENCIA", "SEM_ORCAMENTO",
      "CLIENTE_NAO_E_ICP", "OPT_OUT", "E_ROBO", "PROPOE_HORARIO", "CONFIRMA_HORARIO", "RECUSA_HORARIO", "SAUDACAO", "OUTRO",
    ] },
    confianca: { type: "number" },
    decisor_nome: { type: ["string", "null"] },
    decisor_cargo: { type: ["string", "null"] },
    telefone: { type: ["string", "null"] },
    quando: { type: ["string", "null"] },
    objecao: { type: ["string", "null"] },
    contexto: { type: ["string", "null"] },
    resumo: { type: "string" },
  },
  required: ["intent", "confianca", "decisor_nome", "decisor_cargo", "telefone", "quando", "objecao", "contexto", "resumo"],
};

/** Regras → IA. Sem IA configurada, o que as regras não pegam vira OUTRO (o inbound chama humano). */
export async function lerIntencao(texto: string, historico: { autor: string; texto: string }[], ctx: Ctx = {}): Promise<IntentLida> {
  const regras = lerIntencaoRegras(texto, ctx);
  if (regras) return regras;
  try {
    const { chatJson, isOpenAIConfigured } = await import("@/lib/ai/openai");
    if (!isOpenAIConfigured()) return { intent: "OUTRO", confianca: 0, resumo: texto.slice(0, 200) };
    const hist = historico.slice(-6).map((h) => `${h.autor === "prospect" ? "PROSPECT" : "AGENTE"}: ${h.texto}`).join("\n");
    const r = await chatJson<IntentLida>({
      model: "gpt-4o-mini", system: SISTEMA_INTENT, schemaName: "intent_sdr", schema: SCHEMA_INTENT,
      user: `ESTÁGIO DA CONVERSA: ${ctx.estagio ?? "?"}\nHISTÓRICO:\n${hist || "(vazio)"}\n\nMENSAGEM DO PROSPECT: ${texto}`,
      maxTokens: 250, temperature: 0, origem: "prospeccao:intencao",
    });
    if (!r.ok || !r.data) return { intent: "OUTRO", confianca: 0, resumo: texto.slice(0, 200) };
    const d = r.data;
    return {
      intent: (d.intent as Intent) ?? "OUTRO",
      confianca: Math.max(0, Math.min(1, Number(d.confianca) || 0)),
      decisor_nome: d.decisor_nome || null, decisor_cargo: d.decisor_cargo || null,
      telefone: telefoneDigitos(d.telefone) ?? null, quando: d.quando || null,
      objecao: d.objecao || null, contexto: d.contexto || null, resumo: d.resumo || texto.slice(0, 200),
    };
  } catch (err) {
    console.error("[prospeccao/intencao] IA falhou:", err instanceof Error ? err.message : err);
    return { intent: "OUTRO", confianca: 0, resumo: texto.slice(0, 200) };
  }
}
