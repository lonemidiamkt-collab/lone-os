import { describe, it, expect } from "vitest";
import {
  capasDosAnexos, diaNaAgenda, janelaDaAgenda, mesValido, montarAgenda, motivoSemAlteracao, podePedirAlteracao,
  situacaoNaAgenda, type LinhaCardAgenda,
} from "@/lib/portal/agenda";
import { montarMateriais, tipoDoArquivo } from "@/lib/portal/materiais";
import { resumoInstagram } from "@/lib/portal/formatDelta";

// Leva 7D — portal do cliente: pedir alteração (N35), agenda do mês (N36), material enviado (N37) e a
// frase do Instagram (N34).

describe("N35: quando o cliente pode pedir alteração", () => {
  it("arte entregue, aprovada, com o cliente ou agendada: pode", () => {
    expect(podePedirAlteracao({ status: "approval", designer_delivered_at: "2026-09-20T10:00:00Z" })).toBe(true);
    expect(podePedirAlteracao({ status: "client_approval" })).toBe(true);
    expect(podePedirAlteracao({ status: "scheduled" })).toBe(true);
    expect(podePedirAlteracao({ status: "in_production", client_approved_at: "2026-09-20T10:00:00Z" })).toBe(true);
  });

  it("no ar, arquivado ou ainda em produção: não pode, cada um com o seu motivo", () => {
    expect(motivoSemAlteracao({ status: "published", designer_delivered_at: "x" })).toBe("no_ar");
    expect(motivoSemAlteracao({ status: "scheduled", archived_at: "2026-09-01T00:00:00Z" })).toBe("arquivado");
    expect(motivoSemAlteracao({ status: "in_production" })).toBe("em_producao");
    expect(motivoSemAlteracao({ status: "ideas" })).toBe("em_producao");
  });
});

const card = (c: Partial<LinhaCardAgenda> & { id: string }): LinhaCardAgenda => ({ title: "Post", format: "Reels", ...c });

describe("N36: agenda do cliente", () => {
  it("só entra compromisso com o cliente: agendado, no ar ou aprovado", () => {
    expect(situacaoNaAgenda(card({ id: "a", status: "scheduled" }))).toBe("agendado");
    expect(situacaoNaAgenda(card({ id: "b", status: "published" }))).toBe("no_ar");
    expect(situacaoNaAgenda(card({ id: "c", status: "client_approval", client_approved_at: "x" }))).toBe("aprovado");
    for (const status of ["ideas", "script", "in_production", "blocked", "approval", "client_approval"]) {
      expect(situacaoNaAgenda(card({ id: "d", status })), status).toBeNull();
    }
    // Arquivado só vale se foi ao ar (o time arquiva depois de postar).
    expect(situacaoNaAgenda(card({ id: "e", status: "scheduled", archived_at: "x" }))).toBeNull();
    expect(situacaoNaAgenda(card({ id: "f", status: "published", archived_at: "x" }))).toBe("no_ar");
  });

  it("o dia: publicado → dia em que foi ao ar (SP); senão a data planejada", () => {
    // 23h30 de SP do dia 19 é 02h30 UTC do dia 20.
    expect(diaNaAgenda(card({ id: "a", status: "published", due_date: "2026-09-18", publish_verified_at: "2026-09-20T02:30:00Z" }))).toBe("2026-09-19");
    expect(diaNaAgenda(card({ id: "b", status: "scheduled", due_date: "2026-09-25" }))).toBe("2026-09-25");
    expect(diaNaAgenda(card({ id: "c", status: "scheduled", scheduled_at: "2026-09-26T15:00:00Z" }))).toBe("2026-09-26");
    expect(diaNaAgenda(card({ id: "d", status: "scheduled" }))).toBeNull();
  });

  it("próximos 7 dias e o mês, em ordem, com hora e capa", () => {
    const r = montarAgenda({
      hoje: "2026-09-24",
      mes: "2026-09",
      cards: [
        card({ id: "hoje", status: "scheduled", due_date: "2026-09-24", due_time: "18:00:00" }),
        card({ id: "semana", status: "scheduled", due_date: "2026-09-30", image_url: "https://cdn/x.jpg" }),
        card({ id: "outubro", status: "scheduled", due_date: "2026-10-01" }),
        card({ id: "longe", status: "scheduled", due_date: "2026-10-15" }),
        card({ id: "passado", status: "published", due_date: "2026-09-10", publish_verified_at: "2026-09-10T15:00:00Z", ig_media_id: "m1" }),
        card({ id: "pauta", status: "ideas", due_date: "2026-09-25" }),
      ],
      capas: new Map([["hoje", "https://cdn/capa.jpg"]]),
      links: new Map([["m1", "https://instagram.com/p/abc"]]),
    });
    // 24/09 + 6 dias = 30/09: o dia 1º/10 já fica de fora dos "próximos 7 dias".
    expect(r.proximos.map((i) => i.id)).toEqual(["hoje", "semana"]);
    expect(r.doMes.map((i) => i.id)).toEqual(["passado", "hoje", "semana"]);
    const hoje = r.proximos[0];
    expect(hoje).toMatchObject({ hora: "18:00", imagem: "https://cdn/capa.jpg", situacao: "agendado", podeAlterar: true });
    expect(r.proximos[1].imagem).toBe("https://cdn/x.jpg");
    const passado = r.doMes[0];
    expect(passado).toMatchObject({ situacao: "no_ar", link: "https://instagram.com/p/abc", podeAlterar: false });
  });

  it("janela de leitura cobre o mês e os próximos 7 dias", () => {
    expect(janelaDaAgenda("2026-09", "2026-09-28")).toEqual({ de: "2026-09-01", ate: "2026-10-04" });
    expect(janelaDaAgenda("2026-08", "2026-09-28")).toEqual({ de: "2026-08-01", ate: "2026-10-04" });
    expect(janelaDaAgenda("2026-11", "2026-09-28")).toEqual({ de: "2026-09-28", ate: "2026-11-30" });
  });

  it("mês da URL só no formato certo", () => {
    expect(mesValido("2026-09")).toBe(true);
    for (const x of ["2026-13", "2026-9", "abc", "", null, "2026-09-01"]) expect(mesValido(x as string)).toBe(false);
  });

  it("capa é a arte entregue, nunca a referência", () => {
    const capas = capasDosAnexos([
      { card_id: "a", url: "https://ref.jpg", tipo: "referencia" },
      { card_id: "a", url: "https://legado.jpg", tipo: null },
      { card_id: "a", url: "https://arte.jpg", tipo: "entrega" },
      { card_id: "b", url: "https://so-ref.jpg", tipo: "referencia" },
      { card_id: "c", url: "javascript:alert(1)", tipo: "entrega" },
    ]);
    expect(capas.get("a")).toBe("https://arte.jpg");
    expect(capas.has("b")).toBe(false);
    expect(capas.has("c")).toBe(false);
  });
});

describe("N37: histórico do material enviado", () => {
  it("tipo do arquivo pelo mime (e pela extensão da planilha)", () => {
    expect(tipoDoArquivo("image/png")).toBe("imagem");
    expect(tipoDoArquivo("video/mp4")).toBe("video");
    expect(tipoDoArquivo("application/pdf")).toBe("pdf");
    expect(tipoDoArquivo("text/csv")).toBe("planilha");
    expect(tipoDoArquivo("application/octet-stream", "precos.xlsx")).toBe("planilha");
    expect(tipoDoArquivo(null)).toBe("arquivo");
  });

  it("recebido sem dizer quem; uso só quando o time ligou a um post que não foi descartado", () => {
    const itens = montarMateriais({
      uploads: [
        { id: "u1", file_name: "foto.jpg", mime_type: "image/jpeg", size_bytes: 2048, created_at: "2026-09-20T12:00:00Z", visto_em: "2026-09-20T13:00:00Z", visto_por: "carlos@lone", card_id: "c1", storage_path: "cli/2026-09-20/abc.jpg" },
        { id: "u2", file_name: "tabela.pdf", mime_type: "application/pdf", created_at: "2026-09-21T12:00:00Z", card_id: "c2" },
        { id: "u3", file_name: "logo.png", mime_type: "image/png", created_at: "2026-09-22T12:00:00Z" },
      ],
      cards: new Map([
        ["c1", { id: "c1", title: "Promoção de sábado", status: "published", publish_verified_at: "2026-09-21T15:00:00Z", ig_media_id: "m9" }],
        ["c2", { id: "c2", title: "Descartado", status: "ideas", archived_at: "2026-09-22T00:00:00Z" }],
      ]),
      links: new Map([["m9", "https://instagram.com/p/xyz"]]),
      urls: new Map([["u1", "https://storage/assinada"]]),
    });
    expect(itens[0]).toMatchObject({ recebido: true, tamanhoKb: 2, url: "https://storage/assinada", uso: { titulo: "Promoção de sábado", situacao: "no_ar", dia: "2026-09-21", link: "https://instagram.com/p/xyz" } });
    expect(itens[1].uso).toBeNull();
    expect(itens[2]).toMatchObject({ recebido: false, uso: null, url: null });
    const json = JSON.stringify(itens);
    expect(json).not.toContain("carlos@lone");
    expect(json).not.toContain("cli/2026-09-20");
  });
});

describe("N34: o Instagram em uma frase", () => {
  it("posts, alcance e seguidores numa frase", () => {
    expect(resumoInstagram(7, { postsNoPeriodo: 3, alcance: 4210, alcanceJanelaDias: 7, seguidoresGanhos: 18 }))
      .toBe("Nos últimos 7 dias: 3 posts publicados, 4.210 pessoas alcançadas e 18 seguidores novos.");
    expect(resumoInstagram(30, { postsNoPeriodo: 1, alcance: null, seguidoresGanhos: -2 }))
      .toBe("Nos últimos 30 dias: 1 post publicado e 2 seguidores a menos.");
  });

  it("alcance de outra janela não entra; sem post, diz isso", () => {
    expect(resumoInstagram(14, { postsNoPeriodo: 0, alcance: 900, alcanceJanelaDias: 28, seguidoresGanhos: 0 }))
      .toBe("Nas últimas 2 semanas: nenhum post publicado.");
    expect(resumoInstagram(7, null)).toBeNull();
  });
});
