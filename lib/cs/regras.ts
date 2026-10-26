// lib/cs/regras.ts — o que É uma regra do cliente, e o que só parece.
//
// AUDITORIA (22/08/2026, Roberto): 378 regras guardadas e só 10 acionáveis. 96 eram preço de
// produto ("Porcelanato 84x84 R$69,99, -20% PIX") e 25 eram efêmeras ("a equipe está em treinamento
// esta semana"). O extrator antigo pedia "fatos CONCRETOS e verificáveis" — e preço é concreto e
// verificável, então a memória do cliente virou catálogo. Pior: era instruído a ignorar "pedido de
// arte ou opinião", que é exatamente onde mora o aprendizado ("o endereço da legenda está errado").
//
// A pergunta certa não é "isso é um fato?" — é "isso muda o que a gente faz na PRÓXIMA peça?".
// Preço não muda: muda o conteúdo daquela peça, e vence sozinho. Endereço errado muda para sempre.

export const TIPOS_REGRA = ["visual", "copy", "operacional", "proibicao"] as const;
export type TipoRegra = (typeof TIPOS_REGRA)[number];

/** Escopo da tabela cs_client_rules (CHECK chk_escopo). Até hoje 376/378 regras eram "sempre" —
 *  a separação existia no banco e nunca foi usada, então nada conseguia filtrar por assunto. */
export type EscopoRegra = "sempre" | "arte" | "social" | "promocao" | "trafego" | "roteiro";

/** Cada tipo cai no escopo que os consumidores já sabem ler (legenda, revisar-post, verificar-arte). */
export const ESCOPO_POR_TIPO: Record<TipoRegra, EscopoRegra> = {
  visual: "arte",        // cor, logo, fonte, enquadramento → conferência da arte
  copy: "social",        // o que a legenda deve/não deve dizer
  operacional: "sempre", // endereço, telefone, horário, quem aprova → vale para tudo
  proibicao: "sempre",   // "nunca fazer X" → vale para tudo
};

export const ROTULO_TIPO: Record<TipoRegra, string> = {
  visual: "identidade visual",
  copy: "texto e legenda",
  operacional: "dado operacional",
  proibicao: "proibição",
};

// ── Portão determinístico: o que NUNCA vira regra ────────────────────────────
// Roda ANTES da IA. É barato, não alucina, e sozinho teria barrado 121 das 378 regras da base.

/** Preço, condição de pagamento, medida comercial: é catálogo, muda toda semana. */
const RX_CATALOGO = /(R\$\s?\d|\d+\s?(reais|conto)\b|\bpre[çc]o\b|\bcusta\b|\bà vista\b|\bparcel|\b\d+x\s|\bdesconto\b|\b\d+\s?%|\bm²|\bm2\b|\bpix\b|\bboleto\b)/i;

/** Promoção/campanha com prazo: vale por dias, não é regra do cliente. */
const RX_PROMO = /(promo[çc][ãa]o|oferta|liquida[çc][ãa]o|queima de estoque|black friday|imperd[íi]vel|s[óo] hoje|[úu]ltimas? unidades?)/i;

/** Estado passageiro. O extrator antigo guardou "a equipe está em treinamento esta semana". */
const RX_EFEMERO = /(esta semana|essa semana|semana que vem|pr[óo]xim[ao]s? (semana|m[êe]s|sexta|segunda)|hoje|amanh[ãa]|ontem|neste m[êe]s|est[áa] em (treinamento|f[ée]rias|recesso)|est[áa] sendo preparad|ser[áa] (feito|enviado|entregue)|foi (enviado|entregue|postado)|aguardando aprova)/i;

/** Narrativa sobre o cliente, não instrução pra quem produz. O extrator antigo enchia a base com
 *  "O cliente está organizando o CRM", "O cliente pretende incluir coisas para vender" — verdade,
 *  mas não muda nada na próxima peça. Cuidado deliberado: "o cliente NÃO QUER/NÃO GOSTA/PEDE QUE"
 *  É regra e precisa passar, por isso o padrão lista os verbos de ESTADO, um a um. */
// O fim do padrão usa lookahead, não \b: em JS o \b é ASCII, então "está\b" NUNCA casa —
// a borda depois de "á" não existe pro motor. Custou um teste vermelho pra aparecer.
const RX_NARRATIVA = /\bclientes?\s+(est[áa]|estava|pretende|mencionou|acredita|relatou|comentou|informou que est|gostaria de saber|quer saber|solicitou informa|perguntou|demonstrou)(?=\s|[,.]|$)/i;

/** Entrada de catálogo sem preço: "Produto: Sabonete íntimo." É item de estoque, não regra. */
const RX_ITEM_CATALOGO = /^\s*(produto|item|linha|modelo|refer[êe]ncia)\s*:/i;

/**
 * ANÚNCIO DE INFORMAÇÃO, sem a informação.
 *
 * Auditoria de 02/09: entraram na base "Informação sobre fechamento na segunda-feira" e "Informação
 * sobre horário de funcionamento". Nenhuma das duas diz QUAL é o horário — avisam que existe um
 * dado em algum lugar. Para quem vai fazer a arte, isso não vale nada: ele continua sem saber o que
 * escrever. A regra tem que CARREGAR o dado.
 */
const RX_ANUNCIO_VAZIO = /^\s*(informa[çc][ãa]o|informe|aviso|comunicado|dados?|detalhes?|observa[çc][ãa]o)\s+(sobre|a respeito|referente|de|do|da)\b/i;

/**
 * Processo interno da agência, não regra DO CLIENTE.
 *
 * "Manter comunicação próxima e atenta com o cliente" e "Sempre dar retorno sobre materiais
 * solicitados em até uma semana" descrevem como a Lone deveria trabalhar. Podem até ser boas
 * práticas, mas entram no lugar errado: a base de regras é lida na hora de fazer a PEÇA daquele
 * cliente, e ali isso só ocupa espaço e dilui o que importa.
 */
const RX_PROCESSO_INTERNO = /\b(manter|dar|garantir|assegurar|estabelecer|criar|melhorar|reforçar|refor[çc]ar)\s+(uma?\s+)?(comunica[çc][ãa]o|retorno|contato|acompanhamento|alinhamento|proximidade|aten[çc][ãa]o|relacionamento|feedback)/i;

/**
 * Genérica: não manda ninguém fazer nada.
 *
 * A primeira versão exigia "âncora concreta" (número, nome próprio, termo visual) e barrava 157 das
 * 363 regras ativas — mas amostrando as 157, metade era regra boa: "utilizar a palavra 'pet' em vez
 * de 'animal'", "usar a paleta vermelho, amarelo e branco", "destacar a vacinação em todas as
 * artes". Nenhuma tem número, e todas mudam a peça.
 *
 * O que realmente separa é o VERBO DE INSTRUÇÃO. Regra é ordem para quem produz — usar, incluir,
 * destacar, conferir, evitar. Ruído é narrativa em terceira pessoa sobre o negócio: "o faturamento
 * está sendo puxado manualmente", "Saquarema começou devagar o mês", "caiu a venda de bruto". Tudo
 * verdade, nada que o designer faça a respeito.
 */
// RAÍZES, não infinitivos: a base está cheia de conjugação — "toda legenda FECHA com o endereço",
// "a arte LEVA o selo", "SEMPRE INCLUI o telefone". Buscar por "fechar" não casa "fecha", e foi
// assim que uma regra boa caiu no primeiro teste.
const VERBOS_DE_INSTRUCAO =
  /\b(us[ae]|usar|utiliz|inclu|adicion|coloc|inser|destac|evit|mant[êe]|manter|segu|confer|revis|post|public|escrev|cit[ae]|citar|mencion|mostr|exib|prioriz|padroniz|separ|limp|cri[ae]|criar|desativ|remov|tir[ae]|tirar|troc|substitu|fech|abr[ei]|marc|sinaliz|respeit|aplic|refor[çc]|lembr|atent|cuid|verific|valid|aprov|solicit|lev[ae]|levar)/i;

/**
 * Proibição e preferência do cliente também são instrução, mesmo sem verbo de ação.
 *
 * "O cliente não considera parafusos um tema relevante" e "não quer aparecer nas fotos" dizem o que
 * NÃO fazer — é o tipo de regra que mais evita retrabalho. A primeira versão só reconhecia proibição
 * com verbo de produção ("não postar", "não usar") e barrou justamente essas, que já estavam
 * cobertas por teste desde a faxina anterior.
 */
const PROIBICAO_CLARA =
  /\b(nunca|jamais|n[ãa]o\s+(pode|deve|quer|gosta|aceita|admite|curte|aprova|considera|autoriza|permite|usar|postar|citar|colocar|falar|mencionar|escrever|mostrar))\b/i;

/**
 * Narrativa sobre o negócio: descreve, não instrui.
 *
 * O fim usa LOOKAHEAD, não `\b` — pela segunda vez neste arquivo. Em JS o `\b` é ASCII, então
 * "está\b" nunca casa: não existe borda depois do "á" para o motor. Escrevi assim de novo mesmo com
 * o aviso três blocos acima, e o filtro deixou passar "o faturamento está sendo puxado manualmente"
 * até o teste pegar. Em regex com acento no fim do token, lookahead sempre.
 */
const RX_RELATO = /\b(est[áa]|est[ãa]o|estava|estavam|come[çc]ou|caiu|subiu|aumentou|diminuiu|melhorou|piorou|aconteceu|houve|teve|foi|foram|ficou|ficaram|vem|v[êe]m|anda|andam)(?=\s|[,.;!?]|$)/i;

/**
 * Dado operacional durável: endereço, telefone, horário.
 *
 * "Mudança de horário de funcionamento para 07:30 a 13:00" não tem verbo de instrução nenhum, e é
 * exatamente o tipo de regra que evita o erro mais caro — a arte sair com o horário velho. O dado
 * em si é a instrução.
 */
const RX_DADO_DURAVEL =
  /\b(hor[áa]rio|funcionamento|endere[çc]o|telefone|whats|contato|abre|fecha|atende)\b/i;

/**
 * "deve/devem/precisa" é ordem, venha onde vier na frase.
 *
 * "A cafeteria e um compressor estão disponíveis no local e DEVEM SER MENCIONADOS na legenda"
 * começa descrevendo e termina instruindo. A regra de posição — instrução tem que vir antes do
 * relato — derruba essa, e ela é exatamente o tipo de coisa que o designer precisa saber.
 */
const OBRIGACAO = /\b(dev[ae]m?|precisa[m]?|tem que|t[êe]m que|obrigat[óo]ri[oa]|sempre que)\b/i;

function temInstrucao(t: string): boolean {
  if (PROIBICAO_CLARA.test(t)) return true;
  if (OBRIGACAO.test(t) && VERBOS_DE_INSTRUCAO.test(t)) return true;
  // Dado operacional com o VALOR junto (número ou nome) vale por si.
  if (RX_DADO_DURAVEL.test(t) && /\d|[A-ZÁÉÍÓÚ][a-záéíóú]{2,}/.test(t.slice(1))) return true;
  if (!VERBOS_DE_INSTRUCAO.test(t)) return false;

  // Relato pode conter verbo de ordem no meio ("o faturamento ESTÁ sendo puxado pra VERIFICAR").
  // Quando a frase começa descrevendo, é relato — a ordem teria vindo antes.
  const iInstr = t.search(VERBOS_DE_INSTRUCAO);
  const iRelato = t.search(RX_RELATO);
  return iRelato === -1 || iInstr < iRelato;
}

export type MotivoDescarte =
  | "catalogo" | "promocao" | "efemero" | "curto" | "narrativa"
  | "anuncio_vazio" | "processo_interno" | "generica";

/**
 * O texto pode virar regra permanente? Retorna o motivo quando NÃO pode.
 *
 * Deliberadamente conservador em uma direção só: preferimos deixar passar uma regra fraca (o time
 * apaga em /clients) a barrar uma regra boa (que nunca mais volta).
 */
export function motivoParaNaoVirarRegra(texto: string): MotivoDescarte | null {
  const t = (texto || "").trim();
  if (t.length < 12) return "curto";
  if (RX_CATALOGO.test(t)) return "catalogo";
  if (RX_PROMO.test(t)) return "promocao";
  if (RX_EFEMERO.test(t)) return "efemero";
  if (RX_ITEM_CATALOGO.test(t)) return "catalogo";
  if (RX_NARRATIVA.test(t)) return "narrativa";
  if (RX_ANUNCIO_VAZIO.test(t)) return "anuncio_vazio";
  if (RX_PROCESSO_INTERNO.test(t)) return "processo_interno";
  if (!temInstrucao(t)) return "generica";
  return null;
}

export function podeVirarRegra(texto: string): boolean {
  return motivoParaNaoVirarRegra(texto) === null;
}

// ── Prompt compartilhado ─────────────────────────────────────────────────────
// Mesma definição de regra nos TRÊS pontos que aprendem (job semanal, correção do cliente no grupo,
// e o que a equipe escreve nos cards). Antes cada um tinha a sua, e só o job semanal era exigente.

export const DEFINICAO_DE_REGRA = `
Uma REGRA é algo que muda o que a agência faz na PRÓXIMA peça deste cliente, e continua valendo mês
que vem. Teste único: "se o designer/social esquecer disso amanhã, o cliente reclama de novo?"

TIPOS (classifique em um):
- visual      → cor, logo, fonte, enquadramento, o que precisa aparecer na arte
                ex: "o logo tem que estar no rodapé, nunca no topo" · "não usar vermelho"
- copy        → o que a legenda deve ou não dizer, tom, o que sempre citar
                ex: "toda legenda fecha com o endereço" · "citar o fabricante junto com o nome do piso"
- operacional → dado durável do negócio: endereço, telefone, horário, quem aprova, área de entrega
                ex: "o endereço certo é Av. Brasil 120, não o antigo da Rua 7"
- proibicao   → o que NUNCA fazer
                ex: "não postar sem o cliente revisar antes" · "não falar de parafuso, não é o foco"

NÃO É REGRA (jamais retorne):
- preço, desconto, condição de pagamento, medida — é catálogo, muda toda semana
- promoção com prazo ("válida até dia 25")
- estado passageiro ("a equipe está em treinamento", "o material sai sexta")
- opinião solta sobre uma peça ("não gostei dessa arte") sem dizer o QUE mudar
- saudação, combinado de horário, conversa
- ANÚNCIO de informação sem a informação ("Informação sobre o horário de funcionamento").
  A regra tem que CARREGAR o dado: "abre 07:30 e fecha 13:00 aos sábados"
- processo interno da agência ("manter comunicação próxima", "dar retorno em até uma semana").
  A base é lida na hora de fazer a PEÇA — isso não muda a peça
- conselho genérico sem nada concreto ("ser mais atencioso", "buscar qualidade")

Escreva cada regra como INSTRUÇÃO para quem vai produzir, curta e no imperativo. Não copie a fala do
cliente — traduza. "o endereço tá errado" vira "conferir o endereço na arte: o correto é X".`.trim();

/** Schema JSON compartilhado pelos extratores. */
export const SCHEMA_REGRAS = {
  type: "object",
  additionalProperties: false,
  required: ["regras"],
  properties: {
    regras: {
      type: "array",
      description: "Regras duráveis encontradas. Vazio se não houver nenhuma — o normal é vazio.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["texto", "tipo"],
        properties: {
          texto: { type: "string", description: "A regra como instrução curta e imperativa." },
          tipo: { type: "string", enum: [...TIPOS_REGRA] },
        },
      },
    },
  },
} as const;

export interface RegraExtraida { texto: string; tipo: TipoRegra }

/** Aplica o portão determinístico + normaliza. Use SEMPRE antes de gravar o que a IA devolveu. */
export function filtrarRegras(brutas: unknown): RegraExtraida[] {
  if (!Array.isArray(brutas)) return [];
  const vistas = new Set<string>();
  const out: RegraExtraida[] = [];
  for (const r of brutas) {
    const texto = String((r as RegraExtraida)?.texto ?? "").trim().slice(0, 220);
    const tipo = (r as RegraExtraida)?.tipo;
    if (!texto || !TIPOS_REGRA.includes(tipo)) continue;
    if (!podeVirarRegra(texto)) continue;
    const chave = texto.toLowerCase().replace(/\s+/g, " ");
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    out.push({ texto, tipo });
  }
  return out;
}

// ── Proposta ────────────────────────────────────────────────────────────────
// Os três pontos que aprendem (regras da semana nas conversas, releitura do ciclo, correção no grupo)
// passam por aqui, pra dedup e cap serem os mesmos em todos.
//
// REGRA APRENDIDA SÓ COM OK (26/10/2026, semana 1 do plano de agentes). Até aqui os três gravavam a regra
// JÁ ATIVA: 248 + 186 regras em 60 dias sem ninguém olhar (de 378 regras, só 10 eram acionáveis). Agora a
// regra nasce PROPOSTA (ativo = false, invisível para o agente e para a tela) com um código de 4 letras; um
// gestor salva com "ok <código>" no grupo interno (lib/cs/regras-propostas.ts). As das rotinas de domingo
// saem num resumo só, na segunda; a da correção sai na mesma mensagem que já existia.

import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Teto por cliente/dia e por fonte: guarda-corpo contra envenenamento e contra pedir ok demais. */
const CAP_POR_DIA = 5;

export interface RegraProposta extends RegraExtraida { id: string; codigo: string }
export interface ResultadoProposta { propostas: RegraProposta[]; puladas: number }

/** Mesma lição escrita duas vezes ("conferir o endereço" ⊂ "conferir o endereço na arte") conta como uma. */
export function mesmaLicao(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

/**
 * Quais regras viram proposta: as que não repetem uma regra ativa nem uma proposta aberta, até o teto
 * que sobra no dia. Pura (o teste roda sem banco).
 */
export function separarNovas(regras: RegraExtraida[], jaExistem: string[], restante: number): { novas: RegraExtraida[]; puladas: number } {
  const vistas = [...jaExistem];
  const novas: RegraExtraida[] = [];
  let puladas = 0;
  let sobra = Math.max(0, restante);
  for (const r of regras) {
    if (vistas.some((e) => mesmaLicao(e, r.texto))) { puladas++; continue; }
    if (sobra <= 0) { puladas++; continue; }
    novas.push(r); vistas.push(r.texto); sobra--;
  }
  return { novas, puladas };
}

/** Código de 4 letras hex que não esteja em uso por outra proposta aberta. */
export function novoCodigo(usados: Set<string>, sortear: () => string = () => randomBytes(2).toString("hex")): string {
  for (let i = 0; i < 50; i++) {
    const c = sortear();
    if (!usados.has(c)) { usados.add(c); return c; }
  }
  const c = sortear(); usados.add(c); return c; // 50 colisões seguidas: vale o sorteio
}

export async function proporRegrasAprendidas(
  clientId: string,
  regras: RegraExtraida[],
  meta: { author: string; sourceMessage?: string; capPorDia?: number },
): Promise<ResultadoProposta> {
  if (!regras.length) return { propostas: [], puladas: 0 };

  const desde24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // O cap conta POR FONTE, não no total do cliente: três fontes rodam no mesmo domingo, e a primeira
  // não pode calar as outras. Conta proposta e ativa, para o teto valer de verdade.
  const [{ data: existentes, error: eEx }, { count: hoje }, { data: abertas }] = await Promise.all([
    supabaseAdmin.from("cs_client_rules").select("texto")
      .eq("client_id", clientId).in("estado", ["ativa", "proposta"]),
    supabaseAdmin.from("cs_client_rules").select("id", { count: "exact", head: true })
      .eq("client_id", clientId).eq("origem", "aprendido").eq("author", meta.author)
      .gte("created_at", desde24h),
    supabaseAdmin.from("cs_client_rules").select("codigo").eq("estado", "proposta").not("codigo", "is", null),
  ]);
  if (eEx) { console.error("[CS/regras] não li as regras do cliente:", eEx.message); return { propostas: [], puladas: regras.length }; }

  const { novas, puladas } = separarNovas(
    regras, (existentes ?? []).map((e) => String(e.texto)), (meta.capPorDia ?? CAP_POR_DIA) - (hoje ?? 0),
  );
  if (!novas.length) return { propostas: [], puladas };

  const usados = new Set((abertas ?? []).map((a) => String(a.codigo)));
  const linhas = novas.map((r) => ({
    client_id: clientId, texto: r.texto, escopo: ESCOPO_POR_TIPO[r.tipo],
    origem: "aprendido", author: meta.author, ativo: false, estado: "proposta",
    codigo: novoCodigo(usados), source_message: meta.sourceMessage?.slice(0, 1000) ?? null,
  }));
  const { data, error } = await supabaseAdmin.from("cs_client_rules").insert(linhas).select("id, codigo, texto");
  if (error) { console.error("[CS/regras] falhou ao propor:", error.message); return { propostas: [], puladas }; }

  const porTexto = new Map((data ?? []).map((d) => [String(d.texto), d]));
  const propostas = novas.flatMap((r) => {
    const d = porTexto.get(r.texto);
    return d ? [{ ...r, id: String(d.id), codigo: String(d.codigo) }] : [];
  });
  return { propostas, puladas };
}
