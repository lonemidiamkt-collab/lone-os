import { describe, it, expect } from "vitest";
import { contarPalavras, textoRegistrada, type AnaliseReuniao } from "@/lib/cs/reuniao-transcricao";
import { reuniaoPdfHtml } from "@/lib/reports/reuniaoPdf";

const analise: AnaliseReuniao = {
  resumo: "Revisão do mês. O cliente quer mais foco em vídeo e reclamou do tempo de resposta.",
  decisoes: ["Trocar 2 posts estáticos por Reels a partir de outubro"],
  proximas_acoes: [
    { acao: "Montar roteiro dos Reels", responsavel: "Thiago", prazo: "2026-09-10" },
    { acao: "Revisar a grade do mês", responsavel: null, prazo: null },
  ],
  pendencias_cliente: [
    { item: "Mandar as fotos da loja nova", impacto: "sem elas o post de inauguração não sai" },
  ],
  pontos_atencao: [
    "Reclamou duas vezes do tempo de resposta no WhatsApp",
    "Vai abrir a segunda loja em novembro",
  ],
  sugestoes_briefing: [
    { regra: "Não usar a cor vermelha nas artes", motivo: "é a cor do concorrente direto na região" },
  ],
  clima: "preocupado",
  proxima_reuniao: "2026-10-15",
};

describe("contagem de palavras", () => {
  it("conta o que separa por espaço, ignorando vazios", () => {
    expect(contarPalavras("uma  reunião   de teste")).toBe(4);
    expect(contarPalavras("")).toBe(0);
    expect(contarPalavras("   ")).toBe(0);
  });
});

describe("o aviso no grupo", () => {
  const t = textoRegistrada("Contele", analise, "@5522997226048");

  it("marca a pessoa e resume em uma linha", () => {
    expect(t).toContain("@5522997226048");
    expect(t).toContain("Contele");
    expect(t).toContain(analise.resumo);
  });

  it("conta o que extraiu, sem despejar a lista", () => {
    expect(t).toMatch(/1 decisão/);
    expect(t).toMatch(/2 ações nossas/);
    expect(t).toMatch(/1 pendência do cliente/);
    expect(t).toMatch(/2 pontos de atenção/);
    // A lista inteira está no PDF e na aba — a mensagem é manchete.
    expect(t).not.toContain("Mandar as fotos da loja nova");
  });

  it("sugestão de briefing NÃO é aplicada sozinha — pede o ok", () => {
    // Regra errada no briefing contamina toda peça futura; perguntar custa uma mensagem.
    expect(t).toContain("Não usar a cor vermelha");
    expect(t).toMatch(/ok briefing/);
  });

  it("clima ruim é sinalizado; clima bom não vira alarme", () => {
    expect(t).toMatch(/pareceu \*preocupado\*/);
    const bom = textoRegistrada("X", { ...analise, clima: "positivo" }, "");
    expect(bom).not.toMatch(/pareceu/);
  });

  it("aponta onde está o resto", () => {
    expect(t).toMatch(/aba do cliente/);
  });

  it("reunião sem nada extraído não vira mensagem quebrada", () => {
    const vazio = textoRegistrada("X", {
      resumo: "Conversa rápida de alinhamento.", decisoes: [], proximas_acoes: [],
      pendencias_cliente: [], pontos_atencao: [], sugestoes_briefing: [],
      clima: "neutro", proxima_reuniao: null,
    }, "");
    expect(vazio).toContain("Conversa rápida");
    expect(vazio).not.toMatch(/Extraí:/);
  });
});

describe("a ata em PDF", () => {
  const html = reuniaoPdfHtml({
    cliente: "Contele Energia Solar", quando: "2026-09-25T14:00:00-03:00", responsavel: "Thiago",
    resumo: analise.resumo, decisoes: analise.decisoes, proximasAcoes: analise.proximas_acoes,
    pendenciasCliente: analise.pendencias_cliente, pontosAtencao: analise.pontos_atencao,
    sugestoesBriefing: analise.sugestoes_briefing, clima: analise.clima,
    transcricao: "Thiago: bom dia! Cliente: bom dia, tudo bem?",
  }, "");

  it("traz cliente, data e quem conduziu", () => {
    expect(html).toContain("Contele Energia Solar");
    expect(html).toMatch(/25 de setembro/);
    expect(html).toContain("Thiago");
  });

  it("traz a TRANSCRIÇÃO inteira — quem abre o PDF não volta ao sistema", () => {
    expect(html).toContain("Thiago: bom dia!");
    expect(html).toMatch(/Transcrição completa/);
  });

  it("mostra responsável e prazo da ação quando existem", () => {
    expect(html).toMatch(/Montar roteiro dos Reels/);
    expect(html).toMatch(/2026-09-10/);
  });

  it("mostra o impacto da pendência do cliente", () => {
    expect(html).toMatch(/o post de inauguração não sai/);
  });

  it("o clima aparece com cor própria", () => {
    expect(html).toContain("Cliente preocupado");
  });

  it("seção sem conteúdo não vira caixa vazia", () => {
    const vazio = reuniaoPdfHtml({
      cliente: "X", quando: "2026-09-25T14:00:00-03:00", responsavel: null,
      resumo: "curta", decisoes: [], proximasAcoes: [], pendenciasCliente: [],
      pontosAtencao: [], sugestoesBriefing: [], clima: "neutro", transcricao: "oi",
    }, "");
    expect(vazio).not.toMatch(/Decisões/);
    expect(vazio).not.toMatch(/Pontos de atenção/);
  });

  it("escapa HTML da transcrição — é texto de terceiro entrando no documento", () => {
    const x = reuniaoPdfHtml({
      cliente: "X", quando: "2026-09-25T14:00:00-03:00", responsavel: null, resumo: "r",
      decisoes: [], proximasAcoes: [], pendenciasCliente: [], pontosAtencao: [],
      sugestoesBriefing: [], clima: "neutro", transcricao: "<script>alert(1)</script>",
    }, "");
    expect(x).toContain("&lt;script&gt;");
    expect(x).not.toContain("<script>alert");
  });
});
