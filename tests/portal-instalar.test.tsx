// tests/portal-instalar.test.tsx — convite para instalar o Painel de Resultados e a tela "sem conexão"
// (lib/portal/instalar.ts, components/portal/PortalInstalar, public/sw.js). Leva 4, 19/11/2026.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CHAVE_DISPENSADO, modoNoIphone } from "@/lib/portal/instalar";
import PortalInstalar from "@/components/portal/PortalInstalar";

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1";
const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const IPAD_COMO_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";

describe("o que dizer no iPhone", () => {
  it("Safari instala; outro navegador ou aplicativo precisa abrir no Safari", () => {
    expect(modoNoIphone(SAFARI, { instalado: false })).toBe("safari");
    expect(modoNoIphone(CHROME_IOS, { instalado: false })).toBe("outro");
    expect(modoNoIphone(INSTAGRAM, { instalado: false })).toBe("outro");
  });

  it("já instalado, Android e computador: nada (no Android quem avisa é o navegador)", () => {
    expect(modoNoIphone(SAFARI, { instalado: true })).toBe("nenhum");
    expect(modoNoIphone(ANDROID, { instalado: false })).toBe("nenhum");
    expect(modoNoIphone(IPAD_COMO_MAC, { instalado: false, pontosDeToque: 0 })).toBe("nenhum"); // é um Mac
  });

  it("iPad que se apresenta como Mac é reconhecido pela tela de toque", () => {
    expect(modoNoIphone(IPAD_COMO_MAC, { instalado: false, pontosDeToque: 5 })).toBe("safari");
  });
});

function comNavegador(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

describe("o cartão de instalar", () => {
  const uaOriginal = window.navigator.userAgent;
  beforeEach(() => {
    window.localStorage.clear();
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => comNavegador(uaOriginal));

  it("computador sem convite do navegador: não aparece", () => {
    const { container } = render(<PortalInstalar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("iPhone no Safari: mostra o caminho; 'Agora não' guarda a escolha e dá para trazer de volta", () => {
    comNavegador(SAFARI);
    render(<PortalInstalar />);
    expect(screen.getByText("Adicionar à Tela de Início")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Instalar" })).toBeNull(); // no iPhone não existe botão

    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByText("Adicionar à Tela de Início")).toBeNull();
    expect(window.localStorage.getItem(CHAVE_DISPENSADO)).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Colocar o painel na tela do celular" }));
    expect(screen.getByText("Adicionar à Tela de Início")).toBeInTheDocument();
    expect(window.localStorage.getItem(CHAVE_DISPENSADO)).toBeNull();
  });

  it("quem já dispensou vê só o link discreto na próxima visita", () => {
    comNavegador(SAFARI);
    window.localStorage.setItem(CHAVE_DISPENSADO, "1");
    render(<PortalInstalar />);
    expect(screen.queryByText("Adicionar à Tela de Início")).toBeNull();
    expect(screen.getByRole("button", { name: "Colocar o painel na tela do celular" })).toBeInTheDocument();
  });

  it("iPhone fora do Safari: manda abrir no Safari; cópia que falha aparece como falha", async () => {
    comNavegador(INSTAGRAM);
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("negado")) }, configurable: true });
    render(<PortalInstalar />);
    expect(screen.getByText(/só funciona pelo/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Copiar link/ })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Não consegui copiar");
    expect(screen.queryByText("Link copiado.")).toBeNull();
  });

  it("Android: o botão Instalar abre o convite do navegador; recusar tira o cartão", async () => {
    render(<PortalInstalar />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const evento = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "dismissed" as const }) });
    act(() => { window.dispatchEvent(evento); });
    expect(evento.defaultPrevented).toBe(true); // o convite é nosso, não a faixa automática do navegador

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Instalar" })); });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Instalar" })).toBeNull();
    expect(window.localStorage.getItem(CHAVE_DISPENSADO)).toBe("1");
  });
});

// ── Service worker: só a abertura do portal ganha a tela "sem conexão" ──
describe("service worker", () => {
  type Ouvinte = (e: { request: { mode: string; url: string }; respondWith: (r: Promise<unknown>) => void; waitUntil: (p: Promise<unknown>) => void }) => void;
  function carregar(rede: () => Promise<unknown>) {
    const ouvintes: Record<string, Ouvinte> = {};
    const guardado = { nome: "tela-sem-conexao" };
    const caches = {
      open: async () => ({ add: async () => {} }),
      keys: async () => ["lone-os-v1", "lone-os-v2"],
      delete: vi.fn(async () => true),
      match: vi.fn(async () => guardado),
    };
    const self = { addEventListener: (t: string, f: Ouvinte) => { ouvintes[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
    vm.runInNewContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), { self, caches, fetch: rede, URL, Request: class { constructor(public url: string) {} }, Response: { error: () => "erro" } });
    return { ouvintes, caches, guardado };
  }
  const pedir = (o: Ouvinte, mode: string, url: string) => {
    let resposta: Promise<unknown> | undefined;
    o({ request: { mode, url }, respondWith: (r) => { resposta = r; }, waitUntil: () => {} });
    return resposta;
  };

  it("abrir o portal sem rede devolve a tela 'sem conexão'", async () => {
    const { ouvintes, guardado } = carregar(() => Promise.reject(new Error("offline")));
    await expect(pedir(ouvintes.fetch, "navigate", "https://resultados.lonemidia.com/portal/abc?aba=google")).resolves.toBe(guardado);
  });

  it("com rede, o portal vem da rede (nunca do cache)", async () => {
    const { ouvintes, caches } = carregar(() => Promise.resolve("da-rede"));
    await expect(pedir(ouvintes.fetch, "navigate", "https://resultados.lonemidia.com/portal/abc")).resolves.toBe("da-rede");
    expect(caches.match).not.toHaveBeenCalled();
  });

  it("painel do time, API e arquivos não passam pelo service worker", () => {
    const { ouvintes } = carregar(() => Promise.reject(new Error("offline")));
    expect(pedir(ouvintes.fetch, "navigate", "https://painel.lonemidia.com/clients")).toBeUndefined();
    expect(pedir(ouvintes.fetch, "cors", "https://resultados.lonemidia.com/api/portal/abc/snapshot")).toBeUndefined();
    expect(pedir(ouvintes.fetch, "no-cors", "https://resultados.lonemidia.com/portal/abc/manifest.webmanifest")).toBeUndefined();
  });

  it("ao ativar, apaga os caches de versões antigas e mantém o atual", async () => {
    const { ouvintes, caches } = carregar(() => Promise.resolve("ok"));
    let espera: Promise<unknown> = Promise.resolve();
    ouvintes.activate({ request: { mode: "", url: "" }, respondWith: () => {}, waitUntil: (p) => { espera = p; } });
    await espera;
    expect(caches.delete).toHaveBeenCalledWith("lone-os-v1");
    expect(caches.delete).not.toHaveBeenCalledWith("lone-os-v2");
  });
});
