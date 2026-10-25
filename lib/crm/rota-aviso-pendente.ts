// lib/crm/rota-aviso-pendente.ts — o aviso das lojas da Rota Lagos que NÃO chegou ao grupo de vendas
// fica guardado e sai na rodada seguinte. PURO (tests/crm-rota-funil.test.ts); a rota é
// app/api/system/crm-rota.
//
// POR QUE (25/10/2026, auditoria de erro recuperável, 14.5). As lojas novas eram criadas no funil, o aviso
// ao grupo falhava e a rota respondia ok:true (só olhava os erros de gravação). Na rodada seguinte as lojas
// já existiam — não eram "novas" — e o aviso nunca mais saía. Agora o que não saiu fica em
// agency_settings (CHAVE_AVISO_ROTA) e entra no próximo aviso; a rota só responde ok quando o aviso saiu.

import type { LojaVisitadaGrupo } from "./grupo-vendas";

export const CHAVE_AVISO_ROTA = "crm_rota_aviso_pendente";
/** Teto do que fica guardado: se o grupo ficar fora por dias, o aviso não vira um livro. */
export const MAX_PENDENTES = 50;

const chave = (l: LojaVisitadaGrupo) => `${(l.empresa || "").trim().toLowerCase()}|${(l.telefone || "").replace(/\D/g, "")}`;

/** O que estava pendente + o que é novo, sem repetir loja, mais antigas primeiro. */
export function juntarAvisos(pendentes: LojaVisitadaGrupo[], novas: LojaVisitadaGrupo[]): LojaVisitadaGrupo[] {
  const vistas = new Set<string>();
  const out: LojaVisitadaGrupo[] = [];
  for (const l of [...pendentes, ...novas]) {
    const k = chave(l);
    if (vistas.has(k)) continue;
    vistas.add(k);
    out.push(l);
  }
  return out.slice(-MAX_PENDENTES);
}

/** Lê o valor guardado (texto JSON em agency_settings.value). Valor estragado = nada pendente, com aviso no log. */
export function lerPendentes(valor: string | null | undefined): LojaVisitadaGrupo[] {
  if (!valor) return [];
  try {
    const v = JSON.parse(valor);
    return Array.isArray(v) ? v.filter((l) => l && typeof l.empresa === "string") as LojaVisitadaGrupo[] : [];
  } catch {
    console.warn("[crm-rota] aviso pendente ilegível — descartado");
    return [];
  }
}
