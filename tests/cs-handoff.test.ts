// Teste OFFLINE do handoff comercial→CS — só as funções puras (sem banco/rede).
import { describe, it, expect } from "vitest";
import { montarNotaHandoff, montarMensagemGrupoHandoff, nomeDoLead } from "@/lib/cs/handoff";

const lead = {
  empresa: "Padaria do Zé",
  contato_nome: "José Silva",
  telefone: "22999990000",
  email: "ze@padaria.com",
  valor_orcamento: 1500,
  origem: "Indicação",
  responsavel: "Rodrigo (SDR)",
  observacoes: "Quer atrair mais clientes no fim de semana. Prometido: 12 posts/mês + tráfego.",
};

const atividades = [
  { tipo: "reuniao", texto: "Reunião de fechamento — topou o plano growth." },
  { tipo: "ligacao", texto: "Ligou pedindo referências." },
  { tipo: "etapa", texto: "Movido para Ganho ✅" }, // ruído — não deve entrar
  { tipo: "nota", texto: "  " }, // vazio — não deve entrar
];

describe("nomeDoLead", () => {
  it("prefere a empresa; cai pro contato; senão genérico", () => {
    expect(nomeDoLead(lead)).toBe("Padaria do Zé");
    expect(nomeDoLead({ contato_nome: "Maria" })).toBe("Maria");
    expect(nomeDoLead({})).toBe("Novo cliente");
  });
});

describe("montarNotaHandoff", () => {
  const nota = montarNotaHandoff(lead, atividades);
  it("traz SDR, origem, valor formatado em BRL e observações", () => {
    expect(nota).toContain("Fechado por: Rodrigo (SDR)");
    expect(nota).toContain("Origem: Indicação");
    expect(nota).toMatch(/Valor negociado: R\$\s?1\.500/);
    expect(nota).toContain("12 posts/mês + tráfego");
  });
  it("inclui só histórico com conteúdo (ignora 'etapa' e texto vazio)", () => {
    expect(nota).toContain("Reunião de fechamento");
    expect(nota).toContain("Ligou pedindo referências");
    expect(nota).not.toContain("Movido para Ganho");
  });
  it("não quebra sem atividades nem valor", () => {
    const n = montarNotaHandoff({ empresa: "X", valor_orcamento: 0 });
    expect(n).toContain("🤝 Handoff do comercial");
    expect(n).not.toContain("Valor negociado");
  });
});

describe("montarMensagemGrupoHandoff", () => {
  const msg = montarMensagemGrupoHandoff(lead);
  it("anuncia o cliente, o SDR e ensina a iniciar o onboarding", () => {
    expect(msg).toContain("*Cliente novo fechado pelo comercial: Padaria do Zé*");
    expect(msg).toContain("Rodrigo (SDR)");
    expect(msg).toContain("Lone, entrou o cliente Padaria do Zé no grupo");
  });
});
