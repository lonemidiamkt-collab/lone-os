import { describe, it, expect } from "vitest";
import { montarPromptArte, type KitDoCliente } from "@/lib/ia/arte-do-cliente";

// A arte "nada com nada" (Armazém do Ferro, 14/09) saiu de um prompt com uma frase e uma miniatura.
// O prompt novo precisa nomear cada imagem, a logo, a paleta, os textos exatos e proibir invenção.
const kit: KitDoCliente = {
  clientId: "c1", nome: "Armazém do Ferro", logoUrl: "https://x/logo.png", artesRecentes: ["https://x/a1.png", "https://x/a2.png"],
  instrucoes: "logo sempre no canto superior esquerdo", contato: "(22) 99999-0000 · Araruama",
  estilo: { paleta: [{ hex: "#B22222", papel: "título" }, { hex: "#FFFFFF", papel: "fundo" }], tipografia: "sans grossa em caixa alta", composicao: "produto ao centro, tabela de medidas à direita", elementos_recorrentes: ["selo vermelho de CTA"], tom_visual: "informativo", o_que_evitar: ["fundo escuro"], resumo: "Peças brancas com vermelho." },
};

describe("prompt da arte com identidade do cliente", () => {
  it("numera as imagens na ordem anexada e manda usar a logo exatamente", () => {
    const p = montarPromptArte({ kit, temReferencia: true, temLogo: true, nEstilos: 2, textos: ["Telhas de PVC", "Faça o seu orçamento"], mantem: "produto, medidas, CTA", muda: "o fundo" });
    expect(p).toContain("Imagem 1 = REFERÊNCIA");
    expect(p).toContain("Imagem 2 = LOGO OFICIAL de Armazém do Ferro: usar exatamente esta logo");
    expect(p).toContain("Imagens 3–4 = artes recentes");
    expect(p).toContain("Paleta: #B22222 (título), #FFFFFF (fundo).");
    expect(p).toContain('TEXTOS EXATOS que devem aparecer (em português, sem alterar, sem traduzir, sem acrescentar): "Telhas de PVC" · "Faça o seu orçamento"');
    expect(p).toContain("INSTRUÇÕES FIXAS DA EQUIPE PARA ESTE CLIENTE: logo sempre no canto superior esquerdo");
    expect(p).toContain("MANTER EXATAMENTE: produto, medidas, CTA.");
    expect(p).toContain("ALTERAR APENAS: o fundo.");
    expect(p).toMatch(/PROIBIDO: bandeiras, logos genéricas/);
    expect(p).toContain("nunca ícone de e-mail");
  });
  it("sem logo e sem referência: numera só as artes e não promete logo; pedido comum usa o briefing", () => {
    const p = montarPromptArte({ kit: { ...kit, logoUrl: null, estilo: null, instrucoes: null }, temReferencia: false, temLogo: false, nEstilos: 3, textos: [], mantem: "", muda: "", pedido: "Promoção de tinta 18L — R$ 189,90" });
    expect(p).toContain("Crie a peça de anúncio pedida abaixo.");
    expect(p).toContain("Imagens 1–3 = artes recentes");
    expect(p).not.toContain("LOGO OFICIAL");
    expect(p).toContain("Sem leitura de estilo — siga as artes anexadas.");
    expect(p).toContain("O PEDIDO: Promoção de tinta 18L — R$ 189,90");
    expect(p).toContain("Não escreva nenhum texto que não esteja na referência ou no pedido.");
    expect(p).not.toContain("MANTER EXATAMENTE");
  });
});
