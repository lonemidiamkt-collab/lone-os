// @vitest-environment node
// tests/email-boas-vindas.test.ts — o e-mail de boas-vindas numa função só (24/10/2026, item 3.9).
// A ativação do cadastro fazia fetch na própria API sem login (401 calado) e a tela dizia que tinha ido.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

const banco = bancoEmMemoria();
const enviados: string[] = [];
vi.mock("@/lib/email/emailService", () => ({
  sendEmail: async (p: { to: string }) => { enviados.push(p.to); return { success: true, messageId: "m1" }; },
  logEmail: async (b: { from: (t: string) => { insert: (d: unknown) => Promise<unknown> } }, d: Record<string, unknown>) => {
    await b.from("email_logs").insert({ status: d.status, template_name: d.templateName });
  },
}));

const { enviarBoasVindas } = await import("@/lib/email/boas-vindas");
const { avisoDoEmail } = await import("@/lib/email/boas-vindas-resultado");

beforeEach(() => { banco.limpar(); enviados.length = 0; });

describe("enviarBoasVindas", () => {
  it("prefere o e-mail da aba Dados (corporativo) e marca como enviado", async () => {
    banco.db.clients = [{ id: "c1", name: "Padaria", email: "velho@x.com", email_corporativo: "novo@x.com" }];
    expect(await enviarBoasVindas(banco.supabaseAdmin, "c1")).toMatchObject({ enviado: true, codigo: "enviado" });
    expect(enviados).toEqual(["novo@x.com"]);
    expect(banco.db.clients[0].welcome_email_sent).toBe(true);
  });
  it("já enviado: não manda de novo (a não ser forçado, como o 'Reenviar' da aba Dados)", async () => {
    banco.db.clients = [{ id: "c1", name: "Padaria", email: "a@x.com", welcome_email_sent: true }];
    expect(await enviarBoasVindas(banco.supabaseAdmin, "c1")).toMatchObject({ enviado: false, jaEnviado: true });
    expect(enviados).toEqual([]);
    expect(await enviarBoasVindas(banco.supabaseAdmin, "c1", { forcar: true })).toMatchObject({ enviado: true });
  });
  it("cliente que não existe ou falha de leitura: não enviado, com motivo", async () => {
    expect(await enviarBoasVindas(banco.supabaseAdmin, "nao-existe")).toMatchObject({ enviado: false, codigo: "sem_cliente" });
  });
});

describe("frase para quem ativou", () => {
  it("enviado ou já enviado antes: nada a avisar; falha: diz o motivo", () => {
    expect(avisoDoEmail({ enviado: true, codigo: "enviado" })).toBeNull();
    expect(avisoDoEmail({ enviado: false, codigo: "ja_enviado", jaEnviado: true })).toBeNull();
    expect(avisoDoEmail({ enviado: false, codigo: "sem_email", motivo: "o cliente está sem e-mail na ficha" }))
      .toBe("o e-mail de boas-vindas não foi enviado: o cliente está sem e-mail na ficha");
    expect(avisoDoEmail(undefined)).toMatch(/não foi enviado/);
  });
});
