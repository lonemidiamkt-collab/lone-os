import { describe, it, expect } from "vitest";
import { decidirAviso, ehCardDoAgente, type CardCriado } from "@/lib/fila/consumidores/aviso-demanda";

// Fase 0B — o consumidor completa o aviso que o webhook não conseguiu dar. Decisão pura.

const card = (extra: Partial<CardCriado> = {}): CardCriado => ({
  id: "c1", client_id: "cli", client_name: "Quero Tintas", title: "Post do Dia do Cliente",
  social_media: "Carlos Augusto", requested_by_traffic: "🤖 Agente CS", due_date: "2026-09-18",
  status: "ideas", created_at: "2026-09-14T11:00:00Z", archived_at: null, ...extra,
});

describe("aviso de card criado pelo agente", () => {
  it("execução confirmou na hora → não repete", () => {
    const d = decidirAviso({ card: card(), correlationId: "e1", avisosDepois: 1, jaAvisouPelaFila: false });
    expect(d.acao).toBe("pular");
  });

  it("execução morreu antes de confirmar → avisa, com dono e prazo, e chave de idempotência", () => {
    const d = decidirAviso({ card: card(), correlationId: "e1", avisosDepois: 0, jaAvisouPelaFila: false });
    expect(d.acao).toBe("avisar");
    if (d.acao === "avisar") {
      expect(d.texto).toContain("*Post do Dia do Cliente*");
      expect(d.texto).toContain("*Quero Tintas*");
      expect(d.texto).toContain("dono: Carlos Augusto");
      expect(d.texto).toContain("prazo 18/09");
      expect(d.idem).toBe("aviso-demanda:c1");
    }
  });

  it("retry depois de um envio que deu certo → não duplica", () => {
    expect(decidirAviso({ card: card(), correlationId: "e1", avisosDepois: 0, jaAvisouPelaFila: true }).acao).toBe("pular");
  });

  it("card humano (painel) → ignora; o sino já avisa", () => {
    const d = decidirAviso({ card: card({ requested_by_traffic: "Julio" }), correlationId: null, avisosDepois: 0, jaAvisouPelaFila: false });
    expect(d.acao).toBe("ignorar");
    expect(ehCardDoAgente({ requested_by_traffic: "🤖 Agente CS (teste)" })).toBe(true);
    expect(ehCardDoAgente({ requested_by_traffic: null })).toBe(false);
  });

  it("card do agente sem execução (script, cron antigo) → não arrisca duplicar", () => {
    expect(decidirAviso({ card: card(), correlationId: null, avisosDepois: 0, jaAvisouPelaFila: false }).acao).toBe("ignorar");
  });

  it("card arquivado ou sumido nos 2 minutos → ignora", () => {
    expect(decidirAviso({ card: card({ archived_at: "2026-09-14T11:01:00Z" }), correlationId: "e1", avisosDepois: 0, jaAvisouPelaFila: false }).acao).toBe("ignorar");
    expect(decidirAviso({ card: null, correlationId: "e1", avisosDepois: 0, jaAvisouPelaFila: false }).acao).toBe("ignorar");
  });
});
