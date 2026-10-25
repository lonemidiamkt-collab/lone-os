// lib/automacoes/envios.ts — o `ok` de uma rotina que manda mensagem (24/10/2026, auditoria 5.12). Módulo PURO.
//
// A Central de Automações lê o `ok` do topo da resposta (lib/automacoes/saude.ts). Véspera, raio-x, datas e as
// reuniões respondiam `ok: true` mesmo quando o WhatsApp recusou o envio — a rotina aparecia verde e ninguém soube
// que a mensagem não saiu. Regra: `ok` só quando tudo o que devia sair saiu; o que falhou vai na resposta, com o motivo.

export interface FalhaEnvio {
  /** Para onde ia: "grupo interno", "grupo de vendas", "cliente X"… */
  alvo: string;
  erro: string;
}

/** Campos para espalhar na resposta da rotina: `{ ok, falhas, erro? }`. */
export function resultadoDosEnvios(falhas: FalhaEnvio[]): { ok: boolean; falhas: FalhaEnvio[]; erro?: string } {
  if (!falhas.length) return { ok: true, falhas: [] };
  const lista = falhas.slice(0, 5).map((f) => `${f.alvo}: ${f.erro}`).join("; ");
  return {
    ok: false,
    falhas,
    erro: `${falhas.length === 1 ? "1 envio não saiu" : `${falhas.length} envios não saíram`} — ${lista}${falhas.length > 5 ? ` (+${falhas.length - 5})` : ""}`,
  };
}

/** Grupo interno não configurado com mensagem para mandar também é falha (antes passava como "não precisou"). */
export const SEM_GRUPO_INTERNO = "CS_INTERNAL_GROUP_JID não configurado";
