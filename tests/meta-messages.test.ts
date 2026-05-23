/**
 * Testes para getMessageMetricFromInsights e countMessagesFromActions.
 *
 * Cenário de referência: Gerenciador mostra 50 mensagens com custo de R$2,57/msg
 * (total spend ≈ R$128,50). Qualquer divergência deve ser explicável tecnicamente.
 *
 * Por que esses testes importam:
 *   - Garantem que nunca somamos vários action_types (inflação)
 *   - Garantem que spend e messages vêm do mesmo escopo (CPA correto)
 *   - Garantem que a janela 7d_click é usada corretamente
 *   - Documentam o comportamento esperado para cada formato de resposta da Meta API
 */

import { describe, it, expect, vi } from "vitest";
import {
  getMessageMetricFromInsights,
  countMessagesFromActions,
  MESSAGE_ACTION_TYPES,
} from "@/lib/meta/messages";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Resposta típica da Meta API para campanha MESSAGES (linha única agregada).
 *  Gerenciador mostra: 50 mensagens, custo por mensagem R$2,57 → spend total R$128,50.
 *  A API retorna apenas 1 window solicitada ("7d_click") no campo "value".
 */
const FIXTURE_SINGLE_WINDOW = {
  date_start: "2026-05-01",
  date_stop: "2026-05-07",
  spend: "128.50",
  impressions: "4200",
  reach: "3800",
  clicks: "210",
  ctr: "5.00",
  cpc: "0.61",
  cpm: "30.59",
  actions: [
    {
      action_type: "onsite_conversion.messaging_conversation_started_7d",
      value: "50",
    },
    // total_messaging_connection sempre maior (inclui reconexões)
    { action_type: "onsite_conversion.total_messaging_connection", value: "65" },
    { action_type: "link_click", value: "210" },
    { action_type: "post_engagement", value: "310" },
  ],
};

/** Resposta quando a API retorna múltiplas janelas (ambas solicitadas).
 *  Nesse formato, cada action tem as chaves "1d_click" e "7d_click".
 */
const FIXTURE_MULTI_WINDOW = {
  ...FIXTURE_SINGLE_WINDOW,
  actions: [
    {
      action_type: "onsite_conversion.messaging_conversation_started_7d",
      value: "50",
      "1d_click": "20",
      "7d_click": "50",
    },
    {
      action_type: "onsite_conversion.total_messaging_connection",
      value: "65",
      "1d_click": "30",
      "7d_click": "65",
    },
  ],
};

/** Resposta de conta que usa formato alternativo WhatsApp (mais novo). */
const FIXTURE_WA_ALTERNATIVE = {
  ...FIXTURE_SINGLE_WINDOW,
  actions: [
    {
      action_type: "onsite_conversion.whatsapp_business_messaging_conversation_started_7d",
      value: "50",
    },
    { action_type: "onsite_conversion.total_messaging_connection", value: "65" },
  ],
};

/** Resposta de conta legada sem prefixo onsite_conversion. */
const FIXTURE_LEGACY = {
  ...FIXTURE_SINGLE_WINDOW,
  actions: [
    { action_type: "messaging_conversation_started_7d", value: "50" },
    { action_type: "onsite_conversion.total_messaging_connection", value: "65" },
  ],
};

/** Resposta sem nenhum action_type de mensagem reconhecido. */
const FIXTURE_NO_MESSAGES = {
  ...FIXTURE_SINGLE_WINDOW,
  actions: [
    { action_type: "link_click", value: "210" },
    { action_type: "post_engagement", value: "310" },
  ],
};

// ── getMessageMetricFromInsights ──────────────────────────────────────────────

describe("getMessageMetricFromInsights", () => {
  it("retorna 0s quando insight é null", () => {
    const result = getMessageMetricFromInsights(null);
    expect(result.messages).toBe(0);
    expect(result.spend).toBe(0);
    expect(result.cpa).toBeNull();
    expect(result.matchedActionType).toBeNull();
    expect(result.allActionTypes).toEqual([]);
  });

  it("lê corretamente 50 mensagens e calcula CPA de R$2,57 (janela única)", () => {
    const result = getMessageMetricFromInsights(FIXTURE_SINGLE_WINDOW, {
      accountId: "act_123",
      period: "2026-05-01→2026-05-07",
      objectiveFilter: "MESSAGES",
      window: "7d_click",
    });

    expect(result.messages).toBe(50);
    expect(result.spend).toBeCloseTo(128.5, 2);
    // cpa = 128.50 / 50 = 2.57
    expect(result.cpa).toBeCloseTo(2.57, 2);
    expect(result.matchedActionType).toBe(
      "onsite_conversion.messaging_conversation_started_7d",
    );
    expect(result.attributionWindow).toBe("7d_click");
  });

  it("usa a chave '7d_click' da action quando API retorna múltiplas janelas", () => {
    const result = getMessageMetricFromInsights(FIXTURE_MULTI_WINDOW, {
      window: "7d_click",
    });
    // Com múltiplas janelas, "7d_click" = 50, "1d_click" = 20
    expect(result.messages).toBe(50);
  });

  it("não usa '1d_click' quando window=7d_click com múltiplas janelas", () => {
    const result = getMessageMetricFromInsights(FIXTURE_MULTI_WINDOW, {
      window: "7d_click",
    });
    // 1d_click seria 20, mas queremos 7d_click = 50
    expect(result.messages).not.toBe(20);
    expect(result.messages).toBe(50);
  });

  it("usa formato alternativo WhatsApp (segunda prioridade)", () => {
    const result = getMessageMetricFromInsights(FIXTURE_WA_ALTERNATIVE, {
      window: "7d_click",
    });
    expect(result.messages).toBe(50);
    expect(result.matchedActionType).toBe(
      "onsite_conversion.whatsapp_business_messaging_conversation_started_7d",
    );
  });

  it("usa formato legado sem prefixo onsite_conversion (terceira prioridade)", () => {
    const result = getMessageMetricFromInsights(FIXTURE_LEGACY, {
      window: "7d_click",
    });
    expect(result.messages).toBe(50);
    expect(result.matchedActionType).toBe("messaging_conversation_started_7d");
  });

  it("NUNCA soma messaging_conversation_started_7d + total_messaging_connection", () => {
    // A fixture tem 50 (started_7d) + 65 (total_connection).
    // Se somasse incorretamente: 115. Deve retornar apenas 50.
    const result = getMessageMetricFromInsights(FIXTURE_SINGLE_WINDOW, {
      window: "7d_click",
    });
    expect(result.messages).toBe(50);
    expect(result.messages).not.toBe(115);
  });

  it("retorna 0 mensagens quando nenhum action_type de mensagem é encontrado", () => {
    const result = getMessageMetricFromInsights(FIXTURE_NO_MESSAGES, {
      window: "7d_click",
    });
    expect(result.messages).toBe(0);
    expect(result.cpa).toBeNull();
    expect(result.matchedActionType).toBeNull();
  });

  it("expõe todos os action_types da resposta para diagnóstico", () => {
    const result = getMessageMetricFromInsights(FIXTURE_SINGLE_WINDOW, {
      window: "7d_click",
    });
    expect(result.allActionTypes).toContain(
      "onsite_conversion.messaging_conversation_started_7d",
    );
    expect(result.allActionTypes).toContain(
      "onsite_conversion.total_messaging_connection",
    );
    expect(result.allActionTypes).toContain("link_click");
  });

  it("spend e messages vêm da mesma linha — CPA é spend/messages sem mistura de escopos", () => {
    // Este teste documenta a invariante crítica: nunca calcular CPA com
    // spend de escopo A e messages de escopo B.
    const insight = {
      spend: "257.00",
      actions: [
        { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "100" },
      ],
    };
    const result = getMessageMetricFromInsights(insight, { window: "7d_click" });
    expect(result.messages).toBe(100);
    expect(result.spend).toBeCloseTo(257, 2);
    // cpa = 257 / 100 = 2.57
    expect(result.cpa).toBeCloseTo(2.57, 2);
  });
});

// ── countMessagesFromActions ──────────────────────────────────────────────────

describe("countMessagesFromActions", () => {
  it("retorna 0 para undefined", () => {
    expect(countMessagesFromActions(undefined)).toBe(0);
  });

  it("retorna 0 para array vazio", () => {
    expect(countMessagesFromActions([])).toBe(0);
  });

  it("usa primeiro match — não soma", () => {
    const actions = [
      { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "50" },
      { action_type: "onsite_conversion.total_messaging_connection", value: "65" },
    ];
    expect(countMessagesFromActions(actions)).toBe(50);
  });

  it("usa chave específica da janela quando disponível", () => {
    const actions = [
      {
        action_type: "onsite_conversion.messaging_conversation_started_7d",
        value: "50",
        "1d_click": "20",
        "7d_click": "50",
      },
    ];
    expect(countMessagesFromActions(actions, "7d_click")).toBe(50);
    expect(countMessagesFromActions(actions, "1d_click")).toBe(20);
  });

  it("cai para 'value' quando chave de janela não existe (janela única na resposta)", () => {
    const actions = [
      {
        action_type: "onsite_conversion.messaging_conversation_started_7d",
        value: "50",
        // sem chave "7d_click" separada — API retornou apenas 1 janela
      },
    ];
    expect(countMessagesFromActions(actions, "7d_click")).toBe(50);
  });
});

// ── Prioridade dos action_types ────────────────────────────────────────────────

describe("MESSAGE_ACTION_TYPES priority", () => {
  it("messaging_conversation_started_7d tem prioridade sobre total_messaging_connection", () => {
    const started7dIdx = MESSAGE_ACTION_TYPES.indexOf(
      "onsite_conversion.messaging_conversation_started_7d",
    );
    const totalConnectionIdx = MESSAGE_ACTION_TYPES.indexOf(
      "onsite_conversion.total_messaging_connection",
    );
    expect(started7dIdx).toBeLessThan(totalConnectionIdx);
  });

  it("nenhum fallback de Engajamento tem prioridade sobre messaging_conversation_started_7d", () => {
    const started7dIdx = MESSAGE_ACTION_TYPES.indexOf(
      "onsite_conversion.messaging_conversation_started_7d",
    );
    const engagementIdx = MESSAGE_ACTION_TYPES.indexOf(
      "onsite_conversion.engagement",
    );
    expect(started7dIdx).toBeLessThan(engagementIdx);
  });
});

// ── Cenário real: divergência explicável ──────────────────────────────────────

describe("Cenário real: Gerenciador 50 msgs × plataforma anterior 80 msgs", () => {
  /**
   * Antes da correção, o sistema usava a conta inteira (sem filtro de objetivo)
   * e/ou somava action_types incorretos. Este teste simula o que acontecia:
   *   - Conta tem campanha MESSAGES (50 msgs) + campanha TRAFFIC (30 msgs WA acidental)
   *   - Sem filtro: API retorna 80 msgs → diverge do Gerenciador (mostra 50)
   *   - Com filtro MESSAGES: API retorna 50 msgs → correto
   *
   * O teste não faz chamadas reais — documenta o raciocínio para revisão futura.
   */

  it("conta SEM filtro retornaria 80 (todas as campanhas)", () => {
    // Simula linha de conta sem filtro de objetivo
    const accountLevelInsight = {
      spend: "800.00",
      actions: [
        { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "80" },
      ],
    };
    const result = getMessageMetricFromInsights(accountLevelInsight, { window: "7d_click" });
    expect(result.messages).toBe(80);
    // CPA inflado: 800 / 80 = R$10 (o que o sistema mostrava antes)
    expect(result.cpa).toBeCloseTo(10, 2);
  });

  it("conta COM filtro MESSAGES retorna 50 e CPA correto de R$2,57", () => {
    // Simula linha filtrada por objetivo MESSAGES
    const messagesCampaignInsight = {
      spend: "128.50",
      actions: [
        { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "50" },
      ],
    };
    const result = getMessageMetricFromInsights(messagesCampaignInsight, {
      objectiveFilter: "MESSAGES",
      window: "7d_click",
    });
    expect(result.messages).toBe(50);
    // CPA correto: 128.50 / 50 = R$2.57
    expect(result.cpa).toBeCloseTo(2.57, 2);
  });
});
