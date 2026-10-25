// tests/portal-upload-lista.test.tsx — "Enviar material" do portal (24/10/2026, item 1.11), a TELA.
// Antes, escolher o arquivo já enviava: sem lista, sem como tirar o errado. Agora escolher só põe na
// lista (com Remover), o "Enviar" manda os que ficaram e pede UM aviso ao time no fim.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const chamadas: { url: string; corpo: unknown }[] = [];
let avisoOk = true;
vi.mock("@/lib/api/chamar", () => ({
  chamar: async (url: string, corpo?: unknown) => {
    chamadas.push({ url, corpo });
    if (url.endsWith("/upload/aviso")) return avisoOk ? { ok: true, data: { ok: true }, erro: null, status: 200 } : { ok: false, data: null, erro: "falhou", status: 502 };
    return { ok: true, data: { ok: true, id: `id-${chamadas.length}` }, erro: null, status: 200 };
  },
}));

const { default: PortalUpload } = await import("@/components/portal/PortalUpload");

const arquivo = (nome: string) => new File([new Uint8Array([1, 2, 3])], nome, { type: "image/jpeg" });
const escolher = (...nomes: string[]) =>
  fireEvent.change(document.getElementById("portal-upload-input")!, { target: { files: nomes.map(arquivo) } });

beforeEach(() => { chamadas.length = 0; avisoOk = true; });

describe("Portal › Enviar material", () => {
  it("escolher não envia; dá para remover o errado; Enviar manda o resto e pede UM aviso", async () => {
    render(<PortalUpload token="tok" clientName="Padaria" />);
    escolher("produto.jpg", "errada.jpg", "loja.jpg");
    expect(chamadas).toHaveLength(0);
    expect(screen.getByText("errada.jpg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remover errada.jpg" }));
    expect(screen.queryByText("errada.jpg")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Enviar 2 arquivos/ }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith("/upload/aviso"))).toBe(true));

    const uploads = chamadas.filter((c) => c.url === "/api/portal/tok/upload");
    expect(uploads).toHaveLength(2);
    const nomes = uploads.map((c) => ((c.corpo as FormData).get("arquivo") as File).name);
    expect(nomes).toEqual(["produto.jpg", "loja.jpg"]);
    for (const c of uploads) expect((c.corpo as FormData).get("avisar")).toBe("depois");
    const lote = (uploads[0].corpo as FormData).get("lote");
    expect((uploads[1].corpo as FormData).get("lote")).toBe(lote);
    const avisos = chamadas.filter((c) => c.url.endsWith("/upload/aviso"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0].corpo).toMatchObject({ lote, ids: ["id-1", "id-2"] });
    expect(await screen.findByText(/o time já foi avisado/)).toBeInTheDocument();
  });

  it("aviso que falha aparece como falha, com 'Avisar o time'", async () => {
    avisoOk = false;
    render(<PortalUpload token="tok" clientName="Padaria" />);
    escolher("produto.jpg");
    fireEvent.click(screen.getByRole("button", { name: /Enviar 1 arquivo/ }));
    expect(await screen.findByText(/não consegui avisar o time agora/)).toBeInTheDocument();
    avisoOk = true;
    fireEvent.click(screen.getByRole("button", { name: "Avisar o time" }));
    expect(await screen.findByText(/o time já foi avisado/)).toBeInTheDocument();
  });

  it("arquivo acima do limite não entra na lista e o motivo é dito antes de enviar", () => {
    render(<PortalUpload token="tok" clientName="Padaria" />);
    const grande = new File([new Uint8Array(1)], "video.mp4", { type: "video/mp4" });
    Object.defineProperty(grande, "size", { value: 30 * 1024 * 1024 });
    fireEvent.change(document.getElementById("portal-upload-input")!, { target: { files: [grande] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/passa de 25 MB/);
    expect(screen.queryByRole("button", { name: /Enviar/ })).not.toBeInTheDocument();
  });
});
