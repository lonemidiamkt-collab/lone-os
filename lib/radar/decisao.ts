// Os motivos de descarte de uma pauta do Radar.
//
// Descarte sem motivo não ensina nada, e o botão existe justamente para ensinar: com o tempo, saber
// que metade das pautas de um cliente cai em "não tem esse produto" diz que o briefing dele está
// desatualizado, e "ideia fraca" repetido diz que o problema é o prompt, não o cliente.
export const MOTIVOS_DESCARTE = {
  nao_combina: "Não combina com este cliente",
  ja_fizemos: "Já fizemos algo assim",
  dificil_produzir: "Difícil de produzir",
  produto_inexistente: "O cliente não tem esse produto",
  ideia_fraca: "Ideia fraca",
  fora_posicionamento: "Fora do posicionamento",
  outro: "Outro",
} as const;

export type MotivoDescarte = keyof typeof MOTIVOS_DESCARTE;
export const MOTIVOS_LISTA = Object.entries(MOTIVOS_DESCARTE) as [MotivoDescarte, string][];
