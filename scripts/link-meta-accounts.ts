/**
 * One-off: link Meta ad accounts to clients by name matching.
 *
 * Usage:
 *   npx tsx scripts/link-meta-accounts.ts [--dry-run] [--min-score=0.6]
 *
 * Flow:
 *   1. Read Meta long-lived token from agency_settings
 *   2. Fetch all ad accounts via /me/adaccounts
 *   3. For each client (not already linked), find best matching ad account by name
 *   4. If score >= threshold: UPDATE client with meta_ad_account_id + meta_ad_account_name
 *   5. Print summary with matched / ambiguous / unmatched
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(resolve(".env.local")), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[ERRO] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const minScoreArg = args.find((a) => a.startsWith("--min-score="));
const MIN_SCORE = minScoreArg ? parseFloat(minScoreArg.slice("--min-score=".length)) : 0.55;

console.log(`→ Supabase: ${SUPABASE_URL}`);
console.log(`→ Modo: ${dryRun ? "DRY-RUN" : "REAL"}`);
console.log(`→ Score mínimo: ${MIN_SCORE}\n`);

// ─── Name normalization ──────────────────────────────────────
// Strips accents, lowercase, agency prefixes (LM - / ST -), business stopwords.
const STOPWORDS = new Set([
  "ltda", "me", "eireli", "sa", "s.a", "s/a", "cia", "&", "e",
  "do", "da", "de", "dos", "das", "e", "a", "o", "os", "as", "em",
  "lone", "growth", "ads", "anuncios", "anuncio", "clientes",
  "lm", "st", // agency prefixes on Meta ad account names
]);

function normalizeToTokens(s: string): string[] {
  if (!s) return [];
  // Remove leading agency prefixes like "LM - " or "ST - " early
  const withoutPrefix = s.replace(/^(LM|ST|Lone|LONE)\s*[-–—:]\s*/i, "");
  const ascii = withoutPrefix.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const cleaned = ascii.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// Levenshtein distance for fuzzy token matching (handles typos like "acabamentos" vs "acabementos")
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) m[i][0] = i;
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}

// Tokens are "similar enough" if identical OR Levenshtein distance ≤ 20% of length (typos)
function tokenSim(a: string, b: string): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 4) return false; // too short for fuzzy
  return levenshtein(a, b) <= Math.max(1, Math.floor(maxLen * 0.2));
}

// Enhanced score: token-wise fuzzy Jaccard + substring bonus + string-level Levenshtein fallback
function score(a: string, b: string): number {
  const ta = normalizeToTokens(a);
  const tb = normalizeToTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  // Fuzzy token intersection (tokens don't need exact match — typo-tolerant)
  let fuzzyIntersect = 0;
  const usedB = new Set<number>();
  for (const t of ta) {
    for (let j = 0; j < tb.length; j++) {
      if (usedB.has(j)) continue;
      if (tokenSim(t, tb[j])) { fuzzyIntersect++; usedB.add(j); break; }
    }
  }
  const union = ta.length + tb.length - fuzzyIntersect;
  const jaccard = union > 0 ? fuzzyIntersect / union : 0;

  // Substring bonus
  const na = ta.join(" ");
  const nb = tb.join(" ");
  const substringBonus = (na.includes(nb) || nb.includes(na)) ? 0.25 : 0;

  // String-level Levenshtein fallback for single-token comparisons or short strings
  const maxLen = Math.max(na.length, nb.length);
  const levSim = maxLen > 0 ? 1 - (levenshtein(na, nb) / maxLen) : 0;

  return Math.min(1, Math.max(jaccard + substringBonus, levSim * 0.9));
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  // 1. Fetch Meta token
  const { data: tokenRows } = await supabase.from("agency_settings").select("key, value").in("key", ["meta_token", "meta_token_expires_at"]);
  const tokenMap = new Map((tokenRows || []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const token = tokenMap.get("meta_token");
  if (!token) {
    console.error("[ERRO] meta_token não encontrado em agency_settings. Conecte Meta via /integrations primeiro.");
    process.exit(1);
  }
  const expiresAt = tokenMap.get("meta_token_expires_at");
  if (expiresAt && parseInt(expiresAt, 10) < Date.now()) {
    console.error("[ERRO] meta_token expirado. Reconecte via /integrations.");
    process.exit(1);
  }
  console.log(`→ Meta token OK (expira em ${expiresAt ? new Date(parseInt(expiresAt, 10)).toISOString().slice(0, 10) : "sem validade"})`);

  // 2. Fetch ad accounts
  interface AdAccount { id: string; name: string; account_id: string; account_status: number }
  const adAccounts: AdAccount[] = [];
  let next: string | null = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_id,account_status&limit=100&access_token=${token}`;
  while (next) {
    const r: Response = await fetch(next);
    if (!r.ok) {
      const err = await r.text();
      console.error(`[ERRO] Meta API: ${err}`);
      process.exit(1);
    }
    const data: { data: AdAccount[]; paging?: { next?: string } } = await r.json();
    adAccounts.push(...data.data);
    next = data.paging?.next ?? null;
  }
  console.log(`→ ${adAccounts.length} ad accounts acessíveis via Meta API\n`);

  // 3. Fetch clients not yet linked
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, nome_fantasia, meta_ad_account_id")
    .order("name");
  if (!clients) {
    console.error("[ERRO] Falha ao carregar clientes");
    process.exit(1);
  }

  let linked = 0;
  let skipped = 0;
  let unmatched: string[] = [];
  let ambiguous: string[] = [];

  for (const c of clients as { id: string; name: string; nome_fantasia: string | null; meta_ad_account_id: string | null }[]) {
    const clientName = c.nome_fantasia || c.name;

    if (c.meta_ad_account_id) {
      console.log(`[SKIP] ${clientName} — ja vinculado (${c.meta_ad_account_id})`);
      skipped++;
      continue;
    }

    // Score all ad accounts, pick best
    const scored = adAccounts
      .map((a) => ({ account: a, s: score(clientName, a.name) }))
      .sort((x, y) => y.s - x.s);

    const best = scored[0];
    const second = scored[1];

    if (!best || best.s < MIN_SCORE) {
      const top3 = scored.slice(0, 3).map((x) => `"${x.account.name}" (${x.s.toFixed(2)})`).join(", ");
      console.log(`[NO MATCH] ${clientName} — top3: ${top3}`);
      unmatched.push(clientName);
      continue;
    }

    // Ambiguity: flag only when best isn't near-perfect AND second is very close AND they're actually different accounts
    const isDuplicate = second && best.account.id === second.account.id;
    const isSameName = second && best.account.name.trim().toLowerCase() === second.account.name.trim().toLowerCase();
    if (best.s < 0.95 && second && best.s - second.s < 0.05 && !isDuplicate && !isSameName) {
      console.log(`[AMBIGUOUS] ${clientName} — top2: "${best.account.name}" (${best.s.toFixed(2)}) vs "${second.account.name}" (${second.s.toFixed(2)})`);
      ambiguous.push(clientName);
      continue;
    }

    if (dryRun) {
      console.log(`[DRY] ${clientName} → "${best.account.name}" (${best.account.id}) score=${best.s.toFixed(2)}`);
      linked++;
      continue;
    }

    const { error } = await supabase.from("clients").update({
      meta_ad_account_id: best.account.id,
      meta_ad_account_name: best.account.name,
    }).eq("id", c.id);

    if (error) {
      console.error(`[FAIL] ${clientName} — ${error.message}`);
    } else {
      console.log(`[LINK] ${clientName} → "${best.account.name}" (${best.account.id}) score=${best.s.toFixed(2)}`);
      linked++;
    }
  }

  console.log("\n─────────────────────────────────────────");
  console.log(`Vinculados  : ${linked}`);
  console.log(`Já existiam : ${skipped}`);
  console.log(`Sem match   : ${unmatched.length}`);
  console.log(`Ambíguos    : ${ambiguous.length}`);
  console.log("─────────────────────────────────────────");
  if (unmatched.length > 0) {
    console.log(`\nSem match (revise manualmente):`);
    unmatched.forEach((n) => console.log(`  - ${n}`));
  }
  if (ambiguous.length > 0) {
    console.log(`\nAmbíguos (escolha manual no painel):`);
    ambiguous.forEach((n) => console.log(`  - ${n}`));
  }
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
