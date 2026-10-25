// Hoje do comercial: WhatsApp aberto não conta como contato, e o lote conta só o que gravou (auditoria 21/10/2026,
// itens 4.5 e 4.6). Dados INVENTADOS. Roda o componente de verdade — a decisão é o que o clique chama.
//
// O QUE ACONTECIA:
//  4.5 — clicar em "Pedir confirmação" / "WhatsApp" já registrava "enviado": o toque contava e a régua andava, mesmo se
//        a mensagem não saiu. Agora o clique só anota; a página pergunta "Enviou?" na volta (lib/crm/enviou.ts).
//  4.6 — "Marcar como feito" / "Adiar" em lote anunciava "N feitos" contando os que falharam, sem Desfazer.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import HojeComercial from "@/components/crm/HojeComercial";
import { anotarEnvio, textoWhatsappDoHoje, tirarEnvio } from "@/lib/crm/enviou";
import { ordenarConcluidas } from "@/lib/tarefas/concluidas";
import type { ItemHoje } from "@/lib/crm/hoje";
import type { ReuniaoBase } from "@/lib/crm/reunioes";

type L = { id: string; empresa: string | null; contatoNome: string; telefone: string | null; estagio: string; origem: string | null; createdAt: string; avancos?: string[] };
const lead = (id: string, empresa: string): L => ({ id, empresa, contatoNome: "Ana", telefone: "22999990000", estagio: "contato", origem: null, createdAt: "2026-10-01T12:00:00Z", avancos: [] });
const A = lead("a", "Loja Alfa"), B = lead("b", "Telhas Beta");
const fila = [A, B].map((l) => ({ lead: l, grupo: "toque", motivo: "toque do dia 5", mensagem: { tipo: "mensagem", texto: "Oi!" }, passo: null, toque: null })) as unknown as ItemHoje<L>[];
// Amanhã às 15h em São Paulo (o Hoje agrupa pelo dia de SP).
const diaAmanhaSP = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const amanha = new Date(`${diaAmanhaSP}T15:00:00-03:00`);
const reuniao: ReuniaoBase = {
  id: "r1", leadId: "a", inicio: amanha.toISOString(), fim: new Date(amanha.getTime() + 45 * 60_000).toISOString(), formato: "meet", local: null,
  meetUrl: null, estado: "agendada", lembreteVesperaEm: null, lembreteHoraEm: null, criadoEm: "2026-10-20T12:00:00Z",
};

const props = () => ({
  fila, leads: [A, B], hoje: "2026-10-24", ocupado: null,
  resumoMeta: { meta: 10000, vendido: 0, progresso: 0, falta: 10000, bateu: false, decorridos: 10, diasUteisMes: 22 } as never,
  onAbrir: vi.fn(), onEnviarWhatsApp: vi.fn(async () => {}), onAbriuWhatsApp: vi.fn(), onRegistrar: vi.fn(async () => true),
  onPatch: vi.fn(async () => true), onLote: vi.fn(async () => {}), onDefinirMeta: vi.fn(), onVerDashboard: vi.fn(),
  reunioes: [reuniao], onReuniao: vi.fn(async () => true), onMarcarReuniao: vi.fn(),
});

beforeEach(() => { vi.restoreAllMocks(); });

describe("4.5 — abrir o WhatsApp não registra", () => {
  it("o erro original: 'Pedir confirmação' registrava o contato no clique — agora só anota para o 'Enviou?'", () => {
    const p = props();
    render(<HojeComercial {...p} />);
    fireEvent.click(screen.getByText("Pedir confirmação"));
    expect(p.onRegistrar).not.toHaveBeenCalled();
    expect(p.onAbriuWhatsApp).toHaveBeenCalledWith(A, expect.stringMatching(/confirmação da reunião/));
  });
  it("um pendente por lead; responder tira da fila", () => {
    let fila2 = anotarEnvio([], { lead: A, tipo: "whatsapp", texto: "1", abertoEm: "x" });
    fila2 = anotarEnvio(fila2, { lead: A, tipo: "whatsapp", texto: "2", abertoEm: "y" });
    fila2 = anotarEnvio(fila2, { lead: B, tipo: "whatsapp", texto: "3", abertoEm: "z" });
    expect(fila2.map((p) => [p.lead.id, p.texto])).toEqual([["a", "2"], ["b", "3"]]);
    expect(tirarEnvio(fila2, "a").map((p) => p.lead.id)).toEqual(["b"]);
    expect(textoWhatsappDoHoje("x".repeat(200))).toMatch(/^WhatsApp enviado pelo Hoje: “x{157}…”$/);
  });
});

describe("4.6 — lote vai inteiro para a página, que conta só o que gravou", () => {
  it("'Marcar como feito' com 2 selecionados chama onLote com os dois (sem anunciar nada por conta própria)", async () => {
    const p = props();
    render(<HojeComercial {...p} />);
    fireEvent.click(screen.getByLabelText("Selecionar Loja Alfa"));
    fireEvent.click(screen.getByLabelText("Selecionar Telhas Beta"));
    fireEvent.click(screen.getByText("Marcar como feito"));
    await vi.waitFor(() => expect(p.onLote).toHaveBeenCalledWith("feito", [A, B]));
    expect(p.onRegistrar).not.toHaveBeenCalled();
  });
  it("'Adiar para amanhã' também (antes contava como adiado mesmo com erro)", async () => {
    const p = props();
    render(<HojeComercial {...p} />);
    fireEvent.click(screen.getByLabelText("Selecionar Loja Alfa"));
    fireEvent.click(screen.getByText("Adiar para amanhã"));
    await vi.waitFor(() => expect(p.onLote).toHaveBeenCalledWith("adiar", [A]));
    expect(p.onPatch).not.toHaveBeenCalled();
  });
});

describe("4.11 — meta que não carregou", () => {
  it("diz que não carregou e oferece tentar de novo, em vez de 'sem meta definida'", () => {
    const p = { ...props(), resumoMeta: { meta: null, vendido: 0, progresso: null, falta: null, bateu: false, decorridos: 1, diasUteisMes: 22 } as never, erroMeta: "timeout", onTentarMeta: vi.fn() };
    render(<HojeComercial {...p} />);
    expect(screen.getByText("Não consegui carregar a meta do mês.")).toBeInTheDocument();
    expect(screen.queryByText("Definir meta")).toBeNull();
    fireEvent.click(screen.getByText("Tentar de novo"));
    expect(p.onTentarMeta).toHaveBeenCalled();
  });
});

describe("4.14 — tarefa concluída agora aparece primeiro em Concluídas", () => {
  it("a antiga concluída por engano não fica escondida depois das 40 mais novas", () => {
    const concluidas = Array.from({ length: 45 }, (_, i) => ({ id: `t${i}` }));
    const ordem = ordenarConcluidas(concluidas, ["t44", "t42"]).slice(0, 40).map((t) => t.id);
    expect(ordem.slice(0, 2)).toEqual(["t44", "t42"]);
  });
});
