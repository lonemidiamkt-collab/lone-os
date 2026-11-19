// tests/portal-como-contamos.test.tsx — "Como contamos os números" (components/portal/ComoContamos). 19/11/2026.
// A folha abre de qualquer área e só explica os canais que o cliente tem.

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ComoContamos, { secoesDeComoContamos } from "@/components/portal/ComoContamos";
import { palavrasDoResultado } from "@/lib/portal/formatos";

const palavras = palavrasDoResultado("mensagens");

describe("seções de Como contamos", () => {
  it("só os canais que o cliente tem, e sempre as comparações", () => {
    const t = (o: Partial<Parameters<typeof secoesDeComoContamos>[0]>) =>
      secoesDeComoContamos({ temResumo: false, temAnuncios: false, temGoogle: false, temInstagram: false, palavras, ...o }).map((s) => s.titulo);
    expect(t({})).toEqual(["Comparações"]);
    expect(t({ temAnuncios: true })).toEqual(["Anúncios (Facebook e Instagram)", "Comparações"]);
    expect(t({ temResumo: true, temAnuncios: true, temGoogle: true, temInstagram: true }))
      .toEqual(["Visão geral", "Anúncios (Facebook e Instagram)", "Google", "Instagram", "Comparações"]);
  });

  it("fala do resultado da conta (leads), não sempre de conversas", () => {
    const s = secoesDeComoContamos({ temResumo: false, temAnuncios: true, temGoogle: false, temInstagram: false, palavras: palavrasDoResultado("leads") });
    expect(s[0].itens.map((i) => i.termo)).toContain("Leads");
    expect(s[0].itens.map((i) => i.termo)).toContain("Custo por lead");
  });
});

describe("a folha", () => {
  it("abre pelo botão e fecha", () => {
    render(
      <ComoContamos temResumo={false} temAnuncios temGoogle temInstagram={false} palavras={palavras}>
        <button type="button">Como contamos</button>
      </ComoContamos>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Como contamos" }));
    expect(screen.getByRole("dialog", { name: "Como contamos os números" })).toBeInTheDocument();
    expect(screen.getByText("Ligações, rotas e cliques no site")).toBeInTheDocument();
    expect(screen.queryByText("Seguidores no período")).toBeNull(); // não tem Instagram
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
