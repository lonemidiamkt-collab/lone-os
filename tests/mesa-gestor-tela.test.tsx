// tests/mesa-gestor-tela.test.tsx — a Mesa do Gestor desenhada com dado inventado: itens, semana, decisões.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const chamadas = vi.hoisted(() => ({ lista: [] as { url: string; corpo?: unknown }[], mesa: null as unknown }));
vi.mock("@/lib/api/chamar", () => ({
  chamar: async (url: string, corpo?: unknown) => {
    chamadas.lista.push({ url, corpo });
    if (url.startsWith("/api/trafego/mesa")) return { ok: true, data: chamadas.mesa, status: 200 };
    return { ok: true, data: { ok: true }, status: 200 };
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: MesaGestor } = await import("@/components/trafego/mesa/MesaGestor");

const item = (o: Record<string, unknown> = {}) => ({
  id: "r1", fingerprint: "trafego|c1|criativo:ADS - PISO|desperdicio", client_id: "c1", cliente: "Reformar",
  titulo: "Reformar: desperdício em \"ADS - PISO\"", motivo: "desperdicio",
  fato: ["\"ADS - PISO\" (3 anúncios com esse criativo) gastou R$ 85 em 7 dias e nenhuma conversa."],
  recomendacao: "Pausar os 3 anúncios desse criativo.", score: 78, exposicao_rs: 12, confianca: 0.85,
  owner: "Julio", estado: "nova", created_at: new Date(Date.now() - 50 * 3_600_000).toISOString(), primeira_vez: null,
  acao_proposta: null, voltou: false, ...o,
});

beforeEach(() => {
  chamadas.lista = [];
  chamadas.mesa = {
    gestor: "Julio", itens: [item(), item({ id: "r2", titulo: "Madeirão: verba abaixo do ritmo do mês", score: 45, exposicao_rs: null, voltou: true })],
    alemDaMesa: 4, adiados: 1,
    feitos: [{ id: "f1", cliente: "Império", titulo: "Império: desperdício em \"ADS X\"", decidido_em: new Date(Date.now() - 30 * 3_600_000).toISOString(), decidido_por: "Julio", resultado: "confirmado_1d" }],
    semana: { recebidos: 10, decididos: 4, taxa: 40, horasAteDecidir: 6, feitos: 3, resolvidos: 1, voltaram: 1 },
    gestores: ["Julio"], eu: { nome: "Julio", papel: "traffic" },
  };
});

describe("Mesa do gestor", () => {
  it("mostra os itens, o R$ em jogo, o 'voltou', a semana, a fila e a conferência", async () => {
    render(<MesaGestor />);
    expect(await screen.findByText("Reformar: desperdício em \"ADS - PISO\"")).toBeTruthy();
    expect(screen.getByText(/R\$\s?12\/dia em jogo/)).toBeTruthy();
    expect(screen.getByText("Voltou depois do “Já fiz”")).toBeTruthy();
    expect(screen.getByText(/10 recebidos · 4 decididos \(40%\)/)).toBeTruthy();
    expect(screen.getByText(/Mais 4 na fila/)).toBeTruthy();
    expect(screen.getByText("Sumiu no 1º dia — confiro de novo no 3º")).toBeTruthy();
    // Gestor de tráfego não escolhe de quem é a Mesa.
    expect(screen.queryByRole("group", { name: "De quem é a Mesa" })).toBeNull();
  });

  it("Já fiz manda 'executada' e tira o item da lista", async () => {
    render(<MesaGestor />);
    await screen.findByText("Reformar: desperdício em \"ADS - PISO\"");
    fireEvent.click(screen.getAllByRole("button", { name: /Já fiz/ })[0]);
    await waitFor(() => expect(screen.queryByText("Reformar: desperdício em \"ADS - PISO\"")).toBeNull());
    expect(chamadas.lista.find((c) => c.url === "/api/priority/decidir")?.corpo).toEqual({ id: "r1", decisao: "executada" });
  });

  it("Não é problema pede o porquê; 'dado errado' vira 'incorreta'", async () => {
    render(<MesaGestor />);
    await screen.findByText("Reformar: desperdício em \"ADS - PISO\"");
    fireEvent.click(screen.getAllByRole("button", { name: /Não é problema/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "O dado está errado" }));
    await waitFor(() => expect(chamadas.lista.some((c) => c.url === "/api/priority/decidir")).toBe(true));
    expect(chamadas.lista.find((c) => c.url === "/api/priority/decidir")?.corpo).toEqual({ id: "r1", decisao: "incorreta", motivo: "dado errado" });
  });

  it("Adiar manda a data de volta", async () => {
    render(<MesaGestor />);
    await screen.findByText("Reformar: desperdício em \"ADS - PISO\"");
    fireEvent.click(screen.getAllByRole("button", { name: /Adiar/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Em 3 dias" }));
    await waitFor(() => expect(chamadas.lista.some((c) => c.url === "/api/priority/decidir")).toBe(true));
    const corpo = chamadas.lista.find((c) => c.url === "/api/priority/decidir")?.corpo as { decisao: string; ate: string };
    expect(corpo.decisao).toBe("adiar");
    expect(corpo.ate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Mesa vazia diz que está limpa e quantos estão adiados", async () => {
    chamadas.mesa = { ...(chamadas.mesa as object), itens: [], alemDaMesa: 0, adiados: 2, feitos: [] };
    render(<MesaGestor />);
    expect(await screen.findByText("Mesa limpa")).toBeTruthy();
    expect(screen.getByText(/2 itens adiados voltam na data marcada/)).toBeTruthy();
  });
});
