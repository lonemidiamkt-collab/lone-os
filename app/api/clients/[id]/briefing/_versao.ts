/**
 * Monta a linha da nova versão do briefing. Função pura (sem I/O) — testada em tests/briefing-versao.test.ts.
 * Arquivo prefixado com _ → Next.js não expõe como rota.
 */

// Colunas que pertencem à VERSÃO, não ao conteúdo — nunca são herdadas da versão anterior.
const COLUNAS_DA_VERSAO = new Set([
  "id", "client_id", "version", "is_current", "created_by", "created_at", "updated_at",
]);

// Default de cada campo que o form sabe editar, quando nem o form nem a versão anterior têm valor.
const DEFAULTS_DO_FORM: Record<string, unknown> = {
  resumo_estrategico: null, produtos: [], publico_alvo: [], posicionamento: null,
  dores: [], ganchos: [], ctas: [], observacoes_estrategicas: null,
  paleta_cores: [], tipografia: null, logo_url: null, referencias_visuais: [], elementos_evitar: [],
  tom_voz: null, pessoa_verbal: null, usa_emoji: null, usa_giria: null,
  palavras_proibidas: [], hashtags_padrao: [],
  horarios_preferidos: null, produtos_destaque_atual: [], concorrentes_evitar_mencionar: [],
  observacoes_internas: null,
};

/**
 * Conteúdo da nova versão = versão atual + o que o form mandou.
 *
 * O form manual não conhece os campos do estrategista (desejos, objeções, crença, mix de pilares,
 * paleta…). Antes, salvar pelo form gravava [] neles e o trabalho do Loninho sumia da versão atual.
 * Campo AUSENTE no payload é herdado; campo PRESENTE (mesmo null/[]) é a escolha de quem editou.
 */
export function conteudoDaNovaVersao(
  atual: Record<string, unknown> | null,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...DEFAULTS_DO_FORM };
  for (const [k, v] of Object.entries(atual ?? {})) {
    if (!COLUNAS_DA_VERSAO.has(k) && v !== undefined) out[k] = v;
  }
  for (const [k, v] of Object.entries(payload)) {
    if (COLUNAS_DA_VERSAO.has(k) || v === undefined) continue;
    out[k] = v ?? DEFAULTS_DO_FORM[k] ?? null;
  }
  return out;
}
