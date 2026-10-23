// tests/cs-envio-cliente.test.ts — cobrança/check-in "pro cliente" pelo Loninho (auditoria
// 21/10/2026, 5.7).
//
// O erro original: o texto (da IA) ia DIRETO ao grupo do cliente achado por nome aproximado, sem
// prévia; o resultado do envio era ignorado e o time recebia "✅ Mandei" mesmo se falhou; a chave
// `pendencias:<id>:<dia>` era gravada sem esperar e nunca consultada (cobrar 3× no mesmo dia).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";
import {
  chaveCobrancaPendencias, desfechoDoEnvio, lerDecisaoEnvio, previaPeloTexto, previaVencida, textoPrevia, RESPOSTA,
} from "@/lib/cs/envio-cliente";

const banco = bancoEmMemoria({ unicas: { cs_cobrancas: ["chave"] } });
const enviados: { jid: string; texto: string; meta?: { destino?: string } }[] = [];
let respostaWhatsApp: { ok: boolean; error?: string; id?: string } = { ok: true, id: "MSG" };
let checkinAberto = false;
const registrados: unknown[] = [];

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/cs/notify", () => ({
  csSendGroupText: async (jid: string, texto: string, _q?: string, meta?: { destino?: string }) => {
    enviados.push({ jid, texto, meta });
    return respostaWhatsApp;
  },
}));
vi.mock("@/lib/cs/checkin", () => ({
  temCheckinAguardando: async () => checkinAberto,
  registrarEnvio: async (...a: unknown[]) => { registrados.push(a); return "chk-1"; },
}));

const { prepararEnvioAoCliente, executarEnvioAoCliente, acharEnvioCitado, cobrancaJaFeita, cancelarEnvioAoCliente } =
  await import("@/lib/cs/envio-cliente-server");

const INTERNO = "interno@g.us";
const CLIENTE = "cliente@g.us";
const CHAVE = chaveCobrancaPendencias("k1", "2026-10-21");

async function previa(tipo: "cobranca_pendencias" | "checkin" = "cobranca_pendencias") {
  respostaWhatsApp = { ok: true, id: "PREVIA-1" };
  const r = await prepararEnvioAoCliente({
    tipo, clientId: "k1", clienteNome: "Padaria do João", grupoCliente: CLIENTE, grupoInterno: INTERNO,
    texto: "Oi! Ainda faltam as fotos da fachada pra gente fechar o post de sexta.",
    chave: tipo === "cobranca_pendencias" ? CHAVE : null,
    dados: tipo === "checkin" ? { pergunta: { key: "publico", cliente: "?", time: "?", porque: "?" } } : null,
    pedidoPor: "Carlos",
  });
  expect(r.ok).toBe(true);
  enviados.length = 0;
  const linha = await acharEnvioCitado(INTERNO, "PREVIA-1", null);
  expect(linha).not.toBeNull();
  return linha!;
}

beforeEach(() => {
  banco.limpar();
  enviados.length = 0;
  registrados.length = 0;
  respostaWhatsApp = { ok: true, id: "MSG" };
  checkinAberto = false;
});

describe("a prévia", () => {
  it("o erro original: nada vai pro cliente no pedido — só a prévia, no grupo interno, com cliente e texto", async () => {
    respostaWhatsApp = { ok: true, id: "PREVIA-1" };
    await prepararEnvioAoCliente({
      tipo: "cobranca_pendencias", clientId: "k1", clienteNome: "Padaria do João", grupoCliente: CLIENTE,
      grupoInterno: INTERNO, texto: "Faltam as fotos.", chave: CHAVE,
    });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].jid).toBe(INTERNO);
    expect(enviados[0].texto).toContain("Cliente: *Padaria do João*");
    expect(enviados[0].texto).toContain("Faltam as fotos.");
    expect(banco.db.cs_envios_cliente[0]).toMatchObject({ status: "aguardando", msg_id_previa: "PREVIA-1" });
  });

  it("prévia que não saiu é falha (não fica aguardando um ok que nunca virá)", async () => {
    respostaWhatsApp = { ok: false, error: "HTTP 500" };
    const r = await prepararEnvioAoCliente({
      tipo: "cobranca_pendencias", clientId: "k1", clienteNome: "X", grupoCliente: CLIENTE, grupoInterno: INTERNO, texto: "t",
    });
    expect(r.ok).toBe(false);
    expect(banco.db.cs_envios_cliente[0].status).toBe("falhou");
  });

  it("sem a tabela (migration não aplicada): diz que não conseguiu, não manda nada", async () => {
    banco.falharEm("cs_envios_cliente", "insert", { message: "relation does not exist" });
    const r = await prepararEnvioAoCliente({
      tipo: "checkin", clientId: "k1", clienteNome: "X", grupoCliente: CLIENTE, grupoInterno: INTERNO, texto: "t",
    });
    expect(r.ok).toBe(false);
    expect(enviados).toHaveLength(0);
  });

  it("a prévia é achada pelo texto citado quando o id não bate", async () => {
    const linha = await previa();
    const citado = textoPrevia("cobranca_pendencias", "Padaria do João", linha.texto);
    const achada = await acharEnvioCitado(INTERNO, "ID-QUE-NAO-BATE", citado);
    expect(achada?.id).toBe(linha.id);
  });
});

describe("o ok", () => {
  it("manda no grupo DO CLIENTE e só diz enviado quando o WhatsApp confirmou", async () => {
    const linha = await previa();
    respostaWhatsApp = { ok: true, id: "ENVIO" };
    const r = await executarEnvioAoCliente(linha, "Carlos");
    expect(r.tipo).toBe("enviado");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ jid: CLIENTE, meta: { destino: "cliente" } });
    expect(banco.db.cs_envios_cliente[0].status).toBe("enviado");
    expect(banco.db.cs_cobrancas).toHaveLength(1);
    expect(banco.db.cs_cobrancas[0].chave).toBe(CHAVE);
  });

  it("o erro original: envio que falhou NÃO vira ✅ — volta a aguardar, solta a chave e o próximo ok tenta de novo", async () => {
    const linha = await previa();
    respostaWhatsApp = { ok: false, error: "HTTP 400: group not found" };
    const r1 = await executarEnvioAoCliente(linha, "Carlos");
    expect(r1).toMatchObject({ tipo: "falhou" });
    expect(banco.db.cs_envios_cliente[0]).toMatchObject({ status: "aguardando", erro: "HTTP 400: group not found" });
    expect(banco.db.cs_cobrancas).toHaveLength(0);

    respostaWhatsApp = { ok: true, id: "ENVIO" };
    const r2 = await executarEnvioAoCliente({ ...linha, status: "aguardando" }, "Carlos");
    expect(r2.tipo).toBe("enviado");
  });

  it("timeout é INCERTO: não reenvia sozinho e a chave do dia fica reservada", async () => {
    const linha = await previa();
    respostaWhatsApp = { ok: false, error: "The operation was aborted due to timeout" };
    const r = await executarEnvioAoCliente(linha, "Carlos");
    expect(r.tipo).toBe("incerto");
    expect(banco.db.cs_envios_cliente[0].status).toBe("incerto");
    expect(banco.db.cs_cobrancas).toHaveLength(1);
  });

  it("o erro original: a chave do dia é CONSULTADA — segunda cobrança no mesmo dia não sai", async () => {
    banco.db.cs_cobrancas = [{ id: "c0", chave: CHAVE }];
    expect(await cobrancaJaFeita(CHAVE)).toBe("sim");
    const linha = await previa();
    const r = await executarEnvioAoCliente(linha, "Carlos");
    expect(r.tipo).toBe("ja_enviado_hoje");
    expect(enviados).toHaveLength(0);
  });

  it("dois 'ok' (retry do webhook / duas pessoas): só um envio", async () => {
    const linha = await previa();
    const [a, b] = await Promise.all([executarEnvioAoCliente(linha, "Carlos"), executarEnvioAoCliente(linha, "Pedro")]);
    expect([a.tipo, b.tipo].sort()).toEqual(["enviado", "ja_decidida"]);
    expect(enviados.filter((e) => e.jid === CLIENTE)).toHaveLength(1);
  });

  it("prévia com mais de 24h vence", async () => {
    const linha = await previa();
    const r = await executarEnvioAoCliente({ ...linha, created_at: "2026-10-01T10:00:00Z" }, "Carlos", new Date("2026-10-21T10:00:00Z"));
    expect(r.tipo).toBe("vencida");
    expect(enviados).toHaveLength(0);
  });

  it("check-in: registra na ficha só depois de sair; com check-in aberto, não manda outro", async () => {
    const linha = await previa("checkin");
    checkinAberto = true;
    expect((await executarEnvioAoCliente(linha, "Carlos")).tipo).toBe("checkin_aberto");
    expect(registrados).toHaveLength(0);
    checkinAberto = false;
    expect((await executarEnvioAoCliente(linha, "Carlos")).tipo).toBe("enviado");
    expect(registrados).toHaveLength(1);
  });

  it("o 'não' cancela e nada sai", async () => {
    const linha = await previa();
    expect(await cancelarEnvioAoCliente(linha, "Carlos")).toBe(true);
    expect((await executarEnvioAoCliente({ ...linha, status: "cancelado" }, "Carlos")).tipo).toBe("ja_decidida");
    expect(enviados).toHaveLength(0);
  });
});

describe("regras puras", () => {
  it("só 'ok' ou 'não' — 'ok, mas muda o texto' não libera envio", () => {
    for (const t of ["ok", "Ok!", "sim", "pode mandar", "manda", "ok pode mandar", "👍", "✅"]) expect(lerDecisaoEnvio(t), t).toBe("enviar");
    for (const t of ["não", "nao", "cancela", "não manda", "deixa quieto"]) expect(lerDecisaoEnvio(t), t).toBe("cancelar");
    for (const t of ["ok, mas muda o segundo parágrafo", "manda não", "qual cliente?", ""]) expect(lerDecisaoEnvio(t), t).toBeNull();
  });

  it("desfecho do envio", () => {
    expect(desfechoDoEnvio({ ok: true })).toBe("enviado");
    expect(desfechoDoEnvio({ ok: false, error: "HTTP 400: bad" })).toBe("falhou");
    expect(desfechoDoEnvio({ ok: false, error: "Evolution (monitor[IA]) não configurada" })).toBe("falhou");
    expect(desfechoDoEnvio({ ok: false, error: "The operation was aborted due to timeout" })).toBe("incerto");
    expect(desfechoDoEnvio({ ok: false, error: "fetch failed" })).toBe("incerto");
  });

  it("prévia vencida e chave", () => {
    const agora = new Date("2026-10-21T12:00:00Z");
    expect(previaVencida("2026-10-21T00:00:00Z", agora)).toBe(false);
    expect(previaVencida("2026-10-20T11:00:00Z", agora)).toBe(true);
    expect(chaveCobrancaPendencias("abc", "2026-10-21")).toBe("pendencias:abc:2026-10-21");
  });

  it("prévia pelo texto: só com um candidato", () => {
    const p = { texto: "Oi! Faltam as fotos da fachada pra fechar o post.", cliente_nome: "Padaria" };
    const q = { texto: "Oi! Faltam as fotos da fachada pra fechar o post.", cliente_nome: "Mercado" };
    expect(previaPeloTexto([p, q], textoPrevia("cobranca_pendencias", "Padaria", p.texto))).toBe(p);
    expect(previaPeloTexto([p], "bom dia")).toBeNull();
  });

  it("a resposta de falha diz que nada saiu e o que fazer", () => {
    expect(RESPOSTA.falhou("Padaria", "HTTP 500")).toMatch(/Nada saiu/);
    expect(RESPOSTA.falhou("Padaria", "HTTP 500")).toMatch(/ok\* de novo/);
    expect(RESPOSTA.incerto("Padaria")).toMatch(/não sei se a mensagem chegou/);
  });
});
