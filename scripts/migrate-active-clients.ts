/**
 * Migração focada: 32 clientes ATIVOS do Notion → Supabase.
 *
 * Combina dois CSVs:
 *   - small: lista de ativos (Nome, Tipo de Serviço, Valor, Vencimento) — define escopo
 *   - master: (EMP) Leads (rich data) — fornece email/endereço/telefone/credenciais
 *
 * Fluxo:
 *   1. Lê os 32 nomes do small CSV
 *   2. Pra cada nome, busca no master por match normalizado
 *   3. Extrai email das credenciais (FB/IG/Google) via regex
 *   4. UPSERT em `clients` (preserva edits manuais)
 *   5. UPSERT em `client_access` com senhas criptografadas (vault.ts)
 *   6. Tag `migrado-notion`
 *
 * Uso:
 *   npx tsx scripts/migrate-active-clients.ts [--dry-run]
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VAULT_KEY (base64 32 bytes — pra criptografar credenciais)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { encryptVault } from "../lib/crypto/vault";

// ─── env ─────────────────────────────────────────────────────
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
  console.error("[ERRO] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente em env");
  process.exit(1);
}
if (!env.VAULT_KEY) {
  console.error("[ERRO] VAULT_KEY ausente — necessária pra criptografar credenciais");
  process.exit(1);
}
process.env.VAULT_KEY = env.VAULT_KEY;

const dryRun = process.argv.includes("--dry-run");

const ACTIVE_CSV = resolve("CLientes lone midia/extracted/Particular e Compartilhado/Leads & Clientes/Sem título 322a4660f1df4f4d842bc9d187831255.csv");
const MASTER_CSV = resolve("CLientes lone midia/extracted/Particular e Compartilhado/Lone Mídia - Adm/Menu/Brain/(EMP) Leads 8bd2bc611b2e46f9b3b9f9ca5c990d71_all.csv");

console.log(`→ Supabase: ${SUPABASE_URL}`);
console.log(`→ Modo: ${dryRun ? "DRY-RUN (não escreve)" : "REAL (UPSERT)"}\n`);

// ─── CSV parser ──────────────────────────────────────────────
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
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
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

// ─── normalização de nomes pra match ─────────────────────────
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ─── helpers de parsing ──────────────────────────────────────
const EMAIL_RE = /[\w._-]+@[\w.-]+\.[\w]{2,}/;
const PHONE_RE = /\(?\d{2}\)?\s*9?\s*\d{4,5}\s*-?\s*\d{4}/;

function digitsOnly(s: string): string { return (s || "").replace(/\D/g, ""); }

function extractEmail(blob: string): string | null {
  if (!blob) return null;
  const m = blob.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

function extractPhone(blob: string): string | null {
  if (!blob) return null;
  const m = blob.match(PHONE_RE);
  return m ? m[0].replace(/\D/g, "") : null;
}

function parseBrlAmount(raw: string): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d,.]/g, "").trim();
  if (!digits) return null;
  let cleaned = digits;
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseNotionDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
  if (m) {
    const months: Record<string, string> = {
      janeiro: "01", fevereiro: "02", "março": "03", marco: "03", abril: "04",
      maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
      outubro: "10", novembro: "11", dezembro: "12",
    };
    const mm = months[m[2].toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function mapServiceType(raw: string): "lone_growth" | "assessoria_trafego" | "assessoria_social" | "assessoria_design" {
  const v = (raw || "").toLowerCase();
  if (v.includes("tráf") || v.includes("traf")) return "assessoria_trafego";
  if (v.includes("social") || v.includes("instag")) return "assessoria_social";
  if (v.includes("design")) return "assessoria_design";
  return "lone_growth";
}

/**
 * Parse credenciais de blob estilo Notion: "Login: x@y.com\nSenha: 123"
 * + variações (sem prefixo, com mailto:, com "Email:" etc).
 */
function parseCredentials(raw: string): { login: string | null; password: string | null } {
  if (!raw) return { login: null, password: null };
  const text = raw.replace(/\r/g, "").trim();

  // Procura por padrões "Login: X" e "Senha: Y"
  const loginMatch = text.match(/(?:login|email|usuario|user)\s*:?\s*(?:mailto:)?([^\s\n]+)/i);
  const passMatch = text.match(/(?:senha|password|pass)\s*:?\s*:?\s*([^\s\n]+)/i);

  let login = loginMatch ? loginMatch[1].trim() : null;
  let password = passMatch ? passMatch[1].trim() : null;

  // Fallback: se não achou "Login:", primeira linha que tem @ ou pelo menos 4 chars
  if (!login) {
    const firstLine = text.split("\n").find((l) => l.includes("@") || l.length > 5);
    if (firstLine && firstLine.includes("@")) {
      const em = firstLine.match(EMAIL_RE);
      login = em ? em[0] : null;
    }
  }

  // Sanity — se login ou senha é placeholder, descarta
  if (login && /^(login|email|senha|password|---|n.a)$/i.test(login)) login = null;
  if (password && /^(login|email|senha|password|---|n.a)$/i.test(password)) password = null;

  return { login, password };
}

// ─── main ────────────────────────────────────────────────────
async function main() {
  if (!existsSync(ACTIVE_CSV)) { console.error(`Arquivo ativos não encontrado: ${ACTIVE_CSV}`); process.exit(1); }
  if (!existsSync(MASTER_CSV)) { console.error(`Arquivo master não encontrado: ${MASTER_CSV}`); process.exit(1); }

  const actives = parseCsv(readFileSync(ACTIVE_CSV, "utf8"));
  const masters = parseCsv(readFileSync(MASTER_CSV, "utf8"));

  // Index do master por nome normalizado pra match O(1)
  const masterByName = new Map<string, Record<string, string>>();
  for (const m of masters) {
    const n = norm(m["Nome"]);
    if (n && !masterByName.has(n)) masterByName.set(n, m);
  }

  console.log(`→ ${actives.length} ativos · ${masters.length} no master\n`);

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  // Carrega clientes existentes pra dedupe
  const { data: existingClients, error: errFetch } = await supabase
    .from("clients").select("id, name, email, cnpj, cpf_cnpj");
  if (errFetch) { console.error("Falha ao listar clientes existentes:", errFetch.message); process.exit(1); }
  const existing = existingClients ?? [];
  const existingByName = new Map(existing.map((c) => [norm(c.name as string), c]));

  let inserted = 0, updated = 0, skipped = 0, failed = 0;
  let credsImported = 0;

  for (const active of actives) {
    const nome = (active["Nome"] || "").trim();
    if (!nome) { skipped++; continue; }

    const tipoServico = (active["Tipo de Serviço"] || "").trim();
    const valor = parseBrlAmount(active["Valor de contrato"] || "");
    const vencimento = parseNotionDate(active["Vencimento de contrato"] || "");
    const responsavel = (active["Responsável"] || "").trim();

    // Match no master
    const masterRow = masterByName.get(norm(nome));
    if (!masterRow) {
      console.log(`[WARN] ${nome} — sem match no master, importando só dados básicos`);
    }

    // Extrai email/telefone/endereço do master
    const masterBlob = masterRow ? Object.values(masterRow).join(" ") : "";
    const fbCreds = parseCredentials(masterRow?.["Facebook"] || "");
    const igCreds = parseCredentials(masterRow?.["Instagram"] || "");
    const ggCreds = parseCredentials(masterRow?.["Google"] || "");
    const credsBlob = `${masterRow?.["Facebook"] ?? ""} ${masterRow?.["Instagram"] ?? ""} ${masterRow?.["Google"] ?? ""}`;
    const email = extractEmail(masterRow?.["Email"] || "") || extractEmail(credsBlob);
    const phone = extractPhone(masterRow?.["Telefone da Empresa"] || "") || extractPhone(credsBlob);
    const endereco = (masterRow?.["Endereço"] || "").trim() || null;
    const cnpj = digitsOnly(masterRow?.["CNPJ"] || "");
    const cpf = digitsOnly(masterRow?.["CPF"] || "");

    // Procura cliente existente
    const existingClient = existingByName.get(norm(nome));

    const incoming = {
      name: nome,
      nome_fantasia: nome,
      cnpj: cnpj || null,
      cpf_cnpj: cnpj || cpf || null,
      email: email || null,
      email_corporativo: email || null,
      phone: phone || null,
      endereco: endereco,
      monthly_budget: valor || null,
      contract_end: vencimento,
      service_type: mapServiceType(tipoServico),
      status: "good",
      attention_level: "low",
      tags: ["migrado-notion"],
      assigned_traffic: responsavel || null,
      lead_source: "indicacao",
    };

    if (dryRun) {
      console.log(`[${existingClient ? "UPDATE" : "INSERT"}] ${nome}`);
      console.log(`  email: ${email || "—"} · phone: ${phone || "—"}`);
      console.log(`  serviço: ${tipoServico || "—"} → ${incoming.service_type} · valor: ${valor || "—"}`);
      if (fbCreds.login || igCreds.login || ggCreds.login) {
        console.log(`  creds: FB=${fbCreds.login ? "✓" : "·"} IG=${igCreds.login ? "✓" : "·"} GG=${ggCreds.login ? "✓" : "·"} (criptografadas)`);
        credsImported++;
      }
      console.log("");
      if (existingClient) updated++; else inserted++;
      continue;
    }

    // ─── REAL: UPSERT em clients ───
    let clientId: string;
    if (existingClient) {
      // UPDATE — só preenche campos null/vazios pra preservar edits manuais
      const updates: Record<string, unknown> = {};
      type ClientRow = typeof existingClient & Record<string, unknown>;
      const cur = existingClient as ClientRow;
      for (const [k, v] of Object.entries(incoming)) {
        if (v === null || v === undefined) continue;
        if (k === "tags") continue; // não sobrescreve tags
        const curVal = cur[k];
        if (curVal === null || curVal === undefined || curVal === "") updates[k] = v;
      }
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("clients").update(updates).eq("id", existingClient.id);
        if (error) { console.error(`[FAIL UPDATE] ${nome}: ${error.message}`); failed++; continue; }
      }
      clientId = existingClient.id as string;
      updated++;
    } else {
      const { data, error } = await supabase.from("clients").insert(incoming).select("id").single();
      if (error || !data) { console.error(`[FAIL INSERT] ${nome}: ${error?.message}`); failed++; continue; }
      clientId = data.id as string;
      inserted++;
    }

    // ─── UPSERT em client_access (credenciais ENCRIPTADAS) ───
    if (fbCreds.login || igCreds.login || ggCreds.login) {
      const accessRow: Record<string, unknown> = {
        client_id: clientId,
        updated_by: "notion-migration",
        updated_at: new Date().toISOString(),
      };
      if (fbCreds.login) accessRow.facebook_login = fbCreds.login;
      if (fbCreds.password) accessRow.facebook_password = encryptVault(fbCreds.password);
      if (igCreds.login) accessRow.instagram_login = igCreds.login;
      if (igCreds.password) accessRow.instagram_password = encryptVault(igCreds.password);
      // google_ads_* mora em clients (não em client_access)

      const { error: accessErr } = await supabase
        .from("client_access")
        .upsert(accessRow, { onConflict: "client_id" });
      if (accessErr) {
        console.error(`[WARN access] ${nome}: ${accessErr.message}`);
      } else {
        credsImported++;
      }
    }

    // Google Ads vai pro clients table
    if (ggCreds.login) {
      const ggUpdates: Record<string, unknown> = {};
      ggUpdates.google_ads_login = ggCreds.login;
      if (ggCreds.password) ggUpdates.google_ads_password = encryptVault(ggCreds.password);
      const { error: ggErr } = await supabase.from("clients").update(ggUpdates).eq("id", clientId);
      if (ggErr) console.error(`[WARN google_ads] ${nome}: ${ggErr.message}`);
    }

    console.log(`[OK ${existingClient ? "UPD" : "NEW"}] ${nome}`);
  }

  console.log("\n═══ RESUMO ═══");
  console.log(`  Inseridos:        ${inserted}`);
  console.log(`  Atualizados:      ${updated}`);
  console.log(`  Pulados:          ${skipped}`);
  console.log(`  Falhas:           ${failed}`);
  console.log(`  Creds importadas: ${credsImported}`);
  console.log(dryRun ? "\n  → DRY-RUN: nada foi escrito." : "\n  → Migração concluída.");
}

main().catch((e) => { console.error("ERRO FATAL:", e); process.exit(1); });
