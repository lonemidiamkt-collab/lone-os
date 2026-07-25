// lib/pulse/compute.ts — O PULSO do relacionamento: atividade nos DOIS sentidos.
//
// Substitui o `inactiveSevenDays` (lib/dashboard/getDashboardData.ts), que marcava a carteira INTEIRA
// como "inativo" porque dependia de dois campos mortos e tratava "não sei" como "ruim".
//
// INVARIANTE (a que corrigia o bug): sinal sem fonte é `null` = INDISPONÍVEL, nunca "ruim".
//   · cliente sem grupo de WhatsApp mapeado → não dá pra dizer que "sumiu";
//   · cliente só de tráfego (sem social) → não se cobra post dele;
//   · cliente sem conta de anúncio → não se cobra verba rodando.
// Quem não tem sinal nenhum sai da lista de atenção e vai pro rodapé "sem sinal suficiente".
//
// Função PURA (sem banco/rede) — testável em tests/pulse.test.ts.

export type MotivoPulso = "cliente_sumiu" | "paramos_de_postar" | "producao_travada" | "anuncio_parado";
export type NivelPulso = "saudavel" | "atencao" | "risco" | "critico" | "sem_sinal";

export interface SinaisPulso {
  // ── NÓS → CLIENTE ──
  diasSemPostNosso: number | null;
  diasDesdeUltimaEntregaDesigner: number | null;
  cardsVencidos: number;
  artesParadasDias: number | null;   // arte entregue pelo designer e ainda não publicada
  diasSemSpend: number | null;       // null = cliente não tem tráfego
  temTrafego: boolean;
  temSocial: boolean;                // tem responsável de social (senão não cobramos post)
  // ── CLIENTE → NÓS ──
  diasSemFalar: number | null;       // null = sem grupo mapeado
  diasDesdeUltimaDemanda: number | null;
  diasDesdeAprovacaoCliente: number | null;
  elogios30d: number;
  reclamacoes14d: number;
}

export interface SubSinal { motivo: MotivoPulso; peso: number; dias: number | null; label: string }

export interface Pulso {
  score: number;                     // 0-100, MAIOR = mais saudável
  nivel: NivelPulso;
  motivoDominante: MotivoPulso | null;
  motivoLabel: string | null;        // o texto que aparece no chip ("12d sem post nosso")
  detalhe: SubSinal[];
  semSinal: boolean;                 // nenhum sinal disponível — não dá pra julgar
}

const dia = (n: number) => `${n}d`;

/** Menor valor não-nulo (o sinal mais recente de vida). */
function minDias(...vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x != null);
  return v.length ? Math.min(...v) : null;
}

export function calcularPulso(s: SinaisPulso): Pulso {
  const subs: SubSinal[] = [];

  // 1) Cliente sumiu — qualquer interação dele conta como vida (falar, pedir, aprovar).
  const contatoCliente = minDias(s.diasSemFalar, s.diasDesdeUltimaDemanda, s.diasDesdeAprovacaoCliente);
  if (contatoCliente != null) {
    const peso = contatoCliente > 14 ? 55 : contatoCliente >= 8 ? 30 : 0;
    subs.push({ motivo: "cliente_sumiu", peso, dias: contatoCliente,
      label: peso ? `cliente sumiu há ${dia(contatoCliente)}` : `cliente ativo (${dia(contatoCliente)})` });
  }

  // 2) Nós paramos de postar — só cobra de quem tem social responsável.
  if (s.temSocial && s.diasSemPostNosso != null) {
    const d = s.diasSemPostNosso;
    const peso = d > 14 ? 50 : d >= 8 ? 25 : 0;
    subs.push({ motivo: "paramos_de_postar", peso, dias: d,
      label: peso ? `${dia(d)} sem post nosso` : `postando em dia (${dia(d)})` });
  }

  // 3) Produção travada — o trabalho existe mas não vira post.
  if (s.temSocial) {
    const travadoPorArte = s.artesParadasDias != null && s.artesParadasDias > 3;
    const peso = (s.cardsVencidos >= 3 || (s.artesParadasDias != null && s.artesParadasDias > 7)) ? 40
      : (s.cardsVencidos >= 2 || travadoPorArte) ? 20 : 0;
    if (peso > 0) {
      subs.push({ motivo: "producao_travada", peso, dias: s.artesParadasDias,
        label: s.cardsVencidos >= 2
          ? `${s.cardsVencidos} entregas atrasadas`
          : `arte pronta parada há ${dia(s.artesParadasDias ?? 0)}` });
    } else {
      subs.push({ motivo: "producao_travada", peso: 0, dias: null, label: "produção em dia" });
    }
  }

  // 4) Anúncio parado — só cobra de quem tem tráfego.
  if (s.temTrafego && s.diasSemSpend != null) {
    const d = s.diasSemSpend;
    const peso = d > 7 ? 40 : d >= 3 ? 20 : 0;
    subs.push({ motivo: "anuncio_parado", peso, dias: d,
      label: peso ? `anúncio parado há ${dia(d)}` : "anúncio rodando" });
  }

  if (subs.length === 0) {
    return { score: 100, nivel: "sem_sinal", motivoDominante: null, motivoLabel: null, detalhe: [], semSinal: true };
  }

  // Reclamação recente agrava; elogio recente protege (hoje 'elogio' não é lido por indicador nenhum).
  const extra = s.reclamacoes14d > 0 ? 20 : 0;
  const bonus = s.elogios30d > 0 ? 10 : 0;
  const penalidade = Math.min(100, subs.reduce((acc, x) => acc + x.peso, 0) + extra - bonus);
  const score = Math.max(0, 100 - Math.max(0, penalidade));

  // Motivo dominante = maior peso; empate resolve na ordem em que o dono age.
  const ordem: MotivoPulso[] = ["cliente_sumiu", "paramos_de_postar", "producao_travada", "anuncio_parado"];
  const candidatos = subs.filter((x) => x.peso > 0)
    .sort((a, b) => b.peso - a.peso || ordem.indexOf(a.motivo) - ordem.indexOf(b.motivo));
  const dom = candidatos[0] ?? null;

  const nivel: NivelPulso = score <= 40 ? "critico" : score <= 60 ? "risco" : score <= 80 ? "atencao" : "saudavel";

  return {
    score,
    nivel,
    motivoDominante: dom?.motivo ?? null,
    motivoLabel: dom?.label ?? null,
    detalhe: subs,
    semSinal: false,
  };
}
