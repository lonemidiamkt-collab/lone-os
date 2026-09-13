-- 13/09/2026 — o status do cliente (kanban "Status Clientes") passa a sair do resultado do anúncio.
--
-- Roberto: "faça em cima dos resultados de anúncio dos clientes. Verifique conta por conta e sempre
-- faça essa troca. Toda sexta-feira você faz essa análise, pede pro Júlio fazer também."
--
-- Medido: clients.status só tinha good (42) e onboarding (10). Ninguém nunca marcou average nem
-- at_risk. Os 42 "bons resultados" eram o padrão do cadastro, não avaliação.
--
-- Duas colunas para a rotina e o arraste manual conviverem:
--   status_origem       'auto' (a rotina de sexta) | 'manual' (alguém arrastou no kanban)
--   status_atualizado_em quando foi. A rotina NÃO sobrescreve um manual com menos de 7 dias —
--                        o Julio olhou e decidiu; a régua automática espera a próxima semana.
--   status_motivo        a frase que explica ("CPL R$ 25,60 acima do crítico") — vai pro card.
alter table clients add column if not exists status_origem text;
alter table clients add column if not exists status_atualizado_em timestamptz;
alter table clients add column if not exists status_motivo text;

comment on column clients.status_origem is 'auto = rotina de sexta pelo resultado do anúncio; manual = arrastado no kanban';
comment on column clients.status_atualizado_em is 'Quando o status foi definido pela última vez';
comment on column clients.status_motivo is 'Uma frase explicando o status atual (CPL x meta, conta parada, etc.)';
