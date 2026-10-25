// tests/grupos-tela.test.tsx — 25/10/2026, auditoria 9.1. Roda a TELA de verdade (/settings/grupos): a decisão do
// que vai para o servidor é o que importa, não o componente com props escritas à mão. Dados INVENTADOS.
//
// O QUE ACONTECIA: a sugestão de grupo de confiança "média" já vinha escolhida no seletor, e o Salvar mandava a
// tabela inteira. Quem entrava para mudar uma verba gravava junto um grupo que ninguém conferiu.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const chamadas: { url: string; corpo: unknown }[] = [];
const ALERTAS = { verbaBaixa: true, verbaZerada: true, erroConta: true, semGasto: true, campanhaParada: false, metaErro: true };
const VENEZA = "120363000000000001@g.us";
const GET = {
  groups: [
    { id: "alfa@g.us", subject: "Loja Alfa Marketing Oficial" },
    { id: VENEZA, subject: "Veneza estofados - Marketing" },
  ],
  groupsError: null,
  clients: [
    {
      clientId: "a", clientName: "Loja Alfa", metaAccountId: "act_1", currentJid: null, currentName: null,
      suggestion: { groupId: "alfa@g.us", groupName: "Loja Alfa Marketing Oficial", score: 0.6, confidence: "medium" },
      monthlyBudget: 3000, verbaMinima: null, alerts: ALERTAS,
    },
    {
      clientId: "v2", clientName: "Veneza Estofados - Nova Iguaçu", metaAccountId: "act_2", currentJid: VENEZA, currentName: "Veneza estofados - Marketing",
      suggestion: { groupId: VENEZA, groupName: "Veneza estofados - Marketing", score: 1.2, confidence: "high" },
      monthlyBudget: 2000, verbaMinima: 300, alerts: ALERTAS,
    },
  ],
  donosGrupos: [
    { clientId: "v1", nome: "VENEZA ESTOFADOS", jid: VENEZA, ativo: true },
    { clientId: "v2", nome: "Veneza Estofados - Nova Iguaçu", jid: VENEZA, ativo: true },
  ],
  warningPct: 18, criticalPct: 10,
};

vi.mock("@/lib/api/chamar", () => ({
  chamar: vi.fn(async (url: string, corpo?: unknown) => {
    chamadas.push({ url, corpo });
    if (corpo === undefined) return { ok: true, data: GET, erro: null, status: 200 };
    return { ok: true, data: { ok: true, salvos: (corpo as { mappings: { clientId: string }[] }).mappings.map((m) => m.clientId) }, erro: null, status: 200 };
  }),
}));

const { default: GruposPage } = await import("@/app/settings/grupos/page");
const posts = () => chamadas.filter((c) => c.corpo !== undefined).map((c) => (c.corpo as { mappings: Record<string, unknown>[] }).mappings);

beforeEach(() => { chamadas.length = 0; });

describe("/settings/grupos", () => {
  it("o erro original: a sugestão NÃO vem escolhida, e mudar a verba grava só a verba", async () => {
    render(<GruposPage />);
    const seletor = await screen.findByLabelText("Grupo de Loja Alfa");
    expect((seletor as HTMLSelectElement).value).toBe("");
    expect(screen.getByText(/Usar sugestão: Loja Alfa Marketing Oficial/)).toBeInTheDocument();

    const [verbaAlfa] = screen.getAllByRole("textbox");
    fireEvent.change(verbaAlfa, { target: { value: "1.500" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar \(1\)/ }));
    // Resumo antes de gravar.
    expect(screen.getByText(/Loja Alfa: avisar saldo baixo abaixo de R\$\s1\.500,00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar e salvar/ }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual([{ clientId: "a", verbaMinima: 1500 }]);
  });

  it("'Usar sugestão' é escolha da pessoa: aparece no resumo como vínculo", async () => {
    render(<GruposPage />);
    fireEvent.click(await screen.findByText(/Usar sugestão: Loja Alfa Marketing Oficial/));
    fireEvent.click(screen.getByRole("button", { name: /Salvar \(1\)/ }));
    expect(screen.getByText('• vincular Loja Alfa → grupo "Loja Alfa Marketing Oficial"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar e salvar/ }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual([{ clientId: "a", groupJid: "alfa@g.us", groupName: "Loja Alfa Marketing Oficial", compartilharCom: [] }]);
  });

  it("grupo que já é de outro cliente só salva com o compartilhamento confirmado (e manda quem foi confirmado)", async () => {
    render(<GruposPage />);
    fireEvent.change(await screen.findByLabelText("Grupo de Loja Alfa"), { target: { value: VENEZA } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar \(1\)/ }));
    const confirmar = screen.getByRole("button", { name: /Confirmar e salvar/ });
    expect(confirmar).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmar).not.toBeDisabled();
    fireEvent.click(confirmar);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][0]).toMatchObject({ clientId: "a", groupJid: VENEZA, compartilharCom: ["v1", "v2"] });
  });

  it("valor que não dá para entender trava o Salvar e diz o que fazer, no campo", async () => {
    render(<GruposPage />);
    await screen.findByLabelText("Grupo de Loja Alfa");
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "1,500,00" } });
    expect(screen.getByText(/Não entendi o valor\. Escreva assim: 1\.500,00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar/ })).toBeDisabled();
  });

  it("Desfazer volta a linha ao que está salvo (e nada fica para gravar)", async () => {
    render(<GruposPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Usar sugestão/ }));
    fireEvent.click(screen.getByRole("button", { name: /Desfazer/ }));
    expect((screen.getByLabelText("Grupo de Loja Alfa") as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("button", { name: /^Salvar$/ })).toBeDisabled();
  });
});
