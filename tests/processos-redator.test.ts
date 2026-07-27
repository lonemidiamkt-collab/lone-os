// Teste OFFLINE da validação de processo (sem IA, sem banco).
// Esta função decide se um rascunho vira processo publicável ou volta pro autor — é a barreira
// entre "documentação executável" e "parágrafo bonito que ninguém consegue seguir".
import { describe, it, expect } from "vitest";
import { validarProcesso, podeSalvar, pendencias, type ProcessoRascunho, type PassoRascunho } from "@/lib/processos/redator";

const passo = (over: Partial<PassoRascunho> = {}): PassoRascunho => ({
  seq: 1, titulo: "Solicitar arte ao designer",
  instrucao: "Até 1 dia útil antes da postagem, abrir o card com produto, preço, benefício e objetivo.",
  papel: "social", sistema: "Lone OS > Designer", slaMinutos: 480,
  evidencia: "card criado no board do designer", decisao: null, opcional: false, ...over,
});

const bom: ProcessoRascunho = {
  titulo: "Pedido de arte ao designer",
  objetivo: "Garantir que toda arte chegue com briefing completo e prazo suficiente.",
  problema: "Pedidos em cima da hora chegam sem preço e voltam pra correção.",
  escopo: "Do pedido do social até a entrega do designer.",
  foraDeEscopo: "Aprovação do cliente.",
  gatilho: "Quando a pauta da semana é aprovada.",
  frequencia: "toda segunda-feira",
  preRequisitos: "Pauta aprovada.",
  entradas: "Pauta da semana e briefing do cliente.",
  saidas: "Arte entregue no board.",
  criterioPronto: "Arte entregue e conferida pelo social.",
  criteriosQualidade: "Preço, produto e CTA conferidos.",
  sla: "1 dia útil",
  donoPapel: "social",
  passos: [passo()],
  kpis: [{ nome: "Artes no prazo", definicao: "% entregue até a data", fonte: "content_cards", meta: "95%", acaoAbaixo: "Revisar carga do designer na reunião de segunda." }],
  riscos: [{ risco: "Pedido em cima da hora", controle: "Prazo mínimo de 1 dia útil", escalonamento: "gestor" }],
  excecoes: [{ situacao: "Urgência do cliente", tratamento: "Gestor autoriza e realoca", escalonarPara: "gestor" }],
};

describe("validarProcesso — o que impede de salvar", () => {
  it("processo completo passa", () => {
    const p = validarProcesso(bom);
    expect(p.filter((x) => x.gravidade === "bloqueia")).toHaveLength(0);
    expect(podeSalvar(p)).toBe(true);
  });

  it("BLOQUEIA processo sem dono — ninguém segue processo sem dono", () => {
    const p = validarProcesso({ ...bom, donoPapel: "" });
    expect(podeSalvar(p)).toBe(false);
    expect(p.some((x) => x.campo === "donoPapel")).toBe(true);
  });

  it("BLOQUEIA nome de pessoa como dono — gente entra e sai, o papel fica", () => {
    const p = validarProcesso({ ...bom, donoPapel: "Carlos Augusto" });
    expect(podeSalvar(p)).toBe(false);
    expect(p.find((x) => x.campo === "donoPapel")?.mensagem).toContain("não é um papel");
  });

  it("BLOQUEIA passo sem responsável", () => {
    const p = validarProcesso({ ...bom, passos: [passo({ papel: null })] });
    expect(podeSalvar(p)).toBe(false);
    expect(p.some((x) => x.mensagem.includes("não tem responsável"))).toBe(true);
  });

  it("BLOQUEIA passo obrigatório sem evidência — sem isso não dá pra auditar", () => {
    const p = validarProcesso({ ...bom, passos: [passo({ evidencia: null })] });
    expect(podeSalvar(p)).toBe(false);
    expect(p.some((x) => x.mensagem.includes("comprova"))).toBe(true);
  });

  it("passo OPCIONAL pode não ter evidência", () => {
    const p = validarProcesso({ ...bom, passos: [passo({ evidencia: null, opcional: true })] });
    expect(podeSalvar(p)).toBe(true);
  });

  it("BLOQUEIA 'periodicamente' como frequência", () => {
    const p = validarProcesso({ ...bom, frequencia: "periodicamente" });
    expect(podeSalvar(p)).toBe(false);
    expect(p.find((x) => x.campo === "frequencia")?.mensagem).toContain("não é frequência");
  });

  it("BLOQUEIA processo sem passo nenhum", () => {
    const p = validarProcesso({ ...bom, passos: [] });
    expect(podeSalvar(p)).toBe(false);
  });

  it("BLOQUEIA KPI sem fonte do dado", () => {
    const p = validarProcesso({ ...bom, kpis: [{ nome: "Engajamento", definicao: "x", fonte: "", meta: "5%", acaoAbaixo: "revisar" }] });
    expect(podeSalvar(p)).toBe(false);
  });

  it("AVISA (sem bloquear) KPI sem ação abaixo da meta", () => {
    const p = validarProcesso({ ...bom, kpis: [{ nome: "Alcance", definicao: "x", fonte: "Instagram", meta: "10k", acaoAbaixo: "" }] });
    expect(podeSalvar(p)).toBe(true);
    expect(p.some((x) => x.gravidade === "aviso")).toBe(true);
  });

  it("AVISA linguagem vaga no passo, mas deixa salvar", () => {
    const p = validarProcesso({ ...bom, passos: [passo({ instrucao: "Revisar a arte quando necessário." })] });
    expect(podeSalvar(p)).toBe(true);
    expect(p.some((x) => x.gravidade === "aviso" && x.mensagem.includes("vaga"))).toBe(true);
  });
});

describe("pendencias — o que a IA admitiu não saber", () => {
  it("extrai os 'A DEFINIR' pra virarem pendência visível, não sumirem no texto", () => {
    const l = pendencias({
      ...bom,
      sla: "A DEFINIR: prazo combinado com o cliente",
      passos: [passo({ instrucao: "Enviar ao cliente. A DEFINIR: qual canal oficial" })],
    });
    expect(l).toHaveLength(2);
    expect(l.join(" ")).toContain("prazo combinado");
    expect(l.join(" ")).toContain("canal oficial");
  });

  it("processo sem lacuna não gera pendência", () => {
    expect(pendencias(bom)).toHaveLength(0);
  });
});

// Papel de PROCESSO não é papel de LOGIN: quem executa inclui gente sem acesso ao painel.
describe("papéis que existem na operação mas não no login", () => {
  it("aceita EDITOR de vídeo — está no playbook §7 e não tem login no sistema", () => {
    const p = validarProcesso({
      ...bom, donoPapel: "social",
      passos: [passo({ titulo: "Editar o Reels", papel: "editor", evidencia: "vídeo entregue no board" })],
    });
    expect(podeSalvar(p)).toBe(true);
  });

  it("aceita CLIENTE quando o passo depende dele (aprovar arte, mandar promoção)", () => {
    const p = validarProcesso({
      ...bom,
      passos: [passo({ titulo: "Aprovar a arte", papel: "cliente", evidencia: "aprovação no portal ou no grupo" })],
    });
    expect(podeSalvar(p)).toBe(true);
  });

  it("continua barrando cargo inventado", () => {
    const p = validarProcesso({ ...bom, passos: [passo({ papel: "estagiário de mídia" })] });
    expect(podeSalvar(p)).toBe(false);
  });
});
