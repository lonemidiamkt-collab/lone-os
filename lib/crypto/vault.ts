// Crypto helper pra dados sensíveis (senhas de Meta/Google/Instagram dos clientes).
//
// Contexto LGPD: antes, senhas iam em plaintext em clients.* → leak de banco = vazamento
// massivo. Este helper criptografa com AES-256-GCM (autenticated encryption), chave
// em env var `VAULT_KEY` (base64 de 32 bytes).
//
// Formato do ciphertext persistido:
//   v1:${iv_base64}:${tag_base64}:${ciphertext_base64}
//
// Migração gradual:
//   - Valores já plaintext continuam lendo (detecta ausência de prefixo v1:)
//   - Toda escrita nova é criptografada
//   - Script de backfill (scripts/encrypt-vault.mjs) migra existentes
//   - Quando 100% migrado, dropa fallback de plaintext

import crypto from "node:crypto";

const VAULT_KEY_ENV = "VAULT_KEY";
const ALGO = "aes-256-gcm";
const PREFIX = "v1:";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env[VAULT_KEY_ENV];
  if (!raw) {
    throw new Error(
      `${VAULT_KEY_ENV} não configurada. Gere uma com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${VAULT_KEY_ENV} deve ser base64 de 32 bytes (resultado: ${key.length}).`);
  }
  cachedKey = key;
  return key;
}

/**
 * Criptografa um valor sensível. Retorna string no formato `v1:iv:tag:ct` (base64).
 * null/undefined/"" passam sem modificação (permite campos opcionais).
 */
export function encryptVault(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  const iv = crypto.randomBytes(12); // 96-bit IV — padrão pra GCM
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/**
 * Descriptografa. Se o valor não tem prefixo `v1:`, assume que é plaintext legado
 * (dado ainda não migrado) e devolve como está — migração gradual.
 * Lança se o prefixo existe mas descrypt falha (ciphertext corrompido/chave errada).
 */
export function decryptVault(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === "") return null;
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext — ainda não migrado. Devolve como está.
    return stored;
  }
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Vault ciphertext malformado (esperado v1:iv:tag:ct)");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Helper para saber se um valor persistido já foi criptografado.
 * Útil em scripts de migração pra saber o que ainda falta encriptar.
 */
export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}
