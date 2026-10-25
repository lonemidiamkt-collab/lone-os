// @vitest-environment node
// Comandos de AÇÃO nos grupos da equipe exigem a autoridade do "ok" (onda 5 do erro recuperável, 25/10/2026).
// Dados INVENTADOS.
//
// O QUE ACONTECIA: a confirmação de demanda já conferia QUEM falava (Fase 0A: número → Gestão da Equipe → papel,
// `podeAgirC`), mas "Lone, o Rodrigo está de férias", "Lone, entrou o cliente X no grupo Y", "Lone, marca a arte
// do X como pronta", "ajustar …" na sugestão, o link da reunião colado no grupo e "gera o contrato" rodavam para
// qualquer número que estivesse no grupo. E a lista da equipe que falhava ao carregar virava "ninguém é da
// equipe" guardado por 10 minutos.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

let falhaEquipe: string | null = null;
let leiturasEquipe = 0;
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => {
        leiturasEquipe++;
        return Promise.resolve(falhaEquipe
          ? { data: null, error: { message: falhaEquipe } }
          : { data: [{ name: "Julio Exemplo", role: "manager", whatsapp_phone: "5522981712589" }], error: null }).then(ok);
      };
      return q;
    },
  },
}));
vi.mock("@/lib/ai/openai", () => ({ chatJson: async () => ({ ok: false }) }));

const { textoSemAutoridade } = await import("@/lib/cs/autoridade-comandos");
const { podeAgir, _limparCacheAutoridade } = await import("@/lib/cs/autoridade");
const { escolherMembroAusente } = await import("@/lib/cs/ausencia");

const JULIO = "5522981712589@s.whatsapp.net";
const ESTRANHO = "5521999990000@s.whatsapp.net";

beforeEach(() => { falhaEquipe = null; leiturasEquipe = 0; _limparCacheAutoridade(); });

describe("a frase de quem não tem autoridade", () => {
  it("diz por quê e que nada foi feito, para cada comando", () => {
    for (const acao of ["onboarding", "ausencia", "mover_card", "ajustar_pedido", "link_reuniao", "contrato"] as const) {
      const t = textoSemAutoridade(acao);
      expect(t, acao).toMatch(/Só quem é da equipe, com o WhatsApp cadastrado na Gestão da Equipe/);
      expect(t, acao).toMatch(/Não (comecei|anotei|mexi|mandei|gerei)|ficou como estava/);
    }
    expect(textoSemAutoridade("ausencia")).toMatch(/férias ou a volta de alguém/);
    expect(textoSemAutoridade("link_reuniao")).toMatch(/Não mandei nada para o cliente/);
  });

  it("lista da equipe que não carregou não vira 'você não é da equipe'", () => {
    const t = textoSemAutoridade("onboarding", { naoConferi: true });
    expect(t).toMatch(/não carregou/);
    expect(t).not.toMatch(/Só quem é da equipe/);
    expect(t).toMatch(/Não comecei nada/);
  });
});

describe("podeAgir: falha na leitura da equipe é falha, não veredito", () => {
  it("o erro original: a leitura falhava, a tabela vazia ia para o cache e a equipe ficava sem autoridade", async () => {
    falhaEquipe = "timeout";
    const r = await podeAgir(JULIO, "C");
    expect(r).toMatchObject({ ok: false, autor: null, naoConferi: true });

    // A falha não ficou guardada: na mensagem seguinte o banco voltou e o Julio volta a ter autoridade.
    falhaEquipe = null;
    const r2 = await podeAgir(JULIO, "C");
    expect(r2.ok).toBe(true);
    expect(r2.naoConferi).toBe(false);
    expect(r2.autor?.nome).toBe("Julio Exemplo");
  });

  it("número fora da equipe com a lista carregada: sem autoridade, e conferido", async () => {
    const r = await podeAgir(ESTRANHO, "C");
    expect(r).toMatchObject({ ok: false, autor: null, naoConferi: false });
  });

  it("sem remetente não consulta o banco", async () => {
    const r = await podeAgir(null, "C");
    expect(r).toMatchObject({ ok: false, naoConferi: false });
    expect(leiturasEquipe).toBe(0);
  });
});

describe("férias/ausência: quem é a pessoa citada", () => {
  const equipe = [
    { id: "1", name: "Ana Paula Exemplo" }, { id: "2", name: "Juliana Teste" },
    { id: "3", name: "Carlos Augusto" }, { id: "4", name: "Carlos Silva" }, { id: "5", name: "Rodrigo Exemplo" },
  ];
  it("o erro original: 'a Ana está de férias' podia marcar a Juliana (o 1º que contém 'ana')", () => {
    expect(escolherMembroAusente("Ana", equipe)).toEqual({ tipo: "um", membro: equipe[0] });
  });
  it("dois com o mesmo primeiro nome: pergunta em vez de escolher", () => {
    expect(escolherMembroAusente("Carlos", equipe)).toEqual({ tipo: "varios", nomes: ["Carlos Augusto", "Carlos Silva"] });
    expect(escolherMembroAusente("Carlos Silva", equipe)).toEqual({ tipo: "um", membro: equipe[3] });
  });
  it("acento e caixa não atrapalham; ninguém com o nome é 'nenhum'", () => {
    expect(escolherMembroAusente("rodrigo", equipe)).toEqual({ tipo: "um", membro: equipe[4] });
    expect(escolherMembroAusente("Ágata", equipe)).toEqual({ tipo: "nenhum" });
    expect(escolherMembroAusente("", equipe)).toEqual({ tipo: "nenhum" });
  });
});

describe("no inbound, a porta vem antes de qualquer efeito", () => {
  const INBOUND = readFileSync("app/api/cs/inbound/route.ts", "utf8");
  // [início do bloco, a porta, o primeiro efeito do bloco]
  const casos: [string, string, string, string][] = [
    ["onboarding", "ehOnboardingTrigger(msg.text)) {", 'recusarSemAutoridade("onboarding"', "ensureClienteOnboarding(cliente"],
    ["ausencia", "ehComandoAusencia(msg.text)) {", 'recusarSemAutoridade("ausencia"', "update({ unavailable_until"],
    ["mover_card", "if (cmdMover) {", 'recusarSemAutoridade("mover_card"', "executarTransicao(cardM.id"],
    ["ajustar_pedido", "if (ajuste && isInternalCmdGroup(msg.groupJid)) {", 'recusarSemAutoridade("ajustar_pedido"', "update({ briefing: novoBriefing })"],
    ["link_reuniao", "const link = ar.acharLinkChamada(msg.text);", 'recusarSemAutoridade("link_reuniao"', "update({ link_reuniao: link })"],
    ["contrato", "if (pedido.querContrato || respondendoOferta || completandoContrato) {", 'recusarSemAutoridade("contrato"', "registrarParcial(msg.groupJid, alvo.id"],
  ];
  for (const [nome, inicio, porta, efeito] of casos) {
    it(`${nome}: confere podeAgirC e responde antes de mexer em qualquer coisa`, () => {
      const i = INBOUND.indexOf(inicio);
      expect(i, `início do bloco ${nome}`).toBeGreaterThan(0);
      const p = INBOUND.indexOf(porta, i);
      const e = INBOUND.indexOf(efeito, i);
      expect(p, `porta do ${nome}`).toBeGreaterThan(i);
      expect(e, `efeito do ${nome}`).toBeGreaterThan(p);
      expect(INBOUND.slice(p - 40, p)).toMatch(/if \(!podeAgirC\) return $/);
    });
  }

  it("a recusa usa a frase do módulo e diz quando a lista não carregou", () => {
    expect(INBOUND).toMatch(/textoSemAutoridade\(acao, \{ naoConferi: autoridade\.naoConferi \}\)/);
  });

  it("ausência: erro de leitura, de gravação e IA fora aparecem como falha (não 'não achei' nem '✅ Anotado')", () => {
    const bloco = INBOUND.slice(INBOUND.indexOf("ehComandoAusencia(msg.text)) {"), INBOUND.indexOf("// ─── Desambiguação: 2+ pedidos"));
    expect(bloco).toMatch(/if \(falhou\)/);
    expect(bloco).toMatch(/if \(errMembros\)/);
    expect(bloco).toMatch(/if \(errAus\)/);
    expect(bloco.indexOf("if (errAus)")).toBeLessThan(bloco.indexOf("`✅ Anotado: *${membro.name}*"));
  });

  it("onboarding: sem a sessão gravada, o cliente não recebe as boas-vindas", () => {
    const bloco = INBOUND.slice(INBOUND.indexOf("ehOnboardingTrigger(msg.text)) {"), INBOUND.indexOf("// ─── Férias/ausência"));
    expect(bloco.indexOf("if (errSess)")).toBeGreaterThan(0);
    expect(bloco.indexOf("if (errSess)")).toBeLessThan(bloco.indexOf("onboardingWelcome(nomeCli)"));
  });
});
