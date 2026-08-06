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
  /** O que ainda falta pra poder gerar. Vazio = dá pra seguir. */
  faltando: string[];
}

/** "gera o contrato", "manda o contrato", "pode gerar o contrato do X" — e o "sim" seco à oferta. */
export function pediuContrato(texto: string): boolean {
  const t = (texto || "").toLowerCase();
  const verbo = /\b(gera|gerar|monta|montar|manda|mandar|envia|enviar|faz|fazer|quero)\b/.test(t);
  const objeto = /\bcontrato\b/.test(t);
  if (verbo && objeto) return true;
  // Resposta curta logo depois da oferta ("quer que eu gere o contrato?").
  return /^(sim|isso|pode|pode ser|manda|envia|quero|bora)\b/.test(t.trim()) && t.trim().length <= 30;
}

/**
 * Tira os três números da frase.
 *
 * Aceita o jeito que a pessoa escreve de verdade: "2500", "R$ 2.500,00", "2,5k", "12 meses",
 * "1 ano", "dia 10", "todo dia 5".
 */
export function extrairNumeros(texto: string): Omit<PedidoContrato, "querContrato"> {
  const t = (texto || "").toLowerCase().replace(/\s+/g, " ");
  const faltando: string[] = [];

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
    faltando,
  };
}

/** Interpreta a mensagem inteira. */
export function lerPedido(texto: string): PedidoContrato {
  return { querContrato: pediuContrato(texto), ...extrairNumeros(texto) };
}
