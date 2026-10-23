// "Enviar pro cliente" (lib/cs/envio-aprovacao.ts) — auditoria de erro recuperável 21/10/2026,
// itens 2.2 e 2.3. Cada bloco reproduz o erro que existia.
import { describe, it, expect } from "vitest";
import {
  assinaturaDaPrevia, chaveDoEnvio, decidirEnvio, escolherArtesParaCliente, mandarArtes, opcoesDeEnvio,
  podeEnviarAoCliente, resumoDoEnvio, situacaoDoEnvio, statusDoResultado, textoDoEnvio, variacoesDoTexto,
  ENVIO_TRAVADO_MS, type AnexoDoCard, type ArteDoEnvio, type EnvioRegistrado, type RespostaDoMensageiro,
} from "@/lib/cs/envio-aprovacao";

const img = (n: string) => `https://painel.lonemidia.com/storage/v1/object/public/arts/c1/${n}.png`;

describe("2.3 — só arte entregue e sem alteração pedida vai ao cliente", () => {
  it("arte não entregue: recusa", () => {
    const p = podeEnviarAoCliente({ entregueEm: null });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.motivo).toMatch(/ainda não foi entregue/);
  });
  it("alteração pedida: recusa (antes ia a versão reprovada e o card pulava pra Com o cliente)", () => {
    const p = podeEnviarAoCliente({ entregueEm: "2026-10-20T10:00:00Z", alteracaoPendenteEm: "2026-10-21T09:00:00Z" });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.motivo).toMatch(/alteração pedida/);
  });
  it("arquivado: recusa", () => {
    expect(podeEnviarAoCliente({ entregueEm: "2026-10-20T10:00:00Z", arquivadoEm: "2026-10-21T09:00:00Z" }).ok).toBe(false);
  });
  it("entregue e sem alteração: pode", () => {
    expect(podeEnviarAoCliente({ entregueEm: "2026-10-20T10:00:00Z", alteracaoPendenteEm: null }).ok).toBe(true);
  });
});

describe("quais artes vão", () => {
  const anexos: AnexoDoCard[] = [
    { id: "ref", url: img("ref"), tipo: "referencia", position: 0 },
    { id: "v1", url: img("v1"), tipo: "entrega", delivery_id: "d1", position: 1 },
    { id: "v2a", url: img("v2a"), tipo: "entrega", delivery_id: "d2", position: 3 },
    { id: "v2b", url: img("v2b"), tipo: "entrega", delivery_id: "d2", position: 2 },
    { id: "solta", url: img("solta"), tipo: "entrega", delivery_id: null, position: 4 },
  ];

  it("só a entrega ATUAL, na ordem; referência, versão anterior e arte não entregue ficam de fora", () => {
    const e = escolherArtesParaCliente(anexos, "d2", null);
    expect(e.artes.map((a) => a.id)).toEqual(["v2b", "v2a"]);
    expect(e.fora).toMatchObject({ referencias: 1, versaoAnterior: 1, naoEntregues: 1 });
    expect(e.erro).toBeNull();
  });

  it("referência nunca sai — nem disfarçada de capa do card", () => {
    const soRef: AnexoDoCard[] = [{ id: "ref", url: img("ref"), tipo: "referencia" }];
    const e = escolherArtesParaCliente(soRef, null, img("ref"));
    expect(e.artes).toEqual([]);
    expect(e.erro).toMatch(/só tem referência/);
  });

  it("entrega por link do Drive: diz que o envio só manda imagem", () => {
    const e = escolherArtesParaCliente([], "d3", "https://drive.google.com/file/d/abc/view");
    expect(e.artes).toEqual([]);
    expect(e.erro).toMatch(/link/);
  });

  it("card antigo sem versão registrada nem marca de entrega: vai o sem classificação, com aviso", () => {
    const e = escolherArtesParaCliente([{ id: "x", url: img("x"), tipo: null }, { id: "r", url: img("r"), tipo: "referencia" }], null, null);
    expect(e.artes.map((a) => a.id)).toEqual(["x"]);
    expect(e.legado).toBe(true);
  });
});

describe("chave e texto", () => {
  const artes: ArteDoEnvio[] = [{ id: "a", url: img("a") }, { id: "b", url: img("b") }];

  it("o mesmo conjunto de artes dá a mesma chave, em qualquer ordem; outro conjunto, outra chave", () => {
    expect(chaveDoEnvio("c1", artes)).toBe(chaveDoEnvio("c1", [...artes].reverse()));
    expect(chaveDoEnvio("c1", artes)).not.toBe(chaveDoEnvio("c1", [artes[0]]));
    expect(chaveDoEnvio("c1", artes).startsWith("c1:")).toBe(true);
  });

  it("o texto é determinado pela chave: a prévia mostra exatamente o que vai sair", () => {
    const k = chaveDoEnvio("c1", artes);
    expect(textoDoEnvio(2, k)).toBe(textoDoEnvio(2, k));
    expect(variacoesDoTexto(2)).toContain(textoDoEnvio(2, k));
    expect(textoDoEnvio(2, k)).toMatch(/as 2 artes/);
  });
});

function envio(p: Partial<EnvioRegistrado>): EnvioRegistrado {
  return {
    id: "e1", chave: "c1:k", tentativa: 1, status: "enviado", enviadas: 2, total: 2,
    artes: [], resultado: [], texto: "oi", enviado_por: "Ana", criado_em: "2026-10-21T13:00:00Z", ...p,
  };
}

describe("2.2 — repetição só com reenvio explícito", () => {
  const artes: ArteDoEnvio[] = [{ id: "a", url: img("a") }, { id: "b", url: img("b") }, { id: "c", url: img("c") }];
  const chave = chaveDoEnvio("c1", artes);
  const texto = textoDoEnvio(3, chave);
  const jid = "120363@g.us";
  const agoraMs = new Date("2026-10-21T14:00:00Z").getTime();

  it("primeiro envio: uma opção, com tudo e o texto", () => {
    const o = opcoesDeEnvio(artes, texto, [], agoraMs);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ modo: "primeiro", tentativa: 1, texto });
  });

  it("clicar de novo (o erro original): recusa e diz quando e quem enviou", () => {
    const anteriores = [envio({ chave, enviadas: 3, total: 3 })];
    const previa = assinaturaDaPrevia({ chave, jid, plano: { modo: "primeiro", artes, texto, tentativa: 1 } });
    const d = decidirEnvio({ chave, jid, artes, texto, envios: anteriores, agoraMs }, { previa, modo: "primeiro" });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.motivo).toMatch(/já foram enviadas.*por Ana.*3 de 3.*Reenviar/);
  });

  it("reenviar com a prévia certa passa, como nova tentativa", () => {
    const anteriores = [envio({ chave, resultado: artes.map((a) => ({ ...a, ok: true })) })];
    const plano = opcoesDeEnvio(artes, texto, anteriores, agoraMs).find((o) => o.modo === "todas")!;
    const d = decidirEnvio({ chave, jid, artes, texto, envios: anteriores, agoraMs }, { previa: assinaturaDaPrevia({ chave, jid, plano }), modo: "todas" });
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.plano).toMatchObject({ tentativa: 2, reenvioDe: "e1" });
  });

  it("a mesma requisição repetida depois do reenvio é recusada (a prévia não vale mais)", () => {
    const e1 = envio({ chave, resultado: artes.map((a) => ({ ...a, ok: true })) });
    const planoDaPrevia = opcoesDeEnvio(artes, texto, [e1], agoraMs).find((o) => o.modo === "todas")!;
    const previa = assinaturaDaPrevia({ chave, jid, plano: planoDaPrevia });
    const e2 = envio({ id: "e2", chave, tentativa: 2, resultado: artes.map((a) => ({ ...a, ok: true })) });
    const d = decidirEnvio({ chave, jid, artes, texto, envios: [e2, e1], agoraMs }, { previa, modo: "todas" });
    expect(d.ok).toBe(false);
  });

  it("arte nova ou grupo trocado depois da prévia: recusa", () => {
    const plano = opcoesDeEnvio(artes, texto, [], agoraMs)[0];
    const previa = assinaturaDaPrevia({ chave, jid, plano });
    expect(decidirEnvio({ chave, jid: "outro@g.us", artes, texto, envios: [], agoraMs }, { previa }).ok).toBe(false);
    const outras = [...artes, { id: "d", url: img("d") }];
    const chave2 = chaveDoEnvio("c1", outras);
    expect(decidirEnvio({ chave: chave2, jid, artes: outras, texto: textoDoEnvio(4, chave2), envios: [], agoraMs }, { previa }).ok).toBe(false);
  });

  it("envio em andamento: ninguém dispara outro; travado há mais de 3 min vira 'interrompido' e libera o reenvio", () => {
    const andando = envio({ chave, status: "enviando", criado_em: new Date(agoraMs - 30_000).toISOString() });
    expect(opcoesDeEnvio(artes, texto, [andando], agoraMs)).toEqual([]);
    const d = decidirEnvio({ chave, jid, artes, texto, envios: [andando], agoraMs }, { previa: "x", modo: "todas" });
    expect(d.ok).toBe(false);
    const travado = envio({ chave, status: "enviando", criado_em: new Date(agoraMs - ENVIO_TRAVADO_MS - 1).toISOString() });
    expect(situacaoDoEnvio(travado, agoraMs)).toBe("interrompido");
    expect(opcoesDeEnvio(artes, texto, [travado], agoraMs).map((o) => o.modo)).toEqual(["todas"]);
  });

  it("depois de um envio parcial: 'só as que faltaram' não repete o que chegou nem o texto", () => {
    const parcial = envio({
      chave, status: "parcial", enviadas: 1, total: 3,
      resultado: [
        { id: "a", url: img("a"), ok: true, comTexto: true },
        { id: "b", url: img("b"), ok: false, erro: "HTTP 500" },
        { id: "c", url: img("c"), ok: false, naoTentada: true },
      ],
    });
    const o = opcoesDeEnvio(artes, texto, [parcial], agoraMs);
    const faltantes = o.find((x) => x.modo === "faltantes")!;
    expect(faltantes.artes.map((a) => a.id)).toEqual(["b", "c"]);
    expect(faltantes.texto).toBeNull();
  });

  it("arte incerta (pode ter chegado) não entra em 'só as que faltaram'", () => {
    const incerto = envio({
      chave, status: "incerto", enviadas: 0, total: 3,
      resultado: [
        { id: "a", url: img("a"), ok: false, incerto: true, comTexto: true },
        { id: "b", url: img("b"), ok: false, naoTentada: true },
        { id: "c", url: img("c"), ok: false, naoTentada: true },
      ],
    });
    const faltantes = opcoesDeEnvio(artes, texto, [incerto], agoraMs).find((x) => x.modo === "faltantes")!;
    expect(faltantes.artes.map((a) => a.id)).toEqual(["b", "c"]);
    expect(faltantes.texto).toBeNull();
  });
});

describe("2.2 — o envio em si", () => {
  const artes: ArteDoEnvio[] = [{ id: "a", url: img("a") }, { id: "b", url: img("b") }, { id: "c", url: img("c") }];
  const semEspera = { esperar: async () => {} };

  function mensageiro(respostas: RespostaDoMensageiro[]) {
    const chamadas: { url: string; legenda?: string }[] = [];
    let i = 0;
    const mandar = async (url: string, legenda?: string) => { chamadas.push({ url, legenda }); return respostas[i++] ?? { ok: true }; };
    return { mandar, chamadas };
  }

  it("tudo certo: o texto vai só na primeira arte", async () => {
    const m = mensageiro([{ ok: true }, { ok: true }, { ok: true }]);
    const r = await mandarArtes(artes, "Seguem as artes", m.mandar, semEspera);
    expect(m.chamadas.map((c) => c.legenda)).toEqual(["Seguem as artes", undefined, undefined]);
    expect(statusDoResultado(r)).toBe("enviado");
    expect(resumoDoEnvio(r, "Padaria Sol")).toBe("3 de 3 artes enviadas ao grupo Padaria Sol.");
  });

  it("todas as imagens falham: NADA sai — nem o texto sozinho (o erro original)", async () => {
    const m = mensageiro([{ ok: false, error: "HTTP 500" }, { ok: false, error: "HTTP 500" }, { ok: false, error: "HTTP 500" }]);
    const r = await mandarArtes(artes, "Seguem as artes", m.mandar, semEspera);
    // cada chamada leva uma IMAGEM; não existe chamada só de texto
    expect(m.chamadas.every((c) => c.url.endsWith(".png"))).toBe(true);
    expect(statusDoResultado(r)).toBe("falhou");
    expect(resumoDoEnvio(r, "Padaria Sol")).toMatch(/^Nenhuma arte saiu — nada foi mandado ao grupo Padaria Sol\./);
  });

  it("a 1ª falha: o texto passa para a próxima que chegar", async () => {
    const m = mensageiro([{ ok: false, error: "HTTP 400" }, { ok: true }, { ok: true }]);
    const r = await mandarArtes(artes, "Seguem", m.mandar, semEspera);
    expect(m.chamadas.map((c) => c.legenda)).toEqual(["Seguem", "Seguem", undefined]);
    expect(r[1].comTexto).toBe(true);
    expect(statusDoResultado(r)).toBe("parcial");
    expect(resumoDoEnvio(r, "G")).toMatch(/^2 de 3 artes enviadas ao grupo G\. Arte 1: não saiu \(HTTP 400\)\./);
  });

  it("sem resposta a tempo: para (não duplica nem embaralha) e diz que pode ter saído", async () => {
    const m = mensageiro([{ ok: true }, { ok: false, incerto: true, error: "timeout" }]);
    const r = await mandarArtes(artes, "Seguem", m.mandar, semEspera);
    expect(m.chamadas).toHaveLength(2);
    expect(r[1].incerto).toBe(true);
    expect(r[2].naoTentada).toBe(true);
    expect(statusDoResultado(r)).toBe("parcial");
    expect(resumoDoEnvio(r, "G")).toMatch(/Arte 2: o WhatsApp não respondeu a tempo — pode ter saído/);
  });

  it("orçamento de tempo estourado: não começa a próxima e diz quais não foram", async () => {
    let t = 0;
    const m = mensageiro([{ ok: true }, { ok: true }, { ok: true }]);
    const mandar = async (url: string, legenda?: string) => { t += 30_000; return m.mandar(url, legenda); };
    const r = await mandarArtes(artes, "Seguem", mandar, { ...semEspera, agora: () => t, orcamentoMs: 38_000 });
    expect(m.chamadas).toHaveLength(2);
    expect(r[2]).toMatchObject({ ok: false, naoTentada: true });
    expect(resumoDoEnvio(r, "G")).toMatch(/^2 de 3 artes enviadas/);
  });

  it("grava o progresso depois de cada arte (se o processo morrer, fica o rastro)", async () => {
    const parciais: number[] = [];
    const m = mensageiro([{ ok: true }, { ok: true }, { ok: true }]);
    await mandarArtes(artes, "x", m.mandar, { ...semEspera, aoProgredir: (p) => { parciais.push(p.length); } });
    expect(parciais).toEqual([1, 2, 3]);
  });
});
