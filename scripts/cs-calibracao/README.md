# Calibração do classificador A1 (Agente Lone)

Harness que roda o classificador **de verdade** (o prompt real de `lib/cs/classifier.ts`,
`gpt-4o-mini`, `json_schema` strict) contra conjuntos de casos rotulados e reporta acerto de
`is_demanda` e `tipo`. Read-only (só chama a OpenAI, não toca no banco).

Use SEMPRE que mexer no prompt do A1 — mede regressão e ganho, em vez de achar no olho.

## Rodar

```bash
export OPENAI_API_KEY=sk-...            # a mesma chave do app
# set padrão (casos "de manual" — pega regressão óbvia):
python3 scripts/cs-calibracao/calibrar-a1.py scripts/cs-calibracao/casos-padrao.json
# set adversarial (casos-armadilha frescos — pega gap real):
python3 scripts/cs-calibracao/calibrar-a1.py scripts/cs-calibracao/casos-adversarial.json scripts/cs-calibracao/ambiguos.json
```

Concorrência baixa (3) pra não bater rate limit (429). Pra testar um prompt AINDA não deployado,
aponte `CLASSIFIER_SRC` pro arquivo editado: `CLASSIFIER_SRC=/caminho/classifier.ts python3 ...`.

## Baseline medido (04/jul/2026, após a calibração)

| Conjunto | is_demanda | tipo |
|---|---|---|
| padrão (31) | 30/31 (97%) | 31/31 (100%) |
| adversarial (29 no placar, 7 ambíguos fora) | 24/29 (83%) | 24/29 (83%) |

As divergências restantes do adversarial são: filtro de autor (mascarado em produção pelo guard
determinístico `isLoneTeam` do inbound), casos debatíveis, ou `elogio`×`conversa` (ambos sem card).
Os `ambiguos.json` saem do placar (pessoas razoáveis discordam mesmo conhecendo as regras).

## Verificar a CONVERSA (Lone conversacional)

`verificar-conversa.py` roda a persona real (`conversa.ts`) contra uma bateria de ~20 perguntas do
dia a dia com um contexto de snapshot rico, e imprime a resposta + o esperado. Use quando aparecer
um "a Lone não entendeu X": adicione o caso na `BATERIA`, rode, e veja se corrige.

```bash
OPENAI_API_KEY=sk-... python3 scripts/cs-calibracao/verificar-conversa.py
```

Baseline (04/jul): 20/20 — distingue designer×social, não inventa dado fora do contexto, não finge
que executou comando, captura ensino, mantém continuidade. (1 correção aplicada: total de pendentes.)

## Arquivos

- `calibrar-a1.py` — o runner do classificador A1.
- `verificar-conversa.py` — o runner da Lone conversacional.
- `casos-padrao.json` — casos derivados do manual/exemplos (regressão).
- `casos-adversarial.json` — casos-armadilha gerados por multi-agente (gap real).
- `ambiguos.json` — ids do adversarial que são genuinamente ambíguos (fora do placar).

Formato de um caso: `{id, cliente, nicho, autor?, msgs[], demanda(bool), tipo[](aceitáveis), nota?}`.
