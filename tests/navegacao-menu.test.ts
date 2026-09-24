// Menu de 9 áreas (Leva 3): nenhuma tela some, nenhum papel ganha ou perde tela.
//
// O retrato do menu ANTIGO (24 itens soltos + subitens do painel) está congelado abaixo. Se um
// teste daqui falhar depois de mexer em lib/navegacao/menu.ts, a pergunta é: alguém perdeu acesso a
// uma tela que tinha no menu, ou ganhou uma que não tinha?

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { Role } from "@/lib/types";
import {
  MENU, TODOS, menuDoPapel, rotasDoPapel, casarRota, grupoTemPainel, temPainelFixo, ROTAS_COM_PAINEL_FIXO,
  telasParaBusca, atalhosMobile, papelVe, pontuarHref, normalizar,
} from "@/lib/navegacao/menu";

const PAPEIS: Role[] = [...TODOS];

// ─── O menu de antes (components/Sidebar.tsx até set/2026) ─────────────────
const OP: Role[] = ["admin", "manager", "traffic", "social", "designer"];
const ANTIGO_PRIMARIO: { href: string; roles: Role[] }[] = [
  { href: "/",              roles: OP },
  { href: "/my-work",       roles: OP },
  { href: "/tarefas",       roles: [...OP, "comercial"] },
  { href: "/processos",     roles: [...OP, "comercial"] },
  { href: "/calendar",      roles: OP },
  { href: "/traffic",       roles: ["admin", "manager", "traffic"] },
  { href: "/social",        roles: ["admin", "manager", "social", "designer"] },
  { href: "/meus-clientes", roles: ["traffic", "social", "designer"] },
  { href: "/planejamento",  roles: ["admin", "manager", "social", "designer"] },
  { href: "/design",        roles: ["admin", "manager", "designer", "social"] },
  { href: "/defesa",        roles: ["admin", "manager", "traffic"] },
  { href: "/clients",       roles: ["admin", "manager"] },
  { href: "/crm",           roles: ["admin", "manager", "comercial"] },
  { href: "/prospeccao",    roles: ["admin", "manager"] },
  { href: "/contratos",     roles: ["admin", "manager"] },
  { href: "/churn",         roles: ["admin", "manager"] },
  { href: "/jornada",       roles: ["admin", "manager", "social"] },
  { href: "/carteira",      roles: ["admin", "manager"] },
  { href: "/sobre",         roles: OP },
  { href: "/automations",   roles: ["admin", "manager"] },
  { href: "/agente",        roles: ["admin", "manager"] },
  { href: "/goals",         roles: ["admin", "manager"] },
  { href: "/ceo",           roles: ["admin"] },
];
// Subitens do painel: herdavam o papel do item principal.
const ANTIGO_SECUNDARIO: Record<string, { rotas: string[]; abas: string[] }> = {
  "/traffic":    { rotas: ["/traffic/budgets", "/traffic/criativos", "/settings/grupos"], abas: ["rotina", "status", "anuncios"] },
  "/social":     { rotas: [], abas: ["carteira", "kanban", "aprovacao", "metricas", "entregas", "onboarding", "acessos"] },
  "/design":     { rotas: [], abas: ["kanbans", "requests", "clientes", "performance", "history"] },
  "/clients":    { rotas: ["/clients", "/clients?filter=at_risk", "/clients?filter=goals"], abas: [] },
  "/prospeccao": { rotas: [], abas: ["visao", "fila", "prospects", "conversas", "agenda", "configuracao", "relatorios"] },
  "/crm":        { rotas: [], abas: ["hoje", "dashboard", "funil", "agenda", "relatorios"] },
};
// Abas que mudaram de nome sem sumir: o pedido antigo cai na nova (a tela aceita os dois nomes).
//  - Leva 4: /traffic#rotina ("Rotina Diária") virou /traffic#hoje ("Hoje", o cockpit do gestor).
//  - Leva 5a: /social#metricas e /social#entregas viraram /social#resultados (contado no Instagram).
const ABAS_RENOMEADAS: Record<string, string> = {
  "/traffic#rotina": "/traffic#hoje",
  "/social#metricas": "/social#resultados",
  "/social#entregas": "/social#resultados",
};
// Abas que viraram OUTRA TELA (a aba sumiu; o conteúdo mora no endereço indicado).
//  - Leva 5a: a Carteira do Social e os "Clientes do Quadro" do Designer eram listas de cliente
//    paralelas — viraram o filtro "Meus clientes" da lista única (/clients?resp=mine).
const ABAS_QUE_VIRARAM_TELA: Record<string, string> = {
  "/social#carteira": "/clients?resp=mine",
  "/design#clientes": "/clients?resp=mine",
};

function rotasAntigas(role: Role): Set<string> {
  const out = new Set<string>();
  for (const it of ANTIGO_PRIMARIO) {
    if (!it.roles.includes(role)) continue;
    out.add(it.href);
    ANTIGO_SECUNDARIO[it.href]?.rotas.forEach((r) => out.add(r));
  }
  return out;
}

// Entradas NOVAS no menu — todas telas que o papel já abria por outro caminho, sem ganho de acesso:
//  - /settings: a engrenagem da barra do topo já levava todo papel pra lá;
//  - /broadcasts: a página só abre pra gestão (checa o papel) e já existia fora do menu;
//  - /integrations: já estava na busca ⌘K pra esses mesmos papéis; na Leva 4 virou /conexao-meta
//    (Sistema › Conexão Meta, a mesma tela) e /integrations redireciona pra lá;
//  - /my-work?view=…: as novas vistas do Meu Trabalho (conteúdo de /tarefas e /calendar, que já eram do papel).
//  - /clients?resp=mine (Leva 5a): a lista única de clientes no filtro "Meus clientes" — para quem
//    executa é o que /meus-clientes mostrava (a carteira dele); a ficha do cliente (/clients/…) ele já
//    abria pelo Social, Designer, Tráfego, notificações e ⌘K. Para a gestão é um filtro da tela que já tinha.
const MINHA_CARTEIRA = ["/clients?resp=mine", "/clients"];
const ACRESCIMOS: Record<Role, string[]> = {
  admin:     ["/settings", "/broadcasts", "/integrations", "/conexao-meta", "/my-work?view=tarefas", "/my-work?view=agenda", "/clients?resp=mine"],
  manager:   ["/settings", "/broadcasts", "/integrations", "/conexao-meta", "/my-work?view=tarefas", "/my-work?view=agenda", "/clients?resp=mine"],
  traffic:   ["/settings", "/integrations", "/conexao-meta", "/my-work?view=tarefas", "/my-work?view=agenda", ...MINHA_CARTEIRA],
  social:    ["/settings", "/my-work?view=tarefas", "/my-work?view=agenda", ...MINHA_CARTEIRA],
  designer:  ["/settings", "/my-work?view=tarefas", "/my-work?view=agenda", ...MINHA_CARTEIRA],
  comercial: ["/settings", "/"], // Início por papel (Leva 3): o comercial ganhou o dele
};

function abasDoPapel(role: Role): Set<string> {
  const out = new Set<string>();
  for (const g of menuDoPapel(role)) {
    for (const it of g.itens) {
      for (const s of it.secoes ?? []) for (const sub of s.itens) if (sub.aba) out.add(`${sub.href.split("?")[0]}#${sub.aba}`);
    }
  }
  return out;
}

describe("menu — estrutura", () => {
  it("o rail tem as 9 áreas, nesta ordem", () => {
    expect(MENU.map((g) => g.rotulo)).toEqual([
      "Início", "Meu Trabalho", "Tráfego", "Conteúdo", "Clientes", "Comercial", "Agente Lone", "Gestão", "Sistema",
    ]);
  });

  it("ids únicos em todo o menu (itens e abas)", () => {
    const ids: string[] = [];
    for (const g of MENU) for (const it of g.itens) {
      ids.push(it.id);
      for (const s of it.secoes ?? []) for (const sub of s.itens) ids.push(sub.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda rota é absoluta e toda área aparece para ao menos um papel", () => {
    for (const g of MENU) {
      for (const it of g.itens) expect(it.href.startsWith("/")).toBe(true);
      expect(PAPEIS.some((r) => menuDoPapel(r).some((x) => x.id === g.id))).toBe(true);
    }
  });

  it.each(PAPEIS)("nenhuma área vazia para %s (área sem tela visível some)", (role) => {
    const grupos = menuDoPapel(role);
    expect(grupos.length).toBeGreaterThan(0);
    expect(grupos.length).toBeLessThanOrEqual(9);
    for (const g of grupos) {
      expect(g.itens.length).toBeGreaterThan(0);
      for (const it of g.itens) for (const s of it.secoes ?? []) expect(s.itens.length).toBeGreaterThan(0);
    }
  });
});

describe("menu — ninguém ganha nem perde tela", () => {
  it.each(PAPEIS)("%s: toda rota do menu antigo continua no menu novo", (role) => {
    const novas = rotasDoPapel(role);
    const faltando = [...rotasAntigas(role)].filter((r) => !novas.has(r));
    expect(faltando).toEqual([]);
  });

  it.each(PAPEIS)("%s: o que é novo no menu é só o que já abria por outro caminho", (role) => {
    const antigas = rotasAntigas(role);
    const extras = [...rotasDoPapel(role)].filter((r) => !antigas.has(r)).sort();
    expect(extras).toEqual([...ACRESCIMOS[role]].sort());
  });

  it.each(PAPEIS)("%s: toda aba interna do painel antigo continua no painel", (role) => {
    const novas = abasDoPapel(role);
    const faltando: string[] = [];
    for (const it of ANTIGO_PRIMARIO) {
      if (!it.roles.includes(role)) continue;
      for (const aba of ANTIGO_SECUNDARIO[it.href]?.abas ?? []) {
        const antiga = `${it.href}#${aba}`;
        const virouTela = ABAS_QUE_VIRARAM_TELA[antiga];
        if (virouTela ? !papelVe(role, virouTela) : !novas.has(ABAS_RENOMEADAS[antiga] ?? antiga)) faltando.push(antiga);
      }
    }
    expect(faltando).toEqual([]);
  });

  it("papéis sem a tela não recebem as abas dela", () => {
    expect([...abasDoPapel("comercial")].every((a) => a.startsWith("/crm#"))).toBe(true);
    expect([...abasDoPapel("traffic")].every((a) => a.startsWith("/traffic#"))).toBe(true);
  });

  it("Leva 4: Tráfego abre no Hoje, a Defesa Ativa é aba dele e /defesa continua no menu", () => {
    for (const r of ["admin", "manager", "traffic"] as Role[]) {
      const abas = abasDoPapel(r);
      expect(abas.has("/traffic#hoje")).toBe(true);
      expect(abas.has("/traffic#defesa")).toBe(true);
      expect(abas.has("/traffic#rotina")).toBe(false);
      expect(papelVe(r, "/defesa")).toBe(true);
    }
    expect(papelVe("social", "/defesa")).toBe(false);
    const hoje = telasParaBusca("traffic").find((t) => t.id === "tela-trafego-hoje");
    expect(hoje).toMatchObject({ href: "/traffic", aba: "hoje" });
    expect(hoje!.texto).toContain("rotina"); // quem procura "rotina" acha o Hoje
  });

  it("Leva 4: Contas & Verba no lugar de Saldos + Investimento; Conexão Meta mora no Sistema", () => {
    for (const r of ["admin", "manager", "traffic"] as Role[]) {
      const trafego = menuDoPapel(r).find((g) => g.id === "trafego")!;
      const rotulos = trafego.itens.map((i) => i.rotulo);
      expect(rotulos).toContain("Contas & Verba");
      expect(rotulos).not.toContain("Saldos, Verba & Alertas");
      expect(rotulos).not.toContain("Conexão Meta");
      expect(abasDoPapel(r).has("/traffic#investimento")).toBe(false);
      const sistema = menuDoPapel(r).find((g) => g.id === "sistema")!;
      expect(sistema.itens.find((i) => i.id === "conexao-meta")).toMatchObject({ href: "/conexao-meta" });
      expect(papelVe(r, "/integrations")).toBe(true); // endereço antigo continua valendo
    }
    for (const r of ["social", "designer", "comercial"] as Role[]) expect(papelVe(r, "/conexao-meta")).toBe(false);
    // Quem procura "investimento" ou "verba" acha Contas & Verba.
    const contas = telasParaBusca("traffic").find((t) => t.id === "tela-trafego-saldos")!;
    expect(contas.texto).toContain("investimento");
    expect(contas.texto).toContain("verba");
  });

  it("Área CEO continua só do admin; Prospecção só da gestão", () => {
    expect(papelVe("admin", "/ceo")).toBe(true);
    expect(papelVe("manager", "/ceo")).toBe(false);
    expect(papelVe("comercial", "/prospeccao")).toBe(false);
    expect(papelVe("manager", "/prospeccao")).toBe(true);
  });

  it("Leva 5a: Social com Resultados no lugar de Métricas/Entregas; Carteira e Clientes do Quadro viram a lista única", () => {
    for (const r of ["admin", "manager", "social", "designer"] as Role[]) {
      const abas = abasDoPapel(r);
      expect(abas.has("/social#resultados")).toBe(true);
      for (const velha of ["/social#metricas", "/social#entregas", "/social#carteira", "/design#clientes"]) expect(abas.has(velha)).toBe(false);
      expect(papelVe(r, "/clients?resp=mine")).toBe(true);
    }
    for (const r of ["traffic", "social", "designer"] as Role[]) {
      const meus = menuDoPapel(r).flatMap((g) => g.itens).find((i) => i.id === "meus-clientes")!;
      expect(meus.href).toBe("/clients?resp=mine");
      expect(papelVe(r, "/meus-clientes")).toBe(true); // endereço antigo continua valendo
    }
    expect(papelVe("comercial", "/clients?resp=mine")).toBe(false);
    // Quem procura "métricas" ou "entregas" acha Resultados.
    const res = telasParaBusca("social").find((t) => t.id === "tela-social-resultados")!;
    expect(res).toMatchObject({ href: "/social", aba: "resultados" });
    expect(res.texto).toContain("metricas");
    expect(res.texto).toContain("entregas");
  });

  it("/tarefas vira vista do Meu Trabalho, menos pro comercial (que não tem Meu Trabalho)", () => {
    for (const r of OP) expect(papelVe(r, "/my-work?view=tarefas")).toBe(true);
    expect(papelVe("comercial", "/my-work?view=tarefas")).toBe(false);
    expect(papelVe("comercial", "/tarefas")).toBe(true);
  });
});

describe("menu — qual área acende", () => {
  const onde = (role: Role, url: string) => {
    const [p, q = ""] = url.split("?");
    const c = casarRota(menuDoPapel(role), p, q);
    return c ? `${c.grupo.id}/${c.item.id}` : null;
  };

  it("subrota acende a área e a subtela certas", () => {
    expect(onde("admin", "/")).toBe("inicio/inicio");
    expect(onde("admin", "/traffic")).toBe("trafego/trafego-pago");
    expect(onde("admin", "/traffic/budgets")).toBe("trafego/trafego-saldos");
    // Defesa Ativa virou aba do Tráfego Pago (Leva 4): /defesa redireciona e acende o Tráfego Pago.
    expect(onde("traffic", "/defesa")).toBe("trafego/trafego-pago");
    expect(onde("admin", "/clients/abc-123")).toBe("clientes/clientes");
    expect(onde("admin", "/clients?filter=at_risk")).toBe("clientes/clientes");
    expect(onde("social", "/planejamento")).toBe("conteudo/planejamento");
    expect(onde("designer", "/design")).toBe("conteudo/designer");
    expect(onde("admin", "/processos/algum-processo")).toBe("meu-trabalho/processos");
    expect(onde("admin", "/goals")).toBe("gestao/metas");
    expect(onde("admin", "/automations")).toBe("sistema/automacoes");
    expect(onde("traffic", "/conexao-meta")).toBe("sistema/conexao-meta");
    expect(onde("admin", "/integrations")).toBe("sistema/conexao-meta");
  });

  it("vistas do Meu Trabalho e endereços antigos", () => {
    expect(onde("social", "/my-work")).toBe("meu-trabalho/meu-trabalho-hoje");
    expect(onde("social", "/my-work?view=tarefas")).toBe("meu-trabalho/meu-trabalho-tarefas");
    expect(onde("social", "/my-work?view=agenda&d=2026-09-10")).toBe("meu-trabalho/meu-trabalho-agenda");
    expect(onde("social", "/calendar")).toBe("meu-trabalho/meu-trabalho-agenda");
    expect(onde("admin", "/tarefas")).toBe("meu-trabalho/meu-trabalho-tarefas");
    expect(onde("comercial", "/tarefas")).toBe("meu-trabalho/tarefas-comercial");
  });

  it("caminho mais específico vence: /settings/grupos é Tráfego pra quem vê Tráfego", () => {
    expect(onde("traffic", "/settings/grupos")).toBe("trafego/grupos-clientes");
    expect(onde("social", "/settings/grupos")).toBe("sistema/configuracoes");
    expect(onde("social", "/settings")).toBe("sistema/configuracoes");
  });

  it("tela que o papel não vê não acende nada", () => {
    expect(onde("traffic", "/contratos")).toBeNull();
    expect(onde("comercial", "/traffic")).toBeNull();
    expect(onde("comercial", "/clients/abc")).toBeNull();
  });

  it("Leva 5a: a ficha e a lista de clientes acendem Meus Clientes pra quem executa", () => {
    expect(onde("traffic", "/clients/abc")).toBe("clientes/meus-clientes");
    expect(onde("social", "/clients?resp=mine")).toBe("clientes/meus-clientes");
    expect(onde("designer", "/meus-clientes")).toBe("clientes/meus-clientes");
    expect(onde("admin", "/clients?resp=mine")).toBe("clientes/clientes");
  });

  it("pontuarHref: prefixo só por segmento inteiro", () => {
    expect(pontuarHref("/traffic", "/trafficx")).toBe(-1);
    expect(pontuarHref("/", "/traffic")).toBe(-1);
    expect(pontuarHref("/clients?filter=goals", "/clients", "filter=at_risk")).toBe(-1);
  });
});

describe("menu — painel secundário", () => {
  it("comercial: Comercial tem painel (abas do funil); Sistema é link direto", () => {
    const g = menuDoPapel("comercial");
    expect(g.map((x) => x.id)).toEqual(["inicio", "meu-trabalho", "comercial", "sistema"]);
    expect(grupoTemPainel(g.find((x) => x.id === "comercial")!)).toBe(true);
    expect(grupoTemPainel(g.find((x) => x.id === "sistema")!)).toBe(false);
  });

  it("painel ancorado nas mesmas rotas em que o AppShell reserva espaço", () => {
    const shell = readFileSync(path.resolve(__dirname, "../components/AppShell.tsx"), "utf8");
    if (!/ROTAS_COM_PAINEL_FIXO/.test(shell)) {
      const m = shell.match(/SECONDARY_ROUTES\s*=\s*\[([^\]]*)\]/);
      expect(m).not.toBeNull();
      const rotas = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
      expect(rotas).toEqual([...ROTAS_COM_PAINEL_FIXO].sort());
    }
    expect(temPainelFixo("/traffic/budgets")).toBe(true);
    expect(temPainelFixo("/my-work")).toBe(false);
  });
});

describe("busca ⌘K — telas do menu, filtradas pelo papel", () => {
  const hrefs = (role: Role) => new Set(telasParaBusca(role).map((t) => t.href));

  it("ninguém acha pela busca uma tela que não vê no menu", () => {
    for (const role of PAPEIS) {
      const menu = rotasDoPapel(role);
      for (const t of telasParaBusca(role)) {
        if (t.aba) continue;
        expect(menu.has(t.href)).toBe(true);
      }
    }
    expect(hrefs("traffic").has("/clients")).toBe(false);
    expect(hrefs("manager").has("/ceo")).toBe(false);
    expect(hrefs("admin").has("/ceo")).toBe(true);
  });

  it("inclui as abas internas (ex.: Board de Produção) e acha sem acento", () => {
    const telas = telasParaBusca("social");
    const board = telas.find((t) => t.id === "tela-social-board");
    expect(board).toMatchObject({ href: "/social", aba: "kanban" });
    const q = normalizar("calendario");
    expect(telas.some((t) => t.href === "/my-work?view=agenda" && t.texto.includes(q))).toBe(true);
  });
});

describe("barra inferior do celular", () => {
  it.each(PAPEIS)("%s: de 1 a 4 atalhos, todos visíveis pro papel, sem repetir", (role) => {
    const itens = atalhosMobile(role);
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.length).toBeLessThanOrEqual(4);
    expect(new Set(itens.map((i) => i.href)).size).toBe(itens.length);
    const visiveis = rotasDoPapel(role);
    for (const i of itens) expect(visiveis.has(i.href)).toBe(true);
  });

  it("cada papel abre pelo que mais usa", () => {
    expect(atalhosMobile("comercial")[0].href).toBe("/crm");
    expect(atalhosMobile("traffic").map((i) => i.href)).toContain("/traffic");
    expect(atalhosMobile("social").map((i) => i.href)).toContain("/social");
    expect(atalhosMobile("designer").map((i) => i.href)).toContain("/design");
    expect(atalhosMobile("admin").map((i) => i.href)).toEqual(["/", "/traffic", "/social", "/clients"]);
  });
});
