import { describe, it, expect } from "vitest";
import { conferirContato } from "@/lib/cs/conferencia-contato";

// Roberto: "o que tem feito muito de errado na CIIL é colocar o endereço errado — não conferir se é
// a arte pra loja de Araruama ou pra de São Gonçalo". É o erro mais caro e o mais bobo de evitar.
describe("conferência de contato na arte", () => {
  it("cliente com duas unidades vira aviso, não uma linha qualquer", () => {
    const r = conferirContato(
      { endereco: "Av. Getúlio Vargas, 221, Araruama · Av. Presidente Kennedy, 735, São Gonçalo", telefone: "(22) 98800-6164" },
      "arte de vacina pra semana",
      "CIIL",
    );
    expect(r.multiplasUnidades).toBe(true);
    expect(r.texto).toMatch(/2 unidades/);
    expect(r.texto).toMatch(/QUAL entra nesta peça/i);
    expect(r.texto).toContain("Araruama");
    expect(r.texto).toContain("São Gonçalo");
  });

  it("cliente com uma unidade entrega os dados sem alarme", () => {
    const r = conferirContato(
      { endereco: "R. Bernardo Vasconcelos, 680 – Centro, Araruama", telefone: "(22) 99793-2384" },
      "post de campanha de vacinação",
      "Veterinária Regional",
    );
    expect(r.multiplasUnidades).toBe(false);
    expect(r.texto).toContain("680");
    expect(r.texto).toContain("(22) 99793-2384");
    expect(r.texto).not.toMatch(/QUAL entra/i);
  });

  it("cadastro vazio avisa de forma acionável", () => {
    const r = conferirContato({}, "qualquer pedido", "Cliente Novo");
    expect(r.texto).toMatch(/sem endereço e telefone no cadastro/i);
  });

  it("reconhece quando o pedido já fala de endereço", () => {
    expect(conferirContato({ endereco: "x" }, "usar o endereço da loja de Iguaba", "C").pedidoMencionaContato).toBe(true);
    expect(conferirContato({ endereco: "x" }, "post sobre cimento", "C").pedidoMencionaContato).toBe(false);
  });
});
