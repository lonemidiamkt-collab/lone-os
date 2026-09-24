// lib/traffic/hoje/tipos.ts — o que a aba "Hoje" do Tráfego recebe de /api/trafego/hoje.
//
// Uma linha por cliente que COMPROU tráfego (lib/clients/servico), com o pior problema primeiro.
// Números são do dinheiro DO CLIENTE (saldo da conta de anúncio, gasto, custo por conversa) — nada
// da agência (fee, contrato, MRR) passa por aqui.

/** Gravidade. `info` = oportunidade, não emergência (criativo cansado, verba mal distribuída). */
export type NivelAlerta = "critical" | "warning" | "info";

/**
 * Tipo do alerta — é a chave do "visto" junto com o cliente. Os três primeiros são os mesmos
 * `problema` do Início (lib/inicio/tipos.ts), para o visto valer nos dois lugares.
 */
export type TipoAlerta =
  | "conta"        // conta de anúncio com problema: cobrança, desativada, leitura falhou, sem conta
  | "saldo"        // saldo baixo/zerado (motor de lib/budgets/alert-engine, o mesmo do WhatsApp)
  | "entrega"      // parou de gastar ou o resultado caiu (anomaly_alerts / diagnóstico)
  | "acima_meta"   // custo por conversa acima do teto combinado (diagnóstico)
  | "desperdicio"  // anúncio gastando sem trazer conversa (diagnóstico)
  | "fadiga"       // criativo cansado: frequência alta (diagnóstico)
  | "verba";       // verba mal distribuída dentro da campanha (diagnóstico)

export const TIPOS_ALERTA: readonly TipoAlerta[] = [
  "conta", "saldo", "entrega", "acima_meta", "desperdicio", "fadiga", "verba",
];

export const NIVEIS_ALERTA: readonly NivelAlerta[] = ["critical", "warning", "info"];

export interface VistoInfo {
  /** Nome de quem marcou (ou o e-mail, se o nome não estiver no time). */
  por: string | null;
  /** ISO. */
  em: string;
  /** ISO — até quando vale. */
  ate: string;
  /** Gravidade no momento em que foi visto. */
  nivel: NivelAlerta;
}

export interface ProblemaHoje {
  tipo: TipoAlerta;
  nivel: NivelAlerta;
  /** Curto: "Saldo acabando", "Conta com pagamento falhou". */
  titulo: string;
  /** Uma linha: o porquê. */
  detalhe: string;
  /** O que fazer, quando a fonte sabe (diagnóstico). */
  acao?: string;
  /** Desempate dentro da gravidade: maior = mais urgente. */
  peso: number;
  /** Visto que ainda vale para ESTA gravidade. Null = em aberto. */
  visto: VistoInfo | null;
}

export interface NumerosHoje {
  /** Saldo disponível em R$ (pré-pago) ou verba − gasto do mês (cartão com verba). */
  saldo: number | null;
  diasRestantes: number | null;
  /** Conta paga no cartão/fatura: não tem saldo que acaba. */
  cartao: boolean;
  /** Status da conta quando não está ativa ("Pagamento falhou"). */
  statusConta: string | null;
  gastoOntem: number | null;
  conversasOntem: number | null;
  custoOntem: number | null;
  /** Média por dia nos 7 dias antes de ontem. */
  conversasMedia7d: number | null;
  custoMedio7d: number | null;
  /** Gasto médio dos últimos 3 dias (ordena por dinheiro em jogo). */
  gastoMedio3d: number | null;
}

export type EstadoLinha = "aberto" | "visto" | "em_dia";

export interface LinhaHoje {
  clientId: string;
  nome: string;
  logo: string | null;
  /** Gestor de tráfego do cadastro (nome do time). */
  gestor: string | null;
  /** O cliente é de quem está olhando. */
  meu: boolean;
  metaAccountId: string | null;
  /** Gerenciador de Anúncios quando a conta é conhecida; senão, os resultados do cliente no painel. */
  linkConta: string;
  linkContaExterno: boolean;
  linkCliente: string;
  /** Pior primeiro; os vistos vão para o fim. */
  problemas: ProblemaHoje[];
  /** Notícia boa do diagnóstico ("pode escalar"). Não é alerta. */
  dicas: string[];
  numeros: NumerosHoje;
  estado: EstadoLinha;
}

export interface RespostaHoje {
  geradoEm: string;
  /** Último sync de saldo das contas (o mais recente). */
  sincronizadoEm: string | null;
  /** "Ontem" em São Paulo (YYYY-MM-DD) — a data dos números "ontem". */
  ontem: string;
  /** Nome de quem está olhando, como está no time. */
  eu: string | null;
  linhas: LinhaHoje[];
  /** false = tabela traffic_alert_acks ainda não existe: a tela mostra, mas sem "visto". */
  vistoDisponivel: boolean;
  /** Fontes que falharam (a tela avisa; nunca vira zero silencioso). */
  falhas: string[];
}

/** Um alerta a marcar/desmarcar como visto. */
export interface AlertaRef {
  clientId: string;
  tipo: TipoAlerta;
  nivel: NivelAlerta;
}
