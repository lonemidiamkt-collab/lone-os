export type PaletaColor = {
  hex:  string; // "#RRGGBB"
  nome: string;
};

export type TomVoz       = "formal" | "informal" | "divertido" | "tecnico" | "misto";
export type PessoaVerbal = "voce" | "voces" | "tu" | "a_gente";

/** Linha crua da tabela client_briefings */
export type ClientBriefing = {
  // Identificação
  id:         string;
  client_id:  string;
  version:    number;
  is_current: boolean;

  // Auditoria
  created_at: string; // ISO 8601
  created_by: string | null;

  // Estratégia
  resumo_estrategico:       string | null;
  produtos:                 string[];
  publico_alvo:             string[];
  posicionamento:           string | null;
  dores:                    string[];
  ganchos:                  string[];
  ctas:                     string[];
  observacoes_estrategicas: string | null;

  // Identidade Visual
  paleta_cores:        PaletaColor[];
  tipografia:          string | null;
  logo_url:            string | null;
  referencias_visuais: string[];
  elementos_evitar:    string[];

  // Voz e Tom
  tom_voz:            TomVoz | null;
  pessoa_verbal:      PessoaVerbal | null;
  usa_emoji:          boolean | null;
  usa_giria:          boolean | null;
  palavras_proibidas: string[];
  hashtags_padrao:    string[];

  // Operação
  horarios_preferidos:           string | null;
  produtos_destaque_atual:       string[];
  concorrentes_evitar_mencionar: string[];

  // Interno
  observacoes_internas: string | null;
};

/** ClientBriefing enriquecido com campos computados da view */
export type BriefingWithMeta = ClientBriefing & {
  completeness_percent: number;   // 0-100
  client_name:          string;
  created_by_name:      string | null; // null se member deletado
  total_versions:       number;
};

/** Item leve usado na listagem de histórico (sem conteúdo completo) */
export type BriefingHistoryItem = {
  id:                  string;
  version:             number;
  is_current:          boolean;
  created_at:          string;
  created_by_name:     string | null;
  completeness_percent: number;
};

/** Resposta do GET /api/clients/[id]/briefing */
export type BriefingGetResponse = {
  briefing:             BriefingWithMeta | null;
  total_versions:       number;
};

/** Resposta do GET /api/clients/[id]/briefing/history */
export type BriefingHistoryResponse = {
  versions: BriefingHistoryItem[];
  total:    number;
};
