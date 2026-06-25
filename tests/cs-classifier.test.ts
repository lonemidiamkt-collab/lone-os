// Testes OFFLINE do A1 (sem chamar a API). Validam as partes puras: taxonomia,
// schema dos structured outputs (strict OpenAI) e montagem do prompt.
// A calibração contra a API real (few-shot do blueprint) fica em scripts/cs-classify.ts.

import { describe, it, expect } from "vitest";
import { CS_DEMAND_TYPES, CS_TAXONOMY } from "@/lib/cs/taxonomy";
import {
  A1_SCHEMA,
  A1_SYSTEM_INSTRUCTIONS,
  buildClassifierSystem,
  buildClassifierUserMessage,
  type ClassifierContext,
} from "@/lib/cs/classifier";

const CTX: ClassifierContext = {
  clienteNome: "Império dos Pisos",
  clienteNicho: "pisos/porcelanato",
  briefing: "tom acolhedor, cores neutras",
  nomesEquipeLone: ["Julio", "Carlos"],
  clientesDoGrupo: ["Império dos Pisos"],
};

describe("taxonomia CS", () => {
  it("tem meta para todos os tipos do enum", () => {
    for (const t of CS_DEMAND_TYPES) expect(CS_TAXONOMY[t]).toBeDefined();
    expect(Object.keys(CS_TAXONOMY).sort()).toEqual([...CS_DEMAND_TYPES].sort());
  });

  it("conversa/elogio = não-demanda; arte_nova = demanda → designer", () => {
    expect(CS_TAXONOMY.conversa.isDemanda).toBe(false);
    expect(CS_TAXONOMY.elogio.isDemanda).toBe(false);
    expect(CS_TAXONOMY.arte_nova.isDemanda).toBe(true);
    expect(CS_TAXONOMY.arte_nova.area).toBe("designer");
  });
});

describe("A1_SCHEMA (structured outputs strict)", () => {
  it("é object com additionalProperties:false e exige itens + observacao", () => {
    expect(A1_SCHEMA.type).toBe("object");
    expect(A1_SCHEMA.additionalProperties).toBe(false);
    expect(A1_SCHEMA.required).toEqual(expect.arrayContaining(["itens", "observacao"]));
  });

  it("strict: todas as props do item estão em required (cliente nullable)", () => {
    const itens = (A1_SCHEMA.properties as Record<string, { items: { required: string[]; properties: { tipo: { enum: string[] }; cliente: { type: string[] } } } }>).itens;
    expect(itens.items.required.sort()).toEqual(
      ["is_demanda", "tipo", "urgencia", "confianca", "resumo", "trecho_origem", "cliente"].sort(),
    );
    expect(itens.items.properties.tipo.enum.sort()).toEqual([...CS_DEMAND_TYPES].sort());
    expect(itens.items.properties.cliente.type).toContain("null");
  });
});

describe("buildClassifierSystem (prompt)", () => {
  it("começa pelo bloco estável e anexa o contexto do cliente depois", () => {
    const sys = buildClassifierSystem(CTX);
    expect(sys.startsWith(A1_SYSTEM_INSTRUCTIONS)).toBe(true); // prefixo idêntico → caching automático
    expect(sys).toContain("Império dos Pisos");
    expect(sys).toContain("Julio, Carlos");
  });
});

describe("buildClassifierUserMessage", () => {
  it("serializa autor: texto em linhas", () => {
    const msg = buildClassifierUserMessage([
      { author: "Cliente", text: "preciso de arte pra amanhã" },
      { author: "Julio", text: "bom dia" },
    ]);
    expect(msg).toContain("Cliente: preciso de arte pra amanhã");
    expect(msg).toContain("Julio: bom dia");
  });
});
