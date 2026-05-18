import { z } from "zod";

export const paletaColorSchema = z.object({
  hex:  z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve estar no formato #RRGGBB"),
  nome: z.string().min(1).max(50),
});

export const briefingInputSchema = z.object({
  // ── Estratégia ────────────────────────────────────────────
  resumo_estrategico:       z.string().max(2000).nullish(),
  produtos:                 z.array(z.string().max(100)).max(50).optional(),
  publico_alvo:             z.array(z.string().max(100)).max(20).optional(),
  posicionamento:           z.string().max(1000).nullish(),
  dores:                    z.array(z.string().max(200)).max(20).optional(),
  ganchos:                  z.array(z.string().max(200)).max(20).optional(),
  ctas:                     z.array(z.string().max(100)).max(15).optional(),
  observacoes_estrategicas: z.string().max(2000).nullish(),

  // ── Identidade Visual ─────────────────────────────────────
  paleta_cores:        z.array(paletaColorSchema).max(10).optional(),
  tipografia:          z.string().max(200).nullish(),
  logo_url:            z.string().url("URL inválida").nullish(),
  referencias_visuais: z.array(z.string().max(500)).max(20).optional(),
  elementos_evitar:    z.array(z.string().max(200)).max(20).optional(),

  // ── Voz e Tom ─────────────────────────────────────────────
  tom_voz: z
    .enum(["formal", "informal", "divertido", "tecnico", "misto"])
    .nullish(),
  pessoa_verbal: z
    .enum(["voce", "voces", "tu", "a_gente"])
    .nullish(),
  usa_emoji:          z.boolean().nullish(),
  usa_giria:          z.boolean().nullish(),
  palavras_proibidas: z.array(z.string().max(50)).max(50).optional(),
  hashtags_padrao:    z.array(z.string().max(50)).max(30).optional(),

  // ── Operação ──────────────────────────────────────────────
  horarios_preferidos:           z.string().max(500).nullish(),
  produtos_destaque_atual:       z.array(z.string().max(100)).max(20).optional(),
  concorrentes_evitar_mencionar: z.array(z.string().max(100)).max(20).optional(),

  // ── Interno ───────────────────────────────────────────────
  observacoes_internas: z.string().max(2000).nullish(),
});

export type BriefingInput = z.infer<typeof briefingInputSchema>;
export type PaletaColor  = z.infer<typeof paletaColorSchema>;
