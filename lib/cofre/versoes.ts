// lib/cofre/versoes.ts — trocar a senha no cofre não pode apagar a anterior. Módulo PURO.
//
// O PROBLEMA (auditoria de erro recuperável, 21/10/2026, item 3.5): o admin trocava a senha na ficha
// e a anterior sumia — digitou errado, colou a senha de outro cliente, o cliente voltou atrás: não
// havia como voltar. E o espelho para o cofre do social falhava calado (gravava `updated_by` com
// e-mail numa coluna que é FK de team_members) e, quando passava, gravava a senha em texto puro.
//
// Aqui fica a decisão — guardar ou não a anterior, o que dizer quando o espelho falha — sem banco,
// para dar para testar. A rota (/api/client-vault) só executa.

export type MotivoVersao = "troca" | "remocao" | "restauracao";

export interface PlanoDeTroca {
  /** Havia senha e ela vai mudar: guardar a anterior ANTES de gravar a nova. */
  guardarAnterior: boolean;
  /** false = a senha nova é igual à atual (nada a gravar; o espelho ainda pode ser refeito). */
  mudou: boolean;
  motivo: MotivoVersao;
}

/**
 * O que fazer com a senha que já estava no cofre.
 * `anteriorClaro` é a atual já decifrada (null = não havia; undefined = não deu para decifrar —
 * o cifrado é guardado assim mesmo, porque é o que estava lá).
 */
export function planejarTroca(params: {
  anteriorBruto: string | null | undefined;
  anteriorClaro: string | null | undefined;
  novoClaro: string | null | undefined;
  restaurando?: boolean;
}): PlanoDeTroca {
  const novo = (params.novoClaro ?? "").trim() ? params.novoClaro! : null;
  const havia = !!(params.anteriorBruto ?? "").trim();
  const motivo: MotivoVersao = params.restaurando ? "restauracao" : novo ? "troca" : "remocao";
  if (!havia) return { guardarAnterior: false, mudou: !!novo, motivo };
  // Não deu para decifrar a atual: não dá para comparar. Trata como troca e guarda o cifrado.
  if (params.anteriorClaro === undefined) return { guardarAnterior: true, mudou: true, motivo };
  if (params.anteriorClaro === novo) return { guardarAnterior: false, mudou: false, motivo };
  return { guardarAnterior: true, mudou: true, motivo };
}

/**
 * O valor que vai para o histórico: SEMPRE cifrado. Linha antiga em texto puro (antes da cifra)
 * é cifrada aqui — o histórico não pode ser o lugar onde a senha aberta sobrevive.
 */
export function valorParaGuardar(
  anteriorBruto: string,
  cifrar: (claro: string) => string | null,
): string | null {
  if (anteriorBruto.startsWith("v1:")) return anteriorBruto;
  return cifrar(anteriorBruto);
}

/** Campos de `clients` que o cofre do social também mostra (Google Ads é do tráfego e fica de fora). */
export const ESPELHADOS = {
  instagram_password: "instagram_password",
  facebook_password: "facebook_password",
} as const;

export function campoEspelhado(tabela: string, campo: string): keyof typeof ESPELHADOS | null {
  if (tabela !== "clients") return null;
  return campo in ESPELHADOS ? (campo as keyof typeof ESPELHADOS) : null;
}

export interface ResultadoEspelho {
  /** O campo é espelhado no cofre do social? (Google não é.) */
  aplicavel: boolean;
  ok: boolean;
  erro?: string;
}

const ROTULO_CAMPO: Record<string, string> = {
  facebook_password: "Meta/Facebook",
  instagram_password: "Instagram",
  google_ads_password: "Google Ads",
  meta_password: "Meta/Facebook",
  google_password: "Google",
};

export function rotuloDoCampo(campo: string): string {
  return ROTULO_CAMPO[campo] ?? campo;
}

/**
 * Frase para a tela quando a senha foi salva no cadastro mas NÃO chegou ao cofre do social.
 * null = nada a avisar. Nunca inclui a senha — só o campo e o motivo técnico.
 */
export function avisoDoEspelho(campo: string, r: ResultadoEspelho | null | undefined): string | null {
  if (!r || !r.aplicavel || r.ok) return null;
  return `${rotuloDoCampo(campo)}: salva no cadastro, mas não chegou ao cofre do social`
    + `${r.erro ? ` (${r.erro})` : ""}. O social continua vendo a senha antiga — tente salvar de novo.`;
}
