// Teste OFFLINE do alerta de conexão do WhatsApp (sem rede).
// O caso real: em 27/07 a API dizia "open" e a conexão estava fechada — 38 relatórios falharam
// em silêncio. O alerta precisa dizer isso com todas as letras.
import { describe, it, expect } from "vitest";
import { textoAlerta, type DiagnosticoNumero } from "@/lib/whatsapp/saude";

const vivo = (rotulo: string): DiagnosticoNumero =>
  ({ rotulo, instancia: rotulo, estadoDeclarado: "open", vivo: true, reconectado: false });

describe("textoAlerta", () => {
  it("tudo de pé → não manda nada (alerta que toca à toa ninguém escuta)", () => {
    expect(textoAlerta([vivo("Gestor"), vivo("Agente")])).toBe("");
  });

  it("número que voltou sozinho no reconnect não vira alerta", () => {
    const d: DiagnosticoNumero = { rotulo: "Gestor", instancia: "g", estadoDeclarado: "close", vivo: true, reconectado: true };
    expect(textoAlerta([d])).toBe("");
  });

  it("caído → avisa e diz O QUE para de sair", () => {
    const d: DiagnosticoNumero = {
      rotulo: "Número do gestor (Julio)", instancia: "Julio_gestor",
      estadoDeclarado: "close", vivo: false, reconectado: false, erro: "Connection Closed",
    };
    const m = textoAlerta([d]);
    expect(m).toContain("WhatsApp fora do ar");
    expect(m).toContain("Julio");
    expect(m).toContain("Connection Closed");
    expect(m).toContain("precisa de gente");
  });

  it("DENUNCIA o status mentiroso — foi o que escondeu a falha por horas", () => {
    const d: DiagnosticoNumero = {
      rotulo: "Número do gestor (Julio)", instancia: "Julio_gestor",
      estadoDeclarado: "open", vivo: false, reconectado: false, erro: "Connection Closed",
    };
    expect(textoAlerta([d])).toContain('o painel mostra "conectado", mas a conexão real está fechada');
  });

  it("dois caídos aparecem os dois", () => {
    const f = (r: string): DiagnosticoNumero => ({ rotulo: r, instancia: r, estadoDeclarado: "close", vivo: false, reconectado: false });
    const m = textoAlerta([f("Gestor"), f("Agente")]);
    expect(m).toContain("2 número(s)");
    expect(m).toContain("Gestor");
    expect(m).toContain("Agente");
  });
});
