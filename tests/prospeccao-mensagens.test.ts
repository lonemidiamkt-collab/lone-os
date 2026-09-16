import { describe, it, expect } from "vitest";
import { abordagemInicial, followup, mensagemDecisor, convite, ofertaHorarios, confirmacao, respostaERobo, respostaPreco, textoSeguro, lembrete1h } from "@/lib/prospeccao/mensagens";
import { lerIntencaoRegras, ehOptOut } from "@/lib/prospeccao/intencao";
import { consolidarDecisor } from "@/lib/prospeccao/decisor";
import { chavesDedup, mesmaEmpresa, telefoneDigitos, cnpjLimpo, instagramHandle, distanciaKm, nomeProprio, primeiroNome, siteNormalizado } from "@/lib/prospeccao/normalizar";
import { importarCsv } from "@/lib/prospeccao/providers/importacao";
import { CONFIG_PADRAO } from "@/lib/prospeccao/config";
import { prospectBase } from "./prospeccao-score.test";

const cfg = CONFIG_PADRAO;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const AGORA = new Date("2026-09-15T13:00:00Z");

describe("mensagens (§11–§15): equipe do Roberto, sem emoji, sem preço", () => {
  it("abordagem usa o decisor quando há confiança; senão pede o proprietário", () => {
    const a = abordagemInicial(prospectBase(), cfg);
    expect(a).toContain("equipe do Roberto Lino");
    expect(a).toContain("Consigo falar com o Marcelo Ferreira?");
    expect(a).not.toMatch(EMOJI);
    const b = abordagemInicial(prospectBase({ decisor_nome: null }), cfg);
    expect(b).toContain("proprietário ou responsável pela Casa do Piso");
    const c = abordagemInicial(prospectBase({ decisor_confianca: 0.3 }), cfg);
    expect(c).toContain("proprietário");
  });
  it("todos os templates passam no validador com dados reais", () => {
    const p = prospectBase();
    for (const t of [abordagemInicial(p, cfg), followup(p, cfg, 1), followup(p, cfg, 2), followup(p, cfg, 3), mensagemDecisor(p, cfg), convite(p, cfg).texto, respostaERobo(cfg), respostaPreco(p, cfg), ofertaHorarios(["2026-09-16T10:00:00-03:00", "2026-09-17T15:00:00-03:00"], cfg)]) {
      expect(textoSeguro(t), t).toMatchObject({ ok: true });
      expect(t).not.toMatch(/\{\w+\}/);
    }
  });
  it("gancho verificado entra na fala com o decisor", () => {
    expect(mensagemDecisor(prospectBase(), cfg)).toContain("Vi que vocês têm duas lojas e mais de 300 avaliações no Google");
    expect(mensagemDecisor(prospectBase({ diagnostico: null }), cfg)).not.toContain("undefined");
  });
  it("convite: visita até 80 km, Meet acima; presente só se disponível E reservado", () => {
    expect(convite(prospectBase({ distancia_km: 45, modalidade_preferida: null }), cfg).tipo).toBe("visita");
    expect(convite(prospectBase({ distancia_km: 130, modalidade_preferida: null }), cfg).tipo).toBe("online");
    expect(convite(prospectBase({ distancia_km: 45, modalidade_preferida: null }), cfg, "online").tipo).toBe("online");
    expect(convite(prospectBase({ gift_reserved: true }), cfg).texto).not.toContain("presente");
    expect(convite(prospectBase({ gift_reserved: true }), { ...cfg, gift_available: true }).texto).toContain("presente");
    expect(convite(prospectBase({ gift_reserved: false }), { ...cfg, gift_available: true }).texto).not.toContain("presente");
  });
  it("confirmação online só traz link quando existe; sem Google avisa que o Roberto manda", () => {
    const com = confirmacao(prospectBase(), cfg, { quandoIso: "2026-09-17T15:00:00-03:00", tipo: "online", link: "https://meet.google.com/abc-defg-hij" });
    expect(com).toContain("https://meet.google.com/abc-defg-hij");
    expect(com).toContain("+55 22 98153-0700");
    const sem = confirmacao(prospectBase(), cfg, { quandoIso: "2026-09-17T15:00:00-03:00", tipo: "online", link: null });
    expect(sem).not.toContain("meet.google.com");
    expect(sem).toContain("envia o link");
    const vis = confirmacao(prospectBase(), cfg, { quandoIso: "2026-09-17T15:00:00-03:00", tipo: "visita" });
    expect(vis).toContain("passa aí");
    expect(lembrete1h(prospectBase({ meet_url: "https://meet.google.com/x" }), cfg, "2026-09-17T15:00:00-03:00")).toContain("meet.google.com/x");
  });
});

describe("intenção por regras (§16)", () => {
  const ler = (t: string, ctx = {}) => lerIntencaoRegras(t, { agora: AGORA, ...ctx })?.intent;
  it("opt-out e 'é robô' têm prioridade", () => {
    expect(ehOptOut("não me mande mais mensagem")).toBe(true);
    expect(ler("para de mandar mensagem por favor")).toBe("OPT_OUT");
    expect(ler("isso é um robô?")).toBe("E_ROBO");
    expect(ler("tô falando com uma pessoa de verdade?")).toBe("E_ROBO");
  });
  it("recepção, decisor, contato, preço, agência, depois", () => {
    expect(ler("sobre o que seria?")).toBe("QUER_SABER_MAIS");
    expect(ler("o dono não está, ele só volta amanhã")).toBe("DECISOR_INDISPONIVEL");
    expect(ler("sou eu mesmo, pode falar")).toBe("SOU_O_DECISOR");
    expect(ler("fala com ele no 22 99999-8888")).toBe("PASSOU_CONTATO");
    expect(lerIntencaoRegras("fala com ele no 22 99999-8888", { agora: AGORA })?.telefone).toBe("5522999998888");
    expect(ler("quanto custa isso?")).toBe("PEDIU_PRECO");
    expect(ler("já tenho agência, obrigado")).toBe("JA_TEM_AGENCIA");
    expect(ler("me chama mês que vem")).toBe("RETORNAR_DEPOIS");
    expect(ler("não tenho interesse, obrigado")).toBe("NAO_INTERESSADO");
    expect(ler("pode vir aqui na loja")).toBe("QUER_VISITA");
    expect(ler("prefiro online, pode ser meet")).toBe("QUER_REUNIAO");
    expect(ler("tenho interesse sim, me explica melhor")).toBe("INTERESSADO");
    expect(ler("bom dia!")).toBe("SAUDACAO");
  });
  it("'como funciona?' NÃO agenda (§17); horário explícito agenda; confirmação curta só com proposta pendente", () => {
    expect(ler("como funciona?")).not.toBe("CONFIRMA_HORARIO");
    expect(ler("pode ser quarta às 15h")).not.toBe("CONFIRMA_HORARIO"); // sem contexto de agenda, não engole
    expect(ler("pode ser quarta às 15h", { estagio: "decisor_contatado" })).toBe("CONFIRMA_HORARIO");
    expect(ler("sou o proprietário, pode falar")).toBe("SOU_O_DECISOR");
    expect(ler("pode marcar", { propostoIso: "2026-09-17T15:00:00-03:00" })).toBe("CONFIRMA_HORARIO");
    expect(ler("não vai dar não", { propostoIso: "2026-09-17T15:00:00-03:00" })).toBe("RECUSA_HORARIO");
    expect(ler("kkkk beleza então")).toBeUndefined(); // só a IA resolve
  });
});

describe("decisor (§9)", () => {
  it("sócio-administrador vence sócio; web concordando sobe a confiança", () => {
    const d = consolidarDecisor({ qsa: [{ nome: "MARCELO FERREIRA DA SILVA", qualificacao: "Sócio-Administrador" }, { nome: "ANA FERREIRA", qualificacao: "Sócio" }] });
    expect(d.nome).toBe("Marcelo Ferreira da Silva");
    expect(d.cargo).toBe("Sócio administrador");
    expect(d.confianca).toBeGreaterThan(0.5);
    const d2 = consolidarDecisor({ qsa: [{ nome: "MARCELO FERREIRA DA SILVA", qualificacao: "Sócio-Administrador" }], webNome: "Marcelo Ferreira", webCargo: "proprietário", webFonte: "instagram" });
    expect(d2.confianca).toBeGreaterThan(d.confianca);
    expect(d2.fontes).toContain("CNPJ");
  });
  it("sem fontes → sem decisor, sem inventar", () => {
    expect(consolidarDecisor({}).nome).toBeNull();
    expect(consolidarDecisor({ qsa: [{ nome: "XPTO PARTICIPACOES LTDA", qualificacao: "Sócio" }] }).nome).toBeNull();
  });
});

describe("normalização e dedup (§25)", () => {
  it("telefone, cnpj, instagram, site", () => {
    expect(telefoneDigitos("(22) 99999-8888")).toBe("5522999998888");
    expect(telefoneDigitos("+55 22 2665 1234")).toBe("552226651234");
    expect(telefoneDigitos("123")).toBeNull();
    expect(cnpjLimpo("11.222.333/0001-81")).toBe("11222333000181");
    expect(cnpjLimpo("11.222.333/0001-80")).toBeNull();
    expect(instagramHandle("https://instagram.com/Casa.Das.Telhas/")).toBe("casa.das.telhas");
    expect(siteNormalizado("casadopiso.com.br/")).toBe("https://casadopiso.com.br");
    expect(siteNormalizado("https://instagram.com/x")).toBeNull();
    expect(nomeProprio("MARCELO DA SILVA")).toBe("Marcelo da Silva");
    expect(primeiroNome("marcelo ferreira")).toBe("Marcelo");
  });
  it("mesma empresa por CNPJ, Instagram, telefone ou nome+cidade", () => {
    const a = chavesDedup({ nome: "Casa das Telhas Ltda", cidade: "Araruama", instagram: "@casadastelhas" });
    expect(mesmaEmpresa(a, chavesDedup({ nome: "CASA DAS TELHAS", cidade: "araruama" }))).toBe(true);
    expect(mesmaEmpresa(a, chavesDedup({ nome: "Outra", cidade: "Araruama", instagram: "casadastelhas" }))).toBe(true);
    expect(mesmaEmpresa(a, chavesDedup({ nome: "Casa das Telhas", cidade: "Cabo Frio" }))).toBe(false);
    expect(mesmaEmpresa(chavesDedup({ cnpj: "11222333000181", nome: "A", cidade: "x" }), chavesDedup({ cnpj: "11222333000181", nome: "B", cidade: "y" }))).toBe(true);
  });
  it("distância Araruama → Cabo Frio ≈ 40 km", () => {
    const km = distanciaKm(-22.8728, -42.3431, -22.8894, -42.0286);
    expect(km).toBeGreaterThan(25); expect(km).toBeLessThan(45);
  });
  it("CSV da Driva: reconhece colunas pelo cabeçalho", () => {
    const csv = "Razão Social;Nome Fantasia;CNPJ;Telefone 1;Município;UF;CNAE Principal;Sócios\nCASA DO PISO LTDA;Casa do Piso;11.222.333/0001-81;(22) 99999-8888;Cabo Frio;RJ;4744-0/06;MARCELO FERREIRA\n;;;;;;;\n";
    const r = importarCsv(csv, "RJ", "driva");
    expect(r.candidatos.length).toBe(1);
    expect(r.candidatos[0]).toMatchObject({ nome: "Casa do Piso", cnpj: "11.222.333/0001-81", cidade: "Cabo Frio", uf: "RJ", fonte: "driva" });
    expect(r.candidatos[0].sinais).toContain("sócio: MARCELO FERREIRA");
    expect(r.ignoradas).toBe(1);
  });
});
