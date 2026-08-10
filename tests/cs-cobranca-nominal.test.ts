// tests/cs-cobranca-nominal.test.ts — o digest passa a ter destinatário.
//
// O que estes testes protegem: o Roberto reclamou que "tudo tem o mesmo peso e nada tem dono".
// O risco ao consertar é trocar um problema por outro — esconder item sem responsável, marcar
// tudo de vermelho, ou repetir o mesmo cliente três vezes porque ele aparece em três listas.

import { describe, it, expect } from "vitest";
import {
  coletarItens, agruparPorDono, paraEscalar, textoPorDono, canonizarDono, DIAS_PRA_ESCALAR,
} from "@/lib/cs/cobranca-nominal";
import type { SnapshotCS } from "@/lib/cs/snapshot";

const vazio: SnapshotCS = {
  pendentes: [], emProducao: 0, aguardandoAprovacao: 0, aguardandoDesigner: 0,
  entreguesAguardandoSocial: 0, prontasPraPostar: [], atrasados: [], encalhados: 0,
  esfriando: [], semPostsSemana: [], semPostsLabel: "essa semana", novosHoje: 0,
  eventosClientes: [], texto: "",
};

describe("agrupamento por dono", () => {
  it("agrupa por pessoa e põe o item mais velho no topo", () => {
    const snap: SnapshotCS = { ...vazio, prontasPraPostar: [
      { cliente: "Mr.distribuidora", titulo: "a", dias: 18, responsavel: "Carlos" },
      { cliente: "Araruama Tintas", titulo: "b", dias: 2, responsavel: "Carlos" },
      { cliente: "Tindaro Solar", titulo: "c", dias: 5, responsavel: "Pedro" },
    ]};
    const blocos = agruparPorDono(coletarItens(snap));
    // Carlos primeiro: o item dele é o mais velho da casa.
    expect(blocos[0].dono).toBe("Carlos");
    expect(blocos[0].itens[0].cliente).toBe("Mr.distribuidora");
    expect(blocos[0].itens[0].dias).toBe(18);
    expect(blocos[1].dono).toBe("Pedro");
  });

  it("ITEM SEM DONO APARECE — é justamente o que apodrece", () => {
    const snap: SnapshotCS = { ...vazio,
      prontasPraPostar: [{ cliente: "Órfão", titulo: "x", dias: 7, responsavel: null }],
      esfriando: [{ cliente: "Paradise", dias: 10 }],
    };
    const blocos = agruparPorDono(coletarItens(snap));
    const semDono = blocos.find((b) => b.dono === "sem dono");
    expect(semDono).toBeDefined();
    expect(semDono!.itens.map((i) => i.cliente).sort()).toEqual(["Paradise", "Órfão"]);
    // …mas vai pro fim: é recado pro time, não cobrança de alguém.
    expect(blocos[blocos.length - 1].dono).toBe("sem dono");
  });

  it("não repete o mesmo cliente que aparece em duas listas — fica o pior caso", () => {
    const snap: SnapshotCS = { ...vazio,
      prontasPraPostar: [{ cliente: "Império", titulo: "a", dias: 3, responsavel: "Carlos" }],
      atrasados: [{ cliente: "Império", titulo: "a", dias: 12, responsavel: "Carlos", designerEntregou: true }],
    };
    const blocos = agruparPorDono(coletarItens(snap));
    expect(blocos[0].itens).toHaveLength(1);
    expect(blocos[0].itens[0].dias).toBe(12);
    expect(blocos[0].itens[0].acao).toContain("prazo vencido");
  });

  it("card sem arte não vira cobrança do social — a fila ali é do designer", () => {
    const snap: SnapshotCS = { ...vazio, atrasados: [
      { cliente: "Sem arte", titulo: "a", dias: 9, responsavel: "Pedro", designerEntregou: false },
    ]};
    expect(coletarItens(snap)).toHaveLength(0);
  });

  it("mostra no máximo 3 por pessoa e diz quantos sobraram", () => {
    const snap: SnapshotCS = { ...vazio, prontasPraPostar: Array.from({ length: 7 }, (_, i) => (
      { cliente: `C${i}`, titulo: "t", dias: i + 1, responsavel: "Carlos" }
    ))};
    const b = agruparPorDono(coletarItens(snap))[0];
    expect(b.itens).toHaveLength(3);
    expect(b.resto).toBe(4);
  });
});

describe("escalada — por TEMPO, não por volume", () => {
  it("dez itens novos não escalam; um item velho escala", () => {
    const muitosNovos: SnapshotCS = { ...vazio, prontasPraPostar: Array.from({ length: 10 }, (_, i) => (
      { cliente: `C${i}`, titulo: "t", dias: 2, responsavel: "Carlos" }
    ))};
    expect(paraEscalar(agruparPorDono(coletarItens(muitosNovos)))).toHaveLength(0);

    const umVelho: SnapshotCS = { ...vazio, prontasPraPostar: [
      { cliente: "Mr.distribuidora", titulo: "t", dias: DIAS_PRA_ESCALAR, responsavel: "Carlos" },
    ]};
    const fora = paraEscalar(agruparPorDono(coletarItens(umVelho)));
    expect(fora).toHaveLength(1);
    expect(fora[0]).toMatchObject({ cliente: "Mr.distribuidora", dono: "Carlos" });
  });

  it("🔴 só no que passou do limite — se tudo é urgente, nada é", () => {
    const snap: SnapshotCS = { ...vazio, prontasPraPostar: [
      { cliente: "Velho", titulo: "t", dias: 18, responsavel: "Carlos" },
      { cliente: "Novo", titulo: "t", dias: 1, responsavel: "Carlos" },
    ]};
    const txt = textoPorDono(agruparPorDono(coletarItens(snap)));
    expect(txt).toMatch(/🔴 Velho/);
    expect(txt).toMatch(/• Novo/);
  });
});

describe("dia limpo", () => {
  it("sem nada pendente, não inventa seção", () => {
    expect(textoPorDono(agruparPorDono(coletarItens(vazio)))).toBe("");
  });
});

describe("canonizar dono — mesma pessoa, grafias diferentes", () => {
  // O time real da Lone, como está em team_members.
  const TIME = ["Carlos Augusto", "Pedro Henrique", "Julio", "Rodrigo", "Lucas Bueno", "Roberto Lino"];

  it('junta "Carlos" e "Carlos Augusto" num bloco só', () => {
    const snap: SnapshotCS = { ...vazio,
      // O snapshot encurta o dono do CARD…
      prontasPraPostar: [{ cliente: "Mr.distribuidora", titulo: "a", dias: 18, responsavel: "Carlos" }],
      // …e mantém o completo na PENDÊNCIA. Antes viravam duas pessoas no digest.
      pendentes: [{ codigo: "x", cliente: "Nova União", tipo: "pauta", resumo: "", dias: 9, responsavel: "Carlos Augusto" }],
    };
    const blocos = agruparPorDono(coletarItens(snap), TIME);
    expect(blocos).toHaveLength(1);
    expect(blocos[0].dono).toBe("Carlos Augusto");
    expect(blocos[0].itens).toHaveLength(2);
  });

  it('NÃO funde "Carlos Melo" com "Carlos Augusto" — são pessoas diferentes', () => {
    expect(canonizarDono("Carlos Melo", TIME)).toBe("Carlos Melo");
    expect(canonizarDono("Carlos", TIME)).toBe("Carlos Augusto");
  });

  it("sem lista do time, não inventa: deixa o nome como veio", () => {
    expect(canonizarDono("Carlos", [])).toBe("Carlos");
  });

  it("primeiro nome ambíguo fica como veio — fundir seria pior que separar", () => {
    expect(canonizarDono("Carlos", ["Carlos Augusto", "Carlos Melo"])).toBe("Carlos");
  });
});

describe("sucessão: quem saiu, quem herdou (10/08)", () => {
  // O Pedro Henrique saiu e o Thiago assumiu os 17 clientes. Cards e demandas antigos seguem
  // marcados com o nome do Pedro — cobrar ele seria cobrar um fantasma, e o trabalho ficaria
  // parado sem ninguém responsável. Isto NÃO reescreve histórico: o registro do que ele fez
  // continua no nome dele; só a cobrança de hoje muda de destinatário.
  const time = ["Carlos Augusto", "Thiago", "Rodrigo"];

  it("cobra o Thiago pelo que estava no nome do Pedro", () => {
    expect(canonizarDono("Pedro Henrique", time)).toBe("Thiago");
    expect(canonizarDono("pedro henrique", time)).toBe("Thiago");
  });

  it("não confunde com contato de cliente de sobrenome parecido", () => {
    expect(canonizarDono("Aquiles Alves Pedrosa", time)).toBe("Aquiles Alves Pedrosa");
  });

  it("quem está no time continua resolvendo normal", () => {
    expect(canonizarDono("Carlos", time)).toBe("Carlos Augusto");
    expect(canonizarDono("Thiago", time)).toBe("Thiago");
  });
});
