// lib/priority/silencio.ts — decisão do gestor vale por um tempo. Puro.
//
// O defeito (medido em 25/10/2026): "Feito", "Ignorar" e "Incorreta" tiram a recomendação dos estados abertos,
// mas se a fonte continua reportando o mesmo problema, a rodada seguinte (de hora em hora) a cria de novo como
// "nova". Para quem decidiu, o botão parece não funcionar — e o ritmo da verba, que vale o mês inteiro, voltaria
// 12 vezes por dia. Nenhuma das 441 recomendações de tráfego de 45 dias tinha decisão de alguém.
//
// A regra: o mesmo fingerprint decidido não volta por um tempo que depende da decisão.
//   • executada (Feito): 24 h — tempo de o dado da Meta refletir a mudança. Se o problema continua depois disso,
//     volta: é o "voltou" que o check-in precisa mostrar.
//   • ignorada / incorreta: 7 dias — a pessoa disse que não é problema; cobrar de novo amanhã é ruído.

export const SILENCIO_HORAS: Record<string, number> = { executada: 24, ignorada: 7 * 24, incorreta: 7 * 24 };

export interface Decidida { fingerprint: string; estado: string; decidido_em: string | null }

/** Fingerprints que ainda estão no silêncio da última decisão. */
export function emSilencio(decididas: Decidida[], agora: Date = new Date()): Set<string> {
  const ultima = new Map<string, Decidida>();
  for (const d of decididas) {
    if (!d.decidido_em || !(d.estado in SILENCIO_HORAS)) continue;
    const atual = ultima.get(d.fingerprint);
    if (!atual || Date.parse(d.decidido_em) > Date.parse(atual.decidido_em!)) ultima.set(d.fingerprint, d);
  }
  const out = new Set<string>();
  for (const [fp, d] of ultima) {
    const fim = Date.parse(d.decidido_em!) + SILENCIO_HORAS[d.estado] * 3_600_000;
    if (Number.isFinite(fim) && fim > agora.getTime()) out.add(fp);
  }
  return out;
}
