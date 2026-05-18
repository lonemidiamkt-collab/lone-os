# Backlog Técnico — Lone OS

Itens de débito técnico confirmados e aceitos. Cada item tem:
- Limitação conhecida
- Proposta de solução
- Critério de priorização (quando vale atacar)

---

## 1. Idempotency persistente para briefings

**Contexto:** `POST /api/clients/[id]/briefing` aceita o header
`Idempotency-Key` para evitar duplo-submit. A implementação atual usa
um `Map` em memória com TTL de 24h (ver `_lib.ts` nas rotas de briefing).

**Limitação conhecida:**
Se o container `loneos-app-1` reiniciar entre duas chamadas com a mesma
`Idempotency-Key`, o cache é perdido e uma segunda versão do briefing
pode ser criada desnecessariamente. O dado não fica corrompido — é só
uma versão extra — mas quebra a semântica de idempotency.

**Proposta de implementação futura:**

```sql
CREATE TABLE idempotency_records (
  key         TEXT        PRIMARY KEY,
  response    JSONB       NOT NULL,
  status_code INT         NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_idempotency_expires ON idempotency_records (expires_at);
-- Job de limpeza: DELETE FROM idempotency_records WHERE expires_at < now();
```

A API consultaria esta tabela antes de processar e gravaria o resultado
após sucesso. TTL de 24h (igual ao Map atual).

**Quando priorizar:**
- Quando aparecer caso real em produção de duplicata de versão causada
  por restart (monitorar via Sentry: `version > 1` criado em < 5s para
  o mesmo `client_id` + `created_by`)
- Ou quando outros endpoints precisarem de idempotency (pagamentos,
  envio de emails em lote)

**Referência no código:** `app/api/clients/[id]/briefing/_lib.ts`

---

## 2. Completude no histórico de versões

**Contexto:** `GET /api/clients/[id]/briefing/history` retorna
`completeness_percent: 0` para todos os itens históricos porque a
função SQL `calculate_briefing_completeness` é chamada via a view
`current_client_briefings`, que só inclui `is_current = true`.

**Limitação conhecida:** A UI de histórico (futura) não vai mostrar %
de completude das versões antigas — vai aparecer sempre 0.

**Proposta:** Chamar a função via RPC por linha, ou mover o cálculo
para a camada TypeScript replicando a lógica da função SQL.

**Quando priorizar:** Quando a UI de histórico for construída e o
design exigir completude por versão.
