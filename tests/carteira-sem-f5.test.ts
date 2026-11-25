// 25/11/2026: o cliente passado para alguém só aparecia depois de F5; e a oferta de passar as artes ao salvar.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Client } from "@/lib/types";

const { chamar, oferecer } = vi.hoisted(() => ({ chamar: vi.fn(), oferecer: vi.fn(async () => {}) }));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/chamar", () => ({ chamar }));
vi.mock("@/lib/design/passar-artes", () => ({ oferecerPassarArtes: oferecer }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {}, REALTIME_ENABLED: false }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn() }));
const { toast } = await import("sonner");
const { useClientsStore } = await import("@/stores/useClientsStore");
const st = () => useClientsStore.getState();
const cli = (id: string, assignedDesigner = "", extra = {}) => ({ id, name: id, assignedTraffic: "", assignedSocial: "", assignedDesigner, ...extra }) as unknown as Client;
const eq = (id: string, assignedDesigner = "") => ({ id, assignedTraffic: "", assignedSocial: "", assignedDesigner });
const resp = (data: unknown) => ({ ok: true, data, erro: null, status: 200 });
let agora = Date.UTC(2026, 10, 25);
beforeEach(() => {
  chamar.mockReset(); oferecer.mockClear();
  agora += 3_600_000; vi.setSystemTime(agora);
  useClientsStore.setState({ clients: [cli("a", "", { cpfCnpj: "guardado" }), cli("b", "Caio")], initialized: true, loading: false, erro: null });
});

describe("a carteira se confere sozinha", () => {
  it("designer novo aparece sem F5, e só os responsáveis mudam", async () => {
    chamar.mockResolvedValueOnce(resp({ equipe: [eq("a", "Téo"), eq("b", "Caio")] }));
    const b = st().clients[1];
    await st().atualizarEquipe();
    expect(st().clients[0]).toMatchObject({ assignedDesigner: "Téo", cpfCnpj: "guardado" });
    expect(st().clients[1]).toBe(b); // quem não mudou não redesenha
  });
  it("cliente novo entra; cliente que sumiu da resposta não some da tela de quem está nele", async () => {
    chamar.mockResolvedValueOnce(resp({ equipe: [eq("a"), eq("n", "Téo")] })).mockResolvedValueOnce(resp({ clients: [cli("a"), cli("n", "Téo")] }));
    await st().atualizarEquipe();
    expect(st().clients.map((c) => c.id)).toEqual(["a", "b", "n"]);
  });
  it("falha fica quieta e não apaga nada; não pergunta de novo em seguida", async () => {
    chamar.mockResolvedValue({ ok: false, data: null, erro: "caiu", status: 503 });
    await st().atualizarEquipe(); await st().atualizarEquipe();
    expect(st().clients).toHaveLength(2);
    expect(chamar).toHaveBeenCalledTimes(1);
  });
  it("resposta que saiu antes de um salvar é descartada; com um salvar em voo, nem pergunta", async () => {
    let solta!: (v: unknown) => void;
    chamar.mockImplementationOnce(() => new Promise((r) => { solta = r; })).mockResolvedValueOnce(resp({ client: { assigned_designer: "Téo" } }));
    const conferindo = st().atualizarEquipe();
    await st().updateClient("a", { assignedDesigner: "Téo" });
    solta(resp({ equipe: [eq("a", ""), eq("b", "Caio")] }));
    await conferindo;
    expect(st().clients[0].assignedDesigner).toBe("Téo");

    vi.setSystemTime((agora += 3_600_000));
    let salvar!: (v: unknown) => void;
    chamar.mockReset().mockImplementationOnce(() => new Promise((r) => { salvar = r; }));
    const salvando = st().updateClient("a", { assignedDesigner: "Ana" });
    await st().atualizarEquipe();
    expect(chamar).toHaveBeenCalledTimes(1);
    salvar(resp({ client: { assigned_designer: "Ana" } })); await salvando;
  });
  it("o casco confere em toda página", () => {
    const shell = readFileSync("components/AppShell.tsx", "utf8");
    expect(shell).toMatch(/setInterval\(conferir, 60_000\)/);
    expect(shell).toMatch(/addEventListener\("focus", conferir\)/);
  });
});

describe("trocou o designer do cliente", () => {
  it("oferece passar as artes abertas com o que o banco guardou", async () => {
    chamar.mockResolvedValueOnce(resp({ client: { assigned_designer: "Téo Braga" } }));
    await st().updateClient("a", { assignedDesigner: "Téo" });
    await vi.waitFor(() => expect(oferecer).toHaveBeenCalledWith("a", "", "Téo Braga"));
  });
  it("outro campo não oferece; falha não oferece e volta como estava", async () => {
    chamar.mockResolvedValueOnce(resp({ client: {} }));
    await st().updateClient("a", { notes: "oi" });
    chamar.mockResolvedValueOnce({ ok: false, data: null, erro: "não", status: 500 });
    await expect(st().updateClient("a", { assignedDesigner: "Téo" })).rejects.toThrow("não");
    expect(st().clients[0].assignedDesigner).toBe("");
    expect(oferecer).not.toHaveBeenCalled();
  });
});

describe("o que a revisão achou", () => {
  it("trocou para serviço sem social: o banco tira o social, a tela mostra e avisa", async () => {
    useClientsStore.setState({ clients: [cli("a", "Téo", { assignedSocial: "Bia" })] });
    chamar.mockResolvedValueOnce(resp({ client: { assigned_social: null, assigned_designer: "Téo", assigned_traffic: "" } }));
    await st().updateClient("a", { serviceType: "assessoria_trafego" });
    expect(st().clients[0]).toMatchObject({ assignedSocial: "", assignedDesigner: "Téo" });
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Bia saiu do social/), expect.anything());
  });
  it("carteira que não carregou: foco e troca de aba não viram uma rajada de pedidos", async () => {
    useClientsStore.setState({ initialized: false });
    chamar.mockResolvedValue({ ok: false, data: null, erro: "caiu", status: 503 });
    for (let i = 0; i < 5; i++) await st().atualizarEquipe();
    expect(chamar).toHaveBeenCalledTimes(1);
  });
  it("conferência com um cadastro em voo não duplica o cliente", async () => {
    let solta!: (v: unknown) => void;
    chamar.mockImplementationOnce(() => new Promise((r) => { solta = r; }));
    const cadastrando = st().addClient({ name: "n" } as never);
    await st().atualizarEquipe();
    expect(chamar).toHaveBeenCalledTimes(1);
    solta(resp({ id: "n" })); await cadastrando;
    expect(st().clients.filter((c) => c.id === "n")).toHaveLength(1);
  });
});
