// O ramo do cliente, e o que muda no ano dentro dele.
//
// PRA QUE (Roberto): "pautas estratégicas por nicho — Atlas é seguradora, então mês chuvoso, mais
// datas comemorativas". A pauta semanal já dizia no prompt "use o nicho do cliente", mas nunca
// RECEBIA o nicho: ele só chegava se estivesse escrito dentro do briefing.
//
// E o campo estava contaminado: `industry` guardava o PACOTE que a Lone vende ("Lone Growth" em 24
// clientes, "Trafego Pago" em 4), não o ramo do cliente. O ramo real mora em `nicho`, preenchido em
// 14 de 50 e com valores soltos ("Construção" e "Construção Civil" como se fossem coisas
// diferentes). Sem ramo normalizado não existe pauta por nicho — existe pauta genérica.

export type Nicho =
  | "construcao" | "automotivo" | "saude" | "beleza" | "alimentacao" | "moda"
  | "otica" | "pet" | "fitness" | "servicos_profissionais" | "seguros" | "imobiliario"
  | "educacao" | "energia_solar" | "movelaria" | "varejo" | "outro";

export const ROTULO_NICHO: Record<Nicho, string> = {
  construcao: "Construção e materiais", automotivo: "Automotivo", saude: "Saúde e clínicas",
  beleza: "Beleza e estética", alimentacao: "Alimentação", moda: "Moda e vestuário",
  otica: "Ótica", pet: "Pet", fitness: "Fitness e academia",
  servicos_profissionais: "Serviços profissionais", seguros: "Seguros",
  imobiliario: "Imobiliário", educacao: "Educação", energia_solar: "Energia solar",
  movelaria: "Móveis e decoração", varejo: "Varejo geral", outro: "Outro",
};

/**
 * Normaliza o que está escrito no cadastro.
 *
 * Cobre as duas sujeiras reais do banco: valores que descrevem o PACOTE em vez do ramo ("Lone
 * Growth", "Trafego Pago", "Social media") e variações do mesmo ramo ("Construção" / "Construção
 * Civil" / "Material de construção"). Pacote devolve null — é ausência de informação, e tratar
 * ausência como um nicho chamado "Lone Growth" é o que produzia pauta genérica com cara de
 * personalizada.
 */
export function normalizarNicho(bruto?: string | null): Nicho | null {
  // Pontuação interna some antes de comparar: o cliente "Portuga P'Neus" existe assim no cadastro,
  // e o apóstrofo fazia /pneu/ não casar. Nome de empresa é escrito como o dono quis.
  const t = (bruto ?? "").toLowerCase().trim().replace(/['´`’.]/g, "");
  if (!t) return null;

  // O que a Lone VENDE não é o ramo de ninguém.
  if (/^(lone growth|trafego pago|tráfego pago|social media|social midia|designer|gravação|gravacao|outro|servicos|serviços|tecnologia)$/.test(t)) return null;
  if (/lone growth|social media.*trafego|trafego.*social media/.test(t)) return null;

  if (/constru|material de constru|cimento|tinta|madeir|ferragem|acabamento|piso|porcelanato|hidráulic|eletric/.test(t)) return "construcao";
  if (/autom|carro|veícul|veicul|pneu|oficina|mecânic|mecanic/.test(t)) return "automotivo";
  if (/saúde|saude|clínic|clinic|médic|medic|odonto|dent|farmác|farmac|veterinár|veterinar|vacina|imunobiol/.test(t)) return "saude";
  if (/belez|estétic|estetic|salão|salao|cabelo|depila|manicure|barbe/.test(t)) return "beleza";
  if (/aliment|restaurant|lanchon|pizzar|açaí|acai|padaria|food|delivery|comida/.test(t)) return "alimentacao";
  if (/moda|vestuár|vestuar|roupa|confecç|confecc|bazar|calçad|calcad/.test(t)) return "moda";
  if (/ótic|otic|óculos|oculos/.test(t)) return "otica";
  if (/pet|animal|agropec/.test(t)) return "pet";
  if (/fitness|academia|crossfit|pilates|muscula/.test(t)) return "fitness";
  if (/contabil|advoca|jurídic|juridic|consultor|arquitet|engenhar/.test(t)) return "servicos_profissionais";
  if (/segur|corretora/.test(t)) return "seguros";
  if (/imobili|imóvel|imovel|corretor de imó/.test(t)) return "imobiliario";
  if (/educaç|educac|escola|curso|ensino|faculdade/.test(t)) return "educacao";
  if (/solar|energia|fotovolt/.test(t)) return "energia_solar";
  if (/móve|move|decoraç|decorac|estofad|colchão|colchao|mdf/.test(t)) return "movelaria";
  if (/varejo|loja|comércio|comercio|distribuidor|mercad|shopping|suplement|minera/.test(t)) return "varejo";
  return "outro";
}

/**
 * O que muda no ano, por nicho.
 *
 * É a parte "estratégica" do pedido: uma seguradora em mês de chuva fala de sinistro e prevenção,
 * uma construtora no mesmo mês fala de obra parada e impermeabilização. Mesmo mês, conversa
 * oposta. Sem isso a pauta trata janeiro e julho como se fossem o mesmo mês.
 *
 * Meses são 1-12. Cada entrada diz o CONTEXTO (o que está acontecendo com o público) — nunca o
 * texto do post: quem escreve é a IA com o briefing na mão, e contexto que vira frase pronta
 * produz post igual pra todo mundo.
 */
const SAZONALIDADE: Partial<Record<Nicho, { meses: number[]; contexto: string }[]>> = {
  construcao: [
    { meses: [1, 2, 3, 11, 12], contexto: "período de chuva: infiltração, impermeabilização, telhado e obra que atrasa são a dor do momento" },
    { meses: [4, 5, 6, 7, 8], contexto: "tempo seco é a janela boa pra pintura externa, reforma e obra puxada — é quando o cliente decide começar" },
    { meses: [9, 10], contexto: "quem quer a casa pronta pro fim de ano precisa começar agora; prazo de obra vira argumento" },
  ],
  seguros: [
    { meses: [1, 2, 3, 11, 12], contexto: "chuva e temporal: alagamento, queda de árvore, raio e sinistro de veículo aumentam — prevenção e cobertura viram assunto concreto" },
    { meses: [6, 7, 12], contexto: "férias e viagem: seguro viagem, casa vazia, veículo na estrada" },
    { meses: [4, 5, 8, 9, 10], contexto: "período sem sinistro concentrado: educar sobre cobertura, revisão de apólice e o que não está coberto" },
  ],
  automotivo: [
    { meses: [1, 2, 3, 11, 12], contexto: "chuva: pneu careca, freio, palheta e aquaplanagem — manutenção com urgência real" },
    { meses: [6, 7], contexto: "férias e viagem de estrada: revisão preventiva antes de pegar a estrada" },
    { meses: [4, 5, 8, 9, 10], contexto: "manutenção de rotina, revisão programada, troca de óleo" },
  ],
  saude: [
    { meses: [4, 5, 6, 7, 8], contexto: "friagem: gripe, alergia respiratória e vacinação — procura por consulta sobe" },
    { meses: [9, 10, 11], contexto: "primavera: alergia, cuidados com a pele e check-up antes do fim do ano" },
    { meses: [12, 1, 2, 3], contexto: "calor e férias: hidratação, protetor solar, dengue e cuidado com criança em casa" },
  ],
  beleza: [
    { meses: [10, 11, 12], contexto: "fim de ano: formatura, casamento e confraternização — agenda lota, vale abrir horário e antecipar" },
    { meses: [1, 2], contexto: "verão: cabelo com sol e mar, depilação, unha para as férias" },
    { meses: [5, 6, 7, 8], contexto: "frio: tratamento capilar, hidratação profunda e procedimento que pede menos sol" },
  ],
  fitness: [
    { meses: [1, 2, 3], contexto: "meta de ano novo e verão: pico de matrícula — o desafio é a permanência, não a captação" },
    { meses: [9, 10, 11], contexto: "'projeto verão': volta a procura, com prazo curto na cabeça do aluno" },
    { meses: [5, 6, 7], contexto: "frio derruba frequência: conteúdo de constância, treino curto e turma" },
  ],
  alimentacao: [
    { meses: [12, 1, 2], contexto: "calor, férias e alta temporada na região dos lagos: movimento de turista e consumo fora de casa" },
    { meses: [5, 6, 7], contexto: "frio e festa junina: pratos quentes, comida típica, delivery cresce" },
  ],
  movelaria: [
    { meses: [9, 10, 11, 12], contexto: "casa pronta pro Natal e fim de ano: sala, mesa e quarto de hóspedes" },
    { meses: [1, 2], contexto: "volta às aulas e organização da casa depois das festas" },
  ],
  energia_solar: [
    { meses: [9, 10, 11, 12, 1, 2], contexto: "conta de luz sobe com ar-condicionado no calor — o payback fica fácil de mostrar" },
    { meses: [4, 5, 6, 7], contexto: "bandeira tarifária e reajuste anual entram na conversa" },
  ],
  pet: [
    { meses: [11, 12, 1, 2], contexto: "calor e viagem: tosa, hidratação, cuidado com patinha no asfalto quente e com quem viaja" },
    { meses: [5, 6, 7, 8], contexto: "frio: roupinha, cuidado com idoso e filhote, e as doenças respiratórias do período" },
  ],
  otica: [
    { meses: [11, 12, 1, 2], contexto: "sol forte: óculos de sol, lente com proteção UV e a segunda armação pro verão" },
    { meses: [1, 2], contexto: "volta às aulas: exame de vista em criança, dificuldade de enxergar o quadro" },
  ],
  varejo: [
    { meses: [11], contexto: "Black Friday: o mês inteiro é comparação de preço, o cliente pesquisa antes" },
    { meses: [12], contexto: "Natal: presente, prazo de entrega e horário estendido" },
    { meses: [1, 2], contexto: "volta às aulas e liquidação de estoque de verão" },
  ],
  imobiliario: [
    { meses: [1, 2, 3], contexto: "temporada e mudança de ano: aluguel, contrato novo e quem decidiu sair do aluguel" },
    { meses: [9, 10, 11], contexto: "quem quer mudar antes do fim do ano começa a procurar agora" },
  ],
  educacao: [
    { meses: [11, 12, 1, 2], contexto: "matrícula e volta às aulas: a decisão do ano inteiro se concentra aqui" },
    { meses: [6, 7], contexto: "meio do ano: turma nova, curso de férias e recuperação" },
  ],
  servicos_profissionais: [
    { meses: [1, 2, 3, 4], contexto: "declaração de imposto de renda e fechamento do ano anterior" },
    { meses: [11, 12], contexto: "planejamento do ano seguinte, 13º e fechamento fiscal" },
  ],
};

/** O contexto do mês para o nicho — string vazia quando não há nada honesto a dizer. */
export function contextoSazonal(nicho: Nicho | null, mes: number): string {
  if (!nicho) return "";
  const faixas = SAZONALIDADE[nicho];
  if (!faixas) return "";
  return faixas.find((f) => f.meses.includes(mes))?.contexto ?? "";
}

/** Linha pronta pro prompt da pauta. Vazia quando não se sabe o ramo — melhor calar que chutar. */
export function blocoNichoParaPrompt(nichoBruto: string | null | undefined, mes: number): string {
  const n = normalizarNicho(nichoBruto);
  if (!n || n === "outro") return "";
  const ctx = contextoSazonal(n, mes);
  return ctx
    ? `Ramo do cliente: ${ROTULO_NICHO[n]}. Época do ano para esse ramo: ${ctx}. Use isso para escolher o ASSUNTO das peças — não force se o briefing apontar outra direção.`
    : `Ramo do cliente: ${ROTULO_NICHO[n]}.`;
}
