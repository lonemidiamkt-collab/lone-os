// tests/logo-erro-na-marca.test.tsx — 24/10/2026, auditoria de erro recuperável (item 3.12).
// "Trocar logo" na aba Marca: o erro do envio ia para o aviso dos Documentos Legais (aba Admin) e na
// Marca não aparecia nada — "Enviando…" sumia e o logo antigo ficava, sem motivo. Agora o limite é dito
// antes (imagem, até 10 MB), o arquivo é conferido antes de subir e o erro aparece junto do botão.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Client } from "@/lib/types";
import { validarLogo, LIMITE_LOGO, DICA_LOGO } from "@/lib/clients/logo-upload";

const espias = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: espias.chamar }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/supabase/client", () => {
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }) };
  return { supabase: { from: () => q } };
});
vi.mock("@/lib/hooks/useTeamMembers", () => ({ useTeamMembers: () => ({ forField: () => [], members: [], loading: false }) }));
vi.mock("@/components/clients/MarcaDoCliente", () => ({ default: () => null }));
vi.mock("@/components/client/ficha/CofreStatus", () => ({ default: () => null }));

const { default: DadosTab } = await import("@/components/client-tabs/DadosTab");

const arquivo = (nome: string, tipo: string, bytes: number) => {
  const f = new File(["x"], nome, { type: tipo });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};

describe("o que serve de logo", () => {
  it("PDF não: diz o que fazer (exportar como PNG)", () => {
    expect(validarLogo({ name: "cartao-cnpj.pdf", type: "application/pdf", size: 1000 })).toMatch(/é PDF — o logo precisa ser imagem[\s\S]*exporte a página como PNG/);
  });
  it("SVG/GIF não entram (a rota recusa); PNG/JPG/WEBP/HEIC sim", () => {
    expect(validarLogo({ name: "logo.svg", type: "image/svg+xml", size: 1000 })).toMatch(/não é um formato aceito/);
    for (const n of ["a.png", "a.JPG", "a.jpeg", "a.webp", "a.heic"]) expect(validarLogo({ name: n, size: 1000 })).toBeNull();
  });
  it("acima de 10 MB: diz o tamanho e o limite", () => {
    expect(validarLogo({ name: "logo.png", type: "image/png", size: 14.2 * 1024 * 1024 })).toMatch(/tem 14,2 MB — o limite é 10 MB/);
    expect(LIMITE_LOGO).toBe(10 * 1024 * 1024);
  });
});

describe("aba Marca › Trocar logo", () => {
  beforeEach(() => { espias.chamar.mockReset(); });
  const client = { id: "c1", name: "Padaria", docLogo: "https://x/logo.png" } as unknown as Client;
  const montar = () => render(
    <DadosTab client={client} role="admin" currentUser="Roberto" updateClientData={vi.fn()} onNavigateTab={vi.fn()}
      generateOnboardingLink={vi.fn()} generatingLink={false} dadosCompletos parte="identidade" />,
  );
  const input = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;

  it("o limite aparece antes de escolher o arquivo", () => {
    montar();
    expect(screen.getByText(DICA_LOGO)).toBeInTheDocument();
  });

  it("PDF escolhido: o erro aparece junto do botão e nada é enviado", () => {
    const { container } = montar();
    fireEvent.change(input(container), { target: { files: [arquivo("cartao-cnpj.pdf", "application/pdf", 2000)] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/é PDF/);
    expect(espias.chamar).not.toHaveBeenCalled();
  });

  it("o envio falhou na rota: o motivo aparece na própria aba Marca", async () => {
    espias.chamar.mockResolvedValue({ ok: false, data: null, erro: "Muitos uploads em pouco tempo. Aguarde 5 segundos e tente novamente.", status: 429 });
    const { container } = montar();
    fireEvent.change(input(container), { target: { files: [arquivo("logo.png", "image/png", 2000)] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Aguarde 5 segundos/));
  });
});
