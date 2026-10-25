// tests/observacao-cadastro-ficha.test.tsx — 25/10/2026, onda 5 da auditoria de erro recuperável.
// A observação que o cliente escreve no link de cadastro (client_onboarding_submissions.notes) só
// aparecia na linha do tempo e em Pendentes: quem abria a ficha não via. Agora a aba Admin mostra
// "Observação do cliente no cadastro" com a data, separada das notas internas, só para ler.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { observacaoParaFicha, rotuloDaObservacao, MAX_OBSERVACAO } from "@/lib/onboarding/observacao-ficha";

const espias = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: espias.chamar }));

const { default: ObservacaoDoCadastro } = await import("@/components/client/ficha/ObservacaoDoCadastro");

describe("qual observação mostrar", () => {
  it("a do cadastro mais recente com texto; envio vale a data do envio", () => {
    const o = observacaoParaFicha([
      { notes: "antiga", submitted_at: "2026-09-01T12:00:00Z", created_at: "2026-08-30T12:00:00Z" },
      { notes: "  Prefiro post sem rosto.\nNada de vermelho.  ", submitted_at: "2026-10-21T13:00:00Z", created_at: "2026-10-20T12:00:00Z" },
      { notes: "   ", submitted_at: null, created_at: "2026-10-22T12:00:00Z" },
    ]);
    expect(o).toEqual({ texto: "Prefiro post sem rosto.\nNada de vermelho.", em: "2026-10-21T13:00:00Z", enviada: true });
    expect(rotuloDaObservacao(o!)).toBe("Escrita no envio do cadastro, em 21/10/2026");
  });

  it("rascunho ainda não enviado: diz que não foi enviado e usa a data em que o link foi aberto", () => {
    const o = observacaoParaFicha([{ notes: "ligar depois das 18h", submitted_at: null, created_at: "2026-10-20T15:00:00Z" }]);
    expect(o).toMatchObject({ enviada: false, em: "2026-10-20T15:00:00Z" });
    expect(rotuloDaObservacao(o!)).toBe("No rascunho do link (ainda não enviado), aberto em 20/10/2026");
  });

  it("sem texto em nenhum cadastro: null; texto enorme é cortado com reticências", () => {
    expect(observacaoParaFicha([{ notes: null }, { notes: "" }])).toBeNull();
    expect(observacaoParaFicha(null)).toBeNull();
    const longa = observacaoParaFicha([{ notes: "a".repeat(MAX_OBSERVACAO + 50), created_at: "2026-10-01T00:00:00Z" }]);
    expect(longa!.texto.length).toBe(MAX_OBSERVACAO);
    expect(longa!.texto.endsWith("…")).toBe(true);
  });
});

describe("Ficha › Admin › Observação do cliente no cadastro", () => {
  beforeEach(() => { espias.chamar.mockReset(); });

  it("o erro original: a observação do cliente aparece na ficha, com a data e o texto inteiro", async () => {
    espias.chamar.mockResolvedValue({ ok: true, status: 200, erro: null, data: {
      temCadastro: true,
      observacao: { texto: "Prefiro post sem rosto.\nNada de vermelho.", em: "2026-10-21T13:00:00Z", enviada: true },
    } });
    render(<ObservacaoDoCadastro clientId="c1" />);
    const bloco = await screen.findByRole("region", { name: /observação do cliente no cadastro/i });
    expect(bloco).toHaveTextContent("Escrita no envio do cadastro, em 21/10/2026");
    expect(bloco).toHaveTextContent("Prefiro post sem rosto.");
    expect(bloco).toHaveTextContent("Nada de vermelho.");
    expect(espias.chamar).toHaveBeenCalledWith("/api/clients/c1/observacao-cadastro");
    // Só leitura: nada de campo para editar nem botão de salvar.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("cadastro sem observação: diz que o cliente não escreveu (não some calado)", async () => {
    espias.chamar.mockResolvedValue({ ok: true, status: 200, erro: null, data: { temCadastro: true, observacao: null } });
    render(<ObservacaoDoCadastro clientId="c1" />);
    expect(await screen.findByText("O cliente não deixou observação no link de cadastro.")).toBeInTheDocument();
  });

  it("cliente cadastrado à mão (sem link): o bloco não aparece", async () => {
    espias.chamar.mockResolvedValue({ ok: true, status: 200, erro: null, data: { temCadastro: false, observacao: null } });
    const { container } = render(<ObservacaoDoCadastro clientId="c1" className="borda" />);
    await waitFor(() => expect(container.querySelector(".borda")).toBeNull());
  });

  it("falha de leitura aparece como falha, com Tentar de novo — nunca como 'não escreveu nada'", async () => {
    espias.chamar.mockResolvedValueOnce({ ok: false, status: 503, data: null, erro: "Não consegui ler o cadastro do cliente agora. Tente de novo." });
    render(<ObservacaoDoCadastro clientId="c1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não consegui ler a observação do cliente/);
    expect(screen.queryByText(/não deixou observação/)).not.toBeInTheDocument();

    espias.chamar.mockResolvedValueOnce({ ok: true, status: 200, erro: null, data: {
      temCadastro: true, observacao: { texto: "voltou", em: null, enviada: true },
    } });
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(await screen.findByText("voltou")).toBeInTheDocument();
  });
});
