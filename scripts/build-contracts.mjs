#!/usr/bin/env node
/**
 * Prebuild step — garante que os .docx dos contratos estão atualizados
 * a partir dos .md fonte em `contract-templates/`.
 *
 * Rodado automaticamente antes de `next build`.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(__dirname, "..", "contract-templates");

// 1. Instala deps do convert.js se ainda não tiver
if (!existsSync(path.join(templatesDir, "node_modules"))) {
  console.log("[build-contracts] Installing contract-templates deps...");
  execSync("npm install --no-audit --no-fund", { cwd: templatesDir, stdio: "inherit" });
}

// 2. Regenera os .docx a partir dos .md
console.log("[build-contracts] Regenerating .docx from .md...");
execSync("node convert.js", { cwd: templatesDir, stdio: "inherit" });
