// @vitest-environment node
// tests/onboarding-upload.test.ts — envio de arquivo do link de cadastro (24/10/2026).
//   1.5  o limite era 1 upload por IP a cada 5 s: o 2º e o 3º arquivo da seleção levavam 429. Agora é
//        por link (N por minuto), e a página tenta de novo sozinha o que levar 429.
//   1.13 num campo de vários arquivos de cliente JÁ ativo, a ficha ficava só com o último arquivo.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

const banco = bancoEmMemoria();
const subidos: string[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: banco.supabaseAdmin.from,
    storage: { from: () => ({ upload: async (path: string) => { subidos.push(path); return { error: null }; } }) },
  }),
}));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => null }));

const { POST } = await import("@/app/api/onboarding/upload/route");
const {
  enviarComNovaTentativa, esperaAntesDaTentativa, valeTentarDeNovo, motivoDoArquivoQueNaoSubiu, LIMITE_UPLOAD,
} = await import("@/lib/onboarding/upload");
const { valorAposUpload } = await import("@/lib/onboarding/docs");

const CLIENTE = "11111111-2222-3333-4444-555555555555";

function envio(token: string, docType = "contrato_social", nome = "cartao.pdf") {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array([37, 80, 68, 70])], nome, { type: nome.endsWith(".png") ? "image/png" : "application/pdf" }));
  fd.append("clientId", CLIENTE);
  fd.append("docType", docType);
  fd.append("token", token);
  return POST(new NextRequest("http://x/api/onboarding/upload", { method: "POST", body: fd }));
}

beforeEach(() => {
  banco.limpar();
  subidos.length = 0;
  banco.db.client_onboarding_submissions = ["ob-a", "ob-b", "ob-c", "ob-d"].map((token, i) => ({ id: `s${i}`, token, client_id: CLIENTE }));
  banco.db.clients = [{ id: CLIENTE, name: "Padaria", draft_status: null, doc_contrato_social: null, doc_logo: null }];
});

describe("1.5 limite por link, não 1 por IP a cada 5 s", () => {
  it("o erro original: 3 arquivos seguidos do mesmo cliente passam todos", async () => {
    const r = [await envio("ob-a"), await envio("ob-a"), await envio("ob-a")];
    expect(r.map((x) => x.status)).toEqual([200, 200, 200]);
  });

  it("passou do limite do link: 429 com Retry-After, e outro link não é afetado", async () => {
    for (let i = 0; i < LIMITE_UPLOAD.porToken; i++) expect((await envio("ob-b")).status).toBe(200);
    const estourou = await envio("ob-b");
    expect(estourou.status).toBe(429);
    expect(Number(estourou.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await estourou.json()).error).toMatch(/tenta de novo sozinha/);
    expect((await envio("ob-c")).status).toBe(200);
  });
});

describe("1.13 campo de vários arquivos acrescenta na ficha", () => {
  it("cliente ativo com uma página do cartão CNPJ: a segunda entra junto, não no lugar", async () => {
    banco.db.clients[0].doc_contrato_social = "legal://antiga/pagina1.pdf";
    const r = await envio("ob-d");
    const { url } = await r.json();
    expect(banco.db.clients[0].doc_contrato_social).toBe(`legal://antiga/pagina1.pdf\n${url}`);
  });

  it("regra: vários acrescenta (sem repetir); o logo troca", () => {
    expect(valorAposUpload("doc_contrato_social", "a", "b")).toBe("a\nb");
    expect(valorAposUpload("doc_identidade", null, "b")).toBe("b");
    expect(valorAposUpload("doc_contrato_social", "a\nb", "b")).toBe("a\nb");
    expect(valorAposUpload("doc_logo", "a", "b")).toBe("b");
  });

  it("sem conseguir ler a ficha, não sobrescreve (as outras páginas ficariam perdidas)", async () => {
    banco.db.clients[0].doc_contrato_social = "legal://antiga/pagina1.pdf";
    banco.falharEm("clients", "select", { message: "timeout" });
    const r = await envio("ob-d");
    expect(r.status).toBe(200);
    expect(banco.db.clients[0].doc_contrato_social).toBe("legal://antiga/pagina1.pdf");
  });
});

describe("a página tenta de novo sozinha", () => {
  const sem = async () => {};
  it("429 → espera → manda de novo; o que passou fica", async () => {
    const respostas = [{ status: 429, retryAfterS: 10 }, { status: 200 }];
    const esperas: number[] = [];
    const r = await enviarComNovaTentativa(async () => respostas.shift()!, { dormir: async (ms) => { esperas.push(ms); } });
    expect(r.status).toBe(200);
    expect(esperas).toEqual([10_000]); // respeita o Retry-After
  });
  it("rede caída e deploy também tentam; erro do arquivo (formato, tamanho) não", async () => {
    expect(valeTentarDeNovo(0)).toBe(true);
    expect(valeTentarDeNovo(503)).toBe(true);
    expect(valeTentarDeNovo(400)).toBe(false);
    let n = 0;
    const r = await enviarComNovaTentativa(async () => { n++; return { status: 400 }; }, { dormir: sem });
    expect(r.status).toBe(400);
    expect(n).toBe(1);
  });
  it("desiste depois de 3 novas tentativas e devolve o motivo para a lista do que não subiu", async () => {
    let n = 0;
    const r = await enviarComNovaTentativa(async () => { n++; return { status: 429 }; }, { dormir: sem });
    expect(n).toBe(4);
    expect(motivoDoArquivoQueNaoSubiu(r.status)).toMatch(/muitos arquivos seguidos/);
    expect(motivoDoArquivoQueNaoSubiu(400, "Formato não suportado.")).toBe("Formato não suportado.");
  });
  it("espera cresce: 3 s, 8 s, 15 s", () => {
    expect([1, 2, 3, 9].map((n) => esperaAntesDaTentativa(n))).toEqual([3_000, 8_000, 15_000, 15_000]);
  });
});
