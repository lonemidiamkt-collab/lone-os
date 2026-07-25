// Teste do PULSO (atividade bidirecional). Função pura — sem banco.
// O bug que ele previne: tratar "não tenho o dado" como "o cliente está mal" (era o que fazia a
// carteira inteira aparecer como "inativo" no dashboard).
import { describe, it, expect } from "vitest";
import { calcularPulso, type SinaisPulso } from "@/lib/pulse/compute";

const base: SinaisPulso = {
  diasSemPostNosso: 1, diasDesdeUltimaEntregaDesigner: 1, cardsVencidos: 0, artesParadasDias: null,
  diasSemSpend: 0, temTrafego: true, temSocial: true,
  diasSemFalar: 1, diasDesdeUltimaDemanda: 2, diasDesdeAprovacaoCliente: null,
  elogios30d: 0, reclamacoes14d: 0,
};

describe("calcularPulso — a invariante do 'não sei'", () => {
  it("cliente SEM grupo mapeado não é acusado de ter sumido", () => {
    const p = calcularPulso({ ...base, diasSemFalar: null, diasDesdeUltimaDemanda: null, diasDesdeAprovacaoCliente: null });
    expect(p.detalhe.find((d) => d.motivo === "cliente_sumiu")).toBeUndefined();
    expect(p.nivel).toBe("saudavel");
  });
  it("cliente só de tráfego não é cobrado por post nem por produção", () => {
    const p = calcularPulso({ ...base, temSocial: false, diasSemPostNosso: 90, cardsVencidos: 5 });
    expect(p.detalhe.some((d) => d.motivo === "paramos_de_postar")).toBe(false);
    expect(p.detalhe.some((d) => d.motivo === "producao_travada")).toBe(false);
  });
  it("cliente sem tráfego não é cobrado por anúncio parado", () => {
    const p = calcularPulso({ ...base, temTrafego: false, diasSemSpend: null });
    expect(p.detalhe.some((d) => d.motivo === "anuncio_parado")).toBe(false);
  });
  it("sem sinal nenhum → 'sem_sinal', fora da lista de atenção", () => {
    const p = calcularPulso({
      ...base, temSocial: false, temTrafego: false, diasSemSpend: null,
      diasSemFalar: null, diasDesdeUltimaDemanda: null, diasDesdeAprovacaoCliente: null,
    });
    expect(p.semSinal).toBe(true);
    expect(p.nivel).toBe("sem_sinal");
  });
});

describe("calcularPulso — motivo dominante", () => {
  it("cliente sumido há 20d domina e o chip diz o motivo", () => {
    const p = calcularPulso({ ...base, diasSemFalar: 20, diasDesdeUltimaDemanda: 20, diasDesdeAprovacaoCliente: null });
    expect(p.motivoDominante).toBe("cliente_sumiu");
    expect(p.motivoLabel).toContain("20d");
    expect(p.nivel === "risco" || p.nivel === "critico").toBe(true);
  });
  it("nós paramos de postar há 15d vira o motivo quando o cliente está ativo", () => {
    const p = calcularPulso({ ...base, diasSemPostNosso: 15 });
    expect(p.motivoDominante).toBe("paramos_de_postar");
    expect(p.motivoLabel).toContain("15d");
  });
  it("produção travada aparece com a contagem de atrasos", () => {
    const p = calcularPulso({ ...base, cardsVencidos: 3 });
    expect(p.motivoDominante).toBe("producao_travada");
    expect(p.motivoLabel).toContain("3");
  });
  it("anúncio parado há 10d é detectado", () => {
    const p = calcularPulso({ ...base, diasSemSpend: 10 });
    expect(p.motivoDominante).toBe("anuncio_parado");
  });
  it("empate resolve na ordem de ação (cliente sumido ganha de anúncio)", () => {
    const p = calcularPulso({ ...base, diasSemFalar: 20, diasDesdeUltimaDemanda: 20, diasSemSpend: 30 });
    expect(p.motivoDominante).toBe("cliente_sumiu");
  });
});

describe("calcularPulso — sentimento", () => {
  it("tudo em dia = saudável", () => {
    expect(calcularPulso(base).nivel).toBe("saudavel");
    expect(calcularPulso(base).motivoDominante).toBeNull();
  });
  it("reclamação recente derruba o score", () => {
    const semRec = calcularPulso({ ...base, diasSemPostNosso: 10 });
    const comRec = calcularPulso({ ...base, diasSemPostNosso: 10, reclamacoes14d: 1 });
    expect(comRec.score).toBeLessThan(semRec.score);
  });
  it("elogio recente protege (sinal hoje ignorado pelo sistema)", () => {
    const sem = calcularPulso({ ...base, diasSemPostNosso: 10 });
    const com = calcularPulso({ ...base, diasSemPostNosso: 10, elogios30d: 2 });
    expect(com.score).toBeGreaterThan(sem.score);
  });
});
