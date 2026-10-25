// lib/automacoes/execucao.ts — a rota rodou de verdade ou pulou? E por que a Central não abriu? Puro.
//
// 25/10/2026 (auditoria de erro recuperável):
//   10.2 — client-messages e monthly-calendar respondiam ok:true com status "skip"/"disabled" (rodada já
//          reservada, trava interna desligada, fora do dia). A pessoa confirmava "manda de verdade" e via
//          "X rodou." sem nada ter saído; a Central mostrava "Funcionando" com a trava segurando tudo.
//          Agora essas rotas devolvem `executado: false` + `motivo` no começo do corpo, e quem lê a resposta
//          (Rodar agora e o registro do cron) trata como "pulou: motivo".
//   10.6 — qualquer falha ao abrir a Central virava "aplique a migração 20260924100000". A frase da migração
//          agora só aparece quando a tabela/função não existe de verdade.

/**
 * Valor de uma chave do PRIMEIRO nível de um corpo JSON — mesmo truncado (o registro do cron guarda só os
 * 300 primeiros caracteres). Devolve o texto cru do valor ("false", "\"motivo\""), ou null.
 */
function valorNoTopo(texto: string, chave: string): string | null {
  try {
    const d = JSON.parse(texto);
    if (d && typeof d === "object" && !Array.isArray(d) && chave in d) return JSON.stringify((d as Record<string, unknown>)[chave]);
    return null;
  } catch { /* truncado: varre */ }
  let prof = 0;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (ch === "{" || ch === "[") { prof++; continue; }
    if (ch === "}" || ch === "]") { prof--; continue; }
    if (ch !== '"') continue;
    let j = i + 1, s = "";
    while (j < texto.length && texto[j] !== '"') {
      if (texto[j] === "\\") { s += texto[j + 1] ?? ""; j += 2; } else { s += texto[j]; j++; }
    }
    if (j >= texto.length) return null;
    const resto = texto.slice(j + 1).replace(/^\s*/, "");
    if (prof === 1 && s === chave && resto.startsWith(":")) {
      const v = resto.slice(1).replace(/^\s*/, "");
      if (v.startsWith('"')) {
        const m = /^"((?:[^"\\]|\\.)*)"/.exec(v);
        return m ? `"${m[1]}"` : null;
      }
      const m = /^(true|false|null|-?\d+(?:\.\d+)?)/.exec(v);
      return m ? m[1] : null;
    }
    i = j;
  }
  return null;
}

export interface NaoExecutou {
  motivo: string;
  /**
   * Pular era o esperado pela agenda (ex.: o calendário roda nos dias 20–22 e só envia no dia útil certo).
   * Para o cron isso é uma rodada normal; para quem clicou "Rodar agora" continua sendo "não enviou".
   */
  esperado: boolean;
}

/**
 * A rota disse que NÃO executou (`executado: false`)? Devolve o motivo; null = executou (ou não disse).
 * Só o primeiro nível conta. As rotas põem `executado`, `esperado` e `motivo` no começo do corpo, para caber
 * nos 300 caracteres que o registro do cron guarda.
 */
export function naoExecutou(corpo: string | null | undefined): NaoExecutou | null {
  const texto = corpo ?? "";
  if (valorNoTopo(texto, "executado") !== "false") return null;
  const esperado = valorNoTopo(texto, "esperado") === "true";
  const m = valorNoTopo(texto, "motivo");
  if (!m) return { motivo: "a rota não executou", esperado };
  let motivo: string;
  try { motivo = String(JSON.parse(m)); } catch { motivo = m.replace(/^"|"$/g, ""); }
  return { motivo, esperado };
}

// ─── Erro ao abrir a Central ────────────────────────────────────────────────

export const MIGRACAO_PENDENTE =
  "A Central ainda não tem as tabelas no banco — aplique supabase/migrations/20260924100000_automacoes.sql.";

/** Erro com o código do Postgres/PostgREST, para a frase certa. */
export class ErroDaCentral extends Error {
  constructor(message: string, public code?: string) { super(message); this.name = "ErroDaCentral"; }
}

// 42P01 = tabela não existe; 42883 = função não existe; PGRST202/205 = função/tabela fora do cache do PostgREST.
const FALTA_ESTRUTURA = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

/** A frase que a tela mostra quando a Central não abre. */
export function fraseDoErroDaCentral(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  if (code && FALTA_ESTRUTURA.has(code)) return MIGRACAO_PENDENTE;
  const msg = e instanceof Error ? e.message : String(e);
  return `Não consegui carregar a Central de Automações (${msg.slice(0, 160)}). Tente de novo em alguns segundos.`;
}
