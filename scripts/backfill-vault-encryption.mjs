// Backfill: encripta senhas em plaintext que já estão no banco.
//
// Uso: node scripts/backfill-vault-encryption.mjs [--dry]
//
// Requer env:
//   - SUPABASE_INTERNAL_URL ou NEXT_PUBLIC_SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - VAULT_KEY (base64 de 32 bytes)
//
// Idempotente: valores já com prefixo v1: são pulados.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");
const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vaultKeyRaw = process.env.VAULT_KEY;

if (!url || !key) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}
if (!vaultKeyRaw) {
  console.error("VAULT_KEY env var missing. Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
  process.exit(1);
}

const vaultKey = Buffer.from(vaultKeyRaw, "base64");
if (vaultKey.length !== 32) {
  console.error(`VAULT_KEY deve ser 32 bytes em base64 (atual: ${vaultKey.length})`);
  process.exit(1);
}

function encrypt(plain) {
  if (!plain || plain.startsWith("v1:")) return null; // already encrypted or empty
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

const supabase = createClient(url, key);

const targets = [
  { table: "clients", idCol: "id", columns: ["facebook_password", "instagram_password", "google_ads_password"] },
  { table: "client_onboarding_submissions", idCol: "id", columns: ["meta_password", "instagram_password", "google_password"] },
];

let totalEncrypted = 0;
let totalSkipped = 0;

for (const { table, idCol, columns } of targets) {
  console.log(`\n=== ${table} ===`);
  const selectCols = [idCol, ...columns].join(",");
  const { data, error } = await supabase.from(table).select(selectCols);
  if (error) {
    console.error(`  skip ${table}: ${error.message}`);
    continue;
  }
  if (!data || data.length === 0) {
    console.log(`  0 rows`);
    continue;
  }

  for (const row of data) {
    const updates = {};
    for (const col of columns) {
      const v = row[col];
      if (!v) continue;
      if (typeof v !== "string") continue;
      if (v.startsWith("v1:")) { totalSkipped++; continue; }
      const encrypted = encrypt(v);
      if (encrypted) {
        updates[col] = encrypted;
        totalEncrypted++;
      }
    }
    if (Object.keys(updates).length === 0) continue;
    console.log(`  ${row[idCol]}: encriptando ${Object.keys(updates).join(", ")}`);
    if (!DRY) {
      const { error: upErr } = await supabase.from(table).update(updates).eq(idCol, row[idCol]);
      if (upErr) console.error(`    falhou: ${upErr.message}`);
    }
  }
}

console.log(`\n✓ Encriptados: ${totalEncrypted}`);
console.log(`  Skipped (já criptografados): ${totalSkipped}`);
if (DRY) console.log("  DRY RUN — nenhuma mudança persistida. Remova --dry pra aplicar.");
