import { describe, it, expect } from "vitest";
import { abordagemInicial, followup, mensagemDecisor, convite, ofertaHorarios, confirmacao, respostaERobo, respostaPreco, respostaJaTemAgencia, perguntaCidade, respostaSaberMais, textoSeguro, lembrete1h, lembrete24h, saudacaoDoDia } from "@/lib/prospeccao/mensagens";
import { lerIntencaoRegras, ehOptOut } from "@/lib/prospeccao/intencao";
import { consolidarDecisor } from "@/lib/prospeccao/decisor";
import { chavesDedup, mesmaEmpresa, telefoneDigitos, cnpjLimpo, instagramHandle, distanciaKm, nomeProprio, primeiroNome, siteNormalizado, celularesNoTexto } from "@/lib/prospeccao/normalizar";
import { importarCsv } from "@/lib/prospeccao/providers/importacao";
import { CONFIG_PADRAO } from "@/lib/prospeccao/config";
import { prospectBase } from "./prospeccao-score.test";

const cfg = CONFIG_PADRAO;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const AGORA = new Date("2026-09-15T13:00:00Z");

const red = (p: ReturnType<typeof prospectBase>, extra: Record<string, unknown> = {}) => ({ p, cfg, historico: [], agora: AGORA, forcarModo: "fixo" as const, ...extra });

describe("mensagens da Rafaela (modo fixo = reserva quando a IA não está): sem emoji, sem preço, sem fingir ser o Roberto", () => {
  it("abordagem se apresenta como Rafaela e pede o decisor; sem decisor pergunta quem é o responsável", async () => {
    const a = await abordagemInicial(red(prospectBase()));
    expect(a).toMatch(/Rafaela/); expect(a).toMatch(/representante comercial da Lone Mídia/);
    expect(a).toMatch(/Marcelo Ferreira/); expect(a).toMatch(/bom dia/);
    expect(a).not.toMatch(/Meu nome é Roberto|Aqui é da equipe do Roberto/);
    expect(a).not.toMatch(EMOJI);
    const b = await abordagemInicial(red(prospectBase({ decisor_nome: null })));
    expect(b).toMatch(/Quem seria a pessoa responsável/);
    const c = await abordagemInicial(red(prospectBase({ decisor_confianca: 0.3 })));
    expect(c).toMatch(/responsável/);
  });
  it("variações: a que usa {gancho} só entra quando há gancho; a escolha é estável por prospect", async () => {
    const sem = await abordagemInicial(red(prospectBase({ id: "b2", diagnostico: null })));
    expect(sem).not.toMatch(/chamou nossa atenção/);
    const ids = ["a1", "b2", "c3", "d4", "e5", "f6"];
    const textos = await Promise.all(ids.map((id) => abordagemInicial(red(prospectBase({ id })))));
    expect(new Set(textos).size).toBeGreaterThan(1);
    expect(await abordagemInicial(red(prospectBase({ id: "a1" })))).toBe(textos[0]);
    const comGancho = textos.find((t) => t.includes("chamou nossa atenção"));
    if (comGancho) expect(comGancho).toMatch(/porque vi que vocês têm duas lojas/);
  });
  it("todos os templates fixos passam no validador com dados reais", async () => {
    const p = prospectBase();
    const textos = await Promise.all([
      abordagemInicial(red(p)), followup(red(p), 1), followup(red(p), 1, true), followup(red(p), 2), followup(red(p), 3), mensagemDecisor(red(p)),
      convite(red(p)).texto, respostaERobo(red(p)), respostaPreco(red(p)), respostaJaTemAgencia(red(p)), perguntaCidade(red(p)), respostaSaberMais(red(p)),
      ofertaHorarios(red(p), ["2026-09-16T10:00:00-03:00", "2026-09-17T15:00:00-03:00"]), ofertaHorarios(red(p), ["2026-09-16T10:00:00-03:00"]),
    ]);
    for (const t of textos) { expect(textoSeguro(t), t).toMatchObject({ ok: true }); expect(t).not.toMatch(/\{\w+\}/); }
  });
  it("mensagem ao decisor traz o gancho e PARA — sem pedir reunião", async () => {
    const t = await mensagemDecisor(red(prospectBase()));
    expect(t).toMatch(/vi porque vi que vocês têm duas lojas|vi que vocês têm duas lojas/i);
    expect(t).not.toMatch(/reuni[aã]o|marcar|hor[aá]rio\?/i);
    const semGancho = await mensagemDecisor(red(prospectBase({ diagnostico: null })));
    expect(semGancho).not.toMatch(/vi \./); expect(semGancho).toMatch(/Rafaela/);
  });
  it("convite: visita até 80 km pede permissão para olhar a agenda; Meet acima; presente só se disponível E reservado", async () => {
    const v = convite(red(prospectBase({ distancia_km: 45, modalidade_preferida: null })));
    expect(v.tipo).toBe("visita"); expect(await v.texto).toMatch(/Araruama/); expect(await v.texto).toMatch(/eu vejo alguns horários/);
    expect(convite(red(prospectBase({ distancia_km: 130, modalidade_preferida: null }))).tipo).toBe("online");
    expect(await convite(red(prospectBase({ distancia_km: 130, modalidade_preferida: null }))).texto).toMatch(/Quer que eu veja os próximos horários/);
    expect(await convite(red(prospectBase({ gift_reserved: true }))).texto).not.toMatch(/presente/);
    expect(await convite(red(prospectBase({ gift_reserved: true }), { cfg: { ...cfg, gift_available: true } })).texto).toMatch(/presente/);
    expect(await convite(red(prospectBase({ gift_reserved: false }), { cfg: { ...cfg, gift_available: true } })).texto).not.toMatch(/presente/);
  });
  it("confirmações: Meet com link só quando existe; visita confirma o endereço; sem telefone da Lone", async () => {
    const com = await confirmacao(red(prospectBase()), { quandoIso: "2026-09-17T15:00:00-03:00", tipo: "online", link: "https://meet.google.com/abc-defg-hij" });
    expect(com).toMatch(/https:\/\/meet\.google\.com\/abc-defg-hij/); expect(com).toMatch(/17\/09\/2026, às 15:00/); expect(com).not.toMatch(/98153-0700/);
    const sem = await confirmacao(red(prospectBase()), { quandoIso: "2026-09-17T15:00:00-03:00", tipo: "online", link: null });
    expect(sem).not.toMatch(/meet\.google\.com/); expect(sem).toMatch(/envia o link/);
    const vis = await confirmacao(red(prospectBase({ endereco: "Av. Principal, 100" })), { quandoIso: "2026-09-17T15:00:00-03:00", tipo: "visita" });
    expect(vis).toMatch(/Av\. Principal, 100\. Está certinho\?/);
    const visSemEnd = await confirmacao(red(prospectBase({ endereco: null })), { quandoIso: "2026-09-17T15:00:00-03:00", tipo: "visita" });
    expect(visSemEnd).toMatch(/me confirma o endereço/);
    expect(await lembrete1h(red(prospectBase({ meet_url: "https://meet.google.com/x" })), "2026-09-17T15:00:00-03:00")).toMatch(/meet\.google\.com\/x/);
    expect(await lembrete24h(red(prospectBase()), "2026-09-17T15:00:00-03:00")).toMatch(/amanhã, às 15:00/);
  });
  it("saudação segue a hora de SP", () => {
    expect(saudacaoDoDia(new Date("2026-09-15T12:00:00Z"))).toBe("bom dia");
    expect(saudacaoDoDia(new Date("2026-09-15T17:00:00Z"))).toBe("boa tarde");
    expect(saudacaoDoDia(new Date("2026-09-15T23:00:00Z"))).toBe("boa noite");
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
  });
  it("acha o celular na bio do Instagram, no wa.me e ignora fixo, CNPJ e nº de pedido", () => {
    expect(celularesNoTexto("Pedidos pelo WhatsApp (22) 99876-5432 ou 22 9 8765-4321")).toEqual(["5522998765432", "5522987654321"]);
    expect(celularesNoTexto("https://wa.me/5522998765432?text=oi")).toEqual(["5522998765432"]);
    expect(celularesNoTexto("+55 22 99876-5432 · CNPJ 12.345.678/0001-90 · fixo (22) 2664-1234")).toEqual(["5522998765432"]);
    expect(celularesNoTexto("pedido 20259987654321 tel 2299876543")).toEqual([]);
    expect(celularesNoTexto(null)).toEqual([]);
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

describe("números e cidade vindos da busca web", () => {
  it("nota do Google em qualquer formato vira 0–5; milhar não vira decimal", async () => {
    const { numeroBr, notaGoogle, cidadeLimpa } = await import("@/lib/prospeccao/providers/web-search");
    expect(notaGoogle("4.4")).toBe(4.4); expect(notaGoogle("4,4")).toBe(4.4); expect(notaGoogle(44)).toBe(4.4); expect(notaGoogle("4.6/5")).toBe(4.6); expect(notaGoogle("7")).toBeNull();
    expect(numeroBr("1.240")).toBe(1240); expect(numeroBr("1,240")).toBe(1240); expect(numeroBr("382 avaliações")).toBe(382); expect(numeroBr("1.240,5")).toBe(1240.5);
    expect(cidadeLimpa("Araruama/RJ", "x")).toBe("Araruama"); expect(cidadeLimpa("Cabo Frio - RJ", "x")).toBe("Cabo Frio"); expect(cidadeLimpa(null, "Maricá")).toBe("Maricá");
  });
});

describe("cliente da Lone nunca vira prospect (casamento de nomes)", () => {
  it("casa variações reais de nome", async () => {
    const { nomesParecidos } = await import("@/lib/prospeccao/normalizar");
    expect(nomesParecidos("Varejão da Construção", "Varejão Material de Construção")).toBe(true);
    expect(nomesParecidos("DelRio Atacadão do Piso", "Del Rio Atacadão do Piso")).toBe(true);
    expect(nomesParecidos("Ello Material de Construção", "Ello Material de Construcao Ltda")).toBe(true);
    expect(nomesParecidos("Top Pisos", "TopPisos Cabo Frio")).toBe(true);
    expect(nomesParecidos("João da Roçadeira", "Joao da Rocadeira Máquinas")).toBe(true);
    expect(nomesParecidos("Armazém do Ferro", "Armazem Do Ferro")).toBe(true);
    // "Império" é a única palavra que identifica os dois — e os dois são clientes. Excluir a mais é barato.
    expect(nomesParecidos("Imperio dos Pisos", "Império Material de Construção")).toBe(true);
    expect(nomesParecidos("Império dos Pisos", "Pisos & Cia")).toBe(false);
    expect(nomesParecidos("Casa do Piso", "Casa das Telhas")).toBe(false);
    expect(nomesParecidos("Construlagos", "Constrular")).toBe(false);
    expect(nomesParecidos("Rimil Building Materials", "MRQ Material de Construção")).toBe(false);
  });
});

describe("mensagem automática, uma pessoa só, artigo por gênero", () => {
  it("detecta bot do WhatsApp Business", async () => {
    const { ehMensagemAutomatica } = await import("@/lib/prospeccao/intencao");
    expect(ehMensagemAutomatica("Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos em breve.")).toBe(true);
    expect(ehMensagemAutomatica("Olá! Seja bem-vindo(a) à M A Shop 🛍️ Sou Vendedor Lucas. Aqui você encontra ofertas")).toBe(true);
    expect(ehMensagemAutomatica("Ola! Somos a DISTRIBUIDORA MR agradecemos seu contato\nComo podemos ajudar?")).toBe(true);
    expect(ehMensagemAutomatica("Ola !!! Me chamo Edilson e agradeço seu contato. Como podemos ajudar?")).toBe(false);
    expect(ehMensagemAutomatica("sobre o que seria?")).toBe(false);
    expect(ehMensagemAutomatica("pode falar, sou o dono")).toBe(false);
  });
  it("só a primeira pessoa e o artigo certo", async () => {
    const { primeiraPessoa, artigoDe } = await import("@/lib/prospeccao/normalizar");
    expect(primeiraPessoa("Luiz Ribamar Pereira; Maria Adaelta Gomes Pereira")).toBe("Luiz Ribamar Pereira");
    expect(primeiraPessoa("Cassio da Silva e Vanessa Pinto")).toBe("Cassio da Silva");
    expect(artigoDe("Mariana Marques")).toBe("a"); expect(artigoDe("Marcelo Ferreira")).toBe("o"); expect(artigoDe("Luca Silva")).toBe("o");
    const a = await abordagemInicial(red(prospectBase({ id: "z9", decisor_nome: "Mariana Marques Amorim", diagnostico: null })));
    expect(a).toMatch(/com a Mariana Marques Amorim/); expect(a).not.toMatch(/o Mariana/);
  });
});
