// lib/prospeccao/providers/driva.ts — Driva (base de CNPJs) como provider de descoberta.
//
// Fica preparado, não ligado: sem `DRIVA_API_KEY` o provider se declara indisponível e a
// descoberta segue pelos outros. Enquanto isso, a exportação CSV da Driva entra pelo importador
// (providers/importacao.ts) — mesmo resultado, sem credencial.

import type { DiscoveryProvider, ConsultaDescoberta } from "./tipos";
import type { Candidato } from "../tipos";

export const drivaProvider: DiscoveryProvider = {
  nome: "driva",
  disponivel: () => !!process.env.DRIVA_API_KEY,
  async descobrir(q: ConsultaDescoberta): Promise<Candidato[]> {
    if (!process.env.DRIVA_API_KEY) throw new Error("Driva: DRIVA_API_KEY ausente — use a importação CSV");
    // Contrato da API da Driva ainda não mapeado (depende do plano contratado). Quando existir:
    // buscar por CNAE (q.segmento.cnaes) + município (q.cidade/q.uf) + situação ATIVA → Candidato[].
    throw new Error(`Driva: integração de API não configurada (consulta ${q.segmento.nome} / ${q.cidade})`);
  },
};
