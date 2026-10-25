# Central de Agentes

> 25/10/2026. O Roberto não sabia quais nem quantos agentes de IA o Lone OS tem. Foram contados no
> código: 50 capacidades que chamam IA, todas na OpenAI. O Morning Briefing estava sem uso e saiu na
> faxina; ficam 49. Existe um agente com nome, o Loninho; os outros são capacidades dele ou rotinas em volta.

## Onde está cada coisa

| O quê | Arquivo |
|---|---|
| Catálogo (fonte da verdade) | `lib/agentes/catalogo.ts` |
| Regra de estado (pura) | `lib/agentes/estado.ts` |
| Uso real (llm_calls, agent_runs, Central de Automações) | `lib/agentes/central-server.ts` |
| Interruptor geral do Loninho | `lib/agentes/loninho-server.ts` · `POST /api/system/agentes/loninho` |
| Tela | `app/agentes/page.tsx` (`/agentes`, só gestão) |
| Testes | `tests/agentes-*.test.ts` |

## Regras

- **Toda chamada de IA leva a etiqueta do agente** (`origem`). O tipo `OrigemIa` só aceita as etiquetas
  do catálogo, e `tests/agentes-etiqueta.test.ts` quebra se alguma chamada sair sem. Agente novo entra no
  catálogo no mesmo commit, com etiqueta própria.
- **Custo em dinheiro não aparece na tela.** É número da agência e fica fora do Lone OS.
- **O interruptor geral** é a linha `agente:loninho` em `automation_settings` (mesmo formato da Central de
  Automações). Desligado, o webhook `/api/cs/inbound` não lê nada dos grupos (clientes, time e vendas).
  Se o banco falhar na leitura, o Loninho segue ligado: desligar é decisão de pessoa. O grupo do time é
  avisado ao desligar e ao religar.
- **"Quem responde"** está por função (Sócios, Social media, Designer, Gestor de tráfego, Gestor do
  cliente). É uma primeira divisão: confirmar com o Roberto e trocar no catálogo se precisar.

## Changelog (platform_updates)

Rodar depois do deploy:

```sql
insert into platform_updates (title, description, category, icon, published, created_by) values (
  'Central de Agentes: os 49 agentes de IA num lugar só',
  'Nova tela em Sistema › Central de Agentes (só gestão): cada agente de IA do Lone OS com o que faz, quem responde por ele, até onde chega (só sugere, grava, fala com o time, fala com o cliente), quando roda, o que o desliga e se está funcionando — última execução e falhas dos últimos 7 dias. No topo, o interruptor geral do Loninho: desliga a leitura dos grupos (até religar, por 1 h, 4 h ou até amanhã 8h) e avisa o grupo do time. Toda chamada de IA agora sai com o nome do agente (antes ~1.400 por mês apareciam como "Morning Briefing"). Faxina: saíram o Morning Briefing e quatro rotas que ninguém chamava.',
  'feature', '🤖', true, 'Sistema');
```

## Propostas para o Roberto decidir (fora desta entrega)

1. **Um cálculo de risco só.** Toda segunda saem "Clientes pedindo atenção" (`cs-risco-semanal`, 9h30) e
   "Saúde da carteira" (`cs-saude`, 11h), com dois cálculos diferentes de cliente em risco.
2. **As três rotinas que gravam regra ativa sem "ok" passam a pedir "ok".** Aprende com a correção
   (`lib/cs/aprender-correcao.ts`), Regras da semana (`cs-briefing-update`) e Releitura do ciclo
   (`cs-releitura`) gravam a regra do cliente já valendo; a regra da casa pede o "ok" do time.
