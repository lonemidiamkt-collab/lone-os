// lib/traffic/destaques-semana.ts — QUEM MELHOROU E QUEM PIOROU NA SEMANA, por cliente de anúncio.
//
// Roberto (05/10/2026), depois de ver o comparativo de sexta × fim de semana: "colocar isso pra
// ocorrer toda segunda, esse relatório dos melhores clientes com essas métricas e os piores também,
// toda segunda 11 horas no grupo tráfego".
//
// A comparação é SEMANA FECHADA (segunda a domingo) contra a anterior. O comparativo avulso foi
// sexta × fim de semana, e mistura dia útil com fim de semana: na carteira, as mensagens por dia
// "caíram" só porque sábado e domingo têm menos verba. Semana contra semana tem os mesmos dias dos
// dois lados.
//
//   melhorou = mais mensagens E custo por conversa menor
//   piorou   = menos mensagens E custo por conversa maior
//   parou    = gastou na semana anterior e nada nesta (anúncio parado — é outra conversa)
// O resto (uma coisa melhorou, a outra piorou) é "misto" e só entra na contagem.
//
// Puro: o servidor (app/api/system/destaques-trafego) lê o banco e chama.

export interface SemanaCliente {
  cliente: string;
  gastoAtual: number;
  conversasAtual: number;
  gastoAnterior: number;
  conversasAnterior: number;
}

export interface LinhaDestaque {
  cliente: string;
  conversasAnterior: number;
  conversasAtual: number;
  custoAnterior: number;
  custoAtual: number;
  /** % de variação das conversas (+ = mais). */
  varConversas: number;
  /** % de variação do custo por conversa (− = mais barato). */
  varCusto: number;
  /** Poucas conversas na semana anterior: a porcentagem engana. */
  poucoVolume: boolean;
}

export interface DestaquesSemana {
  melhoraram: LinhaDestaque[];
  pioraram: LinhaDestaque[];
  pararam: { cliente: string; gastoAnterior: number; conversasAnterior: number }[];
  mistos: number;
  /** Clientes com conversa nas duas semanas (a base da comparação). */
  avaliados: number;
  carteira: {
    gastoAtual: number; gastoAnterior: number;
    conversasAtual: number; conversasAnterior: number;
    custoAtual: number | null; custoAnterior: number | null;
  };
}

/** Abaixo disso, na semana anterior, a variação é marcada como pouco volume. */
export const POUCO_VOLUME = 10;
/** Menos que isso em qualquer uma das semanas: o custo por conversa não quer dizer nada. */
const MIN_CONVERSAS = 3;
/** Gasto que conta como "estava rodando" na semana anterior. */
const GASTO_MINIMO = 20;

const pct = (atual: number, anterior: number) => (anterior > 0 ? (atual / anterior - 1) * 100 : 0);
/** O tamanho da mudança nas duas pontas juntas, em pontos percentuais. */
const movimento = (l: LinhaDestaque) => Math.abs(l.varConversas) + Math.abs(l.varCusto);

export function destaquesDaSemana(linhas: ReadonlyArray<SemanaCliente>): DestaquesSemana {
  const melhoraram: LinhaDestaque[] = [];
  const pioraram: LinhaDestaque[] = [];
  const pararam: DestaquesSemana["pararam"] = [];
  let mistos = 0, avaliados = 0;
  const cart = { gastoAtual: 0, gastoAnterior: 0, conversasAtual: 0, conversasAnterior: 0 };

  for (const l of linhas) {
    cart.gastoAtual += l.gastoAtual; cart.gastoAnterior += l.gastoAnterior;
    cart.conversasAtual += l.conversasAtual; cart.conversasAnterior += l.conversasAnterior;

    if (l.gastoAnterior >= GASTO_MINIMO && l.gastoAtual <= 0) {
      pararam.push({ cliente: l.cliente, gastoAnterior: l.gastoAnterior, conversasAnterior: l.conversasAnterior });
      continue;
    }
    if (l.conversasAnterior < MIN_CONVERSAS || l.conversasAtual < MIN_CONVERSAS || l.gastoAnterior <= 0 || l.gastoAtual <= 0) continue;
    avaliados++;

    const custoAnterior = l.gastoAnterior / l.conversasAnterior;
    const custoAtual = l.gastoAtual / l.conversasAtual;
    const linha: LinhaDestaque = {
      cliente: l.cliente,
      conversasAnterior: l.conversasAnterior, conversasAtual: l.conversasAtual,
      custoAnterior, custoAtual,
      varConversas: pct(l.conversasAtual, l.conversasAnterior),
      varCusto: pct(custoAtual, custoAnterior),
      poucoVolume: l.conversasAnterior < POUCO_VOLUME,
    };
    const maisConversas = l.conversasAtual > l.conversasAnterior;
    const menosConversas = l.conversasAtual < l.conversasAnterior;
    const maisBarato = custoAtual < custoAnterior;
    const maisCaro = custoAtual > custoAnterior;
    if (maisConversas && maisBarato) melhoraram.push(linha);
    else if (menosConversas && maisCaro) pioraram.push(linha);
    else mistos++;
  }

  // Quem tem volume vem antes de quem não tem; dentro de cada grupo, o maior movimento SOMANDO as
  // duas pontas. Ordenar só pelo custo escondia o Maicon Minerais no fim da lista de piores com
  // −60% de conversas (124 → 49) e o custo +4% — a maior perda de volume da semana (05/10).
  melhoraram.sort((a, b) => Number(a.poucoVolume) - Number(b.poucoVolume) || movimento(b) - movimento(a));
  pioraram.sort((a, b) => Number(a.poucoVolume) - Number(b.poucoVolume) || movimento(b) - movimento(a));
  pararam.sort((a, b) => b.gastoAnterior - a.gastoAnterior);

  return {
    melhoraram, pioraram, pararam, mistos, avaliados,
    carteira: {
      ...cart,
      custoAtual: cart.conversasAtual > 0 ? cart.gastoAtual / cart.conversasAtual : null,
      custoAnterior: cart.conversasAnterior > 0 ? cart.gastoAnterior / cart.conversasAnterior : null,
    },
  };
}

/** Segunda a domingo da semana que acabou e da anterior, a partir de "hoje" (YYYY-MM-DD, SP). */
export function semanasFechadas(hoje: string): { atual: { de: string; ate: string }; anterior: { de: string; ate: string } } {
  const d = new Date(`${hoje}T12:00:00Z`);
  const diaSemana = d.getUTCDay(); // 0 = domingo
  const voltaAteSegunda = ((diaSemana + 6) % 7) + 7; // segunda da semana passada
  const soma = (base: Date, n: number) => { const x = new Date(base); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const seg = new Date(d); seg.setUTCDate(seg.getUTCDate() - voltaAteSegunda);
  return {
    atual: { de: soma(seg, 0), ate: soma(seg, 6) },
    anterior: { de: soma(seg, -7), ate: soma(seg, -1) },
  };
}
