// lib/cs/bom-dia.ts — o "bom dia" diário da Lone no grupo interno: um raio-x rápido do dia pro
// time começar sabendo o que fazer. Determinístico (sem IA → zero custo, roda todo dia útil).
// Voz da Lone via template. Fonte de dados: montarSnapshotCS().

import type { SnapshotCS } from "@/lib/cs/snapshot";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function buildBomDiaDigest(snap: SnapshotCS, now: Date): string {
  const data = `${DIAS[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const temAlgo = snap.pendentes.length || snap.emProducao || snap.aguardandoAprovacao || snap.atrasados.length || snap.esfriando.length;

  if (!temAlgo) {
    return `☀️ *Bom dia, time!* (${data})\n\nDia limpo por aqui — nada pendente, nada atrasado, ninguém sumido. Bora fazer acontecer! 💪`;
  }

  const l: string[] = [`☀️ *Bom dia, time!* (${data})`, ``, `Como tá o dia:`];

  if (snap.pendentes.length) {
    const nomes = [...new Set(snap.pendentes.map((p) => p.cliente))].slice(0, 5).join(", ");
    l.push(`📋 *${snap.pendentes.length}* esperando seu ok/não — ${nomes}${snap.pendentes.length > 5 ? "…" : ""}`);
  }
  if (snap.emProducao || snap.aguardandoAprovacao) {
    l.push(`🎨 *${snap.emProducao}* em produção · *${snap.aguardandoAprovacao}* aguardando aprovação`);
  }
  if (snap.atrasados.length) {
    const top = snap.atrasados.slice(0, 3).map((a) => `${a.cliente} (${a.dias}d)`).join(", ");
    l.push(`⏰ *${snap.atrasados.length}* com prazo vencido — ${top}${snap.atrasados.length > 3 ? "…" : ""} — vale priorizar hoje`);
  }
  if (snap.esfriando.length) {
    const top = snap.esfriando.slice(0, 3).map((e) => `${e.cliente} (${e.dias}d)`).join(", ");
    l.push(`👀 *${snap.esfriando.length}* esfriando (sumiram do grupo) — ${top}${snap.esfriando.length > 3 ? "…" : ""} — que tal um "oi"?`);
  }

  const fecho = snap.atrasados.length
    ? `\nComeça pelos atrasados que a gente fecha o dia tranquilo. Tamo junto! 🤝`
    : `\nstá tudo caminhando bem — bora manter o ritmo! 🚀`;
  l.push(fecho);
  return l.join("\n");
}
