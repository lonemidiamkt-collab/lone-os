/**
 * QA: salvamento de Markdown e renderização correta.
 * Cobre: htmlToMarkdown (legacy), MarkdownView (read), markdownPlainText (preview).
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { htmlToMarkdown, markdownPlainText, MarkdownView } from "@/components/Markdown";

describe("htmlToMarkdown — converte legacy HTML pra Markdown", () => {
  it("passa markdown puro sem alterar", () => {
    const md = "**Nome:** Produto\n\n- item 1\n- item 2";
    expect(htmlToMarkdown(md)).toBe(md);
  });

  it("converte <strong> e <em> em **bold** e *italic*", () => {
    const html = "<p><strong>Nome:</strong> <em>Produto</em></p>";
    const out = htmlToMarkdown(html);
    expect(out).toContain("**Nome:**");
    expect(out).toContain("*Produto*");
  });

  it("converte <ul><li> em listas markdown", () => {
    const html = "<ul><li>um</li><li>dois</li></ul>";
    const out = htmlToMarkdown(html);
    expect(out).toContain("- um");
    expect(out).toContain("- dois");
  });

  it("converte <a href> em [texto](url)", () => {
    const html = '<a href="https://lonemidia.com">Site</a>';
    expect(htmlToMarkdown(html)).toContain("[Site](https://lonemidia.com)");
  });

  it("decodifica entities &nbsp; &amp; &lt;", () => {
    const html = "Tom &amp; Jerry &lt;test&gt;&nbsp;hello";
    const out = htmlToMarkdown(html);
    expect(out).toContain("Tom & Jerry");
    expect(out).toContain("<test>");
  });

  it("remove tags desconhecidas (defesa)", () => {
    const html = "<p>Texto <span class=foo>limpo</span></p>";
    const out = htmlToMarkdown(html);
    expect(out).not.toContain("<");
    expect(out).toContain("Texto limpo");
  });

  it("retorna string vazia pra null/undefined", () => {
    expect(htmlToMarkdown(null)).toBe("");
    expect(htmlToMarkdown(undefined)).toBe("");
    expect(htmlToMarkdown("")).toBe("");
  });
});

describe("markdownPlainText — strip pra previews compactos", () => {
  it("remove formatação markdown", () => {
    const md = "**Nome:** Produto\n\n- item 1\n- item 2";
    const plain = markdownPlainText(md);
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("- ");
    expect(plain).toContain("Nome:");
    expect(plain).toContain("item 1");
  });

  it("converte links em texto", () => {
    expect(markdownPlainText("[Site](https://x.com)")).toBe("Site");
  });

  it("aceita HTML legacy também", () => {
    const html = "<p><strong>Bold</strong> text</p>";
    expect(markdownPlainText(html)).toContain("Bold text");
  });
});

describe("MarkdownView — renderização React", () => {
  it("renderiza markdown como HTML formatado (sem mostrar tags cruas)", () => {
    const { container } = render(<MarkdownView source="**Nome:** Produto" />);
    const html = container.innerHTML;
    // tag <strong> renderizada (não como texto literal)
    expect(html).toContain("<strong>");
    expect(html).not.toContain("**");
  });

  it("renderiza listas markdown", () => {
    const { container } = render(<MarkdownView source="- um\n- dois" />);
    const html = container.innerHTML;
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
  });

  it("converte HTML legacy antes de renderizar", () => {
    const { container } = render(<MarkdownView source="<p><strong>X</strong></p>" />);
    const html = container.innerHTML;
    expect(html).toContain("<strong>");
    expect(html).not.toContain("&lt;p&gt;");
    expect(html).not.toContain("<p>X</p>"); // já foi convertido pra markdown e re-renderizado
  });

  it("retorna null pra source vazio", () => {
    const { container } = render(<MarkdownView source="" />);
    expect(container.firstChild).toBeNull();
  });
});
