// tests/cadastro-cliente-novo-documentos.test.tsx — 25/10/2026, onda 5 da auditoria de erro recuperável.
// "Novo cliente": Contrato Social e RG/CNH SEMPRE falhavam. O arquivo subia na hora de escolher, com
// clientId "manual-<data>" (o cliente ainda não existe) e a rota respondia "clientId inválido."; o RG/CNH
// ia com docType "rg_ou_cnh", que a rota nem conhece. Agora a tela guarda os arquivos e os envia depois do
// cadastro, com o id devolvido, mostrando o resultado de cada um.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { problemaDoArquivo, resumoDoEnvio, MAX_ARQUIVOS_POR_DOC } from "@/lib/clients/documentos-novo-cliente";
import { MB } from "@/lib/onboarding/etapas";

const espias = vi.hoisted(() => ({ addClient: vi.fn(), addTask: vi.fn(), push: vi.fn(), chamar: vi.fn() }));
vi.mock("@/stores/useClientsStore", () => ({ useClientsStore: (sel: (s: unknown) => unknown) => sel({ addClient: espias.addClient }) }));
vi.mock("@/stores/useOperationalStore", () => ({ useOperationalStore: (sel: (s: unknown) => unknown) => sel({ addTask: espias.addTask }) }));
vi.mock("@/stores/useNotificationsStore", () => ({ useNotificationsStore: (sel: (s: unknown) => unknown) => sel({ push: espias.push }) }));
vi.mock("@/lib/context/RoleContext", () => ({ useRole: () => ({ role: "admin", currentUser: "Roberto" }) }));
vi.mock("@/lib/hooks/useTeamMembers", () => ({ useTeamMembers: () => ({ forField: () => [], members: [], loading: false }) }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })) }));
vi.mock("@/lib/api/chamar", () => ({ chamar: espias.chamar }));

const { default: NewClientModal } = await import("@/components/NewClientModal");

const ID = "11111111-2222-3333-4444-555555555555";
const arquivo = (nome: string, tamanho?: number) => {
  const f = new File(["x"], nome, { type: nome.endsWith(".pdf") ? "application/pdf" : "image/jpeg" });
  if (tamanho) Object.defineProperty(f, "size", { value: tamanho });
  return f;
};

/** Uploads que chegaram à rota: clientId e docType de cada FormData. */
function uploads() {
  return espias.chamar.mock.calls
    .filter(([url]) => url === "/api/onboarding/upload")
    .map(([, fd]) => ({ clientId: (fd as FormData).get("clientId"), docType: (fd as FormData).get("docType"), nome: ((fd as FormData).get("file") as File).name }));
}

function irParaEmpresa() {
  fireEvent.change(screen.getByPlaceholderText("Ex: Contele Energia Solar"), { target: { value: "Padaria do Zé" } });
  fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
}
function escolher(rotulo: string, ...files: File[]) {
  fireEvent.change(screen.getByLabelText(`Arquivo de ${rotulo}`), { target: { files } });
}
function cadastrar() {
  fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
  fireEvent.click(screen.getByRole("button", { name: /cadastrar cliente/i }));
}

beforeEach(() => {
  espias.addClient.mockReset(); espias.addTask.mockReset(); espias.chamar.mockReset();
  espias.addClient.mockResolvedValue({ id: ID });
  espias.chamar.mockImplementation(async (url: string, fd: FormData) => url === "/api/onboarding/upload"
    ? { ok: true, status: 200, erro: null, data: { url: `legal://${ID}/${fd.get("docType")}-1.pdf` } }
    : { ok: true, status: 200, erro: null, data: {} });
});

describe("Novo cliente › documentos", () => {
  it("o erro original: nada sobe antes do cadastro; depois, sobe com o id do cliente e o docType certo", async () => {
    const onSuccess = vi.fn();
    render(<NewClientModal onClose={vi.fn()} onSuccess={onSuccess} />);
    irParaEmpresa();
    escolher("Contrato Social", arquivo("contrato.pdf"));
    escolher("RG ou CNH", arquivo("rg-frente.jpg"), arquivo("rg-verso.jpg"));
    // Escolher só guarda: a lista mostra o que vai subir, e a rota não foi chamada (o cliente não existe).
    expect(within(screen.getByRole("list", { name: "Arquivos de RG ou CNH" })).getAllByRole("listitem")).toHaveLength(2);
    expect(uploads()).toEqual([]);

    cadastrar();
    const docs = await screen.findByRole("status", { name: "Documentos" });
    await waitFor(() => expect(docs).toHaveTextContent("3 de 3 documentos enviados."));
    expect(uploads()).toEqual([
      { clientId: ID, docType: "contrato_social", nome: "contrato.pdf" },
      { clientId: ID, docType: "identidade", nome: "rg-frente.jpg" },
      { clientId: ID, docType: "identidade", nome: "rg-verso.jpg" },
    ]);
    // Nunca o id inventado nem o docType que a rota não conhece.
    expect(uploads().some((u) => String(u.clientId).startsWith("manual-") || u.docType === "rg_ou_cnh")).toBe(false);
    // Tudo certo: segue sozinho para a ficha.
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ID), { timeout: 3000 });
  });

  it("um documento falhou: diz qual e por quê, com Tentar de novo — e o reenvio vai para o mesmo cliente", async () => {
    let recusar = true;
    espias.chamar.mockImplementation(async (url: string, fd: FormData) => {
      if (url !== "/api/onboarding/upload") return { ok: true, status: 200, erro: null, data: {} };
      if (fd.get("docType") === "identidade" && recusar) return { ok: false, status: 400, data: null, erro: "Formato não suportado. Use JPG, PNG, WEBP, HEIC ou PDF." };
      return { ok: true, status: 200, erro: null, data: { url: `legal://${ID}/x.pdf` } };
    });
    const onSuccess = vi.fn();
    render(<NewClientModal onClose={vi.fn()} onSuccess={onSuccess} />);
    irParaEmpresa();
    escolher("Contrato Social", arquivo("contrato.pdf"));
    escolher("RG ou CNH", arquivo("rg.jpg"));
    cadastrar();

    const alerta = await screen.findByRole("alert", { name: "Documentos" });
    expect(alerta).toHaveTextContent("1 de 2 documentos enviados — 1 não subiu.");
    expect(alerta).toHaveTextContent(/RG ou CNH:\s*rg\.jpg/);
    expect(alerta).toHaveTextContent("Não subiu: Formato não suportado. Use JPG, PNG, WEBP, HEIC ou PDF.");
    expect(onSuccess).not.toHaveBeenCalled();

    recusar = false;
    fireEvent.click(within(alerta).getByRole("button", { name: /tentar de novo/i }));
    const docs = await screen.findByRole("status", { name: "Documentos" });
    await waitFor(() => expect(docs).toHaveTextContent("2 de 2 documentos enviados."));
    expect(uploads().filter((u) => u.docType === "identidade")).toEqual([
      { clientId: ID, docType: "identidade", nome: "rg.jpg" },
      { clientId: ID, docType: "identidade", nome: "rg.jpg" },
    ]);
    // Depois de uma falha a pessoa decide quando ir: o botão continua, sem redirecionar sozinho.
    fireEvent.click(screen.getByRole("button", { name: /abrir a ficha do cliente/i }));
    expect(onSuccess).toHaveBeenCalledWith(ID);
  });

  it("formato e tamanho são conferidos ao escolher, no próprio campo; Remover tira da lista", () => {
    render(<NewClientModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    irParaEmpresa();
    escolher("Contrato Social", arquivo("contrato.docx"));
    expect(screen.getByRole("alert")).toHaveTextContent('"contrato.docx" não é um formato aceito');
    escolher("Contrato Social", arquivo("contrato.pdf", 34 * MB));
    expect(screen.getByRole("alert")).toHaveTextContent(/tem 34 MB — o limite é 30 MB/);
    expect(screen.queryByRole("list", { name: "Arquivos de Contrato Social" })).not.toBeInTheDocument();

    escolher("Contrato Social", arquivo("pagina1.pdf"), arquivo("pagina2.pdf"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover pagina1.pdf" }));
    const lista = screen.getByRole("list", { name: "Arquivos de Contrato Social" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
    expect(lista).toHaveTextContent("pagina2.pdf");
  });

  it("sem documento escolhido, o cadastro segue como antes (nenhum upload, sem bloco de documentos)", async () => {
    const onSuccess = vi.fn();
    render(<NewClientModal onClose={vi.fn()} onSuccess={onSuccess} />);
    irParaEmpresa();
    cadastrar();
    await screen.findByText("Cliente cadastrado!");
    expect(screen.queryByRole("status", { name: "Documentos" })).not.toBeInTheDocument();
    expect(uploads()).toEqual([]);
  });
});

describe("regras puras", () => {
  it("limite de arquivos por documento e resumo do envio", () => {
    expect(problemaDoArquivo({ name: "a.jpg", size: 10 }, "identidade", MAX_ARQUIVOS_POR_DOC)).toMatch(/no máximo 5 arquivos/);
    expect(problemaDoArquivo({ name: "a.JPG", size: 10 }, "identidade", 0)).toBeNull();
    expect(problemaDoArquivo({ name: "vazio.pdf", size: 0 }, "identidade", 0)).toMatch(/está vazio/);
    expect(resumoDoEnvio([
      { id: "1", docType: "identidade", nome: "a", estado: "enviado" },
      { id: "2", docType: "identidade", nome: "b", estado: "enviando" },
    ]).frase).toBe("Enviando documentos: 1 de 2…");
    expect(resumoDoEnvio([{ id: "1", docType: "contrato_social", nome: "a", estado: "enviado" }]).frase).toBe("1 de 1 documento enviado.");
    expect(resumoDoEnvio([
      { id: "1", docType: "identidade", nome: "a", estado: "falhou", erro: "x" },
      { id: "2", docType: "identidade", nome: "b", estado: "falhou", erro: "y" },
    ]).frase).toBe("0 de 2 documentos enviados — 2 não subiram.");
  });
});
