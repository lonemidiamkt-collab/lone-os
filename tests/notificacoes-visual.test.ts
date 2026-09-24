import { describe, it, expect } from "vitest";
import {
  autorNoCorpo, buscaDeClientes, cardDoCorpo, corpoDaEntrega, ehAtualizacaoDeArte, ehDeIA, ehEntregaDeDesigner,
  estiloDasIniciais, iniciais, logoDoCliente, normalizar, perfilPorNome, pessoaNoInicio, tituloDaEntrega,
  tituloDeEntregaDeDesigner, tomDoNome,
} from "@/lib/notificacoes/visual";
import { fotoDaPessoa, fotoNoMapa, fotoPorPerfil } from "@/lib/equipe/fotos";

// Roberto (23/09): "quando for de um cliente, colocar a logo do cliente"; "se for uma parada de IA,
// um logo de IA"; "se for entrega de designer, a fotinha dele".

const CLIENTES = [
  { id: "1", name: "Nova União" },
  { id: "2", name: "Óticas Raki" },
  { id: "3", name: "Raki" },
  { id: "4", name: "Contele Energia Solar", nomeFantasia: "Contele" },
  { id: "5", name: "WT" },
  { id: "6", name: "Mr.distribuidora MDF" },
];

const EQUIPE = [
  { id: "roberto", name: "Roberto Lino", email: "lonemidiamkt@gmail.com" },
  { id: "carlos", name: "Carlos Augusto", email: "carlos@lonemidia.com" },
  { id: "rodrigo", name: "Rodrigo", email: "rodrigo@lonemidia.com" },
  { id: "lucas", name: "Lucas Bueno" },
  { id: "lucas2", name: "Lucas Souza" },
];

describe("normalizar", () => {
  it("tira acento, caixa e pontuação", () => {
    expect(normalizar("  Óticas  RAKI! ")).toBe("oticas raki");
    expect(normalizar("Mr.distribuidora MDF")).toBe("mr distribuidora mdf");
    expect(normalizar(null)).toBe("");
  });
});

describe("cliente citado no texto", () => {
  const busca = buscaDeClientes(CLIENTES);

  it("acha o cliente sem ligar para acento e caixa", () => {
    expect(busca.umNoTexto("NOVA UNIAO")?.id).toBe("1");
    expect(busca.umNoTexto("CPL alto na conta da oticas raki hoje")?.id).toBe("2");
  });

  it("o nome mais longo vence ('Óticas Raki' antes de 'Raki')", () => {
    expect(busca.umNoTexto("Óticas Raki")?.id).toBe("2");
    expect(busca.umNoTexto("Raki")?.id).toBe("3");
  });

  it("casa pelo nome fantasia também", () => {
    expect(busca.umNoTexto("Arte da Contele pronta")?.id).toBe("4");
  });

  it("só palavra inteira, e ignora nome com menos de 4 letras", () => {
    expect(busca.umNoTexto("Rakiana Modas")).toBeNull();
    expect(busca.umNoTexto("Saldo baixo na WT")).toBeNull();
    expect(busca.umNoTexto("")).toBeNull();
  });

  it("lista todos os citados, na ordem, sem repetir e sem contar nome dentro de nome", () => {
    const todos = busca.todosNoTexto("Saldo baixo: Nova União, Óticas Raki e Contele. De novo Nova União.");
    expect(todos.map((c) => c.id)).toEqual(["1", "2", "4"]);
  });
});

describe("logo do cliente", () => {
  it("prefere logo, depois docLogo", () => {
    expect(logoDoCliente({ logo: "https://x/a.png", docLogo: "https://x/b.png" })).toBe("https://x/a.png");
    expect(logoDoCliente({ docLogo: "https://x/b.png" })).toBe("https://x/b.png");
  });

  it("não usa PDF, caminho do cofre nem texto solto", () => {
    expect(logoDoCliente({ logo: "https://x/logo.pdf", docLogo: "legal://cli/logo.png" })).toBeNull();
    expect(logoDoCliente({ logo: "🏥" })).toBeNull();
    expect(logoDoCliente(null)).toBeNull();
  });
});

describe("aviso da IA", () => {
  it.each([
    ["⚠️ Revisão da arte (IA)", ""],
    ["🤖 Nova demanda do Agente CS", ""],
    ["✏️ Ajuste na arte (Agente CS)", ""],
    ["Resumo do dia", "a IA achou 3 pontos a conferir"],
    ["Loninho respondeu o cliente", ""],
  ])("reconhece %s", (titulo, corpo) => {
    expect(ehDeIA(titulo, corpo)).toBe(true);
  });

  it.each([
    ["Card movido", "ele ia postar amanhã"],
    ["Iara Imóveis", "CPL da Iara subiu"],
    ["Novo card de conteúdo pra você", "a gente combinou"],
  ])("não confunde %s", (titulo, corpo) => {
    expect(ehDeIA(titulo, corpo)).toBe(false);
  });
});

describe("entrega do designer", () => {
  it("reconhece os títulos do sistema e o verbo", () => {
    expect(ehEntregaDeDesigner("Arte entregue pelo Designer")).toBe(true);
    expect(ehEntregaDeDesigner("Arte atualizada pelo designer")).toBe(true);
    expect(ehEntregaDeDesigner("Aviso", "Rodrigo entregou a arte")).toBe(true);
    expect(ehEntregaDeDesigner("Arte pronta — SEX 25")).toBe(true);
    expect(tituloDeEntregaDeDesigner("Arte entregue pelo Designer")).toBe(true);
    expect(tituloDeEntregaDeDesigner("Rodrigo entregou")).toBe(false);
  });

  it("não confunde aprovação nem produção", () => {
    expect(ehEntregaDeDesigner("🎉 Contele aprovou a arte", "o cliente aprovou pelo portal")).toBe(false);
    expect(ehEntregaDeDesigner("Card em produção", "Designer: verificar fila.")).toBe(false);
  });

  it("sabe se é atualização", () => {
    expect(ehAtualizacaoDeArte("Arte atualizada pelo designer")).toBe(true);
    expect(ehAtualizacaoDeArte("Arte entregue pelo Designer")).toBe(false);
  });

  it("tira o autor do aviso local", () => {
    expect(autorNoCorpo('Rodrigo enviou a arte de "SEX 25" para Contele. Social media: conferir.')).toBe("Rodrigo");
    expect(autorNoCorpo('Carlos Augusto atualizou a arte de "X" para Y.')).toBe("Carlos Augusto");
    expect(autorNoCorpo('"SEX 25" (Contele) — v1, 2 arte(s).')).toBeNull();
  });

  it("tira card e cliente dos dois formatos de corpo", () => {
    expect(cardDoCorpo('"SEX 25 - 7 em 10" (Contele Energia Solar) — v1, 2 arte(s). Pronta para conferir.'))
      .toEqual({ titulo: "SEX 25 - 7 em 10", cliente: "Contele Energia Solar" });
    expect(cardDoCorpo('Rodrigo enviou a arte de "Promo" para Mr.distribuidora MDF. Social media: conferir e confirmar.'))
      .toEqual({ titulo: "Promo", cliente: "Mr.distribuidora MDF" });
    expect(cardDoCorpo('"Só o título"')).toEqual({ titulo: "Só o título", cliente: null });
    expect(cardDoCorpo("sem aspas")).toBeNull();
  });

  it("reescreve título e corpo", () => {
    expect(tituloDaEntrega("Gabriel Souza")).toBe("Gabriel entregou a arte");
    expect(tituloDaEntrega("Rodrigo", true)).toBe("Rodrigo atualizou a arte");
    expect(corpoDaEntrega("SEX 25 - 7 em 10", "Contele Energia Solar")).toBe("SEX 25 - 7 em 10 · Contele Energia Solar");
    expect(corpoDaEntrega("SEX 25", null)).toBe("SEX 25");
  });
});

describe("pessoa do time", () => {
  it("acha o perfil pelo nome, sem acento/caixa, pelo primeiro nome único ou pelo e-mail", () => {
    expect(perfilPorNome("rodrigo", EQUIPE)?.id).toBe("rodrigo");
    expect(perfilPorNome("Carlos", EQUIPE)?.id).toBe("carlos");
    expect(perfilPorNome("carlos@lonemidia.com", EQUIPE)?.id).toBe("carlos");
    expect(perfilPorNome("Lucas", EQUIPE)).toBeNull();
    expect(perfilPorNome("Gabriel", EQUIPE)).toBeNull();
    expect(perfilPorNome("", EQUIPE)).toBeNull();
  });

  it("reconhece quem abre o corpo, mas não um cliente com o mesmo nome", () => {
    expect(pessoaNoInicio('Carlos confirmou a arte de "X" — Contele.', EQUIPE)?.id).toBe("carlos");
    expect(pessoaNoInicio("Roberto Lino pediu revisão", EQUIPE)?.id).toBe("roberto");
    expect(pessoaNoInicio("Carlos Autopeças avisou: aniversário da loja", EQUIPE)).toBeNull();
    expect(pessoaNoInicio('"Promo" (Contele) — v1', EQUIPE)).toBeNull();
  });
});

describe("iniciais e cor", () => {
  it("duas letras para nome composto, uma para nome simples, sem conectivos", () => {
    expect(iniciais("Nova União")).toBe("NU");
    expect(iniciais("Óticas Raki")).toBe("ÓR");
    expect(iniciais("Casa de Carnes")).toBe("CC");
    expect(iniciais("Julio")).toBe("J");
    expect(iniciais("🚀 foguete")).toBe("F");
    expect(iniciais("")).toBe("?");
  });

  it("tom fixo por nome, de 1 a 5, sem ligar para acento e caixa", () => {
    const t = tomDoNome("Óticas Raki");
    expect(t).toBeGreaterThanOrEqual(1);
    expect(t).toBeLessThanOrEqual(5);
    expect(tomDoNome("OTICAS RAKI")).toBe(t);
    const tons = new Set(CLIENTES.map((c) => tomDoNome(c.name)));
    expect(tons.size).toBeGreaterThan(1);
  });

  it("cor só por token (chart-*), nunca literal", () => {
    const s = estiloDasIniciais("Nova União");
    expect(s.backgroundColor).toMatch(/^color-mix\(in srgb, var\(--chart-[1-5]\) \d+%, var\(--card\)\)$/);
    expect(s.color).toMatch(/var\(--foreground\)/);
    expect(JSON.stringify(s)).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });
});

describe("fotos do time", () => {
  it("resolve pelo primeiro nome, sem acento e caixa", () => {
    const mapa = { gabriel: "/equipe/gabriel.jpg", julio: "/equipe/julio.jpg" };
    expect(fotoNoMapa("Gabriel Souza", mapa)).toBe("/equipe/gabriel.jpg");
    expect(fotoNoMapa("JÚLIO", mapa)).toBe("/equipe/julio.jpg");
    expect(fotoNoMapa("Maria", mapa)).toBeNull();
    expect(fotoNoMapa(undefined, mapa)).toBeNull();
  });

  it("o mapa real tem o time que mandou foto", () => {
    expect(fotoDaPessoa("Rodrigo Designer")).toBe("/equipe/rodrigo.jpg");
    expect(fotoDaPessoa("Roberto Lino")).toBe("/equipe/roberto.jpg");
    expect(fotoPorPerfil({ name: "Gabriel" })).toBe("/equipe/gabriel.jpg");
    expect(fotoPorPerfil(null)).toBeNull();
    expect(fotoDaPessoa("Maria Luiza")).toBeNull();
  });
});
