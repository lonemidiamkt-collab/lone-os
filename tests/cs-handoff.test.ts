// Teste OFFLINE do handoff comercial→CS — só as funções puras (sem banco/rede).
import { describe, it, expect } from "vitest";
import { montarNotaHandoff, montarMensagemGrupoHandoff, nomeDoLead } from "@/lib/cs/handoff";

const lead = {
  empresa: "Padaria do Zé",
  contato_nome: "José Silva",
  telefone: "22999990000",
  email: "ze@padaria.com",
  origem: "Indicação",
  responsavel: "Rodrigo (SDR)",
  observacoes: "Quer atrair mais clientes no fim de semana. Prometido: 12 posts/mês + tráfego. Fechou por R$ 1.500, desconto de 200 no 1º mês.",
};

const atividades = [
  { tipo: "reuniao", texto: "Reunião de fechamento — topou o plano growth." },
  { tipo: "ligacao", texto: "Ligou pedindo referências. Topou 1.345/mês." },
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
  it("traz SDR, origem e observações — SEM dinheiro (a ficha é lida pela equipe e pelo agente)", () => {
    expect(nota).toContain("Fechado por: Rodrigo (SDR)");
    expect(nota).toContain("Origem: Indicação");
    expect(nota).toContain("12 posts/mês + tráfego");
    expect(nota).not.toContain("Valor negociado");
    expect(nota).not.toMatch(/1\.500|1\.497|\b200\b/);
    expect(nota).toContain("Fechou por [valor], desconto de [valor]");
    expect(nota).toContain("Topou [valor]");
  });
  it("inclui só histórico com conteúdo (ignora 'etapa' e texto vazio)", () => {
    expect(nota).toContain("Reunião de fechamento");
    expect(nota).toContain("Ligou pedindo referências");
    expect(nota).not.toContain("Movido para Ganho");
  });
  it("não quebra sem atividades nem valor", () => {
    const n = montarNotaHandoff({ empresa: "X" });
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
  it("não leva valor para o grupo interno, nem escrito nas observações", () => {
    expect(msg).not.toMatch(/1\.500|\b200\b/);
    expect(msg).toContain("[valor]");
  });
});
