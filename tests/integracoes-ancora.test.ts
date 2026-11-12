import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { assinar } from "@/lib/crm/site-lead";
import { mensagemDoGet, montarPedidoDeLink, nomeDoCliente, resumoDoEstado, type ClienteParaAncora, type EstadoDoCliente } from "@/lib/integracoes/ancora";

// 12/11/2026 — o conector do Âncora CRM. O que não pode acontecer: assinar diferente do que o Âncora confere;
// mandar ao Âncora dado que não veio do cadastro; gerar link sem e-mail; dizer "sem acesso" quando não conferiu.

const cliente = (extra: Partial<ClienteParaAncora> = {}): ClienteParaAncora => ({
  id: "11111111-1111-4111-8111-111111111111", name: "Loja de Piso LTDA", nome_fantasia: "Loja de Piso",
  razao_social: "Loja de Piso Comércio LTDA", cnpj: "12.345.678/0001-90", contact_name: "Fulano de Tal",
  email: " Dono@Loja.com.br ", phone: "(22) 99999-0000", contact_phone: null, instagram_user: "@lojadepiso",
  endereco_cidade: "Cabo Frio", endereco_estado: "rj", ...extra,
});
const opcoes = { plano: "base" as const, diasDeTeste: 14, parceria: false, emitidoPor: "roberto@lonemidia.com" };

describe("assinatura — a mesma língua do Âncora", () => {
  it("GET em forma canônica: a vírgula sai codificada e os parâmetros em ordem", () => {
    // o Âncora (lib/parceiro/assinatura.ts, teste porta-de-parceiro) confere exatamente esta mensagem
    expect(mensagemDoGet("/api/parceiro/convites", { refs: "a,b" })).toEqual({
      mensagem: "GET /api/parceiro/convites?refs=a%2Cb", url: "/api/parceiro/convites?refs=a%2Cb",
    });
    expect(mensagemDoGet("/p", { to: "2", from: "1" }).mensagem).toBe("GET /p?from=1&to=2");
    expect(mensagemDoGet("/p", {}).mensagem).toBe("GET /p");
  });
  it("sha256= + hmac de `${timestamp}.${mensagem}`", () => {
    const esperado = "sha256=" + createHmac("sha256", "k").update("1.m").digest("hex");
    expect(assinar("k", "1", "m")).toBe(esperado);
  });
});

describe("o pedido de link sai do cadastro", () => {
  it("monta com o que a ficha tem, limpo", () => {
    const r = montarPedidoDeLink(cliente(), opcoes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.corpo).toMatchObject({
      ref_externa: "11111111-1111-4111-8111-111111111111", email: "dono@loja.com.br", nome_empresa: "Loja de Piso",
      plan_id: "base", trial_dias: 14, parceria: false, pedir_acesso_da_agencia: true, emitido_por: "roberto@lonemidia.com",
      dados: { responsavel: "Fulano de Tal", telefone: "22999990000", cidade: "Cabo Frio", uf: "RJ", instagram: "lojadepiso",
        razao_social: "Loja de Piso Comércio LTDA", cnpj: "12.345.678/0001-90" },
    });
  });
  it("campo vazio não vai (o Âncora recusa chave desconhecida, e vazio não é dado)", () => {
    const r = montarPedidoDeLink(cliente({ contact_name: null, phone: null, instagram_user: "  ", cnpj: null, razao_social: null, endereco_cidade: null, endereco_estado: null }), opcoes);
    expect(r.ok && r.corpo.dados).toEqual({});
  });
  it("sem nome fantasia usa o nome do cadastro", () => {
    expect(nomeDoCliente({ nome_fantasia: " ", name: "Ótica Vista" })).toBe("Ótica Vista");
  });
  it.each([
    ["sem e-mail", cliente({ email: null }), opcoes, "o e-mail do cliente"],
    ["e-mail torto", cliente({ email: "sem-arroba" }), opcoes, "o e-mail do cliente"],
    ["sem nome", cliente({ name: null, nome_fantasia: null }), opcoes, "o nome do cliente"],
    ["zero dias", cliente(), { ...opcoes, diasDeTeste: 0 }, "dias de teste entre 1 e 90"],
    ["sem autor", cliente(), { ...opcoes, emitidoPor: "" }, "quem está gerando o link"],
  ])("recusa %s dizendo o que falta", (_n, c, o, falta) => {
    expect(montarPedidoDeLink(c, o)).toEqual({ ok: false, falta });
  });
});

describe("o estado numa frase", () => {
  const AGORA = Date.parse("2026-11-12T12:00:00Z");
  const e = (extra: Partial<EstadoDoCliente>): EstadoDoCliente => ({
    ref_externa: "x", estado: "sem_convite", link: null, expira_em: null, gerado_em: null, cadastrou_em: null, plano: null, parceria: false, empresa: null, ...extra,
  });
  it("cada estado tem a sua", () => {
    expect(resumoDoEstado(null, AGORA).rotulo).toBe("Sem acesso");
    expect(resumoDoEstado(e({ estado: "vencido" }), AGORA)).toEqual({ rotulo: "Link vencido", tom: "atencao" });
    expect(resumoDoEstado(e({ estado: "link_gerado", expira_em: "2026-11-15T12:00:00Z" }), AGORA).rotulo).toBe("Link gerado · vale 3 dias");
    const emp = { nome: "L", assinatura: null, whatsapp_conectado: false, acesso_da_agencia: false };
    expect(resumoDoEstado(e({ estado: "cadastrou", empresa: emp }), AGORA).tom).toBe("atencao");
    expect(resumoDoEstado(e({ estado: "cadastrou", empresa: { ...emp, whatsapp_conectado: true } }), AGORA)).toEqual({ rotulo: "Cadastrou · WhatsApp conectado", tom: "ok" });
  });
});

describe("as rotas", () => {
  const ler = (f: string) => readFileSync(f, "utf8");
  it("só gestão (admin e gestor) lê e gera", () => {
    for (const f of ["app/api/ancora/route.ts", "app/api/ancora/link/route.ts"]) {
      const s = ler(f);
      for (const bloco of s.split("export async function ").slice(1)) expect(bloco, f).toContain("requireRole(req, GESTAO)");
    }
  });
  it("o que vai ao Âncora sai do cadastro, não do navegador", () => {
    const s = ler("app/api/ancora/link/route.ts");
    expect(s).toContain("montarPedidoDeLink(");
    expect(s).toContain('.from("clients").select(COLUNAS_DO_CLIENTE)');
  });
  it("Âncora fora do ar não vira 'sem acesso': o estado sai nulo, com o erro dito", () => {
    const s = ler("app/api/ancora/route.ts");
    expect(s).toContain("estado: ligada && !erro ? (estados.get(c.id) ?? null) : null");
  });
  it("o segredo nunca vai para o navegador", () => {
    expect(ler("lib/integracoes/ancora-server.ts")).toContain('import "server-only"');
    expect(ler("app/ancora/page.tsx")).not.toMatch(/ancora-server|process\.env/);
  });
});
