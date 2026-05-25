# Banco de Briefings por Cliente

## O que é

Tabela `client_briefings` que armazena o briefing estratégico de cada
cliente de forma versionada. Cada save cria uma nova versão; a versão
ativa tem `is_current = true`. Versões antigas ficam no histórico.

## Estrutura

Três grupos de campos além de identificação e auditoria:

- **Estratégia** — resumo, produtos, ICP, posicionamento, dores, ganchos, CTAs
- **Identidade visual** — paleta de cores (JSONB), tipografia, logo, referências
- **Voz e tom** — tom, pessoa verbal, emoji, gíria, palavras proibidas, hashtags
- **Operação** — horários, produtos em destaque, concorrentes a evitar
- **Interno** — observações só para o staff (`observacoes_internas`)

`completeness_percent` é calculado pela função SQL
`calculate_briefing_completeness` (IMMUTABLE, 21 campos, 0–100).
Disponível na view `current_client_briefings`.

## Acesso

| Ação | Roles |
|---|---|
| Ler briefing atual | todos autenticados |
| Criar versão / ver histórico / ver versão antiga | admin, manager |
| Restaurar versão | admin |

Controle de acesso na camada da API — RLS só distingue
`authenticated` (leitura) vs `service_role` (escrita).

## Como adicionar um campo no futuro

Requer mudança em 4 lugares:

1. **SQL** — nova migration com `ALTER TABLE client_briefings ADD COLUMN ...`
2. **Função de completude** — adicionar IF no `calculate_briefing_completeness`
   e incrementar `total_fields` em 1
3. **Zod** — `lib/schemas/briefing.ts` → adicionar campo ao `briefingInputSchema`
4. **TypeScript** — `lib/types/briefing.ts` → adicionar campo em `ClientBriefing`

Se o campo for crítico operacionalmente, incluir no cálculo de completude.
Se for opcional/raro (como `usa_giria`), pode omitir.

## Débitos técnicos

Ver `docs/BACKLOG.md` para:
- Idempotency persistente (Map em memória atual não sobrevive a restart)
- Completude no histórico de versões (retorna 0 para versões não-atuais)
