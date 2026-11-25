// 25/11/2026: o "Desfazer" some quando o resultado reusa o id do aviso que está saindo (sonner de verdade).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";

const { chamar } = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar }));
vi.mock("@/stores/useContentStore", () => ({ marcarMutacao: vi.fn(), useContentStore: { setState: vi.fn() } }));
const { oferecerPassarArtes } = await import("@/lib/design/passar-artes");
const ok = (data: unknown) => ({ ok: true, data, erro: null, status: 200 });
afterEach(cleanup);

describe("oferta de passar as artes", () => {
  it("clicou, o servidor respondeu na hora: o resultado e o Desfazer ficam na tela", async () => {
    render(<Toaster />);
    chamar.mockResolvedValueOnce(ok({ para: "Téo Braga", artes: [{ pedidoId: "1", cardId: "k1", titulo: "Arte", com: "Caio", fazendo: false }] }))
      .mockResolvedValueOnce(ok({ passadas: ["1"], jaEstavam: [], para: "Téo Braga", operacao: "op1" }))
      .mockResolvedValueOnce(ok({ voltaram: [{ id: "1", para: "Caio" }] }));
    await act(async () => { await oferecerPassarArtes("c1", "", "Téo Braga"); });
    fireEvent.click(await screen.findByRole("button", { name: "Passar para Téo Braga" }));
    await screen.findByText("1 arte passou para Téo Braga.");
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await screen.findByText("1 arte voltou para quem estava.");
    expect(chamar).toHaveBeenLastCalledWith("/api/design-requests/passar", { desfazer: "op1" });
    await waitFor(() => expect(screen.queryByText(/continua com outra pessoa/)).toBeNull());
  });
});
