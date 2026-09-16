// lib/prospeccao/providers/tipos.ts — de onde vêm as empresas. O resto do módulo não sabe (nem
// deve saber) se foi Driva, busca web ou um CSV: entra um `Candidato`, sai um prospect.

import type { Candidato } from "../tipos";
import type { SegmentoIcp } from "../config";

export interface ConsultaDescoberta {
  segmento: SegmentoIcp;
  cidade: string;
  uf: string;
  /** Quantas empresas pedir por consulta. */
  limite?: number;
}

export interface DiscoveryProvider {
  nome: string;
  /** Configurado e pronto para uso? (chave presente, etc.) */
  disponivel(): boolean;
  descobrir(q: ConsultaDescoberta): Promise<Candidato[]>;
}
