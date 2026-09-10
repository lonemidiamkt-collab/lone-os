// O AVISO DE CHURN NO GRUPO DA EQUIPE.
//
// Roberto (10/09): "ao ser feito um churn na empresa e no sistema, deveria ser aviso no grupo
// cadastro com o motivo e as observações."
//
// Cliente que sai é a informação mais importante da semana e hoje some em silêncio: alguém
// arquiva pela tela e o resto do time descobre quando estranha a ausência no board. O tráfego
// continua gastando verba, o social continua programando post, o designer continua produzindo.
//
// Texto puro, testável — quem envia é a rota.

import { rotuloMotivo, INICIATIVAS, type Iniciativa } from "./offboarding";
import { tempoDeParceria } from "./offboarding";

export interface AvisoChurn {
  cliente: string;
  motivo: string;
  motivoDetalhe?: string | null;
  iniciativa?: Iniciativa | null;
  entrada?: string | null;
  saida: string;
  responsavel?: string | null;
  /** Quem apertou o botão. */
  porQuem: string;
  /** Serviços que estavam ativos — é o que precisa ser desligado. */
  servicos?: string[];
  /** Pausa temporária pretende voltar: muda a instrução para o time. */
  pretendeVoltar?: boolean;
}

export function textoAvisoChurn(a: AvisoChurn): string {
  const l: string[] = [];
  const dataBR = (iso?: string | null) =>
    iso ? iso.slice(0, 10).split("-").reverse().join("/") : null;

  l.push(`🔻 *${a.cliente}* saiu da carteira`);
  l.push("");
  l.push(`*Motivo:* ${rotuloMotivo(a.motivo)}`);
  if (a.motivoDetalhe?.trim()) l.push(`_${a.motivoDetalhe.trim()}_`);
  l.push("");

  const linhas = [
    a.entrada && `📅 Cliente desde ${dataBR(a.entrada)}${a.entrada ? ` · ${tempoDeParceria(a.entrada, a.saida)}` : ""}`,
    `🚪 Saída em ${dataBR(a.saida)}`,
    a.iniciativa && `🤝 Pedido por ${INICIATIVAS[a.iniciativa].toLowerCase()}`,
    a.responsavel && `👤 Carteira: ${a.responsavel}`,
  ].filter(Boolean) as string[];
  l.push(...linhas);

  // A parte operacional. Sem isto o aviso é uma notícia; com isto é uma instrução.
  l.push("");
  if (a.pretendeVoltar) {
    l.push("⏸️ *É pausa, não saída definitiva* — ele sinalizou que volta.");
    l.push("Pausem as entregas e a verba, mas NÃO desmontem nada: conta, board e materiais ficam.");
  } else {
    l.push("*O que precisa parar:*");
    l.push("• campanhas e verba");
    l.push("• programação de posts");
    l.push("• produção de arte em aberto");
    l.push("• relatórios e mensagens automáticas");
  }
  if (a.servicos?.length) l.push(`_Serviços ativos: ${a.servicos.join(", ")}._`);

  l.push("");
  l.push(`_Arquivado por ${a.porQuem}. O histórico do cliente continua no sistema._`);
  return l.join("\n");
}
