import { describe, it, expect } from "vitest";
import { deveOuvir, deveFalar, abreJanela } from "@/lib/cs/porta-do-papo";

// As mensagens são as REAIS do grupo (Equipe) Lone Mídia em 11/09/2026, entre 09:52 e 10:14. O
// agente respondeu a todas. Cinco não eram para ele.

const NOME = { chamadoPeloNome: true, continuacao: false, perguntaOperacional: false };
const CONTINUACAO = { chamadoPeloNome: false, continuacao: true, perguntaOperacional: false };
const NADA = { chamadoPeloNome: false, continuacao: false, perguntaOperacional: false };

describe("porta do papo — o que aconteceu hoje não pode acontecer de novo", () => {
  it('"Está assim...ainda" (Rodrigo, print do quadro) — continuação, modelo diz que não era pra ele → CALA', () => {
    // Recebeu: "pode ser que a atualização não rolou direito. Dá uma olhada se tá tudo certo no sistema."
    expect(deveFalar(CONTINUACAO, { ignorar: true, soRecibo: false, marcouTarefa: false })).toBe(false);
  });

  it('"Faltam alguns clientes pra marcar horário…" (Carlos, status pro grupo) — continuação, resposta é recibo → CALA', () => {
    // Recebeu: "Beleza, Carlos! Se precisar de mim pra ajustar algo ou dar um toque no pessoal, só avisar. Tamo junto!"
    expect(deveFalar(CONTINUACAO, { ignorar: false, soRecibo: true, marcouTarefa: false })).toBe(false);
  });

  it('"acho que esses na fila eram apenas do Gabriel" (Rodrigo, concluindo sozinho) — continuação + ignorar → CALA', () => {
    // Recebeu: "pode ser que tá filtrando por responsável. Dá uma checada nisso."
    expect(deveFalar(CONTINUACAO, { ignorar: true, soRecibo: false, marcouTarefa: false })).toBe(false);
  });
});

describe("porta do papo — o que TEM que continuar funcionando", () => {
  it("chamado pelo nome responde mesmo que o modelo quisesse ignorar", () => {
    // "Loninho, tá vendo as demandas com alterações?" — foi a pessoa que pediu.
    expect(deveFalar(NOME, { ignorar: true, soRecibo: false, marcouTarefa: false })).toBe(true);
  });

  it('"e do Pedro?" logo depois de um chamado — continuação com resposta de conteúdo → RESPONDE', () => {
    expect(deveFalar(CONTINUACAO, { ignorar: false, soRecibo: false, marcouTarefa: false })).toBe(true);
  });

  it("tarefa marcada como feita confirma sempre — é escrita no sistema", () => {
    expect(deveFalar(NADA, { ignorar: true, soRecibo: true, marcouTarefa: true })).toBe(true);
  });

  it("pergunta operacional sem nome passa pelo modelo e respeita o ignorar", () => {
    const s = { chamadoPeloNome: false, continuacao: false, perguntaOperacional: true };
    expect(deveOuvir(s)).toBe(true);
    expect(deveFalar(s, { ignorar: true, soRecibo: false, marcouTarefa: false })).toBe(false);
    expect(deveFalar(s, { ignorar: false, soRecibo: false, marcouTarefa: false })).toBe(true);
  });

  it("mensagem solta no grupo nem chega ao modelo", () => {
    expect(deveOuvir(NADA)).toBe(false);
  });
});

describe("a janela de continuação", () => {
  it("abre só com o nome — a resposta do agente não a renova", () => {
    // Era isso que fazia a conversa não acabar nunca: cada "tamo junto" ganhava mais 5 minutos.
    expect(abreJanela(NOME)).toBe(true);
    expect(abreJanela(CONTINUACAO)).toBe(false);
    expect(abreJanela({ chamadoPeloNome: false, continuacao: false, perguntaOperacional: true })).toBe(false);
  });
});

describe("o snapshot que o modelo lê sabe o que cada designer tem", () => {
  it("a linha DESIGNERS existe no texto e reusa a regra de dono do quadro", async () => {
    // 10:07 de 11/09: "Não tem nada pendente pra você no momento" — a um designer com 3 alterações.
    // O snapshot só via content_cards e avisava ao modelo que "resp NÃO é o designer". Dado ausente
    // virou resposta errada com convicção.
    const { readFileSync } = await import("node:fs");
    const SNAP = readFileSync("lib/cs/snapshot.ts", "utf8");
    expect(SNAP).toMatch(/DESIGNERS — o que cada um tem na mão AGORA/);
    expect(SNAP).toMatch(/import \{ donoDaDemanda \} from "@\/lib\/design\/dono"/);
    expect(SNAP).toMatch(/from\("design_requests"\)/);
    expect(SNAP).toMatch(/ALTERAÇÃO pedida pelo social/);
  });
});
