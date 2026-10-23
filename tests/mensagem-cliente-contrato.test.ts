// tests/mensagem-cliente-contrato.test.ts — a mensagem de qua/sex escrita pela IA respeita o CONTRATO
// (auditoria 21/10/2026, item 5.5).
//
// O erro original: o texto neutro já escolhia pelo contrato, mas a versão da IA lia o
// metric_snapshots — que a varredura grava pra todo cliente com conta de anúncio vinculada, inclusive
// o Dumar, que é só social. Com conversas suficientes, o assunto virava "os anúncios geraram X
// conversas" no grupo de quem não contratou anúncio.

import { describe, it, expect, vi, beforeEach } from "vitest";

/** Banco de mentira: cada tabela devolve uma lista (consulta aguardada) ou um registro (maybeSingle). */
const tabelas: Record<string, { lista?: unknown[]; um?: unknown }> = {};
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "gte", "order", "limit", "in", "not"]) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve({ data: tabelas[t]?.um ?? null, error: null });
      q.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabelas[t]?.lista ?? [], error: null }).then(ok, erro);
      return q;
    },
  },
}));

import { coletarSinais, escolherFoco, revisarMensagem, type SinaisCliente } from "@/lib/cs/mensagem-cliente";

/** Semana boa de anúncio: 49 conversas, pico de 14 na terça. */
const METRICAS = [
  { metric_date: "2026-10-20", conversions: 14 },
  { metric_date: "2026-10-19", conversions: 9 },
  { metric_date: "2026-10-18", conversions: 9 },
  { metric_date: "2026-10-17", conversions: 9 },
  { metric_date: "2026-10-16", conversions: 8 },
];

function cliente(service_type: string | null) {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  tabelas.clients = { um: { last_client_msg_at: new Date().toISOString(), pergunta_produtos_semana: false, service_type } };
  tabelas.metric_snapshots = { lista: METRICAS };
}

describe("coletarSinais — o contrato decide se o anúncio vira assunto", () => {
  beforeEach(() => cliente(null));

  it("SÓ SOCIAL com conta vinculada (o caso do Dumar): o número de conversas não entra", async () => {
    cliente("assessoria_social");
    const s = await coletarSinais("dumar");
    expect(s.contratoDeAnuncio).toBe(false);
    expect(s.conversasDoAnuncio).toBeNull();
    expect(s.melhorDia).toBeNull();
    const f = await escolherFoco(s);
    expect(f.objetivo).not.toBe("resultado_anuncio");
    expect(f.fatos.join(" ")).not.toMatch(/an[úu]ncio|conversas/);
  });

  it("com contrato de tráfego, o mesmo número continua virando assunto", async () => {
    cliente("assessoria_trafego");
    const s = await coletarSinais("trafego");
    expect(s.contratoDeAnuncio).toBe(true);
    expect(s.conversasDoAnuncio).toBe(49);
    const f = await escolherFoco(s);
    expect(f.objetivo).toBe("resultado_anuncio");
  });

  it("contrato desconhecido (service_type vazio) conta como sem anúncio — na dúvida, cala", async () => {
    cliente(null);
    const s = await coletarSinais("sem-contrato");
    expect(s.contratoDeAnuncio).toBe(false);
    expect(s.conversasDoAnuncio).toBeNull();
  });
});

const BASE: SinaisCliente = {
  aguardandoAprovacao: 0, aprovouRecentemente: true, esperandoDesde: null, entreguesNaSemana: 0, diasSemFalar: 2,
  promoDoMesSemResposta: false, destaqueIg: null, postsNaSemana: null, pedirProdutosHoje: false,
  conversasDoAnuncio: null, melhorDia: null, contratoDeAnuncio: false,
};

describe("escolherFoco — segunda barreira", () => {
  it("mesmo que o sinal chegue preenchido, sem contrato não há foco de anúncio", async () => {
    const f = await escolherFoco({ ...BASE, conversasDoAnuncio: 49 });
    expect(f.objetivo).not.toBe("resultado_anuncio");
  });
});

describe("revisarMensagem — o texto da IA não fala de anúncio com quem não contratou", () => {
  it("barra anúncio sem número (o número já era barrado; a frase não)", () => {
    const r = revisarMensagem("Oi, pessoal! Os anúncios trouxeram bastante gente essa semana. Como está o movimento?", BASE);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("contrato não inclui tráfego");
  });

  it("barra o 'de olho nas campanhas' que o Dumar recebeu", () => {
    expect(revisarMensagem("Oi, pessoal! Seguimos de olho nas campanhas por aqui. Precisam de algo?", BASE).ok).toBe(false);
    expect(revisarMensagem("Oi, pessoal! O tráfego está rodando bem. Como está a loja?", BASE).ok).toBe(false);
  });

  it("cliente de tráfego pode ouvir sobre campanha", () => {
    expect(revisarMensagem("Oi, pessoal! Seguimos de olho nas campanhas por aqui. Precisam de algo?",
      { ...BASE, contratoDeAnuncio: true }).ok).toBe(true);
  });

  it("mensagem de social normal passa", () => {
    expect(revisarMensagem("Oi, pessoal! A equipe está acompanhando tudo de perto. Precisam de algo pra semana?", BASE).ok).toBe(true);
  });
});
