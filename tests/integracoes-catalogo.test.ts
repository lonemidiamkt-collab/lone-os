// tests/integracoes-catalogo.test.ts — Sistema › Integrações (lib/integracoes/catalogo.ts): como cada checagem vira
// estado na tela. O que isto protege: "ok" por falta de resposta, conexão do WhatsApp travada passando por boa,
// token da Meta vencendo sem aviso, API do Drive desligada sem o link do botão, e a volta do Google para o painel.

import { describe, it, expect } from "vitest";
import {
  CATALOGO, ordenar, piorSituacao, linkAtivarDriveApi, estadoGoogleIntegracao, estadoMetaIntegracao,
  estadoWhatsappIntegracao, estadoIaIntegracao, estadoD4signIntegracao, estadoServicoIntegracao, HORAS_SEM_RECEBER,
  type EstadoIntegracao,
} from "@/lib/integracoes/catalogo";
import { assinarState, lerState } from "@/lib/google/estado-oauth";

const AGORA = Date.parse("2026-11-09T17:00:00Z");
const DIA = 86_400_000;

describe("catálogo", () => {
  it("só aplicativos que o código usa, ids únicos, cada um diz o que depende dele", () => {
    const ids = CATALOGO.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["google", "meta", "whatsapp", "ia", "d4sign", "email", "pdf", "academy", "finance", "site"]);
    for (const c of CATALOGO) expect(c.servePara.length).toBeGreaterThan(20);
  });
  it("o que precisa de alguém vem primeiro; empate segue a ordem do catálogo", () => {
    const e = (id: EstadoIntegracao["id"], situacao: EstadoIntegracao["situacao"]) => ({ id, situacao } as EstadoIntegracao);
    expect(ordenar([e("site", "ok"), e("google", "ok"), e("pdf", "erro"), e("meta", "atencao"), e("email", "desligada")]).map((x) => x.id))
      .toEqual(["pdf", "meta", "email", "google", "site"]);
    expect(piorSituacao(["ok", "desligada", "atencao"])).toBe("atencao");
    expect(piorSituacao([])).toBe("ok");
  });
});

describe("Google", () => {
  const conectado = { configurado: true, conectado: true, email: "lonemidiamkt@gmail.com", drive: true as boolean | null };
  it("API do Drive desligada: atenção com o link do botão Ativar do projeto certo", () => {
    const msg = "Google Drive API has not been used in project 922295894505 before or it is disabled.";
    const e = estadoGoogleIntegracao({ ...conectado, driveApi: { ok: false, status: 403, motivo: "accessNotConfigured SERVICE_DISABLED", mensagem: msg } });
    expect(e.situacao).toBe("atencao");
    expect(e.acao?.href).toBe("https://console.cloud.google.com/apis/library/drive.googleapis.com?project=922295894505");
    expect(e.acao?.externo).toBe(true);
    expect(linkAtivarDriveApi(null)).toBe("https://console.cloud.google.com/apis/library/drive.googleapis.com");
  });
  it("conexão antiga sem o Drive, desconectado, sem credencial e tudo certo", () => {
    expect(estadoGoogleIntegracao({ ...conectado, drive: false, driveApi: null }).resumo).toContain("Reconectar Google");
    expect(estadoGoogleIntegracao({ ...conectado, driveApi: { ok: false, motivo: "insufficientPermissions ACCESS_TOKEN_SCOPE_INSUFFICIENT" } }).situacao).toBe("atencao");
    expect(estadoGoogleIntegracao({ ...conectado, conectado: false, driveApi: null }).situacao).toBe("erro");
    expect(estadoGoogleIntegracao({ ...conectado, configurado: false, conectado: false, driveApi: null }).situacao).toBe("desligada");
    const ok = estadoGoogleIntegracao({ ...conectado, driveApi: { ok: true } });
    expect(ok.situacao).toBe("ok");
    expect(ok.resumo).toContain("lonemidiamkt@gmail.com");
  });
  it("o consentimento iniciado no painel volta para o painel", () => {
    const st = assinarState("painel", AGORA);
    expect(lerState(st, AGORA + 60_000)).toEqual({ valido: true, destino: "painel" });
    expect(lerState(st, AGORA + 11 * 60_000).valido).toBe(false);
  });
});

describe("Meta", () => {
  it("avisa 15 dias antes de vencer; vencido e ausente são problema", () => {
    expect(estadoMetaIntegracao({ estado: "ok", expiraEm: AGORA + 29 * DIA, agora: AGORA }).situacao).toBe("ok");
    const perto = estadoMetaIntegracao({ estado: "ok", expiraEm: AGORA + 10 * DIA, agora: AGORA });
    expect(perto.situacao).toBe("atencao");
    expect(perto.resumo).toContain("10 dias");
    expect(estadoMetaIntegracao({ estado: "expirada", expiraEm: null, agora: AGORA }).situacao).toBe("erro");
    expect(estadoMetaIntegracao({ estado: "ausente", expiraEm: null, agora: AGORA }).situacao).toBe("erro");
    expect(estadoMetaIntegracao({ estado: "ok", expiraEm: null, agora: AGORA }).acao?.href).toBe("/conexao-meta");
  });
});

describe("WhatsApp", () => {
  const automacao = { rotulo: "Automação", configurada: true, estado: "open" };
  it("conectada e recebendo é ok; 'open' sem receber há mais de 12 h é conexão travada", () => {
    const recente = new Date(AGORA - 30 * 60_000).toISOString();
    expect(estadoWhatsappIntegracao([automacao, { rotulo: "Loninho", configurada: true, estado: "open", ultimaRecebida: recente }], AGORA).situacao).toBe("ok");
    const velha = new Date(AGORA - (HORAS_SEM_RECEBER + 1) * 3_600_000).toISOString();
    const travada = estadoWhatsappIntegracao([automacao, { rotulo: "Loninho", configurada: true, estado: "open", ultimaRecebida: velha }], AGORA);
    expect(travada.situacao).toBe("atencao");
    expect(travada.resumo).toContain("Loninho");
    expect(estadoWhatsappIntegracao([automacao, { rotulo: "Loninho", configurada: true, estado: "open", ultimaRecebida: null }], AGORA).situacao).toBe("atencao");
  });
  it("desconectada ou sem resposta da Evolution é problema, e o pior manda no cartão", () => {
    const e = estadoWhatsappIntegracao([{ ...automacao, estado: "close" }, { rotulo: "Loninho", configurada: true, estado: null, erro: "não respondeu a tempo" }], AGORA);
    expect(e.situacao).toBe("erro");
    expect(e.detalhes).toHaveLength(2);
    expect(estadoWhatsappIntegracao([{ rotulo: "Automação", configurada: false, estado: null }], AGORA).situacao).toBe("desligada");
  });
});

describe("IA, D4Sign e serviços de apoio", () => {
  it("IA sem crédito diz desde quando e o que fazer", () => {
    const e = estadoIaIntegracao({
      configurada: true, ultimoOk: null,
      fora: { causa: { chave: "openai-sem-credito", titulo: "OpenAI sem crédito", explicacao: "Saldo acabou.", acao: "Recarregar." }, desde: "2026-11-09T10:00:00Z", falhas: 12 },
    });
    expect(e.situacao).toBe("erro");
    expect(e.resumo).toContain("OpenAI sem crédito");
    expect(e.resumo).toContain("12 chamadas");
    expect(estadoIaIntegracao({ configurada: true, ultimoOk: null, fora: null }).situacao).toBe("atencao");
    expect(estadoIaIntegracao({ configurada: false, ultimoOk: null, fora: null }).situacao).toBe("desligada");
    expect(estadoIaIntegracao({ configurada: true, ultimoOk: "2026-11-09T16:50:00Z", fora: null }).situacao).toBe("ok");
  });
  it("D4Sign: teste que falhou, segredo errado e aviso faltando em cofre", () => {
    const base = { ligada: true, testeOk: true, testeResultado: null, segredoErrado: false, cofres: 2, cofresComAviso: 2 };
    expect(estadoD4signIntegracao(base).situacao).toBe("ok");
    expect(estadoD4signIntegracao({ ...base, testeOk: false, testeResultado: "401" }).situacao).toBe("erro");
    expect(estadoD4signIntegracao({ ...base, segredoErrado: true }).situacao).toBe("atencao");
    expect(estadoD4signIntegracao({ ...base, cofresComAviso: 1 }).situacao).toBe("atencao");
    expect(estadoD4signIntegracao({ ...base, ligada: false }).situacao).toBe("desligada");
    expect(estadoD4signIntegracao({ ...base, erro: "migration pendente" }).situacao).toBe("erro");
  });
  it("serviço configurado que não responde é problema, nunca ok", () => {
    const p = { configurado: true, semConfig: "sem token", okTexto: "Respondendo." };
    expect(estadoServicoIntegracao("pdf", { ...p, alcance: { ok: false, erro: "não respondeu a tempo" } }).situacao).toBe("erro");
    expect(estadoServicoIntegracao("pdf", { ...p, alcance: { ok: true } }).situacao).toBe("ok");
    expect(estadoServicoIntegracao("finance", { ...p, alcance: null }).situacao).toBe("ok");
    expect(estadoServicoIntegracao("email", { ...p, configurado: false, alcance: null }).resumo).toBe("sem token");
  });
});
