// O NÚCLEO: o que é um indicador, e como ele vira status.
//
// PRA QUE (Roberto, 02/09): "o principal ponto que eu atacaria não é o design, é a arquitetura
// dos indicadores". Três defeitos concretos que ele apontou, todos resolvidos aqui:
//
//   1. "Progresso Geral 82%" era média simples de coisas de naturezas diferentes. Churn 0% (ótimo)
//      pesava igual a 0 novos clientes (ruim), e o número final escondia os dois.
//   2. "No ritmo" olhava só a situação ATUAL. Saúde 68 de meta 80 aparecia como "no ritmo" — o
//      gestor lia saúde e via calmaria.
//   3. Barra de progresso em tudo. "ROAS 3,3 de 4" não é 83% concluído: ninguém acumula ROAS.
//
// A distinção que organiza o resto é a NATUREZA da métrica:
//
//   ACUMULATIVA  — soma ao longo do período (leads, entregas, receita nova). Aqui progresso existe
//                  de verdade: 365 de 500 leads É 73% do caminho, e faz sentido projetar pelo ritmo.
//   QUALIDADE    — é um nível, não um acúmulo (ROAS, CTR, saúde, satisfação, SLA). Não tem "73%
//                  concluído": tem distância até a meta, e direção.
//   INVERSA      — qualidade onde MENOR é melhor (churn, CPL, tempo médio, retrabalho).
//
// Confundir as três é o que produz um painel que parece saudável enquanto a operação não está.

export type Natureza = "acumulativa" | "qualidade" | "inversa";

export type Situacao = "otimo" | "no_alvo" | "atencao" | "critico" | "sem_dado";

export interface Indicador {
  chave: string;
  titulo: string;
  natureza: Natureza;
  /** null quando não há fonte confiável. NUNCA use 0 para "não sei" — ver `confianca`. */
  valor: number | null;
  meta: number;
  unidade?: string;
  /** Valor no início do período, quando conhecido: permite dizer a DIREÇÃO, não só a distância. */
  base?: number | null;
  /** 0..1 — quanto do período já passou. Só faz sentido para acumulativa. */
  fracaoDoPeriodo?: number;
  /** De onde veio o número, para auditoria e para o painel de confiança de dados. */
  fonte?: string;
}

export interface Avaliacao {
  chave: string;
  titulo: string;
  natureza: Natureza;
  valor: number | null;
  meta: number;
  unidade: string;
  /** 0..100+. Mede ATINGIMENTO: na acumulativa é o ritmo (valor ÷ esperado até aqui), em
   *  qualidade/inversa é o quanto da meta foi alcançado. É este que entra nas médias ponderadas. */
  score: number | null;
  /** Só para acumulativa: o quanto da meta CHEIA já foi feito — é o que a barra desenha.
   *  Separado do score porque 50% da meta na metade do mês é barra pela metade e ritmo perfeito. */
  progresso?: number;
  situacao: Situacao;
  /** Distância até a meta, com sinal. Positivo = acima da meta (bom em qualidade, ruim em inversa). */
  delta: number | null;
  /** Onde termina o período se o ritmo continuar. Só para acumulativa com fração conhecida. */
  projecao: number | null;
  situacaoProjetada: Situacao | null;
  /** Se a barra de progresso faz sentido para esta métrica. */
  mostrarBarra: boolean;
  /** Frase curta, pronta para a tela. Diz o que está acontecendo, não um rótulo genérico. */
  leitura: string;
  fonte?: string;
}

const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Formata respeitando a unidade — "3.3x" e "R$ 15" não se escrevem igual. */
export function fmt(v: number | null, unidade = ""): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const casas = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  const n = Number(v.toFixed(casas)).toLocaleString("pt-BR");
  if (unidade === "R$") return `R$ ${n}`;
  if (unidade === "%") return `${n}%`;
  return unidade ? `${n}${unidade.length <= 2 ? unidade : ` ${unidade}`}` : n;
}

/**
 * Situação a partir do ATINGIMENTO (quanto da meta foi alcançado, 0..100+).
 *
 * As faixas são deliberadamente exigentes perto da meta: 95% de uma meta de SLA não é "no alvo",
 * é quase — e chamar de verde é o que faz o problema chegar como surpresa.
 */
function situacaoPorAtingimento(at: number): Situacao {
  if (at >= 110) return "otimo";
  if (at >= 100) return "no_alvo";
  if (at >= 80) return "atencao";
  return "critico";
}

// A faixa de "atenção" vai de 80 a 100 por calibração contra o julgamento do Roberto, não por
// gosto: no documento dele, "ROAS 3,3x / meta 4x" — 82% de atingimento — é 🟡 Atenção, e não
// vermelho. Abaixo de 80 vira crítico. O que importa é que nada entre 80 e 100 apareça como
// verde: era esse o defeito do "No ritmo", que pintava 68 de 80 como saudável.

/**
 * Avalia um indicador respeitando a natureza dele.
 *
 * Regra que vale para tudo aqui: valor `null` NUNCA vira 0 nem 100. Sem dado, a resposta é
 * "sem_dado" — porque um painel que inventa zero para o que não sabe é pior que um painel com
 * lacuna visível. Foi assim que "Rodrigo, tempo médio 0,0 d" apareceu como se fosse instantâneo.
 */
export function avaliar(i: Indicador): Avaliacao {
  const unidade = i.unidade ?? "";
  const base = {
    chave: i.chave, titulo: i.titulo, natureza: i.natureza,
    valor: i.valor, meta: i.meta, unidade, fonte: i.fonte,
  };

  if (i.valor === null || !Number.isFinite(i.valor) || !Number.isFinite(i.meta)) {
    return {
      ...base, score: null, situacao: "sem_dado", delta: null, projecao: null,
      situacaoProjetada: null, mostrarBarra: false,
      leitura: "sem dado conectado",
    };
  }

  const v = i.valor;

  // ── ACUMULATIVA: progresso é real, e projetar pelo ritmo faz sentido ──────
  if (i.natureza === "acumulativa") {
    const progresso = i.meta > 0 ? pct((v / i.meta) * 100) : 0;
    const f = i.fracaoDoPeriodo;
    const projecao = f && f > 0.05 ? v / f : null;
    // O que importa aqui é o RITMO: metade do período com metade da meta é "no alvo", mesmo com
    // a barra em 50%. Comparar progresso com meta cheia no dia 3 do mês assustaria à toa.
    const esperado = f ? i.meta * f : null;
    // CEDO DEMAIS PARA JULGAR. No dia 2 do mês, uma meta de 3 novos clientes espera 0,2 cliente —
    // e ter 0 vira "0% de atingimento", crítico. Foi o que aconteceu no primeiro teste real: o
    // Comercial zerou a dimensão de peso 20 por causa do calendário, não do desempenho.
    // Enquanto o esperado não chega a UMA unidade inteira, não há o que cobrar.
    const situacao: Situacao = esperado === null
      ? (progresso >= 100 ? "no_alvo" : "atencao")
      : esperado < 1
        ? (v > 0 ? "otimo" : "no_alvo")
        : situacaoPorAtingimento((v / esperado) * 100);
    const situacaoProjetada = projecao === null ? null
      : situacaoPorAtingimento(i.meta > 0 ? (projecao / i.meta) * 100 : 100);
    const leitura = projecao === null
      ? `${fmt(v, unidade)} de ${fmt(i.meta, unidade)}`
      : `${fmt(v, unidade)} de ${fmt(i.meta, unidade)} · projeta ${fmt(projecao, unidade)}`;
    // O SCORE da acumulativa mede o RITMO, não a barra: no dia 2 do mês, 0 de 3 clientes não vale
    // 0 pontos na dimensão — vale "sem sinal ainda". A barra continua mostrando o progresso real.
    const scoreRitmo = esperado === null ? progresso
      : esperado < 1 ? (v > 0 ? 100 : 100)               // cedo demais: neutro, não penaliza
        : Math.round(Math.min(150, (v / esperado) * 100));
    return { ...base, score: scoreRitmo, situacao, delta: v - i.meta, projecao, situacaoProjetada, mostrarBarra: true, leitura, progresso };
  }

  // ── QUALIDADE e INVERSA: nível, não acúmulo. Barra não se aplica ─────────
  const inversa = i.natureza === "inversa";
  // Atingimento: quanto da meta foi alcançado. Na inversa a razão vira ao contrário — gastar
  // R$ 10 numa meta de R$ 15 é 150% de atingimento, não 67%.
  const atingimento = inversa
    ? (v > 0 ? (i.meta / v) * 100 : 200)     // valor 0 numa métrica inversa é o melhor caso possível
    : (i.meta > 0 ? (v / i.meta) * 100 : 100);
  const delta = v - i.meta;
  const situacao = situacaoPorAtingimento(atingimento);

  // Direção: com base conhecida, dizer se está melhorando importa mais que a distância.
  let direcao = "";
  if (i.base !== null && i.base !== undefined && Number.isFinite(i.base)) {
    const mudou = v - i.base;
    const melhorou = inversa ? mudou < 0 : mudou > 0;
    if (Math.abs(mudou) > Math.abs(i.base) * 0.02) {
      direcao = melhorou ? ` · ↑ melhorando (de ${fmt(i.base, unidade)})` : ` · ↓ piorando (de ${fmt(i.base, unidade)})`;
    }
  }

  const distancia = Math.abs(delta);
  const ok = inversa ? v <= i.meta : v >= i.meta;
  const leitura = ok
    ? `${fmt(v, unidade)} · meta ${fmt(i.meta, unidade)} atingida${direcao}`
    : `${fmt(v, unidade)} · ${fmt(distancia, unidade)} ${inversa ? "acima" : "abaixo"} da meta de ${fmt(i.meta, unidade)}${direcao}`;

  return {
    ...base, score: pct(atingimento), situacao, delta,
    projecao: null, situacaoProjetada: null,
    mostrarBarra: false,   // ROAS 3,3 não é "83% concluído"
    leitura,
  };
}

/** Rótulo curto para a tela. Sem "no ritmo": o termo mascarava atraso. */
export const ROTULO: Record<Situacao, string> = {
  otimo: "acima da meta",
  no_alvo: "na meta",
  atencao: "atenção",
  critico: "crítico",
  sem_dado: "sem dado",
};
