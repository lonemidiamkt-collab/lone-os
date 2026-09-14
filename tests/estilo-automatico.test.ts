import { describe, it, expect } from "vitest";
import { escolherArtes, decidirReleitura, type ArteCandidata } from "@/lib/traffic/estilo-automatico";

// Estilo visual lido das ARTES ENTREGUES (Roberto, 14/09): prefere o que foi publicado/aprovado,
// nunca usa referência do cliente, e relê sozinho quando vence ou chegam artes novas.
const c = (o: Partial<ArteCandidata> & { url: string }): ArteCandidata => ({ tipo: "entrega", status: "published", criadoEm: "2026-09-01T00:00:00Z", posicao: 0, ...o });

describe("escolherArtes", () => {
  it("publicada > agendada > aprovada pelo cliente > em aprovação; referência do cliente nunca entra", () => {
    const out = escolherArtes([
      c({ url: "a.png", status: "approval" }),
      c({ url: "ref.png", tipo: "referencia", status: "published" }),
      c({ url: "b.png", status: "client_approval" }),
      c({ url: "c.png", status: "published" }),
      c({ url: "d.png", status: "scheduled" }),
    ]);
    expect(out).toEqual(["c.png", "d.png", "b.png", "a.png"]);
  });
  it("anexo sem tipo (antes da separação) só conta se o card passou da aprovação interna; vídeo e duplicata ficam de fora", () => {
    const out = escolherArtes([
      c({ url: "velha-ok.png", tipo: null, status: "published" }),
      c({ url: "velha-nao.png", tipo: null, status: "approval" }),
      c({ url: "video.mp4", status: "published" }),
      c({ url: "velha-ok.png", tipo: null, status: "published", criadoEm: "2026-08-01T00:00:00Z" }),
    ]);
    expect(out).toEqual(["velha-ok.png"]);
  });
  it("mais recente primeiro dentro do mesmo status e respeita o máximo", () => {
    const out = escolherArtes([c({ url: "1.png", criadoEm: "2026-09-01" }), c({ url: "2.png", criadoEm: "2026-09-10" }), c({ url: "3.png", criadoEm: "2026-09-05" })], 2);
    expect(out).toEqual(["2.png", "3.png"]);
  });
});

describe("decidirReleitura", () => {
  const agora = new Date("2026-09-14T12:00:00Z");
  const leitura = (fonte: string, diasAtras: number) => ({ fonte, criadoEm: new Date(agora.getTime() - diasAtras * 86_400_000).toISOString(), imagens: [] });
  it("sem leitura e com 2+ artes → lê", () => expect(decidirReleitura({ ultima: null, artesNovasDesde: 5, totalArtes: 5, agora })).toEqual({ reler: true, motivo: "sem_leitura" }));
  it("menos de 2 artes → não lê (sem inventar estilo de 1 peça)", () => expect(decidirReleitura({ ultima: null, artesNovasDesde: 1, totalArtes: 1, agora }).motivo).toBe("poucas_artes"));
  it("print subido por gente há 10 dias prevalece — mesmo com artes novas", () => expect(decidirReleitura({ ultima: leitura("print", 10), artesNovasDesde: 9, totalArtes: 9, agora }).motivo).toBe("print_recente"));
  it("leitura de 46 dias venceu → relê; 6+ artes novas → relê; senão em dia", () => {
    expect(decidirReleitura({ ultima: leitura("artes", 46), artesNovasDesde: 0, totalArtes: 6, agora })).toEqual({ reler: true, motivo: "vencida" });
    expect(decidirReleitura({ ultima: leitura("artes", 10), artesNovasDesde: 6, totalArtes: 6, agora })).toEqual({ reler: true, motivo: "artes_novas" });
    expect(decidirReleitura({ ultima: leitura("artes", 10), artesNovasDesde: 5, totalArtes: 6, agora })).toEqual({ reler: false, motivo: "em_dia" });
  });
});
