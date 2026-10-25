// tests/agentes-central.test.tsx — a Central de Agentes de ponta a ponta, com banco INVENTADO:
// o uso real sai de llm_calls/agent_runs, a etiqueta diz de qual agente é, nada de dinheiro na tela.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

type Linha = Record<string, unknown>;
const banco = vi.hoisted(() => ({ dados: {} as Record<string, Linha[]>, falhas: new Set<string>(), colunasLidas: [] as string[] }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const filtros: ((r: Linha) => boolean)[] = [];
      let ordem: { col: string; asc: boolean } | null = null;
      let faixa: [number, number] | null = null;
      let limite: number | null = null;
      const q: Record<string, unknown> = {};
      q.select = (cols: string) => { banco.colunasLidas.push(`${tabela}:${cols}`); return q; };
      q.eq = (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; };
      q.neq = (c: string, v: unknown) => { filtros.push((r) => r[c] !== v); return q; };
      q.gte = (c: string, v: string) => { filtros.push((r) => String(r[c]) >= v); return q; };
      q.in = (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return q; };
      q.like = (c: string, p: string) => { filtros.push((r) => String(r[c] ?? "").startsWith(p.replace(/%$/, ""))); return q; };
      q.order = (col: string, o?: { ascending?: boolean }) => { ordem = { col, asc: o?.ascending !== false }; return q; };
      q.range = (a: number, b: number) => { faixa = [a, b]; return q; };
      q.limit = (n: number) => { limite = n; return q; };
      const resultado = () => {
        if (banco.falhas.has(tabela)) return { data: null, error: { message: `${tabela} fora do ar` } };
        let rs = (banco.dados[tabela] ?? []).filter((r) => filtros.every((f) => f(r)));
        if (ordem) { const { col, asc } = ordem; rs = [...rs].sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : 1) * (asc ? 1 : -1)); }
        if (faixa) rs = rs.slice(faixa[0], faixa[1] + 1);
        if (limite != null) rs = rs.slice(0, limite);
        return { data: rs, error: null };
      };
      q.maybeSingle = () => { const r = resultado(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); };
      q.then = (ok: (v: unknown) => unknown, ruim?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ruim);
      return q;
    },
  },
}));

// A Central de Automações tem o próprio teste; aqui ela devolve duas rotinas prontas.
vi.mock("@/lib/automacoes/painel", () => ({
  montarPainel: async () => ({
    configs: [],
    inicioMonitoramento: null,
    linhas: [
      { id: "cs-releitura", nome: "Releitura do ciclo", agendaBRT: "domingo, 8h", saude: "falhou", config: { ligado: true, pausadoAte: null },
        ultima: { em: "2026-10-26T11:00:00Z" }, ultimoSucessoEm: "2026-10-19T11:00:00Z", semana: { ok: 0, erro: 1, pulado: 0 }, maxSilencioHoras: 192 },
      { id: "creative-atributos", nome: "Atributos dos criativos", agendaBRT: "seg a sex, 7h30", saude: "desligado", config: { ligado: false, pausadoAte: null },
        ultima: null, ultimoSucessoEm: null, semana: { ok: 0, erro: 0, pulado: 0 }, maxSilencioHoras: 74 },
    ],
  }),
}));

const agora = new Date("2026-10-26T15:00:00Z");
const h = (horas: number) => new Date(agora.getTime() - horas * 3600_000).toISOString();

beforeEach(() => {
  banco.falhas.clear();
  banco.colunasLidas.length = 0;
  banco.dados = {
    llm_calls: [
      { origem: "cs:classificador", ok: true, created_at: h(1), erro: null, custo_usd: 0.5 },
      { origem: "cs:classificador", ok: true, created_at: h(2), erro: null, custo_usd: 0.5 },
      { origem: "cs:revisao-arte", ok: false, created_at: h(3), erro: "Rate limit reached", custo_usd: 0 },
      { origem: "cs:revisao-arte", ok: true, created_at: h(4), erro: null, custo_usd: 0.9 },
      { origem: "app/.next/server/app/api/ai/morning-briefing/route", ok: true, created_at: h(30), erro: null, custo_usd: 0.1 },
      { origem: "cs:faxina-regras", ok: true, created_at: h(24 * 20), erro: null, custo_usd: 0.1 },
    ],
    agent_runs: [
      { origem: "inbound", iniciado_em: h(1), erro: null },
      { origem: "cron:creative-vencedores", iniciado_em: h(6), erro: "TypeError: x" },
    ],
    automation_settings: [{ job: "agente:loninho", enabled: false, paused_until: null, updated_by: "roberto@lone", updated_at: h(1) }],
    agency_settings: [{ key: "cs_msg_ia_enabled", value: "revisao" }, { key: "ia_imagem", value: "off" }],
  };
});

const { montarCentralDeAgentes } = await import("@/lib/agentes/central-server");

describe("montar a Central", () => {
  it("cada chamada cai no agente da etiqueta; a sem etiqueta aparece separada", async () => {
    const c = await montarCentralDeAgentes(agora);
    const por = (id: string) => c.agentes.find((l) => l.agente.id === id)!;
    expect(c.agentes).toHaveLength(49);
    expect(por("classificador").uso.chamadas7d).toBe(2);
    expect(por("revisor-arte").uso).toMatchObject({ chamadas7d: 2, falhasIa7d: 1 });
    // A chamada mais recente do revisor falhou e nada deu certo depois.
    expect(por("revisor-arte").estado).toBe("falhando");
    expect(por("revisor-arte").motivo).toContain("Rate limit reached");
    expect(c.semEtiqueta.total).toBe(1);
    expect(c.semEtiqueta.porOrigem[0]).toMatchObject({ rotulo: "chamadas sem etiqueta" });
    // Fora da semana: a última vez nos 90 dias.
    expect(por("faxina-regras").ultimaEm).toBe(h(24 * 20));
    expect(por("faxina-regras").estado).toBe("funcionando");
    // Execução da rotina com erro conta como falha do agente dela.
    expect(por("analise-vencedores").uso.errosExecucao7d).toBe(1);
  });

  it("Loninho desligado na Central: quem só roda pelo webhook aparece desligado", async () => {
    const c = await montarCentralDeAgentes(agora);
    expect(c.loninho).toMatchObject({ ligado: false, alteradoPor: "roberto@lone" });
    expect(c.agentes.find((l) => l.agente.id === "classificador")!.estado).toBe("desligado");
  });

  it("rotina falhou → agente falhando; rotina desligada → agente desligado; chave desligada → desligado", async () => {
    const c = await montarCentralDeAgentes(agora);
    const est = (id: string) => c.agentes.find((l) => l.agente.id === id)!.estado;
    expect(est("releitura-ciclo")).toBe("falhando");
    expect(est("atributos-criativos")).toBe("desligado");
    expect(est("arte-ia")).toBe("desligado");
    expect(est("mensagem-quarta-sexta")).not.toBe("desligado"); // "revisao" é ligada
  });

  it("nunca lê coluna de custo", async () => {
    await montarCentralDeAgentes(agora);
    expect(banco.colunasLidas.filter((c) => /custo/.test(c))).toEqual([]);
  });

  it("parte do banco fora: mostra o resto e diz o que faltou, sem inventar 'IA fora'", async () => {
    banco.falhas.add("agent_runs");
    const c = await montarCentralDeAgentes(agora);
    expect(c.agentes).toHaveLength(49);
    expect(c.avisos.join(" ")).toMatch(/execuções/);
    banco.falhas.add("llm_calls");
    const d = await montarCentralDeAgentes(agora);
    expect(d.iaFora).toBeNull();
    expect(d.avisos.join(" ")).toMatch(/chamadas de IA/);
  });
});

// ── A tela ──────────────────────────────────────────────────────────────────────────────────────
const chamada = vi.hoisted(() => ({ resposta: null as unknown }));
vi.mock("@/lib/api/chamar", () => ({ chamar: async () => ({ ok: true, data: chamada.resposta, status: 200 }) }));
vi.mock("@/lib/context/RoleContext", () => ({ useRole: () => ({ role: "admin", hydrated: true }) }));
vi.mock("@/components/Header", () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));

describe("a tela", () => {
  it("lista os 49 por área, com o interruptor do Loninho e sem dinheiro", async () => {
    chamada.resposta = await montarCentralDeAgentes(agora);
    const { default: Pagina } = await import("@/app/agentes/page");
    render(<Pagina />);
    expect(await screen.findByText("Classificador de pedidos")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Central de Agentes" })).toBeTruthy();
    expect(screen.getByText(/O Loninho está desligado/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Religar o Loninho/ })).toBeTruthy();
    const total = screen.getByText("Agentes de IA").closest("button") as HTMLElement;
    expect(within(total).getByText("49")).toBeTruthy();
    for (const area of ["Atendimento", "Social e conteúdo", "Design", "Tráfego", "Comercial", "Gestão"]) {
      expect(screen.getByRole("heading", { name: area })).toBeTruthy();
    }
    expect(document.body.textContent).not.toMatch(/US\$|R\$|custo/i);
  });
});
