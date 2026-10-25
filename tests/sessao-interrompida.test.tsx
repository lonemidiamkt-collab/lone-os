// tests/sessao-interrompida.test.tsx — 25/10/2026, onda 6 da auditoria de erro recuperável, 8.3, 8.4 e 8.5.
// A decisão inteira, do evento do Supabase à tela (não só o componente):
//  · 8.3 a sessão que cai (outra aba saiu, inatividade) NÃO troca a página pelo login: o formulário
//        aberto fica montado por baixo do pedido de senha; "Sair" e a inatividade usam signOut LOCAL;
//  · 8.4 o pedido que voltou 401 espera a pessoa entrar de novo e é repetido sozinho;
//  · 8.5 o login diz por que não entrou (senha × rede × limite), e só a senha errada apaga o campo.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

type Sessao = { access_token: string; expires_at: number; user: { id: string; email: string } } | null;
const sb = vi.hoisted(() => ({
  sessao: null as Sessao,
  ouvinte: null as null | ((evento: string, s: unknown) => void),
  signOuts: [] as unknown[],
  senhaCerta: "certa",
  falhaDeRede: false,
}));
const novaSessao = (tok: string): Sessao => ({ access_token: tok, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "u-thiago", email: "thiago@lonemidia.com" } });

vi.mock("@/lib/supabase/client", () => ({
  REALTIME_ENABLED: false,
  supabase: {
    from: () => { throw new Error("sem banco no teste"); },
    auth: {
      getSession: async () => ({ data: { session: sb.sessao } }),
      refreshSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => { sb.ouvinte = cb; return { data: { subscription: { unsubscribe: () => {} } } }; },
      signInWithPassword: async ({ password }: { email: string; password: string }) => {
        if (sb.falhaDeRede) return { data: { session: null, user: null }, error: { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" } };
        if (password !== sb.senhaCerta) return { data: { session: null, user: null }, error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" } };
        sb.sessao = novaSessao("token-novo");
        sb.ouvinte?.("SIGNED_IN", sb.sessao);
        return { data: { session: sb.sessao, user: sb.sessao!.user }, error: null };
      },
      signOut: async (opts?: unknown) => { sb.signOuts.push(opts); sb.sessao = null; sb.ouvinte?.("SIGNED_OUT", null); return { error: null }; },
      mfa: {
        listFactors: async () => ({ data: { all: [], totp: [] }, error: null }),
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      },
    },
  },
}));

const servidor = vi.hoisted(() => ({ tokensValidos: new Set<string>(), chamadasSalvar: [] as string[] }));
vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
  const auth = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "";
  if (url === "/api/team/roster") {
    return new Response(JSON.stringify({ profiles: [{ id: "thiago", name: "Thiago", role: "social", initials: "TH", color: "", email: "thiago@lonemidia.com", teamMemberId: "tm-thiago" }] }), { status: 200 });
  }
  if (url === "/api/auth/team-member") {
    return servidor.tokensValidos.has(auth) ? new Response(JSON.stringify({ id: "tm-thiago" }), { status: 200 }) : new Response("{}", { status: 401 });
  }
  if (url === "/api/salvar") {
    servidor.chamadasSalvar.push(auth);
    return servidor.tokensValidos.has(auth) ? new Response("{\"ok\":true}", { status: 200 }) : new Response("{}", { status: 401 });
  }
  return new Response("{}", { status: 404 });
}));

const { RoleProvider, useRole } = await import("@/lib/context/RoleContext");
const { AuthGate } = await import("@/components/AppShell");
const { authedFetch } = await import("@/lib/supabase/authed-fetch");

function Pagina() {
  const { logout, login } = useRole();
  return (
    <div>
      <label>Legenda do post <input aria-label="legenda" defaultValue="" /></label>
      <button onClick={() => void logout()}>Sair</button>
      <button onClick={() => void login("thiago", "x")}>noop</button>
    </div>
  );
}

const montar = () => render(<RoleProvider><AuthGate><Pagina /></AuthGate></RoleProvider>);

beforeEach(() => {
  sb.sessao = novaSessao("token-1");
  sb.signOuts.length = 0;
  sb.falhaDeRede = false;
  servidor.tokensValidos = new Set(["token-1"]);
  servidor.chamadasSalvar.length = 0;
});

describe("8.3: sessão que cai não apaga a página", () => {
  it("outra aba saiu: o formulário continua digitado por baixo do pedido de senha; entrou de novo, segue igual", async () => {
    montar();
    const campo = await screen.findByLabelText("legenda");
    fireEvent.change(campo, { target: { value: "Promoção de sexta, texto pela metade" } });

    await act(async () => { sb.sessao = null; sb.ouvinte?.("SIGNED_OUT", null); });
    expect(await screen.findByRole("dialog")).toHaveTextContent(/Sua sessão expirou/);
    expect(screen.getByLabelText("legenda")).toHaveValue("Promoção de sexta, texto pela metade");

    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "errada" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Senha incorreta/);

    servidor.tokensValidos.add("token-novo");
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "certa" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("legenda")).toHaveValue("Promoção de sexta, texto pela metade");
  });

  it("'Sair' de propósito: signOut LOCAL (não derruba celular e outros computadores) e volta à tela de login", async () => {
    montar();
    await screen.findByLabelText("legenda");
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByText(/Bem-vindo de volta/)).toBeInTheDocument();
    expect(sb.signOuts).toEqual([{ scope: "local" }]);
    expect(screen.queryByLabelText("legenda")).not.toBeInTheDocument();
  });
});

describe("8.4: o pedido que voltou 401 é repetido depois de entrar de novo", () => {
  it("o 'Salvando…' termina sozinho com o token novo, sem recarregar a página", async () => {
    montar();
    await screen.findByLabelText("legenda");
    servidor.tokensValidos.delete("token-1"); // o servidor passou a recusar a sessão

    let resposta: Response | null = null;
    const pedido = authedFetch("/api/salvar", { method: "POST", body: "{\"legenda\":\"x\"}" }).then((r) => { resposta = r; });
    expect(await screen.findByRole("dialog")).toHaveTextContent(/Sua sessão expirou/);
    expect(resposta).toBeNull(); // ainda esperando, em vez de devolver o erro

    servidor.tokensValidos.add("token-novo");
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "certa" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    await pedido;
    expect(resposta!.status).toBe(200);
    expect(servidor.chamadasSalvar.at(-1)).toBe("token-novo");
  });

  it("401 que é falta de permissão (sessão boa) não cobre a página", async () => {
    montar();
    await screen.findByLabelText("legenda");
    // /api/salvar recusa o token-1, mas /api/auth/team-member aceita: é permissão, não sessão.
    const original = servidor.tokensValidos;
    servidor.tokensValidos = new Set(["token-1"]);
    const naoSalva = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => (url === "/api/salvar" ? new Response("{}", { status: 401 }) : naoSalva(url as string, init)));
    const r = await authedFetch("/api/salvar", { method: "POST" });
    expect(r.status).toBe(401);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    vi.mocked(fetch).mockImplementation(naoSalva);
    servidor.tokensValidos = original;
  });
});

describe("8.5: login diz o motivo", () => {
  it("rede caída não diz 'senha incorreta' nem apaga a senha", async () => {
    sb.sessao = null;
    montar();
    fireEvent.click(await screen.findByText(/Selecione um usuário/));
    fireEvent.click(await screen.findByRole("button", { name: /Thiago/ }));
    const senha = screen.getByPlaceholderText("Sua senha");
    fireEvent.change(senha, { target: { value: "minha-senha" } });
    sb.falhaDeRede = true;
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeInTheDocument();
    expect(screen.queryByText(/Senha incorreta/)).not.toBeInTheDocument();
    expect(screen.queryByText(/modo local/i)).not.toBeInTheDocument();
    expect(senha).toHaveValue("minha-senha");
  });
});
