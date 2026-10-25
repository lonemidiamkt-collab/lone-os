// tests/cofre-senhas-anteriores-tela.test.tsx — 25/10/2026, onda 5. A caixa "Senhas anteriores" de um
// campo do cofre, na ficha: lista sem a senha, "Ver" revela só a pedida, "Restaurar esta" confirma antes,
// e a falha aparece junto da linha (nada muda no cofre).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const espias = vi.hoisted(() => ({ chamar: vi.fn(), sucesso: vi.fn(), aviso: vi.fn(), erro: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: espias.chamar }));
vi.mock("sonner", () => ({ toast: { success: espias.sucesso, warning: espias.aviso, error: espias.erro } }));

const { default: SenhasAnteriores } = await import("@/components/client/ficha/SenhasAnteriores");

const LISTA = {
  disponivel: true,
  versoes: [
    { id: "v1", em: "2026-10-21T17:30:00Z", quem: "Roberto", motivo: "troca" },
    { id: "v2", em: "2026-10-01T12:00:00Z", quem: "julio@lonemidia.com", motivo: "remocao" },
  ],
};

function rotas(extra?: (url: string, corpo: unknown) => unknown) {
  espias.chamar.mockImplementation(async (url: string, corpo?: unknown) => {
    const r = extra?.(url, corpo);
    if (r) return r;
    if (url.includes("versaoId=v1")) return { ok: true, status: 200, erro: null, data: { value: "antiga-111" } };
    if (url.startsWith("/api/client-vault/anteriores")) return { ok: true, status: 200, erro: null, data: LISTA };
    return { ok: false, status: 500, erro: "rota inesperada", data: null };
  });
}

beforeEach(() => {
  espias.chamar.mockReset(); espias.sucesso.mockReset(); espias.aviso.mockReset(); espias.erro.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

async function abrir() {
  fireEvent.click(screen.getByRole("button", { name: "Senhas anteriores" }));
  await screen.findByText(/Valia até 21\/10\/2026, 14:30 · trocada por Roberto/);
}

describe("Ficha › Cofre › Senhas anteriores", () => {
  it("lista com data e quem trocou, sem mostrar senha nenhuma", async () => {
    rotas();
    render(<SenhasAnteriores clientId="c1" field="instagram_password" />);
    await abrir();
    expect(screen.getByText(/Valia até 01\/10\/2026, 09:00 · apagada por julio@lonemidia.com/)).toBeInTheDocument();
    expect(screen.queryByText("antiga-111")).not.toBeInTheDocument();
    expect(espias.chamar).toHaveBeenCalledWith("/api/client-vault/anteriores?clientId=c1&field=instagram_password");
  });

  it("Ver revela só a versão pedida; fechar a caixa esquece a senha", async () => {
    rotas();
    render(<SenhasAnteriores clientId="c1" field="instagram_password" />);
    await abrir();
    fireEvent.click(screen.getAllByRole("button", { name: /^ver$/i })[0]);
    expect(await screen.findByText("antiga-111")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /esconder senhas anteriores/i }));
    fireEvent.click(screen.getByRole("button", { name: "Senhas anteriores" }));
    await screen.findByText(/trocada por Roberto/);
    expect(screen.queryByText("antiga-111")).not.toBeInTheDocument();
  });

  it("Restaurar esta: confirma, usa a ação `restaurar` do cofre, avisa e recarrega a lista", async () => {
    rotas((url, corpo) => url === "/api/client-vault"
      ? { ok: true, status: 200, erro: null, data: { ok: true, historicoId: "v3", aviso: null } } : undefined);
    const onRestaurada = vi.fn();
    render(<SenhasAnteriores clientId="c1" field="instagram_password" onRestaurada={onRestaurada} />);
    await abrir();
    fireEvent.click(screen.getAllByRole("button", { name: /restaurar esta/i })[1]);
    await waitFor(() => expect(onRestaurada).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Restaurar a senha do Instagram que valia até 01\/10\/2026, 09:00\?/));
    expect(espias.chamar).toHaveBeenCalledWith("/api/client-vault", { acao: "restaurar", clientId: "c1", table: "clients", field: "instagram_password", versaoId: "v2" });
    expect(espias.sucesso).toHaveBeenCalledWith(expect.stringMatching(/Senha do Instagram restaurada/));
    // Recarregou a lista depois de restaurar.
    expect(espias.chamar.mock.calls.filter(([u]) => String(u).startsWith("/api/client-vault/anteriores")).length).toBe(2);
  });

  it("cancelou a confirmação: nada é chamado", async () => {
    rotas();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SenhasAnteriores clientId="c1" field="instagram_password" />);
    await abrir();
    fireEvent.click(screen.getAllByRole("button", { name: /restaurar esta/i })[0]);
    expect(espias.chamar).not.toHaveBeenCalledWith("/api/client-vault", expect.anything());
  });

  it("restaurar falhou: a falha aparece na caixa, e a tela de cima não é avisada de troca", async () => {
    rotas((url) => url === "/api/client-vault"
      ? { ok: false, status: 503, data: null, erro: "Não consegui ler a senha atual." } : undefined);
    const onRestaurada = vi.fn();
    render(<SenhasAnteriores clientId="c1" field="instagram_password" onRestaurada={onRestaurada} />);
    await abrir();
    fireEvent.click(screen.getAllByRole("button", { name: /restaurar esta/i })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não restaurei a senha do Instagram: Não consegui ler a senha atual\. Nada foi trocado\./);
    expect(onRestaurada).not.toHaveBeenCalled();
    expect(espias.sucesso).not.toHaveBeenCalled();
  });

  it("lista que não carrega vira erro com Tentar de novo — não 'nenhuma senha'", async () => {
    espias.chamar.mockResolvedValueOnce({ ok: false, status: 503, data: null, erro: "Não consegui ler as senhas anteriores agora." });
    render(<SenhasAnteriores clientId="c1" field="instagram_password" />);
    fireEvent.click(screen.getByRole("button", { name: "Senhas anteriores" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não consegui ler as senhas anteriores/);
    expect(screen.queryByText(/Nenhuma senha anterior/)).not.toBeInTheDocument();
    rotas();
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(await screen.findByText(/trocada por Roberto/)).toBeInTheDocument();
  });
});
