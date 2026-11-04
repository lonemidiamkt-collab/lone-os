// Bloco "Lone Academy" na ficha (04/11/2026). Roda o componente de verdade com a API simulada.
// O que importa: antes de mandar mostra para quem vai e pede confirmação; e-mail que não saiu vira
// aviso com o link para o WhatsApp, nunca "enviado"; situação do dono aparece depois de liberado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: api.chamar }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
const { default: LoneAcademy } = await import("@/components/client/ficha/LoneAcademy");

const cliente = { id: "c1", name: "Casa Exemplo LTDA", nomeFantasia: "Casa Exemplo", contactName: "Paula Souza" } as never;
const naoLiberada = { existe: false, sugestao: { gestorNome: "Paula Souza", gestorEmail: "paula@casaexemplo.com.br" }, clienteEncerrado: false };

beforeEach(() => api.chamar.mockReset());

describe("Lone Academy na ficha", () => {
  it("liberar: formulário com a sugestão → confirmação com o destinatário → e-mail que não saiu mostra o link", async () => {
    api.chamar.mockImplementation(async (_url: string, corpo?: unknown) => corpo
      ? { ok: true, data: { resultado: "convite_enviado", existe: true, situacao: "active", email: { enviado: false, motivo: "falta RESEND_API_KEY" }, link: "https://academy/convite/abc",
          gestor: { email: "paula@casaexemplo.com.br", convite: "pendente", enviadoEm: "2026-11-04T12:00:00Z", expiraEm: "2026-11-11T12:00:00Z", aceitoEm: null }, assentos: { limite: 10, emUso: 0 } }, erro: null, status: 200 }
      : { ok: true, data: naoLiberada, erro: null, status: 200 });
    render(<LoneAcademy client={cliente} />);
    fireEvent.click(await screen.findByText("Liberar Lone Academy"));
    expect((screen.getByPlaceholderText("nome@loja.com.br") as HTMLInputElement).value).toBe("paula@casaexemplo.com.br");
    fireEvent.click(screen.getByText("Continuar"));
    expect(screen.getByText("Confira antes de mandar")).toBeTruthy();
    expect(screen.getByText("paula@casaexemplo.com.br")).toBeTruthy();
    expect(api.chamar).toHaveBeenCalledTimes(1); // nada saiu ainda
    fireEvent.click(screen.getByText("Liberar e enviar e-mail"));
    await waitFor(() => expect(screen.getByText(/o e-mail não saiu: falta RESEND_API_KEY/)).toBeTruthy());
    expect(screen.getByText("https://academy/convite/abc")).toBeTruthy();
    expect(api.chamar.mock.calls[1][1]).toEqual({ acao: "liberar", gestorNome: "Paula Souza", gestorEmail: "paula@casaexemplo.com.br", assentos: 10 });
    expect(screen.getByText(/e-mail enviado em .*vale até/)).toBeTruthy();
  });
  it("e-mail inválido trava no formulário, sem chamar a API", async () => {
    api.chamar.mockResolvedValue({ ok: true, data: { ...naoLiberada, sugestao: { gestorNome: "Paula", gestorEmail: "" } }, erro: null, status: 200 });
    render(<LoneAcademy client={cliente} />);
    fireEvent.click(await screen.findByText("Liberar Lone Academy"));
    fireEvent.click(screen.getByText("Continuar"));
    expect(screen.getByText(/E-mail inválido/)).toBeTruthy();
    expect(api.chamar).toHaveBeenCalledTimes(1);
  });
  it("integração desligada ou Academy fora do ar: diz o motivo e oferece tentar de novo", async () => {
    api.chamar.mockResolvedValue({ ok: false, data: null, erro: "Integração com a Lone Academy desligada: falta ACADEMY_URL ou ACADEMY_SHARED_SECRET no servidor.", status: 503 });
    render(<LoneAcademy client={cliente} />);
    expect(await screen.findByText(/desligada: falta ACADEMY_URL/)).toBeTruthy();
    expect(screen.getByText("Tentar de novo")).toBeTruthy();
  });
  it("dono já entrou: mostra quando e não oferece reenviar", async () => {
    api.chamar.mockResolvedValue({ ok: true, status: 200, erro: null, data: { existe: true, situacao: "active", assentos: { limite: 10, emUso: 4 }, ativos7d: 3, ultimoAcesso: new Date().toISOString(),
      gestor: { email: "paula@x.com", convite: "aceito", enviadoEm: "2026-11-01T12:00:00Z", expiraEm: null, aceitoEm: "2026-11-02T12:00:00Z" } } });
    render(<LoneAcademy client={cliente} />);
    expect(await screen.findByText(/paula@x.com · entrou em 02\/11\/2026/)).toBeTruthy();
    expect(screen.getByText("4 em uso de 10")).toBeTruthy();
    expect(screen.queryByText(/Reenviar/)).toBeNull();
  });
});
