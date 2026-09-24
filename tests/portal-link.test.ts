// tests/portal-link.test.ts — o botão "Portal" da ficha (lib/portal/link.ts) e as palavras do resultado
// no portal (N4, lib/portal/formatos.ts + formatDelta.ts).

import { describe, it, expect } from "vitest";
import { estadoDoPortal, mensagemParaCliente, numeroWhatsapp, rascunhoWhatsapp, urlDoPortal } from "@/lib/portal/link";
import { formatarMetrica, palavrasDoResultado, rotuloMetrica } from "@/lib/portal/formatos";
import { resumoConversas } from "@/lib/portal/formatDelta";
import { resolverAba } from "@/components/client/ficha/abas";

describe("o link do portal", () => {
  it("endereço público com o token", () => {
    expect(urlDoPortal("abc", "https://resultados.lonemidia.com/")).toBe("https://resultados.lonemidia.com/portal/abc");
  });

  it("estado: sem link, desativado (revogado ou desligado), ativo", () => {
    expect(estadoDoPortal({})).toBe("sem_link");
    expect(estadoDoPortal({ publicReportToken: "t", publicReportTokenRevokedAt: "2026-09-01" })).toBe("desativado");
    expect(estadoDoPortal({ publicReportToken: "t", publicReportEnabled: false })).toBe("desativado");
    expect(estadoDoPortal({ publicReportToken: "t", publicReportEnabled: true })).toBe("ativo");
    // Lista magra sem o campo "enabled": o token sozinho, sem revogação, é ativo.
    expect(estadoDoPortal({ publicReportToken: "t" })).toBe("ativo");
  });

  it("WhatsApp do contato no formato do wa.me (com o 55)", () => {
    expect(numeroWhatsapp("(22) 99815-3070")).toBe("5522998153070");
    expect(numeroWhatsapp("+55 22 99815-3070")).toBe("5522998153070");
    expect(numeroWhatsapp("2226451234")).toBe("552226451234");
    expect(numeroWhatsapp("")).toBeNull();
    expect(numeroWhatsapp("12345")).toBeNull();
  });

  it("mensagem ao cliente: saudação pelo primeiro nome e o link; boas-vindas configurada abre o texto", () => {
    const m = mensagemParaCliente({ url: "https://x/portal/t", contato: "Ana Paula Souza" });
    expect(m.startsWith("Olá, Ana! Preparamos o seu painel de resultados da Lone Mídia.")).toBe(true);
    expect(m).toContain("https://x/portal/t");
    expect(mensagemParaCliente({ url: "https://x/portal/t", boasVindas: "Oi, pessoal da Padaria!" }).startsWith("Oi, pessoal da Padaria!")).toBe(true);
    expect(mensagemParaCliente({ url: "https://x/portal/t" }).startsWith("Olá! ")).toBe(true);
  });

  it("rascunho no WhatsApp — nada é enviado sozinho, só abre a conversa com o texto", () => {
    expect(rascunhoWhatsapp("5522998153070", "Olá & link")).toBe("https://wa.me/5522998153070?text=Ol%C3%A1%20%26%20link");
    expect(rascunhoWhatsapp(null, "oi")).toBe("https://wa.me/?text=oi");
  });

  it("?tab=portal (endereço antigo da seção) abre a ficha no Resumo — o painel do Portal abre sozinho", () => {
    expect(resolverAba("portal")).toEqual({ aba: "resumo" });
  });
});

describe("N4 — as palavras seguem o resultado", () => {
  it("conversas continuam conversas; leads e compras com o nome certo", () => {
    expect(palavrasDoResultado(null)).toMatchObject({ um: "conversa", Varios: "Conversas", custo: "Custo por conversa", porUm: "por conversa", atribuidos: "atribuídas" });
    expect(palavrasDoResultado("leads")).toMatchObject({ varios: "leads", custo: "Custo por lead", atribuidos: "atribuídos" });
    expect(palavrasDoResultado("compras")).toMatchObject({ Varios: "Compras", porUm: "por compra" });
  });

  it("gráfico e frase de topo", () => {
    expect(rotuloMetrica("messages", "leads")).toBe("Leads");
    expect(rotuloMetrica("clicks", "leads")).toBe("Cliques");
    expect(formatarMetrica("messages", 1, "compras")).toBe("1 compra");
    expect(formatarMetrica("messages", 29)).toBe("29 conversas");
    expect(resumoConversas(12, 20, "last_week", "leads")).toBe("Nos últimos 7 dias: 12 leads, 20% a mais que a semana anterior.");
    expect(resumoConversas(48, null, "last_week")).toBe("Nos últimos 7 dias: 48 conversas.");
  });
});
