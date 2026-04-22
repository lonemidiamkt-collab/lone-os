/**
 * One-off migration: import historical clients from Notion export CSV into Supabase.
 *
 * Usage:
 *   npx tsx scripts/migrate-notion-clients.ts [--dry-run] [--csv=<path>]
 *
 * Behavior (UPSERT mode):
 *   - If client exists (match by CNPJ or email): UPDATE only the DB fields that are currently empty/null.
 *     This preserves manual edits and fills gaps from previous partial migrations.
 *   - If not found: INSERT new row.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * To target production, override with:
 *   NEXT_PUBLIC_SUPABASE_URL=https://painel.lonemidia.com/supabase SUPABASE_SERVICE_ROLE_KEY=... npx tsx ...
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── env loader (no dotenv dep) ──────────────────────────────
function loadEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[k] = v;
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

// ─── args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvArg = args.find((a) => a.startsWith("--csv="));
const onlyStatusArg = args.find((a) => a.startsWith("--only-status="));
const onlyStatus = onlyStatusArg ? onlyStatusArg.slice("--only-status=".length) : null;
const DEFAULT_CSV = "CLientes lone midia/extracted/Particular e Compartilhado/Lone Mídia - Adm/Menu/Brain/(EMP) Leads 8bd2bc611b2e46f9b3b9f9ca5c990d71_all.csv";
const csvPath = resolve(csvArg ? csvArg.slice(6) : DEFAULT_CSV);

if (!existsSync(csvPath)) {
  console.error(`[ERRO] CSV nao encontrado: ${csvPath}`);
  process.exit(1);
}

console.log(`→ Supabase: ${SUPABASE_URL}`);
console.log(`→ CSV: ${csvPath}`);
console.log(`→ Modo: ${dryRun ? "DRY-RUN" : "REAL"} (UPSERT: preenche campos vazios em clientes existentes, cria novos)\n`);

// ─── CSV parser (handles quoted multi-line fields) ───────────
function parseCsv(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
}

// ─── helpers ─────────────────────────────────────────────────
const digitsOnly = (s: string) => (s || "").replace(/\D/g, "");
const cleanEmail = (s: string) => (s || "").trim().toLowerCase();

function mapStatus(raw: string): "onboarding" | "good" | "average" | "at_risk" {
  const v = (raw || "").trim().toLowerCase();
  if (!v) return "good";
  if (v.includes("ativ") || v.includes("finaliz")) return "good";
  if (v.includes("cadastr") || v.includes("negocia")) return "onboarding";
  if (v.includes("paus")) return "at_risk";
  return "good";
}

function mapServiceType(raw: string): "lone_growth" | "assessoria_trafego" | "assessoria_social" | "assessoria_design" {
  const v = (raw || "").toLowerCase();
  if (v.includes("tráf") || v.includes("traf")) return "assessoria_trafego";
  if (v.includes("social") || v.includes("instag")) return "assessoria_social";
  if (v.includes("design")) return "assessoria_design";
  return "lone_growth";
}

function mapPaymentMethod(raw: string): "pix" | "boleto" | "cartao" | "transferencia" | null {
  const v = (raw || "").toLowerCase();
  if (v.includes("pix")) return "pix";
  if (v.includes("boleto")) return "boleto";
  if (v.includes("cart")) return "cartao";
  if (v.includes("transf")) return "transferencia";
  return null;
}

function mapLeadSource(raw: string): "indicacao" | "trafego" | "organico" | "outros" | null {
  const v = (raw || "").toLowerCase();
  if (!v) return null;
  if (v.includes("indica")) return "indicacao";
  if (v.includes("tráf") || v.includes("traf") || v.includes("ads") || v.includes("anunc")) return "trafego";
  if (v.includes("orgânic") || v.includes("organic") || v.includes("google")) return "organico";
  return "outros";
}

function parseNotionDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
  if (m) {
    const monthsPt: Record<string, string> = {
      janeiro: "01", fevereiro: "02", "março": "03", marco: "03", abril: "04", maio: "05", junho: "06",
      julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
    };
    const mm = monthsPt[m[2].toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  }
  // Try DD/MM/YYYY
  const d = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (d) return `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  return null;
}

function parseBrlAmount(raw: string): number | null {
  if (!raw) return null;
  // Handles "R$ 2.500,00", "3000", "3.000", "2500,50"
  const digits = raw.replace(/[^\d,.]/g, "").trim();
  if (!digits) return null;
  // If has comma and dots: dots are thousands, comma is decimal
  // If only dots: might be thousand separator if 3 digits after last dot
  let cleaned = digits;
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function extractInstagram(raw: string): string | null {
  if (!raw) return null;
  const handleMatch = raw.match(/@([A-Za-z0-9._]+)/);
  if (handleMatch) return handleMatch[1];
  const urlMatch = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (urlMatch) return urlMatch[1];
  // Fallback: first line after "Login:" might be the handle if no @ or URL
  const loginMatch = raw.match(/login:\s*([A-Za-z0-9._@]+)/i);
  if (loginMatch && !loginMatch[1].includes("@")) return loginMatch[1];
  return null;
}

/**
 * Parses Notion-format credential blobs. Handles variations:
 *   "Login: mailto:user@x.com \n Senha: : 123"    → standard
 *   "mailto:user@x.com \n 123"                     → no prefixes (line 1 = login, line 2 = pass)
 *   "Email: x@y.com \n Senha : abc"                → "Email" instead of "Login", "Senha " with space
 *   "acesso Facebook: 22999...\nSenha facebook: X" → custom prefixes
 *   "Está vinculado ao do erick"                   → not a credential (returns nulls)
 */
function parseCredentials(raw: string): { login: string | null; password: string | null } {
  if (!raw) return { login: null, password: null };
  const normalized = raw.replace(/\r/g, "").trim();

  // Split into non-empty lines
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { login: null, password: null };

  const stripPrefix = (s: string): string => {
    // Remove any leading label like "Login:", "Email -", "acesso Facebook:", "Senha facebook:".
    // Runs iteratively so "Senha : : 146275" → "146275".
    let out = s.trim();
    const labelRe = /^(?:acesso\s+\w+|login(?:\s+\w+)?|email|e-mail|usuario|user|senha(?:\s+\w+)?|password|pass|instagram|facebook|google)\s*[:\-–]\s*/i;
    for (let i = 0; i < 3; i++) {
      const next = out.replace(labelRe, "").replace(/^mailto:/i, "").replace(/^[:\-–]\s*/, "").trim();
      if (next === out) break;
      out = next;
    }
    return out;
  };

  // Look for explicit "senha"/"pass" label in any line
  const senhaLineIdx = lines.findIndex((l) => /^\s*(?:senha|password|pass)\s*[:\-–]/i.test(l));
  // Look for explicit "login"/"email"/"user" label in any line (excluding the senha line)
  const loginLineIdx = lines.findIndex((l, i) =>
    i !== senhaLineIdx && /^\s*(?:login|email|e-mail|usuario|user|acesso\s+\w+|instagram|facebook|google)\s*[:\-–]/i.test(l)
  );

  let login: string | null = null;
  let password: string | null = null;

  if (loginLineIdx >= 0) login = stripPrefix(lines[loginLineIdx]);
  if (senhaLineIdx >= 0) password = stripPrefix(lines[senhaLineIdx]);

  // Fallback: no labels → first non-empty line is login, next non-empty line is password
  if (!login && lines.length >= 1) login = stripPrefix(lines[0]);
  if (!password && lines.length >= 2) {
    // Use the first line AFTER the login that isn't the login itself
    for (let i = 1; i < lines.length; i++) {
      if (i === loginLineIdx) continue;
      const p = stripPrefix(lines[i]);
      if (p && p !== login) { password = p; break; }
    }
  }

  // Reject if what we parsed is clearly a free-text note (e.g., "Está vinculado ao")
  const looksLikeNote = (s: string | null) => {
    if (!s) return false;
    if (s.length > 80) return true; // credentials are usually short
    if (/\s(ao|ao\s+do|com|de|em|que|para|sobre)\s/.test(s.toLowerCase())) return true;
    return false;
  };
  if (looksLikeNote(login)) login = null;
  if (looksLikeNote(password)) password = null;

  return { login, password };
}

function firstUrl(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/https?:\/\/[^\s,)]+/);
  return m ? m[0] : null;
}

// Field names on the `clients` table that we consider fillable.
type Fillable = Record<string, unknown>;

// Only write a field if DB has it empty/null.
// Returns the subset of `incoming` that should be UPDATEd.
function diffForFill(incoming: Fillable, dbRow: Record<string, unknown>): Fillable {
  const out: Fillable = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined || v === "") continue;
    const cur = dbRow[k];
    const isEmpty = cur === null || cur === undefined || cur === "" ||
      (Array.isArray(cur) && cur.length === 0) ||
      (typeof cur === "number" && cur === 0 && k === "monthly_budget"); // 0 budget counts as empty
    if (isEmpty) out[k] = v;
  }
  return out;
}

// ─── main ────────────────────────────────────────────────────
async function main() {
  const csvText = readFileSync(csvPath, "utf8");
  const rows = parseCsv(csvText);
  console.log(`→ ${rows.length} linhas encontradas no CSV\n`);

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let unchanged = 0;

  const seenCnpjs = new Set<string>();
  const seenEmails = new Set<string>();
  const PLACEHOLDER_NAMES = new Set(["nome do lead", "sem nome", "lead", "cliente"]);

  for (const row of rows) {
    const name = (row["Nome"] || "").trim();
    if (!name) { skipped++; continue; }
    if (PLACEHOLDER_NAMES.has(name.toLowerCase())) {
      console.log(`[SKIP] ${name} — placeholder`);
      skipped++;
      continue;
    }
    if (onlyStatus && (row["Status"] || "").trim() !== onlyStatus) {
      skipped++;
      continue;
    }

    const cnpj = digitsOnly(row["Cnpj"] || "");
    const cpf = digitsOnly(row["CPF"] || "");
    const email = cleanEmail(row["E-mail"] || "");
    const phone = digitsOnly(row["Telefone da Empresa"] || "");
    const statusRaw = row["Status"] || "";
    const razaoSocial = (row["Razão Social"] || "").trim();
    const endereco = (row["Endereço"] || "").trim();
    const responsavel = (row["Responsável"] || "").trim();
    const comoConheceu = (row["Como conheceu?"] || "").trim();
    const tipoServico = (row["Tipo de Serviço"] || "").trim();
    const site = (row["Site"] || "").trim();
    const linktree = (row["Linktree"] || "").trim();

    const fbCreds = parseCredentials(row["Facebook"] || "");
    const igCreds = parseCredentials(row["Instagram"] || "");
    const ggCreds = parseCredentials(row["Google"] || "");
    const instagramHandle = extractInstagram(row["Instagram"] || "");

    const driveLink = firstUrl(row["Pasta drive"] || "");
    const monthlyBudget = parseBrlAmount(row["Valor de contrato"] || "");
    const adInvestment = parseBrlAmount(row["Investimento em Anúncio"] || "");
    const contractEnd = parseNotionDate(row["Vencimento do contrato"] || row["Vencimento de contrato"] || "");
    const paymentMethod = mapPaymentMethod(row["Pagamento dos anúncios"] || "");
    const leadSource = mapLeadSource(comoConheceu);
    const joinDate = parseNotionDate(row["Created time"] || "");

    const notesExtra = [
      responsavel ? `Responsavel Lone: ${responsavel}` : "",
      site ? `Site: ${site}` : "",
      linktree ? `Linktree: ${linktree.split("\n")[0]}` : "",
      adInvestment && !monthlyBudget ? `Investimento mensal em ads: R$ ${adInvestment}` : "",
      row["Data de pagamento (Pré pago)"] ? `Data pagamento pré-pago: dia ${row["Data de pagamento (Pré pago)"].trim()}` : "",
      row["Data de pagamento (pós pago)"] ? `Data pagamento pós-pago: dia ${row["Data de pagamento (pós pago)"].trim()}` : "",
    ].filter(Boolean).join(" | ");

    // Build the full payload with every extractable field
    const incoming: Fillable = {
      name,
      nome_fantasia: name,
      razao_social: razaoSocial || null,
      cnpj: cnpj || null,
      cpf_cnpj: cnpj || cpf || null,
      email: email || null,
      email_corporativo: email || null,
      phone: phone || null,
      endereco: endereco || null,
      instagram_user: instagramHandle,
      facebook_login: fbCreds.login,
      facebook_password: fbCreds.password,
      instagram_login: igCreds.login,
      instagram_password: igCreds.password,
      google_ads_login: ggCreds.login,
      google_ads_password: ggCreds.password,
      drive_link: driveLink,
      monthly_budget: monthlyBudget,
      contract_end: contractEnd,
      payment_method: paymentMethod,
      lead_source: leadSource,
      status: mapStatus(statusRaw),
      service_type: mapServiceType(tipoServico),
      industry: tipoServico || "Outro",
      join_date: joinDate,
      notes: notesExtra || null,
    };

    // Clean out null/empty entries from incoming
    for (const k of Object.keys(incoming)) {
      const v = incoming[k];
      if (v === null || v === undefined || v === "") delete incoming[k];
    }

    // ── Look up existing client: CNPJ > email > name (last resort for rows with neither) ──
    let existing: Record<string, unknown> | null = null;
    if (cnpj) {
      const { data } = await supabase.from("clients").select("*").eq("cnpj", cnpj).limit(1);
      if (data && data.length > 0) existing = data[0] as Record<string, unknown>;
    }
    if (!existing && email) {
      const { data } = await supabase.from("clients").select("*").eq("email", email).limit(1);
      if (data && data.length > 0) existing = data[0] as Record<string, unknown>;
    }
    if (!existing && !cnpj && !email) {
      // Fallback: match by exact name for rows missing both identifiers
      // (prevents duplicate inserts on repeated runs)
      const { data } = await supabase.from("clients").select("*").eq("name", name).contains("tags", ["migrado-notion"]).limit(1);
      if (data && data.length > 0) existing = data[0] as Record<string, unknown>;
    }

    // ── In-run dedup to avoid re-processing same CNPJ/email twice ──
    if (cnpj && seenCnpjs.has(cnpj) && !existing) {
      console.log(`[SKIP] ${name} — CNPJ ${cnpj} repetido no CSV`);
      skipped++;
      continue;
    }
    if (!cnpj && email && seenEmails.has(email) && !existing) {
      console.log(`[SKIP] ${name} — E-mail ${email} repetido no CSV`);
      skipped++;
      continue;
    }
    if (cnpj) seenCnpjs.add(cnpj);
    if (email) seenEmails.add(email);

    if (existing) {
      // UPDATE only empty fields
      const toUpdate = diffForFill(incoming, existing);
      if (Object.keys(toUpdate).length === 0) {
        console.log(`[SAME] ${name} — nada a atualizar (DB ja completo)`);
        unchanged++;
        continue;
      }

      const updatedKeys = Object.keys(toUpdate).join(", ");

      if (dryRun) {
        console.log(`[DRY UPDATE] ${name} → ${updatedKeys}`);
        updated++;
        continue;
      }

      const { error } = await supabase.from("clients").update(toUpdate).eq("id", existing.id as string);
      if (error) {
        console.error(`[FAIL UPDATE] ${name} — ${error.message}`);
        failed++;
      } else {
        console.log(`[UPDATE] ${name} → ${updatedKeys}`);
        updated++;
      }
    } else {
      // INSERT with full payload (plus required defaults if not set)
      const insertPayload = {
        ...incoming,
        attention_level: "medium" as const,
        monthly_budget: incoming.monthly_budget ?? 0,
        payment_method: incoming.payment_method ?? "pix",
        join_date: incoming.join_date ?? new Date().toISOString().slice(0, 10),
        tags: ["migrado-notion"],
      };

      if (dryRun) {
        console.log(`[DRY INSERT] ${name} → status=${incoming.status}, campos=${Object.keys(incoming).length}`);
        inserted++;
        continue;
      }

      const { error } = await supabase.from("clients").insert(insertPayload);
      if (error) {
        console.error(`[FAIL INSERT] ${name} — ${error.message}`);
        failed++;
      } else {
        console.log(`[OK] Cliente ${name} importado com sucesso`);
        inserted++;
      }
    }
  }

  console.log("\n─────────────────────────────────────────");
  console.log(`Inseridos   : ${inserted}`);
  console.log(`Atualizados : ${updated}`);
  console.log(`Inalterados : ${unchanged}`);
  console.log(`Ignorados   : ${skipped}`);
  console.log(`Falhas      : ${failed}`);
  console.log("─────────────────────────────────────────");
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
