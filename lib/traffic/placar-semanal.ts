// lib/traffic/placar-semanal.ts — o texto que acompanha o relatório de segunda ("placar da semana").
//
// POR QUE (Roberto, 24/10/2026): a legenda do PDF era uma frase de bênção sorteada entre cinco, a
// mesma para a loja de tinta e para a clínica de estética. O dono lê o WhatsApp no intervalo do
// balcão e não abre o PDF: o texto é o relatório que ele de fato lê. Agora a legenda é o placar,
// no modelo do Playbook Lone Construção ("Como o time conversa com ele"):
//
//   Bom dia! Relatório da semana (13 a 19/10) aqui em cima.
//   *Placar:* 38 conversas no WhatsApp vindas do anúncio, R$ 4,20 em média por conversa — 12% a
//   mais que na semana anterior.
//   *O que mais puxou conversa:* telha fibrocimento 2,44×1,10 (14 conversas) e cimento CP3 (9).
//   *Dica:* uma dica do nicho dele, de uma linha.
//   E aí na loja, a semana vendeu mais ou menos que a anterior?
//
// As regras que este arquivo segura (Playbook, "As 8 regras"):
//   · número primeiro, pergunta no fim; até 5 linhas;
//   · o produto pelo nome e pela medida ("telha fibrocimento 2,44×1,10"), nunca o nome do anúncio
//     ("ADS - ESTATICO - ...") e NUNCA o preço que está no nome — ele pode estar vencido;
//   · zero jargão: "lead", CTR, CPM não aparecem; o resultado tem nome de gente;
//   · nada de prometer: a dica pede ou sugere, não garante.
// Os números são OS MESMOS do PDF: tudo sai do RelatorioAnuncios que montou o relatório.
//
// Puro (sem banco, sem rede). Testado em tests/placar-semanal.test.ts. Skill: .claude/skills/placar-semanal.

import type { RelatorioAnuncios, Criativo } from "@/lib/reports/relatorioCliente";
import type { TipoResultadoConta } from "@/lib/meta/resultado";
import { PERFIS_VOZ, type SegmentoVoz } from "@/lib/traffic/placar-voz";

export { PERFIS_VOZ, type SegmentoVoz };

// ── De que segmento é o cliente (decide a pergunta e as dicas) ───────────────────────────────

export interface ClienteParaVoz {
  nome?: string | null;
  nicho?: string | null;
  cnae_principal?: string | null;
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * O segmento de voz. Ordem: o NOME (quando é inequívoco — "Tintas", "Pisos", "Ótica"), o nicho
 * Energia solar (o CNAE dos integradores é de instalação elétrica ou de móveis), o CNAE e, por fim,
 * o nicho. Nada casou → "varejo", que fala de loja sem supor o que ela vende.
 */
export function segmentoDeVoz(c: ClienteParaVoz): SegmentoVoz {
  const nome = sem(c.nome ?? "");
  const nicho = sem(c.nicho ?? "");
  const cnae = (c.cnae_principal ?? "").replace(/\D/g, "");

  if (/\btinta/.test(nome)) return "tintas";
  if (/\bpiso|porcelanat|revestiment|acabament/.test(nome)) return "pisos";
  if (/\boticas?\b/.test(nome)) return "otica";
  if (/barbear/.test(nome)) return "barbearia";
  if (/solar|fotovolt/.test(nome) || /solar|energia/.test(nicho)) return "solar";
  if (/\bpneu|p'?neus/.test(nome)) return "pneus";
  if (/estofad|moveis|decorac|\bmdf\b/.test(nome)) return "moveis";
  if (/madeir/.test(nome)) return "madeira";
  if (/bazar/.test(nome)) return "bazar";

  if (cnae.startsWith("4741")) return "tintas";
  if (cnae === "4744006") return "pisos";
  if (cnae === "4744001") return "ferragens";
  if (cnae === "4744002" || cnae.startsWith("4671")) return "madeira";
  if (cnae.startsWith("4744") || cnae.startsWith("4679") || cnae.startsWith("4321")) return "construcao";
  if (cnae.startsWith("4754") || cnae.startsWith("3101")) return "moveis";
  if (cnae.startsWith("4530")) return cnae === "4530705" ? "pneus" : "autopecas";
  if (cnae.startsWith("4511") || cnae.startsWith("4512")) return "veiculos";
  if (cnae.startsWith("7500")) return "veterinaria";
  if (cnae === "4771702" || cnae === "4771703") return "farmacia";
  if (cnae.startsWith("4774")) return "otica";
  if (cnae === "9602502") return "estetica";
  if (cnae === "9602501") return "barbearia";
  if (cnae.startsWith("86")) return "clinica";
  if (cnae.startsWith("6920")) return "contabilidade";
  if (cnae.startsWith("4729") || cnae.startsWith("4772")) return "suplementos";
  if (cnae === "4789004") return "pet";
  if (cnae.startsWith("8130") || cnae === "4789002") return "plantas";
  if (cnae.startsWith("56")) return "alimentacao";
  if (cnae === "4789099" || cnae.startsWith("4759") || cnae.startsWith("4757")) return "bazar";

  if (/constru/.test(nicho)) return "construcao";
  if (/movei|decorac/.test(nicho)) return "moveis";
  if (/otica/.test(nicho)) return "otica";
  if (/belez|estetic/.test(nicho)) return "estetica";
  if (/saude|clinic/.test(nicho)) return "clinica";
  if (/automot/.test(nicho)) return "autopecas";
  if (/pet/.test(nicho)) return "pet";
  if (/aliment/.test(nicho)) return "alimentacao";
  if (/fitness/.test(nicho)) return "suplementos";
  if (/servicos profission/.test(nicho)) return "contabilidade";
  return "varejo";
}

// ── O produto pelo nome e pela medida, a partir do nome do anúncio ───────────────────────────

/** Palavras que, no nome do anúncio, são produto ou serviço (comum ou de medida). Minúsculas, sem acento. */
const PRODUTOS = new Set(
  (
    // construção e acabamento
    "telha telhas tinta tintas massa selador cimento porcelanato piso pisos revestimento ceramica argamassa rejunte " +
    "madeira madeiras ripa ripas viga vigas caibro caibros tabua tabuas regua reguas mourao aduela porta portas janela " +
    "vergalhao vergalhoes trelica trelicas malha malhas ferro ferros chapa chapas caixa tubo tubos cano conexoes areia " +
    "brita tijolo tijolos bloco blocos laje impermeabilizante manta calha cumeeira acm placa placas mdf " +
    "compensado esquadria esquadrias aluminio vidro guarda-corpo pergolado deck serra seladora pedra pedras gres " +
    "semi-gres poste impermeabilizacao comoda armario armarios tenis carrinho roupa " +
    // hidráulica, elétrica e ferramentas
    "fechadura ducha chuveiro torneira assento bomba escada parafusadeira furadeira lavadora cortador filtro tomada " +
    "disjuntor fio fios cabo lampada refletor drone tv box ventilador " +
    // móveis
    "sofa sofas estofado estofados cama colchao mesa cadeira rack guarda-roupa painel poltrona cortina tapete " +
    // solar
    "kit inversor bateria kwp modulo modulos energia " +
    // beleza, saúde e serviços
    "depilacao laser botox toxina preenchimento peeling limpeza sessoes sessao pacote virilha axila pernas braços bracos " +
    "areas corte barba sobrancelha progressiva oculos armacao armacoes lente lentes multifocal exame consulta vacina " +
    "castracao formula formulas capsulas manipulado manipulados contabilidade mei imposto abertura " +
    // automotivo, pet, plantas, alimentação, suplementos
    "pastilha freio amortecedor oleo pneu pneus aro alinhamento balanceamento suspensao embreagem racao banho tosa muda " +
    "mudas palmeira grama vaso vasos paisagismo acai combo whey creatina suplemento suplementos"
  ).split(/\s+/),
);

/** Palavras comuns que ficam em minúscula no meio do nome; o resto (marca, linha) ganha maiúscula. */
const COMUNS = new Set(
  (
    "de da do das dos e em com para pra sem a o as os um uma " +
    "fibrocimento esmaltada esmaltado portuguesa termica galvanizada galvanizado tratado tratada mista misto pinus " +
    "eucalipto corrida acrilica fosca acetinado acetinada polido retificado lavavel economica ultra matte submersa " +
    "alta pressao barro superior inferior total completo completa pequena pequenas grande inteira inteiras facial " +
    "labial terco rosto manutencao especial oferta promocao promo agua piso solar hibrido hibrida rapida " +
    "botulinica corporal capilar hidratante natural original premium plus max mini"
  ).split(/\s+/),
);

/** Acentos que o nome do anúncio perdeu (escrito em caixa alta, sem acento). */
const ACENTOS: Record<string, string> = {
  ceramica: "cerâmica", termica: "térmica", lavavel: "lavável", economica: "econômica", agua: "água", aguas: "águas",
  mourao: "mourão", vergalhao: "vergalhão", vergalhoes: "vergalhões", trelica: "treliça", trelicas: "treliças",
  regua: "régua", reguas: "réguas", tabua: "tábua", tabuas: "tábuas", aluminio: "alumínio", acrilica: "acrílica",
  depilacao: "depilação", sessoes: "sessões", sessao: "sessão", botulinica: "botulínica", terco: "terço",
  manutencao: "manutenção", pressao: "pressão", lampada: "lâmpada", colchao: "colchão", sofa: "sofá", sofas: "sofás",
  oculos: "óculos", armacao: "armação", armacoes: "armações", formula: "fórmula", formulas: "fórmulas",
  capsulas: "cápsulas", suspensao: "suspensão", oleo: "óleo", racao: "ração", acai: "açaí", promocao: "promoção",
  conexoes: "conexões", modulo: "módulo", modulos: "módulos", hibrido: "híbrido", hibrida: "híbrida", rapida: "rápida",
  castracao: "castração", eletrica: "elétrica", hidraulica: "hidráulica", impermeabilizacao: "impermeabilização",
  ha: "há", ja: "já", mes: "mês", tenis: "tênis", sao: "são", nao: "não", ate: "até", aniversario: "aniversário",
  comoda: "cômoda", armario: "armário", armarios: "armários", marmore: "mármore", tambem: "também", voce: "você",
  caminhao: "caminhão", gratis: "grátis", liquida: "líquida", campeao: "campeão", padrao: "padrão",
  mao: "mão", movel: "móvel", moveis: "móveis", disponivel: "disponível", feirao: "feirão",
  area: "área", areas: "áreas", unamar: "Unamar", whatsapp: "WhatsApp", instagram: "Instagram", pix: "Pix",
  // cidades de uma palavra só; as compostas ("Cabo Frio") ficam em CIDADES, depois de montar a frase
  araruama: "Araruama", saquarema: "Saquarema", marica: "Maricá", iguaba: "Iguaba", macae: "Macaé", buzios: "Búzios",
  niteroi: "Niterói", brasil: "Brasil",
};

/** Cidades de mais de uma palavra (aplicadas na frase pronta: "cabo" sozinho é cabo elétrico). */
const CIDADES: [RegExp, string][] = [
  [/s[aã]o pedro da aldeia/gi, "São Pedro da Aldeia"], [/cabo frio/gi, "Cabo Frio"], [/arraial do cabo/gi, "Arraial do Cabo"],
  [/rio das ostras/gi, "Rio das Ostras"], [/campos dos goytacazes/gi, "Campos dos Goytacazes"], [/iguaba grande/gi, "Iguaba Grande"],
  [/rio de janeiro/gi, "Rio de Janeiro"], [/s[aã]o gon[cç]alo/gi, "São Gonçalo"], [/s[aã]o pedro\b/gi, "São Pedro"],
];

/** Nome de anúncio que é anotação do time, não frase do anúncio ("Curto / transformação / CTA"). */
const JARGAO = /\b(cta|hook|ugc|cpl|cpa|leads?|remarketing|rmkt|lal|lookalike|p[uú]blico|criativo|copy|teste a\/?b)\b/i;
const comCidades = (t: string) => CIDADES.reduce((acc, [re, nome]) => acc.replace(re, nome), t);

/** Unidades depois de número: o jeito certo de escrever. */
const UNIDADES: Record<string, string> = { mm: "mm", cm: "cm", m: "m", kg: "kg", ml: "ml", l: "L", kwp: "kWp", kw: "kW" };
const UNIDADES_ESCRITAS = new Set(Object.values(UNIDADES));

const ROTULOS_DE_FORMATO = /\b(ads?|anuncio|es?a?t[aá]ticos?|imagem|iamgem|imagens|v[oó]?[ií]deos?|carrossel|reels?|stories|story|motion|gif|teste|fecha mes)\b/gi;

export type FormatoAnuncio = "imagem" | "video" | "post" | "outro";

export interface ProdutoDoAnuncio {
  /** O que vai na mensagem: "telha fibrocimento 2,44×1,10", "Decora Matte 18 L". null = não dá pra citar. */
  texto: string | null;
  /** true = o nome tem produto ou serviço reconhecível; false = é a frase de abertura de um vídeo/post. */
  ehProduto: boolean;
  formato: FormatoAnuncio;
}

function formatoDoNome(nome: string): FormatoAnuncio {
  if (/^\s*post do instagram/i.test(nome)) return "post";
  if (/v[ií]deo/i.test(nome)) return "video";
  if (/est[aá]tico|imagem|iamgem/i.test(nome)) return "imagem";
  return "outro";
}

/** Siglas que ficam em maiúscula. */
const SIGLAS = new Set(["pva", "acm", "mdf", "mei", "tv", "pvc", "led", "pei", "ac", "st", "cp", "ir", "suv", "bmw", "ram", "gm", "vw", "rcm", "tz"]);

/**
 * Uma palavra como se escreve no WhatsApp: minúscula (com o acento que o nome perdeu), sigla e código
 * em maiúscula ("CP3", "PVA", "HB20"), unidade no jeito certo ("18 L", "4 mm"), cidade com maiúscula.
 * Marca fica em minúscula ("telha kingspan") — maiúscula em palavra desconhecida acertava a marca e
 * errava o adjetivo ("porta Lisa", "areia Lavada"); a minúscula nunca soa errada no WhatsApp.
 * `titulo`: revenda de carros, onde o nome é o modelo ("Jeep Compass").
 */
function palavraLegivel(p: string, titulo = false): string {
  if (UNIDADES_ESCRITAS.has(p)) return p;
  // "D'AGUA" → "d'água": o prefixo com apóstrofo fica em minúscula e o resto segue a regra.
  const ap = p.match(/^([A-Za-z])['’](.+)$/);
  if (ap) return `${ap[1].toLowerCase()}'${palavraLegivel(ap[2], titulo)}`;
  const base = sem(p);
  if (/\d/.test(p)) return p.toUpperCase();
  if (SIGLAS.has(base)) return p.toUpperCase();
  const legivel = ACENTOS[base] ?? p.toLowerCase();
  if (titulo && !COMUNS.has(base)) return legivel.charAt(0).toUpperCase() + legivel.slice(1);
  return legivel;
}

/** Palavras que não podem terminar uma citação ("Se você é de…" não diz nada). */
const PENDURADAS = new Set(["de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "com", "para", "pra", "que", "um", "uma", "no", "na", "te", "se", "eu", "é", "partir", "apenas", "por", "só", "so", "r$", "até"]);

/**
 * Do nome do anúncio ao produto que o dono reconhece.
 *   "ADS - ESTATICO - TELHA FIBROCIMENTO 2,44 X 1,10 - R$ 59:00" → "telha fibrocimento 2,44×1,10"
 *   "ADS - CIMENTO CP3 -  32 - 16/10"                            → "cimento CP3"
 *   "ADS - VIDEO - CHEGOU A HORA DE VOCE REFORMAR"              → vídeo "Chegou a hora de você reformar"
 * Preço, data e "— Cópia" saem sempre: preço no nome pode estar vencido (regra 5 do playbook).
 */
export function produtoDoAnuncio(nomeBruto: string, segmento?: SegmentoVoz): ProdutoDoAnuncio {
  const formato = formatoDoNome(nomeBruto);
  let t = nomeBruto
    .replace(/^\s*post do instagram\s*:\s*/i, "")
    .replace(/[—–-]\s*c[oó]pia\b.*$/i, "")
    .replace(/\bc[oó]pia\b/gi, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/R\$\s*[\d.,:]+/gi, " ")            // R$ 59:00, R$59,90
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ") // datas 16/10
    .replace(/\.{2,}|…/g, " ")
    .replace(/\s+\+\s+/g, " e ").replace(/\s+\/\s+/g, ", ")   // "SOFÁS + COLCHÕES", "LOJA / SOFÁS"
    .replace(/\s+v\d+\s*$/i, " ")                  // "... ENTREGANDO V3" (versão do criativo)
    .replace(ROTULOS_DE_FORMATO, " ")
    .replace(/(\d)\s*[xX×]\s*(\d)/g, "$1×$2")    // 2,44 X 1,10 → 2,44×1,10
    .replace(/(\d)\s*(mm|cm|kg|ml|kwp|kw|m|l)\b/gi, (_m, d: string, u: string) => `${d} ${UNIDADES[u.toLowerCase()]}`);

  // Pedaços separados por " - ": tira os que são só preço/número solto (variação "1", "2", "32").
  const pedacos = t.split(/\s+[-–—]\s+|\s+[-–—]|[-–—]\s+/).map((p) => p.replace(/^[-–—\s]+|[-–—\s]+$/g, "")).filter(Boolean)
    .map((p) => p.replace(/\s+\d{1,4}(,\d{2})?$/, "").trim()) // "CIMENTO CP3 31,00" → "CIMENTO CP3"; "TELHA KINGSPAN 1" → "TELHA KINGSPAN"
    .filter((p) => !/^[\d.,\s]+$/.test(p));
  t = pedacos.join(" ").replace(/\s{2,}/g, " ").trim();
  if (!t) return { texto: null, ehProduto: false, formato };

  const palavras = t.split(" ");
  // Produto = tem palavra de produto OU uma medida ("18 L", "70×70", "aro 14"): "Decora Matte 18 L" é produto.
  const temMedida = /\d\s?(L|kg|m|mm|cm|ml|kWp)\b|\d×\d/.test(t);
  const generico = /^(novo an[uú]ncio|onde estamos|localiza[cç][aã]o|apresenta[cç][aã]o|servi[cç]os|encarte|produtos|opera[cç][aã]o|delivery|coluna)/i.test(sem(t));
  // Revenda de carros: o nome do anúncio É o modelo ("JEEP COMPASS", "HB20", "COROLLA").
  if (segmento === "veiculos" && !generico && palavras.length <= 4) {
    return { texto: palavras.map((p) => palavraLegivel(p, true)).join(" "), ehProduto: true, formato };
  }
  // Começa como gente fala ("Tá precisando de um poste", "A porta ideal", "Procurando contabilidade"):
  // é a frase do vídeo/post, mesmo com palavra de produto no meio — cita entre aspas.
  const abertura = /^(t[aá]|tava|se|voc[eê]|vc|ei|olha|vem|venha|quer|precisa|precisando|procurando|est[aá]|estava|a|o|as|os|para|pra|hoje|j[aá]|chegou|chegaram|acabamos|temos|confira|aproveite|garanta|imagina|conhe[cç]a|aten[cç][aã]o|sabia)$/i.test(palavras[0] ?? "");
  // Nome de cidade não conta como produto: "LOJA CABO FRIO" não é cabo elétrico.
  const semCidade = comCidades(t).replace(/(S[aã]o Pedro da Aldeia|Cabo Frio|Arraial do Cabo|Rio das Ostras|Campos dos Goytacazes|Iguaba Grande|Rio de Janeiro|S[aã]o Gon[cç]alo)/g, " ");
  const ehProduto = !abertura && (temMedida || semCidade.split(/\s+/).some((p) => PRODUTOS.has(sem(p))));
  if (ehProduto) {
    const limpas = [...palavras];
    while (limpas.length > 1 && PENDURADAS.has(sem(limpas[limpas.length - 1]))) limpas.pop();
    const texto = comCidades(limpas.map((p) => palavraLegivel(p)).join(" ").replace(/\s+([,.;:])/g, "$1"));
    return { texto, ehProduto: true, formato };
  }
  // Não é produto: frase de abertura de vídeo/post ("CHEGOU A HORA DE VOCE REFORMAR"). Vira citação
  // em caixa de frase, curta. Nome genérico ("Novo anúncio de Tráfego", "ONDE ESTAMOS") não vale citar.
  // Só vale citar frase que diz alguma coisa: 3+ palavras, sem terminar pendurada ("Se você é de").
  const corte = palavras.slice(0, 8).filter((p) => /[\p{L}\d]/u.test(p));
  while (corte.length && PENDURADAS.has(sem(corte[corte.length - 1]))) corte.pop();
  if (generico || corte.length < 3 || JARGAO.test(t)) return { texto: null, ehProduto: false, formato };
  const frase = comCidades(corte.map((p) => (sem(p) === "ta" ? "tá" : palavraLegivel(p))).join(" "));
  return { texto: frase.charAt(0).toUpperCase() + frase.slice(1), ehProduto: false, formato };
}

/** Como o anúncio aparece na linha "o que mais puxou": produto direto; vídeo/post entre aspas. */
/**
 * O que a regra do setor não deixa escrever, mesmo numa mensagem só para o dono (pesquisa de 24/10/2026,
 * .claude/skills/placar-semanal/nichos.md): marca de remédio de receita vira o procedimento (Lei 9.294,
 * art. 7º) e "grátis" sai — chamariz amarrado à compra é venda casada (CDC, art. 39, I).
 */
function semTermoProibido(t: string): string {
  return t
    .replace(/\b(botox|dysport)\b/gi, "toxina botulínica")
    .replace(/\s*\bgr[aá]tis\b/gi, "")
    .replace(/\s{2,}/g, " ").trim();
}

export function citacaoDoAnuncio(c: Pick<Criativo, "nome">, segmento?: SegmentoVoz): string | null {
  const p = produtoDoAnuncio(c.nome, segmento);
  if (!p.texto) return null;
  // Farmácia de manipulação: fórmula não se cita pelo nome (RDC 67/2007, item 5.14) — fica a frase
  // do anúncio ("Envie sua receita"), nunca o produto.
  if (segmento === "farmacia" && p.ehProduto) return null;
  const texto = semTermoProibido(p.texto);
  if (!texto) return null;
  if (p.ehProduto) return texto;
  const tipo = p.formato === "post" ? "o post" : p.formato === "video" ? "o vídeo" : "o anúncio";
  return `${tipo} "${texto}"`;
}

// ── A mensagem ────────────────────────────────────────────────────────────────────────────────

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** O resultado do anúncio com nome de gente — "lead" é jargão (regra 7). */
export interface FalaDoResultado {
  placar: string;
  porUm: string;
  puxou: string;
  /** "14 conversas", "1 contato". */
  unidade: (k: number) => string;
  /** "conversa" / "contato" / "compra", e se é feminino (concordância da dica). */
  um: string;
  feminino: boolean;
}

export function falaDoResultado(tipo: TipoResultadoConta, n: number): FalaDoResultado {
  switch (tipo) {
    case "leads":
      return {
        placar: `${inteiro(n)} ${n === 1 ? "pessoa deixou" : "pessoas deixaram"} o contato pelo anúncio`,
        porUm: "por contato", puxou: "O que mais trouxe contato",
        unidade: (k) => `${inteiro(k)} ${k === 1 ? "contato" : "contatos"}`, um: "contato", feminino: false,
      };
    case "compras":
      return {
        placar: `${inteiro(n)} ${n === 1 ? "compra" : "compras"} pelo anúncio`,
        porUm: "por compra", puxou: "O que mais vendeu",
        unidade: (k) => `${inteiro(k)} ${k === 1 ? "compra" : "compras"}`, um: "compra", feminino: true,
      };
    case "misto":
      return {
        placar: `${inteiro(n)} ${n === 1 ? "contato vindo" : "contatos vindos"} do anúncio`,
        porUm: "por contato", puxou: "O que mais trouxe contato",
        unidade: (k) => `${inteiro(k)} ${k === 1 ? "contato" : "contatos"}`, um: "contato", feminino: false,
      };
    default:
      return {
        placar: `${inteiro(n)} ${n === 1 ? "conversa no WhatsApp vinda" : "conversas no WhatsApp vindas"} do anúncio`,
        porUm: "por conversa", puxou: "O que mais puxou conversa",
        unidade: (k) => `${inteiro(k)} ${k === 1 ? "conversa" : "conversas"}`, um: "conversa", feminino: true,
      };
  }
}

/** Semana ISO (1–53) — gira a dica toda segunda sem guardar nada. */
export function semanaDoAno(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primeira = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - primeira.getTime()) / 86400000 - 3 + ((primeira.getUTCDay() + 6) % 7)) / 7);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface EntradaPlacar {
  relatorio: Pick<RelatorioAnuncios, "janela" | "tipo" | "total" | "kpis" | "criativos" | "criativosIndisponiveis" | "semVeiculacao">;
  clienteId: string;
  segmento: SegmentoVoz;
  /** Dia do envio (YYYY-MM-DD, SP) — decide a dica da vez. */
  hoje: string;
}

export interface Placar {
  /** O texto para a legenda. null = não dá para mandar placar (vai a legenda neutra) — ver `motivo`. */
  texto: string | null;
  /** Por que não houve placar, ou o alerta para o time (queda forte). */
  motivo: string | null;
  /** Para o time conferir: o que entrou. */
  alerta: "sem_veiculacao" | "zero" | "queda" | null;
  dica: "dados" | "nicho" | null;
}

/** Queda (em %) a partir da qual o time é avisado para explicar a causa no mesmo dia (regra 4). */
export const QUEDA_ALERTA = 25;
/** Abaixo disto na semana anterior, a comparação vai em número, não em %. */
export const BASE_MINIMA_PCT = 10;
/** Anúncio com menos que isto não "puxou" nada: não é citado. */
export const MINIMO_PARA_CITAR = 3;
/** Segmentos que vendem produto de estoque: só neles a dica dos números fala de estoque. */
const COM_ESTOQUE = new Set<SegmentoVoz>(["construcao", "tintas", "pisos", "madeira", "ferragens", "moveis", "bazar", "autopecas", "pneus", "suplementos", "pet", "plantas", "varejo"]);
/** Variação até este limite (em pontos %) é "no mesmo ritmo" — o mesmo limiar do PDF e do portal. */
export const LIMIAR_RITMO = 5;

/**
 * O cadastro às vezes erra o ramo (Calábria está como "Móveis", Hentzy pelo CNAE como "construção";
 * as duas vendem piso). Quando o que mais roda é piso, porcelanato ou tinta, a voz segue o anúncio.
 */
export function segmentoPelosAnuncios(segmento: SegmentoVoz, nomes: string[]): SegmentoVoz {
  if (segmento !== "construcao" && segmento !== "moveis" && segmento !== "varejo") return segmento;
  const t = sem(nomes.join(" "));
  if (/\b(piso|pisos|porcelanato|revestimento|ceramica)\b/.test(t)) return "pisos";
  if (segmento !== "moveis" && /\b(tinta|tintas|suvinil|coral)\b/.test(t)) return "tintas";
  return segmento;
}

export function montarPlacar(e: EntradaPlacar): Placar {
  const r = e.relatorio;
  const perfil = PERFIS_VOZ[segmentoPelosAnuncios(e.segmento, (r.criativosIndisponiveis ? [] : r.criativos).map((c) => c.nome))];
  const periodo = `(${ddmm(r.janela.inicio)} a ${ddmm(r.janela.fim)})`;

  // Notícia ruim não sai em placar automático: o gestor manda com a causa e o que já fez (regra 4).
  if (r.semVeiculacao) return { texto: null, motivo: "os anúncios não rodaram na semana", alerta: "sem_veiculacao", dica: null };
  if (r.total <= 0) return { texto: null, motivo: "nenhum resultado registrado na semana", alerta: "zero", dica: null };

  const fala = falaDoResultado(r.tipo, r.total);
  const custo = r.kpis.find((k) => k.chave === "custo")?.valor ?? null;
  const kRes = r.kpis.find((k) => k.chave === "resultados");
  const varRes = kRes?.variacaoPct ?? null;
  const anterior = kRes?.anterior ?? null;

  let placar = `*Placar:* ${fala.placar}`;
  if (custo != null && custo > 0) placar += `, ${reais(custo)} em média ${fala.porUm}`;
  let alerta: Placar["alerta"] = null;
  let motivo: string | null = null;
  if (varRes != null && anterior != null) {
    const pct = Math.round(Math.abs(varRes));
    // Base pequena faz porcentagem gritar ("2000% a mais" com 1 conversa antes): diz o número.
    // e salto grande também: o número antigo diz mais que "233% a mais".
    if (anterior < BASE_MINIMA_PCT || varRes >= 100) placar += ` — na semana anterior ${anterior === 1 ? "foi" : "foram"} ${inteiro(anterior)}`;
    else if (pct <= LIMIAR_RITMO) placar += " — no mesmo ritmo da semana anterior";
    else placar += ` — ${pct}% ${varRes > 0 ? "a mais" : "a menos"} que na semana anterior`;
    if (varRes <= -QUEDA_ALERTA && anterior >= BASE_MINIMA_PCT) { alerta = "queda"; motivo = `${pct}% a menos que na semana anterior (${inteiro(anterior)} → ${inteiro(r.total)})`; }
  }
  placar += ".";

  // Os dois que mais trouxeram, pelo produto (ou pela frase do vídeo). Anúncio sem nome citável sai.
  // Cópias do mesmo anúncio ("— Cópia", mesmo produto) somam: "combo levante (15) e combo levante (13)"
  // é um anúncio só para o dono.
  const porCitacao = new Map<string, { c: Criativo; cita: string }>();
  for (const c of r.criativosIndisponiveis ? [] : r.criativos) {
    const cita = citacaoDoAnuncio(c, e.segmento);
    if (!cita || c.resultados <= 0) continue;
    const chave = sem(cita);
    const ja = porCitacao.get(chave);
    if (!ja) { porCitacao.set(chave, { c: { ...c }, cita }); continue; }
    ja.c.resultados += c.resultados;
    ja.c.investimento += c.investimento;
    ja.c.custo = ja.c.resultados > 0 ? ja.c.investimento / ja.c.resultados : null;
  }
  const citados = [...porCitacao.values()]
    .filter((x) => x.c.resultados >= MINIMO_PARA_CITAR)
    .sort((a, b) => b.c.resultados - a.c.resultados)
    .slice(0, 2);
  let linhaTop: string | null = null;
  if (citados.length === 2) {
    linhaTop = `*${fala.puxou}:* ${citados[0].cita} (${fala.unidade(citados[0].c.resultados)}) e ${citados[1].cita} (${inteiro(citados[1].c.resultados)}).`;
  } else if (citados.length === 1) {
    linhaTop = `*${fala.puxou}:* ${citados[0].cita} (${fala.unidade(citados[0].c.resultados)}).`;
  }

  // Dica: a dos números vem primeiro — um produto que trouxe conversa bem mais barata que a média
  // vira pedido de estoque (próximo passo com dono, regra 1). Sem isso, a do nicho, girando por semana.
  let dica: string;
  let origemDica: Placar["dica"];
  const top = citados[0];
  const produtoTop = top && produtoDoAnuncio(top.c.nome, e.segmento).ehProduto ? top.cita : null;
  if (produtoTop && COM_ESTOQUE.has(e.segmento) && custo && top.c.custo != null && top.c.resultados >= 10 && top.c.custo <= custo * 0.6) {
    const nomeTop = produtoTop.charAt(0).toUpperCase() + produtoTop.slice(1);
    dica = `${nomeTop} trouxe ${fala.um} bem mais barat${fala.feminino ? "a" : "o"} que a média da semana — se tiver estoque pra mais 15 dias, me avisa que a gente segura esse anúncio no ar.`;
    origemDica = "dados";
  } else {
    dica = perfil.dicas[(semanaDoAno(e.hoje) + hash(e.clienteId)) % perfil.dicas.length];
    origemDica = "nicho";
  }

  const linhas = [
    `Bom dia! Relatório da semana ${periodo} aqui em cima.`,
    placar,
    ...(linhaTop ? [linhaTop] : []),
    `*Dica:* ${dica}`,
    perfil.pergunta,
  ];
  return { texto: linhas.join("\n"), motivo, alerta, dica: origemDica };
}
