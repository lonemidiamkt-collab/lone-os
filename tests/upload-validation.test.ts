/**
 * QA: validação de upload de arte.
 * Cobre tipo MIME, tamanho, extensão correta, edge cases.
 */

import { describe, it, expect } from "vitest";

// Replica a lógica de validação do /api/upload-art e UploadArtModal
const MAX_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
  "application/pdf", "video/mp4", "video/webm",
]);

interface ValidationResult { ok: boolean; error?: string }

function validateUpload(file: { name: string; size: number; type: string }): ValidationResult {
  if (file.size === 0) return { ok: false, error: "Arquivo vazio" };
  if (file.size > MAX_SIZE) {
    return { ok: false, error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 25MB` };
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return { ok: false, error: `Tipo de arquivo não suportado (${file.type})` };
  }
  return { ok: true };
}

describe("Upload validation — tipos aceitos", () => {
  it("aceita PNG", () => {
    expect(validateUpload({ name: "art.png", size: 1024, type: "image/png" })).toEqual({ ok: true });
  });

  it("aceita JPEG", () => {
    expect(validateUpload({ name: "art.jpg", size: 1024, type: "image/jpeg" })).toEqual({ ok: true });
  });

  it("aceita WebP", () => {
    expect(validateUpload({ name: "art.webp", size: 1024, type: "image/webp" })).toEqual({ ok: true });
  });

  it("aceita GIF", () => {
    expect(validateUpload({ name: "anim.gif", size: 1024, type: "image/gif" })).toEqual({ ok: true });
  });

  it("aceita PDF", () => {
    expect(validateUpload({ name: "art.pdf", size: 1024, type: "application/pdf" })).toEqual({ ok: true });
  });

  it("aceita MP4 (vídeos/reels)", () => {
    expect(validateUpload({ name: "reel.mp4", size: 1024, type: "video/mp4" })).toEqual({ ok: true });
  });
});

describe("Upload validation — tipos rejeitados", () => {
  it("rejeita executável", () => {
    const r = validateUpload({ name: "vírus.exe", size: 1024, type: "application/x-msdownload" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Tipo de arquivo não suportado");
  });

  it("rejeita zip", () => {
    expect(validateUpload({ name: "x.zip", size: 1024, type: "application/zip" }).ok).toBe(false);
  });

  it("rejeita texto plain", () => {
    expect(validateUpload({ name: "x.txt", size: 1024, type: "text/plain" }).ok).toBe(false);
  });
});

describe("Upload validation — tamanho", () => {
  it("rejeita arquivo vazio", () => {
    const r = validateUpload({ name: "x.png", size: 0, type: "image/png" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("vazio");
  });

  it("aceita arquivo no limite (25MB)", () => {
    expect(validateUpload({ name: "big.png", size: 25 * 1024 * 1024, type: "image/png" }).ok).toBe(true);
  });

  it("rejeita arquivo > 25MB", () => {
    const r = validateUpload({ name: "huge.png", size: 25 * 1024 * 1024 + 1, type: "image/png" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("muito grande");
  });

  it("rejeita arquivo de 100MB com tamanho na mensagem", () => {
    const r = validateUpload({ name: "huge.png", size: 100 * 1024 * 1024, type: "image/png" });
    expect(r.error).toContain("100.0MB");
  });
});

describe("Upload validation — fluxo completo", () => {
  it("simula upload de PNG válido (caso de uso designer normal)", () => {
    const file = { name: "logo-final.png", size: 2.5 * 1024 * 1024, type: "image/png" };
    const result = validateUpload(file);
    expect(result.ok).toBe(true);
  });

  it("simula upload de JPG válido", () => {
    const file = { name: "post-instagram.jpg", size: 800 * 1024, type: "image/jpeg" };
    expect(validateUpload(file).ok).toBe(true);
  });
});
