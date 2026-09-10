// A DATA EM QUE O POST VAI AO AR — a que o social escreveu, não a que o card carrega.
//
// Roberto (10/09): "está sendo cobrado mas não está sendo olhado as datas que os social media
// programam."
//
// O QUE OS DADOS MOSTRARAM. De 74 cards publicados que tinham as duas datas, o `due_date` batia
// com a publicação real em apenas 8. Em 42 ele estava mais de um dia ANTES. `due_date` não é a
// data do post: é o prazo interno de produção, deliberadamente adiantado para a arte ficar pronta.
//
// Usar esse campo como "data do post" fazia o agente cobrar cedo demais e dizer "o post é HOJE"
// num card que o time programou para o dia seguinte. Foi exatamente o que saiu no grupo do
// designer: quatro clientes com "SEX 11" no título, cobrados na quinta como se fosse hoje.
//
// A CONVENÇÃO REAL do time está no TÍTULO: "[Gabriel] SEX 11 - Ecoflow". Cinquenta dos oitenta e
// oito cards ativos seguem esse formato. É o dado mais próximo da intenção de quem programou.

/** "SEG 11", "sex 4", "QUA 08" — dia da semana + dia do mês, em qualquer posição do título. */
const RX_DIA_TITULO = /\b(seg|ter|qua|qui|sex|s[áa]b|dom)\w*\s*[.\-]?\s*(\d{1,2})\b/i;

const DIA_SEMANA: Record<string, number> = {
  dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, sáb: 6,
};

export interface DataDoPost {
  /** YYYY-MM-DD. */
  data: string;
  /** De onde saiu — o log precisa poder explicar por que cobrou. */
  fonte: "titulo" | "due_date";
}

/**
 * Lê a data do post a partir do título, conferindo o dia da semana.
 *
 * A CONFERÊNCIA É O QUE TORNA ISTO SEGURO: "SEX 11" só é aceito se o dia 11 do mês candidato cair
 * mesmo numa sexta. Quando os dois sinais discordam, o título está velho (card copiado do mês
 * passado) e a leitura é descartada — melhor cair no `due_date` do que inventar uma data.
 *
 * `hoje` no formato YYYY-MM-DD.
 */
export function dataDoTitulo(titulo: string, hoje: string): string | null {
  const m = RX_DIA_TITULO.exec(titulo || "");
  if (!m) return null;
  const semanaEsperada = DIA_SEMANA[m[1].toLowerCase().slice(0, 3)];
  const dia = Number(m[2]);
  if (!(dia >= 1 && dia <= 31) || semanaEsperada === undefined) return null;

  const [ano, mes] = hoje.split("-").map(Number);
  // Três candidatos: mês passado, este mês, mês que vem. Um card de fim de mês pode apontar para
  // o começo do seguinte, e um card atrasado pode ser do anterior.
  for (const desloc of [0, 1, -1]) {
    const d = new Date(Date.UTC(ano, mes - 1 + desloc, dia, 12));
    if (d.getUTCDate() !== dia) continue;                 // dia não existe nesse mês (31 de fev)
    if (d.getUTCDay() !== semanaEsperada) continue;        // o título discorda do calendário
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * A data que vale para cobrar.
 *
 * Título primeiro porque é o que a pessoa escreveu ao programar; `due_date` como rede, porque
 * quase metade dos cards não segue a convenção.
 */
export function dataDoPost(
  card: { title?: string | null; due_date?: string | null },
  hoje: string,
): DataDoPost | null {
  const doTitulo = dataDoTitulo(card.title ?? "", hoje);
  if (doTitulo) return { data: doTitulo, fonte: "titulo" };
  if (card.due_date) return { data: card.due_date.slice(0, 10), fonte: "due_date" };
  return null;
}
