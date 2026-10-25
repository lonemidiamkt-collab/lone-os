# Agenda do servidor (crontab) — Lone OS

> Gerado a partir de `ops/crontab-producao.txt` (o retrato do crontab do VPS), de `lib/automacoes/registro.ts`
> (nome e horário de Brasília) e de `lib/agentes/catalogo.ts` (o agente de IA que cada rotina põe para rodar).
> Não edite à mão: rode `npx tsx scripts/gerar-agenda-cron.ts`. O teste `tests/agenda-cron-doc.test.ts`
> quebra quando este arquivo fica para trás do retrato.

**Linhas no crontab:** 84 · **Rotinas:** 82 · **Rotinas que usam IA:** 16

- O servidor roda em UTC puro. Horário de Brasília = UTC − 3h (sem horário de verão).
- Ligar, desligar, pausar, rodar agora e ver o histórico: Central de Automações (`/automations`).
  As marcadas “só crontab” não passam pela Central: param só editando o crontab.
- Os agentes de IA, com o estado de cada um: Central de Agentes (`/agentes`).
- Mexeu no crontab? Atualize o registro no mesmo commit; depois do deploy, regenere o retrato
  (`crontab -l > ops/crontab-producao.txt`) e este arquivo.

## Clientes (WhatsApp)

| Quando (Brasília) | Crontab (UTC) | Rotina | O que o servidor chama | Agente de IA |
|---|---|---|---|---|
| segunda, 8h | `0 11 * * 1` | Relatório de segunda aos clientes · **fala com cliente** | `client-messages.sh monday` | — |
| quarta, 8h | `0 11 * * 3` | Mensagem de suporte de quarta · **fala com cliente** | `client-messages.sh wed` | Mensagem de quarta e sexta |
| sexta, 8h | `0 11 * * 5` | Mensagem de suporte de sexta · **fala com cliente** | `client-messages.sh fri` | Mensagem de quarta e sexta |
| dia 1º de cada mês, 8h | `0 11 1 * *` | Relatório do mês fechado · **fala com cliente** | `relatorio-mensal.sh` | — |
| seg a sex, de hora em hora das 8h às 17h | `0 11-20 * * 1-5` | Reunião mensal com o cliente · **fala com cliente** | `POST /api/system/cs-reuniao-mensal` | — |
| seg a sex, de hora em hora das 9h15 às 17h15 | `15 12-20 * * 1-5` | NPS depois da reunião · **fala com cliente** | `POST /api/system/cs-nps` | — |
| dias 20, 21 e 22, 11h (envia só no dia útil certo) | `0 14 20,21,22 * *` | Planejamento do próximo mês · **fala com cliente** | `POST /api/system/monthly-calendar` | — |

## CS / time

| Quando (Brasília) | Crontab (UTC) | Rotina | O que o servidor chama | Agente de IA |
|---|---|---|---|---|
| a cada 15 min, o dia todo (avisos só das 8h às 20h) | `*/15 * * * *` | Mensagens de cliente não lidas | `POST /api/system/cs-nao-lidas` | — |
| todo dia, 5h | `0 8 * * *` | Follow-up de clientes parados | `GET /api/system/followup` | — |
| dia 20 de cada mês, 6h | `0 9 20 * *` | Feriados do próximo mês | `POST /api/system/holiday-alert` | — |
| seg a sex, a cada 15 min das 8h às 17h45 | `*/15 11-20 * * 1-5` | Cliente sem resposta | `POST /api/system/cs-sem-resposta` | — |
| seg a sex, 8h | `0 11 * * 1-5` | Resumo da manhã | `POST /api/system/cs-manha` | — |
| segunda, 8h30 | `30 11 * * 1` | Radar de datas comemorativas | `POST /api/system/cs-datas` | Datas comemorativas |
| todo dia, 9h | `0 12 * * *` | Datas e promoções dos clientes | `POST /api/system/cs-eventos` | — |
| todo dia, 9h e 10h | `0 12 * * *` | Cobrança de tarefas | `POST /api/system/task-reminders` | — |
| segunda, 9h | `0 12 * * 1` | Roteiros da semana | `POST /api/system/cs-roteiro-semanal` | Roteiros (Agente Criativo) |
| segunda, 9h15 | `15 12 * * 1` | Revisão semanal de operação (PDF) | `POST /api/system/revisao-semanal` | — |
| segunda, 9h30 | `30 12 * * 1` | Clientes pedindo atenção | `POST /api/system/cs-risco-semanal` | — |
| todo dia, 9h e 10h | `0 13 * * *` | Cobrança de tarefas | `POST /api/system/task-reminders` | — |
| segunda, 10h | `0 13 * * 1` | Acurácia do agente | `POST /api/system/cs-autoavaliacao` | — |
| seg a sex, 10h, 13h e 16h | `0 13,16,19 * * 1-5` | Vigilância de fluxo | `POST /api/system/cs-vigilancia` | — |
| segunda, 11h | `0 14 * * 1` | Saúde da carteira | `POST /api/system/cs-saude` | — |
| sexta, 14h | `0 17 * * 5` | Pauta da semana seguinte | `POST /api/system/cs-pauta` | Pauta semanal |
| dom, ter e qui, 16h | `0 19 * * 0,2,4` | Véspera de postagem | `POST /api/system/cs-vespera` | — |
| sexta, 16h | `0 19 * * 5` | Raio-X do gestor | `POST /api/system/cs-raio-x` | — |
| sexta, 17h | `0 20 * * 5` | Relatório semanal de entregas | `POST /api/system/cs-relatorio` | — |
| sexta, 17h30 | `30 20 * * 5` | Produção do time (PDF) | `POST /api/system/team-weekly` | — |
| sexta, 18h | `0 21 * * 5` | Desempenho da semana (PDF) | `POST /api/system/cs-desempenho` | — |
| seg, qua e sex, 19h | `0 22 * * 1,3,5` | Conferência de postagem | `POST /api/system/cs-conferir-postagem` | — |

## Tráfego

| Quando (Brasília) | Crontab (UTC) | Rotina | O que o servidor chama | Agente de IA |
|---|---|---|---|---|
| a cada 15 min, o dia todo | `*/15 * * * *` | Defesa Ativa (varredura) | `POST /api/system/defense-scan` | — |
| todo dia, 0h10 | `10 3 * * *` | Retrato diário das campanhas | `POST /api/system/estado-campanhas` | — |
| dia 1º de cada mês, 6h | `0 9 1 * *` | Política de tráfego por cliente | `POST /api/system/traffic-policy` | — |
| seg a sex, 7h | `0 10 * * 1-5` | Coleta por campanha e anúncio | `POST /api/system/meta-granular` | — |
| seg, qua e sex, 8h | `0 11 * * 1,3,5` | Saldos das contas Meta | `POST /api/system/budget-digest` | — |
| seg a sex, 8h | `0 11 * * 1-5` | Diagnóstico diário das contas | `POST /api/system/traffic-diagnostico` | — |
| ter e qui, 8h | `0 11 * * 2,4` | Alertas urgentes de tráfego | `POST /api/system/urgent-alerts` | — |
| todo dia, de 2 em 2h das 8h às 20h | `0 11-23/2 * * *` | Saldo das contas (2 em 2h) | `POST /api/system/sync-saldos` | — |
| dia útil, de 15 em 15 min, das 8h às 18h | `*/15 11-20 * * 1-5` | Avisos falados de tráfego | `POST /api/system/avisos-falados` | — |
| segunda, 8h05 | `5 11 * * 1` | Brief de segunda do tráfego | `POST /api/system/traffic-brief-segunda` | — |
| dia 1º de cada mês, 9h | `0 12 1 * *` | Diagnóstico mensal dos clientes | `diagnostico-mensal.sh` | — |
| sexta, 9h | `0 12 * * 5` | Status dos clientes pelo resultado | `POST /api/system/status-clientes` | — |
| seg a sex, 9h30 | `30 12 * * 1-5` | Alerta de queda de resultado | `POST /api/system/alerta-queda` | — |
| segunda, 11h | `0 14 * * 1` | Destaques do tráfego (PDF) | `POST /api/system/destaques-trafego` | — |
| todo dia, 11h05 | `5 14 * * *` | Vigia de entrega da conta | `POST /api/system/vigia-entrega` | — |

## Criativos

| Quando (Brasília) | Crontab (UTC) | Rotina | O que o servidor chama | Agente de IA |
|---|---|---|---|---|
| segunda, 5h, e dia 1º, 4h | `0 7 1 * *` | Trend Radar — descoberta | `POST /api/system/radar-descoberta` | Trend Radar: descoberta |
| segunda, 5h, e dia 1º, 4h | `0 8 * * 1` | Trend Radar — descoberta | `POST /api/system/radar-descoberta` | Trend Radar: descoberta |
| todo dia, 6h (cerca de 30 perfis por dia, até o limite da Meta) | `0 9 * * *` | Trend Radar — coleta | `POST /api/system/radar-coleta` | — |
| segunda, 6h30 | `30 9 * * 1` | Trend Radar — pautas | `POST /api/system/radar-inteligencia` | Trend Radar: inteligência |
| seg a sex, 7h20 | `20 10 * * 1-5` | Saúde dos criativos | `POST /api/system/creative-health` | — |
| seg a sex, 7h30 | `30 10 * * 1-5` | Atributos dos criativos | `POST /api/system/creative-atributos` | Atributos dos criativos |
| seg a sex, 7h35 | `35 10 * * 1-5` | Casar anúncio com arte | `POST /api/system/creative-casar` | — |
| seg a sex, 7h40 | `40 10 * * 1-5` | Análise dos vencedores | `POST /api/system/creative-vencedores` | Análise de vencedores |
| seg a sex, 7h45 | `45 10 * * 1-5` | Medir variações | `POST /api/system/creative-medir` | — |
| seg a sex, 7h50 | `50 10 * * 1-5` | Vencedor vira pauta orgânica | `POST /api/system/creative-social` | Vencedor vira pauta |
| seg a sex, 7h55 | `55 10 * * 1-5` | Estilo visual dos clientes | `POST /api/system/creative-estilo` | Estilo visual |

## Prospecção

| Quando (Brasília) | Crontab (UTC) | Rotina | O que o servidor chama | Agente de IA |
|---|---|---|---|---|
| todo dia, a cada 15 min das 7h às 20h45 | `*/15 10-23 * * *` | Lembretes das reuniões de venda | `POST /api/system/crm-reunioes` | — |
| seg a sex, 8h | `0 11 * * 1-5` | Follow-up do comercial | `POST /api/system/crm-followups` | — |
| seg a sáb, a cada 15 min das 8h às 20h45 | `*/15 11-23 * * 1-6` | Lead do site sem resposta | `POST /api/system/crm-lead-novo` | — |
| todo dia, a cada 30 min das 8h às 20h30 | `*/30 11-23 * * *` | Visitas da rota no funil | `POST /api/system/crm-rota` | — |
| dias 1 a 5, 8h (envia só no 1º dia útil) | `0 11 1-5 * *` | Relatório mensal de vendas | `POST /api/system/crm-relatorio-mensal` | — |
| seg a sex, 8h05 | `5 11 * * 1-5` | Cobrança da meta do comercial | `POST /api/system/crm-meta` | — |
| todo dia, 9h | `0 12 * * *` | Cadastro ligado ao funil | `POST /api/system/crm-ligar-cadastros` | — |

## Dados e sync

| Quando (Brasília) | Crontab (UTC) | Rotina | O que o servidor chama | Agente de IA |
|---|---|---|---|---|
| de hora em hora | `0 * * * *` | Histórico operacional | `POST /api/system/historico-cliente` | — |
| todo dia, 3h | `0 6 * * *` | Relatórios de Instagram | `POST /api/system/ig-snapshots` | — |
| domingo, 5h | `0 8 * * 0` | Ramo de cada cliente | `POST /api/system/cs-nichos` | Ramo do cliente |
| todo dia, 6h | `0 9 * * *` | Renovação de contratos | `POST /api/system/contract-renewal` | — |
| todo dia, 6h | `0 9 * * *` | Snapshots do portal · só crontab | `generate-snapshots-cron.sh` | — |
| domingo, 6h | `0 9 * * 0` | Estilo de comunicação | `POST /api/system/cs-estilo` | Estilo de comunicação |
| terça, 6h | `0 9 * * 2` | Briefing de quem não tem | `POST /api/system/cs-briefing-inicial` | Briefing inicial |
| todo dia, 6h20 | `20 9 * * *` | Score de saúde dos clientes · só crontab | `cron-scores.sh` | — |
| todo dia, 6h30 | `30 9 * * *` | Postagens do mês + No ar | `POST /api/system/sync-posts` | — |
| todo dia, 6h40 | `40 9 * * *` | Aquecer relatórios públicos | `POST /api/system/warmup-snapshots` | — |
| domingo, 7h | `0 10 * * 0` | Regras aprendidas nas conversas | `POST /api/system/cs-briefing-update` | Regras da semana |
| dia 1º de cada mês, 7h | `0 10 1 * *` | Fechamento do mês das metas | `POST /api/system/metas-fechamento` | — |
| todo dia, de hora em hora das 7h10 às 20h10 | `10 10-23 * * *` | Feed de prioridades | `POST /api/system/priority-recalcular` | — |
| domingo, 8h | `0 11 * * 0` | Releitura do ciclo | `POST /api/system/cs-releitura` | Releitura do ciclo |
| dia 2 de cada mês, 10h | `0 13 2 * *` | Vigia de CNPJ na Receita | `POST /api/system/receita-vigia` | — |

## Infra

| Quando (Brasília) | Crontab (UTC) | Rotina | O que o servidor chama | Agente de IA |
|---|---|---|---|---|
| a cada 5 min | `*/5 * * * *` | Healthcheck do servidor · só crontab | `healthcheck.sh` | — |
| de hora em hora (minuto 5) | `5 * * * *` | Vigia das automações | `POST /api/system/automacoes/vigia` | — |
| todo dia, 0h | `0 3 * * *` | Backup do banco · só crontab | `backup-postgres.sh` | — |
| domingo, 0h | `0 3 * * 0` | Limpeza de arquivos · só crontab | `cleanup-storage.sh` | — |
| domingo, 1h | `0 4 * * 0` | Limpeza do Docker · só crontab | `docker builder prune -af --filter "until=168h"` | — |
| seg a sex, 7h50 | `50 10 * * 1-5` | WhatsApp de pé | `POST /api/system/whatsapp-health` | — |
| todo dia, 8h | `0 11 * * *` | Validade do token da Meta | `POST /api/system/check-meta-token` | — |
