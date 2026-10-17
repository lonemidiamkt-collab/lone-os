// Comercial — Leva 3 (out/2026): grupo de vendas no WhatsApp e visitas da rota entrando no funil.
// Dados INVENTADOS: o repositório é público.
import { describe, it, expect } from "vitest";
import { cadastroDoPacote, textoCadastroGrupo, textoClienteGrupo, textoFollowupsGrupo, textoRotaGrupo, textoVoltouGrupo } from "@/lib/crm/grupo-vendas";
import { catalogoDaPagina, lerEtapas, lojasVisitadas, telefoneDaRota, ehRotaDeTeste } from "@/lib/crm/rota";
import { planejarImportacao } from "@/lib/crm/importar";
import { resumirPipeline } from "@/lib/crm/pipeline";
import type { PacoteSite } from "@/lib/crm/site-lead";

const DINHEIRO = /R\$|reais|mensalidade|meta/i;

describe("grupo de vendas: cadastro do site", () => {
  const pacote: PacoteSite = {
    id: "cad-0001-teste",
    lead: {
      nomeCompleto: "Ana Exemplo", whatsappE164: "+5522998765432", emailCorporativo: "ana@lojaexemplo.com.br",
      empresa: "Loja Exemplo", segmento: "Material de construção", faturamentoRotulo: "Até 50 mil", maiorDesafio: "Vender mais no verão",
    },
    atribuicao: { utm_source: "facebook", utm_medium: "cpc", utm_campaign: "outubro" },
  };

  it("leva o número do cliente clicável, empresa, segmento, desafio e campanha", () => {
    const t = textoCadastroGrupo(cadastroDoPacote(pacote, { telefone: "5522998765432" }, "Anúncio → site"));
    expect(t).toContain("*Novo cadastro — anúncio → site*");
    expect(t).toContain("*Empresa:* Loja Exemplo");
    expect(t).toContain("*Contato:* Ana Exemplo");
    expect(t).toContain("(22) 99876-5432 — wa.me/5522998765432");
    expect(t).toContain("*Segmento:* Material de construção");
    expect(t).toContain("*Desafio:* Vender mais no verão");
    expect(t).toContain("*Campanha:* facebook / cpc / outubro");
    expect(t).not.toMatch(DINHEIRO);
  });
  it("telefone errado: mostra o que a pessoa digitou e manda conferir pelo e-mail", () => {
    const t = textoCadastroGrupo(cadastroDoPacote(pacote, { telefone: null, telefoneDigitado: "2299876" }, "Site"));
    expect(t).toContain("*Novo cadastro pelo site*");
    expect(t).toContain("2299876 (veio errado — conferir pelo e-mail)");
    expect(t).not.toContain("wa.me");
  });
  it("campo vazio não vira linha vazia; desafio longo é cortado", () => {
    const t = textoCadastroGrupo({ empresa: null, contatoNome: "Bruno", telefone: "5522998765432", desafio: "x".repeat(900) });
    expect(t).not.toContain("*Empresa:*");
    expect(t.split("\n").every((l) => l.trim().length > 0)).toBe(true);
    expect(t.length).toBeLessThan(600);
  });
  it("voltou pelo site e cliente que preencheu o formulário", () => {
    expect(textoVoltouGrupo({ empresa: "Loja Exemplo", contatoNome: "Ana", telefone: "5522998765432" })).toContain("wa.me/5522998765432");
    expect(textoClienteGrupo("Cliente Exemplo", true, { telefone: "5522998765432" })).toMatch(/^\*Ex-cliente preencheu/);
    expect(textoClienteGrupo("Cliente Exemplo", false, { telefone: null })).toContain("upsell");
  });
});

describe("grupo de vendas: lista de follow-ups", () => {
  it("nada para fazer: não manda nada", () => {
    expect(textoFollowupsGrupo([], 0)).toBeNull();
  });
  it("até 15 itens, o resto fica no painel; régua encerrada vira contagem; sem valor", () => {
    const itens = Array.from({ length: 18 }, (_, i) => ({ empresa: `Loja ${i + 1}`, contatoNome: "Fulano", motivo: "WhatsApp do dia 2 · hoje" }));
    const t = textoFollowupsGrupo(itens, 2)!;
    expect(t).toContain("*Follow-ups de hoje (18)*");
    expect(t).toContain("• Loja 15 —");
    expect(t).not.toContain("• Loja 16 —");
    expect(t).toContain("…e mais 3 no painel.");
    expect(t).toContain("2 régua(s) encerrada(s)");
    expect(t).not.toMatch(DINHEIRO);
  });
});

// Página da rota inventada, no mesmo formato da rota-lagos.vercel.app (literal JS, sem aspas nas chaves).
const PAGINA = `<!doctype html><script>
const ROTA_ID = "lagos-2026-10";
// lista de lojas
const ETAPAS = [
  { n:1, cidade:"Cidade Alfa", lat:-22.8, lng:-42.0, trecho:"44 km · 52 min", empresas:[
    {i:3, nome:"Madeireira Exemplo", dono:"Ana e Bruno", saud:"Ana e Bruno", seg:"Madeireira", ig:"@madeiraexemplo",
      end:"Av. Central, 100 - Centro, Cidade Alfa", lat:-22.1, lng:-42.1, tel:"22998765432", wa:true, obs:"Seg–sex até 18h"},
    {i:4, nome:"Ferragens \\"Teste\\"", dono:"Carla", saud:"Carla", seg:"Ferragens", ig:null, end:"R. Um, s/n", tel:"2226450000", wa:false}
  ]},
  { n:2, cidade:"Cidade Beta", empresas:[
    /* loja nova */
    {i:7, nome:"Telhas Exemplo", dono:"Diego", seg:"Telhas", ig:"telhasexemplo", end:"Estrada Dois, 2"}
  ]}
];
const LOJAS = ETAPAS.flatMap(et => et.empresas);
</script>`;

describe("rota → funil: leitura da página", () => {
  it("lê ETAPAS sem eval, com comentário, aspas escapadas, null e número", () => {
    const etapas = lerEtapas(PAGINA) as { empresas: unknown[] }[];
    expect(etapas).toHaveLength(2);
    expect(etapas[0].empresas).toHaveLength(2);
  });
  it("monta o catálogo com cidade da etapa, telefone com 55 e Instagram sem @", () => {
    const c = catalogoDaPagina(PAGINA);
    expect(c.map((l) => l.id)).toEqual([3, 4, 7]);
    expect(c[0]).toMatchObject({ empresa: "Madeireira Exemplo", cidade: "Cidade Alfa", contato: "Ana e Bruno", telefone: "5522998765432", instagram: "madeiraexemplo", obs: "Seg–sex até 18h" });
    expect(c[1].empresa).toBe('Ferragens "Teste"');
    expect(c[1].telefone).toBe("552226450000");
    expect(c[2]).toMatchObject({ cidade: "Cidade Beta", telefone: null });
  });
  it("página sem a lista ou quebrada: erro (o cron tenta de novo), nunca catálogo vazio calado", () => {
    expect(() => catalogoDaPagina("<html>manutenção</html>")).toThrow(/ETAPAS/);
    expect(() => catalogoDaPagina("const ETAPAS = [ { i:1, nome:\"A\" ")).toThrow();
    expect(() => catalogoDaPagina("const ETAPAS = [ alert(1) ];")).toThrow();
  });
  it("telefone da rota", () => {
    expect(telefoneDaRota("(22) 99876-5432")).toBe("5522998765432");
    expect(telefoneDaRota("+55 22 2645-0000")).toBe("552226450000");
    expect(telefoneDaRota("98765")).toBeNull();
    expect(telefoneDaRota(undefined)).toBeNull();
  });
});

describe("rota → funil: visitas", () => {
  const catalogo = catalogoDaPagina(PAGINA);
  const visitas = [
    { rota: "lagos-2026-10", loja: 3, visitada: true, por: "Roberto", visitadaEm: "2026-10-13T14:00:00Z" },
    { rota: "lagos-2026-11", loja: 3, visitada: true, por: "João", visitadaEm: "2026-11-10T14:00:00Z" }, // revisita
    { rota: "lagos-2026-10", loja: 4, visitada: false, por: "Roberto", visitadaEm: null },             // desmarcada
    { rota: "teste", loja: 7, visitada: true, por: "Roberto", visitadaEm: "2026-10-12T14:00:00Z" },       // teste
    { rota: "lagos-2026-10", loja: 99, visitada: true, por: "Roberto", visitadaEm: "2026-10-13T15:00:00Z" }, // sumiu da página
  ];

  it("uma loja por visita real; a primeira visita é o dia zero; teste e desmarcada ficam de fora", () => {
    const { lojas, semCadastro } = lojasVisitadas(catalogo, visitas);
    expect(lojas.map((l) => l.rota_loja_id)).toEqual([3]);
    expect(lojas[0]).toMatchObject({ visitada_por: "Roberto", visitada_em: "2026-10-13T14:00:00Z", telefone: "5522998765432", horario: "Seg–sex até 18h" });
    expect(semCadastro).toEqual([99]);
    expect(ehRotaDeTeste("teste")).toBe(true);
    expect(ehRotaDeTeste("teste-2")).toBe(true);
    expect(ehRotaDeTeste("lagos-2026-10")).toBe(false);
  });
  it("passa pelo planejador: loja nova vira lead em Contato feito, régua do dia da visita; quem já está não duplica", () => {
    const { lojas } = lojasVisitadas(catalogo, visitas);
    const novo = planejarImportacao({ dados: { lojas_rota: lojas }, existentes: [], clientes: [], hoje: "2026-10-17" });
    expect(novo.linhas[0]).toMatchObject({ acao: "criar", campos: { estagio: "contato", rotaLojaId: 3, cadenciaInicio: "2026-10-13", origem: "Visita — Rota Lagos" } });
    expect(novo.linhas[0].atividades[0].tipo).toBe("visita");
    const de_novo = planejarImportacao({
      dados: { lojas_rota: lojas }, clientes: [], hoje: "2026-10-17",
      existentes: [{ id: "l1", empresa: "Madeireira Exemplo", contatoNome: "Ana", telefone: "5522998765432", rotaLojaId: 3, externoId: null }],
    });
    expect(de_novo.linhas[0].acao).toBe("ignorar");
    const cliente = planejarImportacao({ dados: { lojas_rota: lojas }, existentes: [], hoje: "2026-10-17", clientes: [{ nome: "Outro Nome", telefones: ["(22) 99876-5432"] }] });
    expect(cliente.linhas[0].motivo).toMatch(/cliente/);
  });
  it("mensagem do grupo: uma por rodada, com o WhatsApp de cada loja, sem valor", () => {
    expect(textoRotaGrupo([])).toBeNull();
    const t = textoRotaGrupo([
      { empresa: "Madeireira Exemplo", contatoNome: "Ana e Bruno", telefone: "5522998765432", cidade: "Cidade Alfa", segmento: "Madeireira", por: "Roberto" },
      { empresa: "Telhas Exemplo", contatoNome: "Telhas Exemplo", telefone: null, cidade: null, segmento: null, por: null },
    ])!;
    expect(t).toContain("*Rota: 2 loja(s) visitada(s) entraram no funil*");
    expect(t).toContain("wa.me/5522998765432");
    expect(t).toContain("Visitada por Roberto");
    expect(t).toContain("Sem telefone na rota");
    expect(t).not.toContain("Contato: Telhas Exemplo");
    expect(t).not.toMatch(DINHEIRO);
  });
});

describe("dashboard: pipeline em dinheiro", () => {
  // Valores inventados, redondos para a conta ficar à vista.
  const L = (id: string, estagio: string, valor: number | null, o: Record<string, unknown> = {}) =>
    ({ id, empresa: `Empresa ${id}`, contatoNome: "Fulano", estagio, valorOrcamento: valor, probabilidade: null, fechadoEm: null, ...o });
  const leads = [
    L("a", "negociacao", 1000, { probabilidade: 0.8 }),
    L("b", "negociacao", 2000),            // chance padrão da etapa (60%)
    L("c", "contato", 500, { probabilidade: 0.1 }),
    L("d", "contato", null),               // loja da rota sem valor
    L("e", "novo", 0),                     // zero não é oportunidade
    L("f", "ganho", 3000, { fechadoEm: "2026-10-06T12:00:00Z" }),
    L("g", "ganho", 4000, { fechadoEm: "2026-09-20T12:00:00Z" }),
    L("h", "perdido", 9000),
  ];
  const r = resumirPipeline(leads, "2026-10");

  it("MRR potencial, anualizado, ponderado e ticket médio só dos abertos com valor", () => {
    expect(r.oportunidades.map((o) => o.lead.id)).toEqual(["b", "a", "c"]); // negociação (maior valor primeiro), depois contato
    expect(r.mrrPotencial).toBe(3500);
    expect(r.anualizado).toBe(42000);
    expect(r.ponderado).toBeCloseTo(1000 * 0.8 + 2000 * 0.6 + 500 * 0.1);
    expect(r.ticketMedio).toBeCloseTo(3500 / 3);
    expect(r.semValor).toBe(2);
  });
  it("simulação 25/50/75/100% do potencial, por mês e no ano", () => {
    expect(r.simulacao.map((s) => s.mrr)).toEqual([875, 1750, 2625, 3500]);
    expect(r.simulacao[3].anual).toBe(42000);
  });
  it("funil por etapa conta os sem valor; ganho do mês fora do potencial", () => {
    const contato = r.porEtapa.find((e) => e.etapa === "contato")!;
    expect(contato).toMatchObject({ n: 2, valor: 500 });
    expect(r.porEtapa.find((e) => e.etapa === "novo")!.n).toBe(1);
    expect(r.ganhosNoMes).toEqual({ n: 1, valor: 3000 });
  });
  it("sem nada: zeros, ticket médio vazio", () => {
    const vazio = resumirPipeline([], "2026-10");
    expect(vazio.mrrPotencial).toBe(0);
    expect(vazio.ticketMedio).toBeNull();
  });
});
