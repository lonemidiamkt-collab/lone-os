// lib/cs/bom-dia.ts — o "bom dia" diário da Lone no grupo interno: um raio-x rápido do dia pro
// time começar sabendo o que fazer. Determinístico (sem IA → zero custo, roda todo dia útil).
// Voz da Lone via template. Fonte de dados: montarSnapshotCS().

import type { SnapshotCS } from "@/lib/cs/snapshot";
import { linhaDataBomDia } from "@/lib/cs/datas";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function buildBomDiaDigest(snap: SnapshotCS, now: Date): string {
  const data = `${DIAS[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const linhaData = linhaDataBomDia(now); // data comemorativa hoje/amanhã ("" se não tem)
  const temAlgo = snap.pendentes.length || snap.emProducao || snap.aguardandoAprovacao || snap.prontasPraPostar.length || snap.atrasados.length || snap.encalhados || snap.esfriando.length || snap.semPostsSemana.length;

  if (!temAlgo) {
    return `☀️ *Bom dia, time!* (${data})\n\nDia limpo por aqui — nada pendente, nada atrasado, ninguém sumido.${linhaData ? `\n\n${linhaData}` : ""} Bora fazer acontecer! 💪`;
  }

  const l: string[] = [`☀️ *Bom dia, time!* (${data})`, ``, `Como tá o dia:`];

  if (snap.pendentes.length) {
    const nomes = [...new Set(snap.pendentes.map((p) => p.cliente))].slice(0, 5).join(", ");
    l.push(`📋 *${snap.pendentes.length}* esperando seu ok/não — ${nomes}${snap.pendentes.length > 5 ? "…" : ""}`);
  }
  if (snap.emProducao || snap.aguardandoAprovacao) {
    l.push(`🎨 *${snap.emProducao}* em produção · *${snap.aguardandoAprovacao}* aguardando aprovação`);
  }
  if (snap.prontasPraPostar.length) {
    // O designer já entregou — o gargalo é o social confirmar/postar. Cutuca com nome e dias.
    const top = snap.prontasPraPostar.slice(0, 4).map((p) => `${p.cliente}${p.responsavel ? ` (${p.responsavel}, ${p.dias}d)` : ` (${p.dias}d)`}`).join(", ");
    l.push(`✅ *${snap.prontasPraPostar.length}* arte(s) PRONTA(S) do designer só esperando vocês postarem — ${top}${snap.prontasPraPostar.length > 4 ? "…" : ""} — é confirmar e subir!`);
  }
  if (snap.atrasados.length) {
    // Separa por CULPA real: prazo vencido aguardando o DESIGNER (falta a arte) vs prazo vencido
    // mas a ARTE JÁ ESTÁ PRONTA (falta só o social postar). Não jogar tudo como "atraso" — o designer
    // reclamou (com razão) que era cobrado por card que ele já entregou; o gargalo ali é a postagem.
    const semArte = snap.atrasados.filter((a) => !a.designerEntregou);
    const comArte = snap.atrasados.filter((a) => a.designerEntregou);
    if (semArte.length) {
      const top = semArte.slice(0, 3).map((a) => `${a.cliente} (${a.dias}d)`).join(", ");
      l.push(`⏰ *${semArte.length}* com prazo vencido esperando a ARTE (designer) — ${top}${semArte.length > 3 ? "…" : ""}`);
    }
    if (comArte.length) {
      const top = comArte.slice(0, 3).map((a) => `${a.cliente} (${a.dias}d)`).join(", ");
      l.push(`📮 *${comArte.length}* vencida(s) mas com ARTE JÁ PRONTA — falta só o social postar (${top}${comArte.length > 3 ? "…" : ""}) — não é atraso do designer`);
    }
  }
  if (snap.encalhados) {
    l.push(`🧹 *${snap.encalhados}* cards encalhados (parados há +30d) — vale arquivar ou fechar pra limpar o board`);
  }
  if (snap.esfriando.length) {
    const top = snap.esfriando.slice(0, 3).map((e) => `${e.cliente} (${e.dias}d)`).join(", ");
    l.push(`👀 *${snap.esfriando.length}* esfriando (sumiram do grupo) — ${top}${snap.esfriando.length > 3 ? "…" : ""} — que tal um "oi"?`);
  }
  if (snap.semPostsSemana.length) {
    const top = snap.semPostsSemana.slice(0, 5).map((c) => c.nome).join(", ");
    l.push(`📭 *${snap.semPostsSemana.length}* sem nenhum post planejado ${snap.semPostsLabel} — ${top}${snap.semPostsSemana.length > 5 ? "…" : ""} — ninguém fica pra trás!`);
  }
  if (linhaData) l.push(linhaData);

  const fecho = snap.atrasados.length
    ? `\nComeça pelos atrasados que a gente fecha o dia tranquilo. Tamo junto! 🤝`
    : `\nTá tudo caminhando bem — bora manter o ritmo! 🚀`;
  l.push(fecho);
  return l.join("\n");
}
