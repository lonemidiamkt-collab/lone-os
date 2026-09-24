// tests/trafego-recargas.test.ts — Leva 7A (N3): calendário de recargas Pix/boleto com rascunho de lembrete.

import { describe, it, expect } from "vitest";
import { montarRecargas, temRecarga, type ContaRecarga } from "@/lib/trafego/recargas";

const HOJE = "2026-09-24";
const conta = (o: Partial<ContaRecarga> = {}): ContaRecarga => ({
  id: "1", clientName: "Loja A", forma: "pix", isPrepaid: true, saldo: 1000, ritmoDia: 100,
  proximoAporte: null, pixKey: "123", telefone: "(22) 99999-9999", ...o,
});
const sp = (t: string) => t.replace(/ /g, " ");

describe("calendário de recargas", () => {
  it("cartão não tem recarga; Pix, boleto e pré-pago sem forma têm", () => {
    expect(temRecarga({ forma: "cartao", isPrepaid: false })).toBe(false);
    expect(temRecarga({ forma: "cartao", isPrepaid: true })).toBe(false);
    expect(temRecarga({ forma: "pix", isPrepaid: false })).toBe(true);
    expect(temRecarga({ forma: null, isPrepaid: true })).toBe(true);
    expect(temRecarga({ forma: null, isPrepaid: false })).toBe(false);
  });

  it("prazo = o que vier antes: aporte combinado ou 1 dia antes do saldo acabar (Pix)", () => {
    const [r] = montarRecargas([conta()], HOJE); // 1000 / 100 = 10 dias → acaba 04/10, recarregar até 03/10
    expect(r.acabaEm).toBe("2026-10-04");
    expect(r).toMatchObject({ prazo: "2026-10-03", motivo: "saldo", urgencia: "depois", diasAtePrazo: 9 });
    const [a] = montarRecargas([conta({ proximoAporte: "2026-09-27" })], HOJE);
    expect(a).toMatchObject({ prazo: "2026-09-27", motivo: "aporte", urgencia: "semana" });
  });

  it("boleto pede 3 dias de antecedência", () => {
    const [r] = montarRecargas([conta({ forma: "boleto" })], HOJE);
    expect(r.prazo).toBe("2026-10-01");
    expect(r.mensagem).toContain("boleto");
  });

  it("aporte vencido ou saldo zerado é atrasada e vem primeiro", () => {
    const lista = montarRecargas([
      conta({ id: "x", clientName: "Folgada", saldo: 5000 }),
      conta({ id: "y", clientName: "Vencida", proximoAporte: "2026-09-20" }),
      conta({ id: "z", clientName: "Zerada", saldo: 0 }),
    ], HOJE);
    expect(lista.map((r) => r.urgencia)).toEqual(["atrasada", "atrasada", "depois"]);
    expect(lista[2].clientName).toBe("Folgada");
  });

  it("rascunho para uma pessoa mandar: texto e link do WhatsApp do financeiro", () => {
    const [r] = montarRecargas([conta()], HOJE);
    expect(sp(r.mensagem)).toBe("Oi, Loja A! Tudo bem? O saldo da conta de anúncios está em R$ 1.000,00 e, no ritmo atual, dura até 04/10. Consegue programar a recarga até 03/10 pra as campanhas não pausarem? Chave Pix: 123");
    expect(r.linkWhatsApp).toMatch(/^https:\/\/wa\.me\/22999999999\?text=/);
    expect(montarRecargas([conta({ telefone: null })], HOJE)[0].linkWhatsApp).toBeNull();
  });

  it("sem ritmo e sem aporte: sem data", () => {
    const [r] = montarRecargas([conta({ ritmoDia: null })], HOJE);
    expect(r).toMatchObject({ prazo: null, urgencia: "sem_data" });
  });
});
