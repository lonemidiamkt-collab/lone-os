// A função que GRAVA a etapa de design (lib/conteudo/producao-server.ts) — contra um banco em memória.
// A regra é testada em conteudo-producao.test.ts; aqui, que a gravação segue a regra: pedido e card
// juntos, trava de concorrência, reprovação registrada, pedido sem card ganha card.
import { describe, it, expect, vi, beforeEach } from "vitest";

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
let seq = 0;
/** Roda antes de aplicar um update em content_cards — simula alguém mexendo no meio. */
let antesDoUpdateDoCard: (() => void) | null = null;

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private dados: Linha | null = null;
  private ordem: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  constructor(private tabela: string) { db[tabela] ??= []; }
  select() { return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filtros.push((r) => r[c] !== v); return this; }
  is(c: string, v: unknown) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  gte(c: string, v: string) { this.filtros.push((r) => String(r[c] ?? "") >= v); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.ordem = { col: c, asc: o?.ascending ?? true }; return this; }
  limit(n: number) { this.max = n; return this; }
  insert(d: Linha) { this.op = "insert"; this.dados = d; return this; }
  update(d: Linha) { this.op = "update"; this.dados = d; return this; }
  delete() { this.op = "delete"; return this; }
  maybeSingle() { return this.exec().then((r) => ({ data: r.data[0] ?? null, error: r.error })); }
  single() { return this.exec().then((r) => ({ data: r.data[0] ?? null, error: r.data[0] ? null : { message: "nada" } })); }
  then<T>(ok: (r: { data: Linha[]; error: null }) => T, erro?: (e: unknown) => T) { return this.exec().then(ok, erro); }
  private async exec(): Promise<{ data: Linha[]; error: null }> {
    const t = db[this.tabela];
    if (this.op === "insert") {
      const nova = { id: `${this.tabela}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...this.dados };
      t.push(nova);
      return { data: [nova], error: null };
    }
    if (this.op === "update" && this.tabela === "content_cards" && antesDoUpdateDoCard) { antesDoUpdateDoCard(); antesDoUpdateDoCard = null; }
    let alvo = t.filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === "update") { alvo.forEach((r) => Object.assign(r, this.dados)); return { data: alvo, error: null }; }
    if (this.op === "delete") { db[this.tabela] = t.filter((r) => !alvo.includes(r)); return { data: alvo, error: null }; }
    if (this.ordem) {
      const { col, asc } = this.ordem;
      alvo = [...alvo].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this.max != null) alvo = alvo.slice(0, this.max);
    return { data: alvo.map((r) => ({ ...r })), error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => new Consulta(t) } }));
vi.mock("@/lib/design/atribuir-server", () => ({ designerDaDemanda: async () => ({ designer: "Rodrigo", motivo: "carteira" }) }));
vi.mock("@/lib/cs/briefing-design-card", () => ({ briefingDesignDoCard: async () => null }));

const { executarTransicao, pedirArteSemCard } = await import("@/lib/conteudo/producao-server");

const umCard = (p: Linha = {}): Linha => ({
  id: "card-1", title: "SEX 26 — promoção", client_id: "k1", client_name: "Padaria", social_media: "Carlos",
  status: "ideas", priority: "high", format: "Post", briefing: "Pão em dobro", due_date: "2026-09-26",
  archived_at: null, design_request_id: null, designer_delivered_at: null, alteracao_pendente_em: null,
  column_entered_at: { ideas: "2026-09-20T10:00:00Z" }, ...p,
});
const card = () => db.content_cards.find((c) => c.id === "card-1")!;

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.content_cards = [umCard()];
  db.design_requests = [];
  db.clients = [{ id: "k1", name: "Padaria", nome_fantasia: null, assigned_social: "Carlos", assigned_designer: "Rodrigo" }];
  antesDoUpdateDoCard = null;
});

describe("pedir arte", () => {
  it("abre o pedido (na fila, ligado ao card, com o dono e o prazo) e leva o card pra Com o designer", async () => {
    const r = await executarTransicao("card-1", { tipo: "pedir_arte" }, { quem: "Carlos" });
    expect(r.ok).toBe(true);
    expect(db.design_requests).toHaveLength(1);
    const p = db.design_requests[0];
    expect(p).toMatchObject({
      title: "Arte: SEX 26 — promoção", status: "queued", content_card_id: "card-1", assigned_designer: "Rodrigo",
      requested_by: "Carlos", deadline: "2026-09-26", briefing: "Pão em dobro", priority: "high",
    });
    expect(card()).toMatchObject({ status: "in_production", design_request_id: p.id });
    expect(db.ops_log?.[0]).toMatchObject({ action: "design:pedir_arte", actor: "Carlos", card_id: "card-1" });
  });

  it("clique repetido: não abre um segundo pedido", async () => {
    await executarTransicao("card-1", { tipo: "pedir_arte" }, { quem: "Carlos" });
    const r = await executarTransicao("card-1", { tipo: "pedir_arte" }, { quem: "Carlos" });
    expect(r).toMatchObject({ ok: true, semEfeito: true });
    expect(db.design_requests).toHaveLength(1);
  });

  it("alguém moveu o card no meio: 409, nada muda e o pedido aberto é desfeito", async () => {
    antesDoUpdateDoCard = () => { card().status = "approval"; };
    const r = await executarTransicao("card-1", { tipo: "pedir_arte" }, { quem: "Carlos" });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(db.design_requests).toHaveLength(0);
    expect(card().status).toBe("approval");
  });

  it("card que não existe: 404", async () => {
    expect(await executarTransicao("nao-existe", { tipo: "pedir_arte" }, { quem: "Carlos" })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("designer pega e entrega", () => {
  beforeEach(async () => { await executarTransicao("card-1", { tipo: "pedir_arte" }, { quem: "Carlos" }); });

  it("pegar: pedido em andamento", async () => {
    await executarTransicao("card-1", { tipo: "iniciar" }, { quem: "Rodrigo" });
    expect(db.design_requests[0].status).toBe("in_progress");
    expect(card().status).toBe("in_production");
  });

  it("depois da transação de entrega (pedido já concluído, data gravada): o card vai pra Revisão interna", async () => {
    db.design_requests[0].status = "done";
    card().designer_delivered_at = "2026-09-24T12:00:00Z";
    const r = await executarTransicao("card-1", { tipo: "entregue", quem: "Rodrigo" }, { quem: "Rodrigo" });
    expect(r.ok).toBe(true);
    expect(card().status).toBe("approval");
    expect(card().designer_delivered_at).toBe("2026-09-24T12:00:00Z");
  });

  it("entrega de fora (WhatsApp): grava a data e fecha o pedido", async () => {
    await executarTransicao("card-1", { tipo: "entregue", quem: "Rodrigo" }, { quem: "CS" });
    expect(db.design_requests[0].status).toBe("done");
    expect(card()).toMatchObject({ status: "approval", designer_delivered_by: "Rodrigo" });
    expect(card().designer_delivered_at).toBeTruthy();
  });
});

describe("pedir alteração", () => {
  beforeEach(() => {
    db.content_cards = [umCard({ status: "client_approval", designer_delivered_at: "2026-09-23T10:00:00Z", design_request_id: "dr-1" })];
    db.design_requests = [{ id: "dr-1", status: "done", content_card_id: "card-1", client_id: "k1", created_at: "2026-09-21" }];
  });

  it("pelo social: card volta pro designer, pedido reabre, reprovação e retrabalho gravados", async () => {
    const r = await executarTransicao("card-1", { tipo: "pedir_alteracao", motivo: "trocar a foto" }, { quem: "Carlos", origem: "social" });
    expect(r.ok).toBe(true);
    expect(card()).toMatchObject({ status: "in_production", alteracao_motivo: "trocar a foto", designer_delivered_at: null });
    expect(db.design_requests[0].status).toBe("in_progress");
    expect(db.content_approvals).toEqual([expect.objectContaining({ card_id: "card-1", status: "rejected", reason: "trocar a foto", reviewed_by: "Carlos" })]);
    expect(db.cs_rework_events).toHaveLength(1);
  });

  it("pelo cliente (portal/WhatsApp): mesma volta, sem virar reprovação do social", async () => {
    await executarTransicao("card-1", { tipo: "pedir_alteracao", motivo: "preço errado" }, { quem: "Padaria (cliente)", origem: "cliente" });
    expect(card().status).toBe("in_production");
    expect(db.design_requests[0].status).toBe("in_progress");
    expect(db.content_approvals ?? []).toHaveLength(0);
  });
});

describe("cancelar pedido", () => {
  it("apaga o pedido aberto e devolve o card pra Pauta", async () => {
    await executarTransicao("card-1", { tipo: "pedir_arte" }, { quem: "Carlos" });
    const id = db.design_requests[0].id;
    const r = await executarTransicao("card-1", { tipo: "cancelar_pedido" }, { quem: "Roberto" });
    expect(r).toMatchObject({ ok: true, pedido: null, pedidoRemovido: id });
    expect(db.design_requests).toHaveLength(0);
    expect(card()).toMatchObject({ status: "ideas", design_request_id: null });
  });
});

describe("pedido que chega sem card", () => {
  it("nasce o card em Com o designer, sem data de postagem, ligado nos dois sentidos", async () => {
    const r = await pedirArteSemCard({
      clientId: "k1", titulo: "Arte: Variação — fundo claro", briefing: "b", formato: "1080 × 1350", prioridade: "high",
      prazo: "2026-09-27", quem: "Julio", doTrafego: true, origem: "ia_replicacao", parentAdId: "ad-9", variavel: "fundo",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const novo = db.content_cards.find((c) => c.id === r.cardId)!;
    expect(novo).toMatchObject({
      title: "Variação — fundo claro", status: "in_production", social_media: "Carlos", requested_by_traffic: "Julio",
      design_request_id: r.pedidoId,
    });
    expect(novo.due_date).toBeUndefined();
    const p = db.design_requests.find((d) => d.id === r.pedidoId)!;
    expect(p).toMatchObject({ content_card_id: r.cardId, deadline: "2026-09-27", origem: "ia_replicacao", parent_ad_id: "ad-9", assigned_designer: "Rodrigo" });
  });

  it("duplo clique em 2 min devolve o mesmo pedido", async () => {
    const a = await pedirArteSemCard({ clientId: "k1", titulo: "Capa", quem: "Rodrigo" });
    const b = await pedirArteSemCard({ clientId: "k1", titulo: "Capa", quem: "Rodrigo" });
    expect(a.ok && b.ok && b.dedupe && a.pedidoId === b.pedidoId).toBe(true);
    expect(db.design_requests).toHaveLength(1);
  });
});
