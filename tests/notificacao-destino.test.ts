import { describe, it, expect } from "vitest";
import { destinoDaNotificacao } from "@/components/NotificationCenter";

// Roberto (10/09): "quando é enviado a notificação de uma arte que foi entregue nós clicamos e não
// abre a arte". A causa não estava no destino — estava em quem recebia o destino: o /social
// procurava o card só entre os ATIVOS e, não achando, não fazia nada. 2.632 avisos no banco
// apontam para card já arquivado.
describe("destino da notificação", () => {
  it("aviso de arte entregue leva ao card", () => {
    expect(destinoDaNotificacao({ title: "Arte entregue pelo Designer", cardId: "abc", clientId: "cli" }))
      .toBe("/social?card=abc");
  });

  it("aviso de card arquivado leva à lista de arquivadas", () => {
    // O card não está no quadro; mandar pro quadro seria mandar pra lugar nenhum.
    expect(destinoDaNotificacao({ title: "Demanda arquivada", cardId: "abc" }))
      .toBe("/social?arquivadas=1");
  });

  it("sem card, cai na ficha do cliente", () => {
    expect(destinoDaNotificacao({ title: "Cliente em risco", clientId: "cli" })).toBe("/clients/cli");
  });

  it("sem card e sem cliente, não há destino", () => {
    // 90 avisos assim no banco ("Link de onboarding gerado", "Cliente aprovado"). Antes eles
    // renderizavam como botão e clicar não fazia nada — agora a interface não convida ao clique.
    expect(destinoDaNotificacao({ title: "Link de onboarding gerado" })).toBeNull();
    expect(destinoDaNotificacao({})).toBeNull();
  });

  it("o card ganha prioridade sobre o cliente", () => {
    // O aviso "Arte pode violar regra" diz "abra o card" — então tem que levar ao card, não à ficha.
    expect(destinoDaNotificacao({ title: "⚠️ Arte pode violar regra — Tindaro", cardId: "c1", clientId: "cl1" }))
      .toBe("/social?card=c1");
  });
});
