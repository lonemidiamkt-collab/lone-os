// Confirmar demanda no WhatsApp exige a autoridade do "ok" (achado de 24/10/2026, ondas 3–4).
//
// O QUE ACONTECIA: o "ok <código>" já conferia QUEM falava (Fase 0A: número → team_members → papel, `podeAgirC`), mas
// dois caminhos que também criam o card não conferiam: a escolha por número ("1", "1 e 2", "todas") quando há 2+
// pedidos abertos, e a resposta livre interpretada pela IA ("pode criar", "beleza"). Um terceiro, "cria a demanda
// que a X pediu", criava os cards dos pedidos capturados. Qualquer número no grupo interno criava card.
// Agora todo caminho que chama confirmarDemanda passa pela mesma porta.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const INBOUND = readFileSync("app/api/cs/inbound/route.ts", "utf8");

describe("toda confirmação de demanda exige podeAgirC", () => {
  it("cada chamada a confirmarDemanda está num bloco que confere a autoridade", () => {
    const chamadas = [...INBOUND.matchAll(/confirmarDemanda\(/g)].map((m) => m.index!);
    expect(chamadas.length).toBeGreaterThanOrEqual(4);
    for (const i of chamadas) {
      const inicioDoBloco = INBOUND.lastIndexOf("// ───", i);
      const bloco = INBOUND.slice(inicioDoBloco, i);
      expect(bloco, `confirmarDemanda na posição ${i} sem conferir autoridade`).toMatch(/podeAgirC/);
    }
  });

  it("escolha por número/'todas' e resposta livre: a porta é a mesma do 'ok'", () => {
    expect(INBOUND).toMatch(/isInternalCmdGroup\(msg\.groupJid\) && podeAgirC && !demandaDaSugestao && \(ehConfirmacaoLivre\(msg\.text\) \|\| pareceSelecao\(msg\.text\)\)/);
    expect(INBOUND).toMatch(/isInternalCmdGroup\(msg\.groupJid\) && podeAgirC && isOpenAIConfigured\(\) && \(msg\.quotedMsgId \|\| ehConfirmacaoLivre\(msg\.text\)\)/);
    expect(INBOUND).toMatch(/decision && isInternalCmdGroup\(msg\.groupJid\) && podeAgirC/);
  });

  it("'cria a demanda que a X pediu' recusa quem não é da equipe, dizendo por quê", () => {
    expect(INBOUND).toMatch(/if \(!podeAgirC\) \{\s*await csSendGroupText\(msg\.groupJid, `Achei \$\{jaPend\.length\} pedido\(s\)/);
  });
});
