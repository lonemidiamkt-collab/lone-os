// lib/cofre/senhas-anteriores.ts — a lista "Senhas anteriores" de cada campo do cofre na ficha. Puro.
//
// POR QUE (25/10/2026, onda 5 da auditoria de erro recuperável). Desde a onda 2 (item 3.5) toda troca de
// senha guarda a anterior em `cofre_senhas_anteriores` (cifrada, quem trocou, quando) — mas o único jeito
// de voltar era o "Desfazer" do aviso, que vive uns 15 s. Passou disso, a versão guardada ficava sem
// porta de entrada. Agora a ficha lista as anteriores por campo: data e quem trocou (sem a senha), "Ver"
// só para admin (registrado como o revelar da senha atual) e "Restaurar esta" com confirmação.
//
// A rota (/api/client-vault/anteriores) só lê e decifra; a restauração é a ação `restaurar` que
// /api/client-vault já tinha. Nada aqui recebe senha. Testado em tests/cofre-senhas-anteriores.test.ts.

import { rotuloDoCampo, type MotivoVersao } from "./versoes";

/** Campos de `clients` cujo histórico a ficha mostra (os mesmos que /api/client-vault aceita). */
export const CAMPOS_COM_HISTORICO = new Set(["facebook_password", "instagram_password", "google_ads_password"]);

/** Quantas versões a ficha lista por campo (as mais recentes). */
export const MAX_VERSOES = 20;

/** Linha da tabela como a rota lê — SEM `valor_cifrado`. */
export interface LinhaVersao {
  id: string;
  motivo: string | null;
  trocado_por_id: string | null;
  trocado_por_email: string | null;
  trocado_em: string;
}

export interface VersaoAnterior {
  id: string;
  /** Quando esta senha deixou de valer (o momento da troca). */
  em: string;
  /** Quem trocou: nome da equipe; sem nome, o e-mail; sem nada, "—". */
  quem: string;
  motivo: MotivoVersao;
}

const MOTIVOS: MotivoVersao[] = ["troca", "remocao", "restauracao"];

/** Monta a lista para a tela. `nomes`: auth_id → nome na equipe. */
export function montarVersoes(linhas: LinhaVersao[], nomes: Map<string, string>): VersaoAnterior[] {
  return linhas.map((l) => ({
    id: l.id,
    em: l.trocado_em,
    quem: (l.trocado_por_id && nomes.get(l.trocado_por_id)) || l.trocado_por_email || "—",
    motivo: MOTIVOS.includes(l.motivo as MotivoVersao) ? (l.motivo as MotivoVersao) : "troca",
  }));
}

const ROTULO_MOTIVO: Record<MotivoVersao, string> = {
  troca: "trocada",
  remocao: "apagada",
  restauracao: "substituída ao restaurar outra",
};

function dataHora(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "data desconhecida";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
}

/** "Valia até 21/10/2026, 14:30 · trocada por Roberto". Nunca inclui a senha. */
export function descreverVersao(v: VersaoAnterior): string {
  return `Valia até ${dataHora(v.em)} · ${ROTULO_MOTIVO[v.motivo]} por ${v.quem}`;
}

/** Texto da confirmação do "Restaurar esta". */
export function confirmacaoRestaurar(campo: string, v: VersaoAnterior): string {
  return `Restaurar a senha do ${rotuloDoCampo(campo)} que valia até ${dataHora(v.em)}?\n\n`
    + "A senha atual não se perde: fica guardada nesta lista e dá para voltar a ela do mesmo jeito.";
}

/** A tabela ainda não existe no banco (migration 20261021170000 não aplicada). */
export function tabelaAusente(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "");
}
