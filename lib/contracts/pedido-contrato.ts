// lib/contracts/pedido-contrato.ts — entender "gera o contrato do Bruno: 2500, 12 meses, dia 10".
//
// O Roberto responde no grupo do jeito que fala, não num formulário. Aqui a frase vira os três
// números que o contrato exige — valor mensal, duração e dia de pagamento.
//
// REGRA QUE MANDA: na dúvida, NÃO gera. Contrato é documento que vai pro cliente assinar; errar o
// valor ou a vigência é pior que pedir de novo. Quando falta algo ou o número está fora do
// razoável, devolve o que entendeu pra pessoa confirmar.

export interface PedidoContrato {
  querContrato: boolean;
  valorMensal?: number;
  duracaoMeses?: number;
  diaPagamento?: number;
  /**
   * "ciclos" é o padrão da casa: 3 meses com renovação automática, sem fidelidade. Só vira
   * "determinado" quando a pessoa DIZ que é teste/prazo fechado — misturar os dois modelos no
   * mesmo documento cria contradição que o cliente usa contra a agência.
   */
  modalidade: "ciclos" | "determinado";
  /** "2026-11-10" — só quando a frase diz ("início dia 10/11", "começa 10/11/2026", "a partir de 10/11"). */
  dataInicio?: string;
  /** O que ainda falta pra poder gerar. Vazio = dá pra seguir. */
  faltando: string[];
}

/**
 * "gera o contrato", "manda o contrato", "pode gerar o contrato do X", o "sim" seco à oferta — e,
 * o que faltava: a RESPOSTA à pergunta.
 *
 * O agente pergunta "quer que eu gere o contrato? me manda valor e vencimento". Quem responde
 * "dia de vencimento dia 10, sao 3 meses de contrato no valor de 1797" não escreve verbo de
 * comando nenhum — está respondendo. Exigir "gera" ali era transformar a própria pergunta do
 * agente numa armadilha, e o silêncio que veio depois foi pior que uma recusa.
 */
export function pediuContrato(texto: string): boolean {
  const t = (texto || "").toLowerCase();
  const verbo = /\b(gera|gerar|monta|montar|manda|mandar|envia|enviar|faz|fazer|quero)\b/.test(t);
  const objeto = /\bcontrato\b/.test(t);
  if (verbo && objeto) return true;
  // Resposta curta logo depois da oferta ("quer que eu gere o contrato?").
  if (/^(sim|isso|pode|pode ser|manda|envia|quero|bora)\b/.test(t.trim()) && t.trim().length <= 30) return true;
  // Fala em contrato E traz os números que só fazem sentido pra gerar um: é a resposta à oferta.
  // "o contrato dele vence em setembro" não entra aqui — não tem valor nem vencimento.
  return objeto && trouxeOsNumeros(t);
}

/**
 * A mensagem carrega valor E dia de vencimento? Então é resposta à oferta, mesmo sem a palavra
 * "contrato" — depois da pergunta, "1797, dia 10" é uma frase completa.
 *
 * Usado pelo webhook no grupo de cadastro, onde a oferta acabou de ser feita.
 */
export function trouxeOsNumeros(texto: string): boolean {
  const n = extrairNumeros(texto);
  return n.valorMensal !== undefined && n.diaPagamento !== undefined;
}

/**
 * Tira os três números da frase.
 *
 * Aceita o jeito que a pessoa escreve de verdade: "2500", "R$ 2.500,00", "2,5k", "12 meses",
 * "1 ano", "dia 10", "todo dia 5".
 */
export function extrairNumeros(texto: string, hoje: Date = new Date()): Omit<PedidoContrato, "querContrato"> {
  const bruto = (texto || "").toLowerCase().replace(/\s+/g, " ");
  const faltando: string[] = [];

  // ── data de início — antes de tudo: "início dia 10/11" tem um "dia 10" que não é o vencimento ──
  const mInicio = RX_INICIO.exec(bruto);
  const dataInicio = mInicio ? dataDoInicio(mInicio[1], mInicio[2], mInicio[3], hoje) : undefined;
  const t = mInicio ? bruto.replace(mInicio[0], " ") : bruto;

  // ── dia de pagamento — lê PRIMEIRO e remove, senão "dia 10" vira valor 10 ──
  let diaPagamento: number | undefined;
  const mDia = /\b(?:todo\s+)?dia\s*(\d{1,2})\b/.exec(t);
  if (mDia) {
    const d = parseInt(mDia[1], 10);
    if (d >= 1 && d <= 28) diaPagamento = d; // acima de 28 não existe em fevereiro
  }
  const semDia = mDia ? t.replace(mDia[0], " ") : t;

  // ── duração — remove também, pra "12 meses" não ser lido como valor ──
  let duracaoMeses: number | undefined;
  const mAno = /\b(\d{1,2})\s*ano(s)?\b/.exec(semDia);
  const mMes = /\b(\d{1,3})\s*(?:meses|mes|mês)\b/.exec(semDia);
  if (mAno) duracaoMeses = parseInt(mAno[1], 10) * 12;
  else if (mMes) duracaoMeses = parseInt(mMes[1], 10);
  const semPrazo = mAno ? semDia.replace(mAno[0], " ") : mMes ? semDia.replace(mMes[0], " ") : semDia;

  // ── valor — o que sobrou ──
  let valorMensal: number | undefined;
  const mK = /\b(\d+(?:[.,]\d+)?)\s*k\b/.exec(semPrazo);
  if (mK) {
    valorMensal = Math.round(parseFloat(mK[1].replace(",", ".")) * 1000);
  } else {
    const mV = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)/.exec(semPrazo);
    if (mV) {
      const cru = mV[1];
      // "2.500,00" → 2500.00 · "2500" → 2500 · "2500,50" → 2500.50
      valorMensal = parseFloat(cru.includes(",") ? cru.replace(/\./g, "").replace(",", ".") : cru.replace(/\./g, ""));
    }
  }

  // Sanidade: número absurdo quase sempre é leitura errada da frase, não a intenção.
  if (valorMensal !== undefined && (valorMensal < 100 || valorMensal > 200_000)) valorMensal = undefined;
  if (duracaoMeses !== undefined && (duracaoMeses < 1 || duracaoMeses > 60)) duracaoMeses = undefined;

  // Prazo determinado é EXCEÇÃO e precisa ser dito. O contrato padrão da casa roda em ciclos de
  // 3 meses com renovação automática — não é uma "duração" que a pessoa escolhe na mensagem.
  const determinado = /\b(prazo determinado|prazo fechado|sem renova|nao renova|não renova|teste|experi[êe]ncia|pontual|projeto fechado)\b/.test(t);

  if (valorMensal === undefined) faltando.push("valor mensal");
  if (diaPagamento === undefined) faltando.push("dia de vencimento");
  // Só no prazo determinado a duração é obrigatória — nos ciclos ela vem do padrão.
  if (determinado && duracaoMeses === undefined) faltando.push("prazo (em meses)");

  return {
    valorMensal, duracaoMeses, diaPagamento,
    modalidade: determinado ? "determinado" : "ciclos",
    ...(dataInicio ? { dataInicio } : {}),
    faltando,
  };
}

// "início dia 10/11", "inicio em 10/11/2026", "começa 10/11", "começando dia 10/11", "a partir de 10/11".
const RX_INICIO = /\b(?:in[íi]cio|inicia(?:ndo|r)?|come[çc]a(?:ndo|r)?|a partir d[eo])\s*(?:(?:em|no|na|dia|de|do)\s+)*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

/**
 * dd/mm[/aaaa] → "aaaa-mm-dd". Sem ano: o deste ano, ou o do ano que vem quando a data já passou há
 * mais de 60 dias (em dezembro, "início 05/01" é janeiro que vem). Data impossível → undefined.
 */
function dataDoInicio(d: string, m: string, a: string | undefined, hoje: Date): string | undefined {
  const dia = Number(d), mes = Number(m);
  if (mes < 1 || mes > 12 || dia < 1) return undefined;
  let ano = a ? Number(a.length === 2 ? `20${a}` : a) : hoje.getFullYear();
  if (!a) {
    const candidata = Date.UTC(ano, mes - 1, dia);
    if (candidata < hoje.getTime() - 60 * 86_400_000) ano += 1;
  }
  if (dia > new Date(Date.UTC(ano, mes, 0)).getUTCDate()) return undefined;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Interpreta a mensagem inteira. */
export function lerPedido(texto: string): PedidoContrato {
  return { querContrato: pediuContrato(texto), ...extrairNumeros(texto) };
}
