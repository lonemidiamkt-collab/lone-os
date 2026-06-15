// lib/whatsapp/group-match.ts — sugestão de match cliente ↔ grupo WhatsApp.
// PURO/testável. Só SUGERE — a confirmação é sempre humana (risco de grupo errado).

export interface GroupOption { id: string; subject: string }

export interface MatchSuggestion {
  groupId: string | null;
  groupName: string | null;
  score: number;
  confidence: "high" | "medium" | "low" | "none";
}

// Palavras genéricas que não ajudam a distinguir clientes.
const STOP = new Set(["marketing", "lone", "midia", "lm", "x", "e", "da", "de", "do", "das", "dos"]);

/** Normaliza para tokens significativos (sem acento, sem stopwords, len > 2). */
export function normTokens(s: string): Set<string> {
  const cleaned = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ");
  return new Set(cleaned.split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)));
}

/** Melhor grupo para um cliente + nível de confiança (high só com folga clara). */
export function matchGroupForClient(clientName: string, groups: GroupOption[]): MatchSuggestion {
  const cn = normTokens(clientName);
  let best = { score: 0, inter: 0, g: null as GroupOption | null };
  let secondScore = 0;

  for (const g of groups) {
    const gn = normTokens(g.subject);
    if (cn.size === 0 || gn.size === 0) continue;
    let inter = 0;
    for (const t of cn) if (gn.has(t)) inter++;
    const union = new Set([...cn, ...gn]).size;
    const jac = union ? inter / union : 0;
    const contain = ([...cn].every((t) => gn.has(t)) || [...gn].every((t) => cn.has(t))) ? 1 : 0;
    const score = jac + contain;
    if (score > best.score) { secondScore = best.score; best = { score, inter, g }; }
    else if (score > secondScore) { secondScore = score; }
  }

  let confidence: MatchSuggestion["confidence"];
  if (best.score >= 1.0 && best.score - secondScore >= 0.3) confidence = "high";
  else if (best.inter >= 2) confidence = "medium";
  else if (best.inter >= 1) confidence = "low";
  else confidence = "none";

  return {
    groupId: best.g?.id ?? null,
    groupName: best.g?.subject ?? null,
    score: Number(best.score.toFixed(2)),
    confidence,
  };
}
