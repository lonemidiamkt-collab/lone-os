// lib/saude/tipos.ts — o que a tela Saúde da carteira recebe de /api/saude/carteira. Sem dinheiro:
// nem da agência (fee, contrato) nem do cliente (faturamento). Nível, porquê, dono e próxima ação.

import type { NivelSaude } from "@/lib/scores/health";
import type { Papel } from "@/lib/api/require-role";
import type { ProximaAcao } from "@/lib/clientes/proxima-acao";
import type { DistribuicaoCarteira, EtapaJornada, Severidade, Tendencia } from "./carteira";

export interface ComponenteDaNota {
  chave: string;
  nome: string;
  valor: number | null;
}

/** A ficha de relacionamento (client_journey). Só vai para a gestão — `notas` traz o handoff do comercial. */
export interface Relacionamento {
  estadoManual: string | null;
  pendenciasCliente: { item: string; desde?: string; impacto?: string }[];
  ultimaReuniao: string | null;
  proximaReuniao: string | null;
  notas: string | null;
}

export interface LinhaSaude {
  id: string;
  nome: string;
  logo: string | null;
  nivel: NivelSaude;
  score: number | null;
  tendencia: Tendencia | null;
  /** Variação da nota nos últimos 14 dias (última − primeira). */
  delta: number | null;
  esfriando: boolean;
  diasQuieto: number | null;
  pedeAtencao: boolean;
  severidade: Severidade | null;
  /** Os 2–3 porquês (lib/saude/carteira.ts → situacaoDaSaude). */
  motivos: string[];
  componentes: ComponenteDaNota[];
  cobertura: number | null;
  /** Quando a nota foi calculada (clients.health_computed_at). */
  calculadaEm: string | null;
  dono: string | null;
  social: string | null;
  trafego: string | null;
  designer: string | null;
  pausado: boolean;
  etapa: EtapaJornada;
  proximaAcao: ProximaAcao;
  /** Quem abriu pode confirmar/editar a próxima ação deste cliente. */
  podeEditar: boolean;
  relacionamento: Relacionamento | null;
}

export interface RespostaSaude {
  geradoEm: string;
  eu: { nome: string | null; papel: Papel; gestao: boolean };
  linhas: LinhaSaude[];
  distribuicao: DistribuicaoCarteira;
  /** Donos do relacionamento presentes na carteira (para o filtro). */
  donos: string[];
  /** Nota mais recente gravada (dia) — a tela avisa quando a nota é velha. */
  notaDoDia: string | null;
  /** Fontes que não carregaram — a tela avisa em vez de mostrar zero. */
  falhas: string[];
  /** A migration da próxima ação confirmada ainda não foi aplicada (grava sem quem/quando). */
  semMigracaoProximaAcao: boolean;
}
