import { describe, it, expect } from "vitest";
import { lerLinhas, avisoPdfHtml } from "@/lib/reports/avisoPdf";
import { contarItens } from "@/lib/cs/enviar-aviso";

// O aviso real que o Roberto mandou em 11/09/2026 perguntando "teria como transformar em pdf?".
// 1.755 caracteres — o WhatsApp corta isso com "Ler mais".
const SETUP = `🚀 *Setup de cliente novo* — os 7 primeiros dias

*DR. JUNIOR VARGAS* — 2/7 · *29d além do prazo*
• Logo finalizada — Rodrigo
• Bio do perfil escrita — Carlos Augusto
• Linktree (ou link único) no ar — Carlos Augusto
• Destaques criados e capeados — Carlos Augusto
• 3 artes fixadas no feed — Rodrigo

📋 *Checklist novo — só confirmar o que já está pronto*
_Estes clientes são anteriores a esta lista. Muita coisa já deve estar feita._

• *MAX CONTABILIDADE* (92d de casa) — 6 itens · Gabriel Sodre, Carlos Augusto, Julio
• *JP barbearia* (2d de casa) — 7 itens · Gabriel Sodre, Carlos Augusto, Julio

_Marca em Tarefas conforme for fechando._

─────

⏰ *Onboarding além dos 15 dias*

*MAX CONTABILIDADE* — 92 dias de casa
• temos acesso à conta, mas nenhum anúncio gastou nos últimos 30 dias
• só 1 de 3 artes fixadas entregues`;

describe("o conversor não perde linha", () => {
  it("toda linha com conteúdo aparece na saída", () => {
    // O risco aqui não é ficar feio: é PERDER LINHA em silêncio. O PDF sai bonito faltando um
    // parágrafo e ninguém confere linha a linha antes de mandar.
    const html = avisoPdfHtml("Setup de cliente novo", SETUP, "", "sexta, 11/09");
    // A primeira linha é a única que MUDA de lugar: o título vai pro <h1> e o complemento pro
    // subtítulo. O caso dela tem teste próprio logo abaixo.
    const comConteudo = SETUP.split("\n").map((l) => l.trim()).filter(Boolean).slice(1);
    for (const l of comConteudo) {
      // Compara pelo miolo, sem marcação nem emoji — o que importa é o texto ter sobrevivido.
      const nucleo = l.replace(/[•*_~─]/g, "").replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").trim();
      if (nucleo.length < 4) continue;
      const alvo = nucleo.split("·")[0].trim().slice(0, 28);
      expect(html.replace(/<[^>]+>/g, ""), `sumiu: ${alvo}`).toContain(alvo.replace(/&/g, "&amp;"));
    }
  });

  it("linha em branco não vira conteúdo", () => {
    expect(lerLinhas("a\n\n\nb")).toHaveLength(2);
  });
});

describe("classificação das linhas", () => {
  it("reconhece item, título, divisor e parágrafo", () => {
    const l = lerLinhas("*Título*\n• um item\n─────\ntexto solto");
    expect(l.map((x) => x.tipo)).toEqual(["titulo", "item", "divisor", "paragrafo"]);
  });

  it("título com emoji na frente continua título", () => {
    const [t] = lerLinhas("📋 *Checklist novo*");
    expect(t.tipo).toBe("titulo");
    expect((t as { texto: string }).texto).toContain("Checklist novo");
  });

  it("linha com negrito NO MEIO é parágrafo, não título", () => {
    // "DR. JUNIOR VARGAS — 2/7 · 29d além do prazo" tem negrito mas não é só negrito.
    const [p] = lerLinhas("*DR. JUNIOR VARGAS* — 2/7 · *29d além do prazo*");
    expect(p.tipo).toBe("paragrafo");
  });

  it("aceita hífen e asterisco como marcador de item", () => {
    expect(lerLinhas("- um\n* dois\n• três").every((x) => x.tipo === "item")).toBe(true);
  });
});

describe("segurança e formatação", () => {
  it("escapa HTML antes de aplicar negrito", () => {
    const html = avisoPdfHtml("t", "• <script>alert(1)</script> e *negrito*", "", "hoje");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<b>negrito</b>");
  });

  it("não repete o título no corpo quando ele já está no topo", () => {
    const html = avisoPdfHtml("Setup de cliente novo", "*Setup de cliente novo*\n• item", "", "hoje");
    expect(html.match(/Setup de cliente novo/g) ?? []).toHaveLength(1);
  });

  it("o complemento do título vira subtítulo, sem perder a informação", () => {
    // "🚀 *Setup de cliente novo* — os 7 primeiros dias" tem texto DEPOIS do negrito: não é título
    // puro, mas repete o título. O que sobra ("os 7 primeiros dias") é informação e vai pro topo.
    const html = avisoPdfHtml("Setup de cliente novo", "🚀 *Setup de cliente novo* — os 7 primeiros dias\n• item", "", "sexta, 11/09");
    expect(html.match(/Setup de cliente novo/g) ?? []).toHaveLength(1);
    expect(html).toContain("os 7 primeiros dias");
    expect(html).toContain("os 7 primeiros dias · sexta, 11/09");
  });

  it("não confunde primeira linha diferente com repetição do título", () => {
    const html = avisoPdfHtml("Pendências do agente", "*Outra coisa qualquer*\n• item", "", "hoje");
    expect(html).toContain("Outra coisa qualquer");
    expect(html).toContain("Pendências do agente");
  });
});

describe("contagem de itens decide o formato", () => {
  it("conta só as linhas de lista", () => {
    expect(contarItens(SETUP)).toBe(9);
    expect(contarItens("sem lista nenhuma")).toBe(0);
    expect(contarItens("• um\n  • dois indentado\ntexto")).toBe(2);
  });
});
