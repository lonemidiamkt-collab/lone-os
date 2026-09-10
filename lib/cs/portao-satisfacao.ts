// lib/cs/portao-satisfacao.ts — PORTÃO DO TERMÔMETRO. O classificador (gpt-4o-mini) diz o que achou;
// este arquivo decide se aquilo pode virar alerta no grupo do time e mexer no attention_level.
//
// Por que existe: em 10/09/2026 auditei os 66 alertas disparados desde julho. ~50 eram falso-positivo
// (79%). E o prompt JÁ trazia a regra certa — a frase "não gostei desse aqui na hora de falar o valor"
// está escrita no prompt como exemplo de NEUTRO e mesmo assim disparou alerta em 01/09. Ou seja:
// exemplo no prompt não segura o modelo. O que segura é código.
//
// Regra de ouro: este portão só sabe DESLIGAR alerta, nunca ligar. Um bug aqui causa silêncio —
// que é o erro barato. Falso-positivo é o erro caro: ensina o time a ignorar o alerta e derruba o
// score do cliente à toa (attention_level alimenta o risco de churn em lib/health/compute.ts).

export type SobreOQue =
  | "agencia"             // a relação: atendimento, prazo, entrega, resposta da Lone
  | "peca"                // a arte/vídeo/legenda em si — é o trabalho acontecendo
  | "negocio_do_cliente"  // a loja dele, o movimento, o preço dele, a equipe dele
  | "terceiro"            // funcionário, sócio, fornecedor, o cliente final DELE
  | "resultado_campanha"  // custo por lead, volume de mensagem — assunto do gestor de tráfego
  | "operacional"         // fato sem carga: "não chegou ainda", "n tá carregando", agendamento
  | "indefinido";         // não deu pra dizer de quem/de quê ele está falando

// ── Marcadores de RECLAMAÇÃO DA RELAÇÃO. Se algum aparece, o portão não veta por brevidade,
// celebração ou vocabulário de peça: aí é assunto da agência mesmo.
// Atenção ao \b final: "obrigad\b" NÃO casa "obrigado" (o "o" é caractere de palavra). Entrada que
// é PREFIXO leva \S* no fim — foi assim que "atrasado" e "obrigado" passaram batido no primeiro corte.
const RX_RELACAO =
  /\b(insatisfa\S*|indignad\S*|decepcion\S*|n[ãa]o t[ôo] gostando|n[ãa]o estou gostando|de novo|j[áa] falei|falei isso|cad[êe]|sem retorno|n[ãa]o me respond\S*|n[ãa]o respondem|n[ãa]o tive resposta|n[ãa]o tivemos retorno|nenhuma resposta|voc[êe]s n[ãa]o|vcs n[ãa]o|atras(o|ad\S*)|fora do prazo|prometid\S*|combinad\S*|programad\S*|desde ontem|semana passada|j[áa] faz|toda vez|sempre a mesma|enrolad\S*|descaso|falta de|esse grupo [ée]|pra que serve)/i;

// ── CELEBRAÇÃO / ELOGIO. Palmas, agradecimento, "agora vai". Vira alívio, não reclamação.
const RX_CELEBRACAO =
  /[👏🙌🎉🥳😍🔥💪❤️😀😃😄😁🤩]|\b(parab[ée]ns|obrigad\S*|valeu|show|arrasou|arrasaram|mandaram bem|ficou (?:[óo]tim\S*|lind\S*|show|perfeit\S*|massa)|perfeito|maravilh\S*|adorei|amei|curti|curtimos|excelente|agora vai|isso a[ií]|boa demais)\b/i;

// ── Vocabulário da PEÇA. Criticar a peça é o cliente participando, não é insatisfação.
const RX_PECA =
  /\b(arte|artes|post|posts|postagem|postad\S*|postar|story|stories|reels?|v[íi]deo|v[íi]deos|legenda|legendas|foto|fotos|imagem|imagens|banner|cor|cores|fonte|layout|design|logo|criativo|criativos|pe[çc]a|montagem|edi[çc][ãa]o|[áa]udio|som|trilha|medida|medidas|modelo|capa|thumb|card|feed|carrossel|copy)\b/i;

// ── Vocabulário de TERCEIRO: não é a Lone, é gente do lado dele.
const RX_TERCEIRO =
  /\b(meu (funcion[áa]rio|vendedor|s[óo]cio|gerente|rapaz|menino|time|pessoal|filho|irm[ãa]o)|minha (equipe|funcion[áa]ria|vendedora|s[óo]cia|esposa|filha)|o (rapaz|menino|vendedor|fornecedor|entregador|motorista|projetista|arquiteto)|a (vendedora|menina|loja|fabrica|f[áa]brica)|meus clientes|meu cliente|os clientes|o cliente final|fornecedor|concorr[êe]ncia|concorrente)\b/i;

// ── Vocabulário de RESULTADO DE CAMPANHA. É sinal legítimo — mas do gestor de tráfego, não
// "cliente insatisfeito". Ir pro balde errado é o que faz o time parar de ler o alerta.
const RX_RESULTADO =
  /\b(custo por (lead|conversa|mensagem|clique|resultado)|cpl|cpm|cpc|lead|leads|or[çc]amento|convers[ãa]o|alcance|impress[õo]es|movimento|vendas?|vende\S*|vender|faturamento|ticket|roi|retorno sobre)\b/i;

// ── SAÍDA DE VERDADE. Verbo de saída + objeto que é o CONTRATO. "Cancelei o login" e "vou fazer de
// outro banco" viraram 🚨 risco de churn em produção — os dois com o objeto errado.
const RX_SAIDA_VERBO =
  /\b(cancelar|cancelamento|encerrar|rescindir|rescis[ãa]o|distratar|desistir|parar|pausar|suspender|sair|romper|finalizar)\b/i;
const RX_SAIDA_OBJETO =
  /\b(contrato|parceria|mensalidade|assessoria|nosso acordo|com voc[êe]s|com a lone|a ag[êe]ncia|servi[çc]o de voc[êe]s|trabalho de voc[êe]s|de trabalhar com)\b/i;
// Frases de saída que se bastam sozinhas — não precisam de objeto.
const RX_SAIDA_NUA =
  /\b(quero cancelar|vou cancelar|vamos cancelar|quero encerrar|vamos encerrar|pensando em (sair|encerrar|cancelar|parar)|n[ãa]o vale a pena continuar|n[ãa]o quero mais continuar|n[ãa]o vamos continuar|vou parar por aqui)\b/i;

// Cliente apontando para uma entrega específica ("desse aqui", "igual o último", "prefiro a
// primeira"). Não tem substantivo de peça na frase, mas é peça: ele está comparando versões.
const RX_PECA_DEITICO =
  /\b(desse aqui|nesse aqui|esse aqui|dessa aqui|nessa aqui|essa aqui|desse a[íi]|igual (?:o [úu]ltimo|a [úu]ltima|esse|essa|aquele|aquela|o de antes)|primeira vers[ãa]o|prefiro (?:a|o|esse|essa)|a anterior|o anterior|de antes)\b/i;

const CURTA = 45; // acima disso já dá pra ter contexto; abaixo, quase sempre é fragmento

export interface EntradaPortao {
  sentimento: "positivo" | "neutro" | "negativo";
  risco: "baixo" | "medio" | "alto";
  churn: boolean;
  sobre?: SobreOQue;
}
export interface DecisaoPortao {
  alerta: boolean;
  churn: boolean;
  risco: "baixo" | "medio" | "alto";
  /** Por que o portão desligou — vai pro log, é o que permite auditar depois. */
  veto: string | null;
}

/** A mensagem fala explicitamente da relação com a agência? */
export function falaDaAgencia(texto: string): boolean {
  return RX_RELACAO.test(texto);
}

/** Elogio/palmas/alívio na mensagem. */
export function temCelebracao(texto: string): boolean {
  return RX_CELEBRACAO.test(texto);
}

/** Curta demais pra julgar e sem nada que aponte pra agência. */
export function ehFragmento(texto: string): boolean {
  const t = texto.trim();
  return t.length <= CURTA && !RX_RELACAO.test(t);
}

/** Está falando da peça (arte/vídeo/legenda), não do atendimento. */
export function ehSobrePeca(texto: string): boolean {
  return (RX_PECA.test(texto) || RX_PECA_DEITICO.test(texto)) && !RX_RELACAO.test(texto);
}

/** Está falando de gente do lado dele — funcionário, sócio, fornecedor, cliente final. */
export function ehSobreTerceiro(texto: string): boolean {
  return RX_TERCEIRO.test(texto) && !RX_RELACAO.test(texto);
}

/** É número de campanha (assunto do tráfego), não desgaste da relação. */
export function ehResultadoDeCampanha(texto: string): boolean {
  return RX_RESULTADO.test(texto) && !RX_RELACAO.test(texto);
}

/** Sinal real de querer sair do CONTRATO — não de cancelar um login ou abortar uma pauta. */
export function ehSaidaDeVerdade(texto: string): boolean {
  if (RX_SAIDA_NUA.test(texto)) return true;
  return RX_SAIDA_VERBO.test(texto) && RX_SAIDA_OBJETO.test(texto);
}

/**
 * Decide se o que o modelo classificou pode virar alerta. Só reduz: nunca transforma um "baixo"
 * em alerta, nunca liga churn que o modelo não ligou.
 */
export function decidirAlerta(s: EntradaPortao, texto: string): DecisaoPortao {
  const churnBruto = s.churn;
  const churn = churnBruto && ehSaidaDeVerdade(texto);
  const alertaBruto = churn || (s.sentimento === "negativo" && (s.risco === "medio" || s.risco === "alto"));

  const nao = (veto: string): DecisaoPortao => ({ alerta: false, churn: false, risco: "baixo", veto });

  if (!alertaBruto) return { alerta: false, churn: false, risco: s.risco, veto: churnBruto && !churn ? "churn-sem-contrato" : null };

  // Saída de contrato confirmada passa por cima de tudo: é curta por natureza ("quero cancelar") e
  // não pode morrer no portão de fragmento.
  if (churn) return { alerta: true, churn: true, risco: "alto", veto: null };

  // Se a mensagem diz alguma coisa sobre COMO ELE ESTÁ SENDO ATENDIDO, o alerta vale — nem elogio
  // na mesma frase ("obrigado pelo retorno, mas cadê a arte…") nem palavra de peça derrubam.
  if (falaDaAgencia(texto)) return { alerta: true, churn: false, risco: s.risco, veto: null };

  // A partir daqui o modelo quer alertar mas nada na mensagem aponta pra agência. Cada veto abaixo
  // é uma família de erro que aconteceu de verdade.
  if (temCelebracao(texto)) return nao("celebracao");                    // "…puxão de orelha! 👏👏👏"
  if (s.sobre === "peca" || ehSobrePeca(texto)) return nao("peca");      // "medida está errada, e 45x45"
  if (s.sobre === "terceiro" || ehSobreTerceiro(texto)) return nao("terceiro");
  if (s.sobre === "negocio_do_cliente") return nao("negocio-do-cliente"); // "movimento parado"
  if (s.sobre === "resultado_campanha" || ehResultadoDeCampanha(texto)) return nao("resultado-campanha");
  if (s.sobre === "operacional") return nao("operacional");              // "não chegou ainda"
  if (s.sobre === "indefinido") return nao("indefinido");                // "não é o meu então"
  if (ehFragmento(texto)) return nao("fragmento");                       // "esse aqui não"

  return { alerta: true, churn, risco: s.risco, veto: churnBruto && !churn ? "churn-sem-contrato" : null };
}
