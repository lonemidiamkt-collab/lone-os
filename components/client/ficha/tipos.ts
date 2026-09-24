// components/client/ficha/tipos.ts — o que as seis abas da ficha do cliente recebem.

import type { Client, Role } from "@/lib/types";
import type { NivelSaude } from "@/lib/scores/health";
import type { ItemHistoricoNps } from "@/lib/cs/nps-server";
import type { AbaFicha } from "./abas";

/** Resposta de GET /api/clients/[id]/resumo. */
export interface ResumoCliente {
  saude: {
    nivel: NivelSaude;
    score: number | null;
    /** Os porquês, na ordem de quem lê: esfriando primeiro, depois o que a nota apontou. */
    motivos: string[];
    cobertura: number | null;
    /** Data (YYYY-MM-DD) da última nota gravada pelo /api/scores. */
    calculadaEm: string | null;
    diasQuieto: number | null;
    esfriando: boolean;
  };
  /** O que o CLIENTE está devendo (Jornada CS). */
  pendenciasCliente: { item: string; desde?: string; impacto?: string }[];
  /** Pergunta do cliente no grupo ainda sem resposta do time (customer_requests aberta). */
  perguntaAberta: { texto: string; autor: string | null; desde: string } | null;
  nps: { itens: ItemHistoricoNps[]; erro: string | null };
  /** Só gestão (a Jornada CS é restrita): null para os outros papéis. */
  checkins: { pergunta: string; origem: string; status: string; resposta: string | null; enviado_em: string }[] | null;
}

export interface FichaCtx {
  client: Client;
  clientId: string;
  role: Role;
  currentUser: string;
  /** admin ou manager. */
  isAdmin: boolean;
  /** O cliente é da carteira de quem está vendo (pelo campo do papel dele). */
  naMinhaCarteira: boolean;
  resumo: ResumoCliente | null;
  resumoErro: string | null;
  recarregarResumo: () => void;
  /** Troca de aba (e rola até a seção, quando vier). */
  irPara: (aba: AbaFicha, secao?: string) => void;
  /** Abre o "Pedir arte" (cria o card já em "Com o designer"). */
  pedirArte: () => void;
}
