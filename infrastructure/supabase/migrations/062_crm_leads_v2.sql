-- 062_crm_leads_v2.sql — profissionalização do CRM comercial.
-- fechado_em: QUANDO o lead foi ganho/perdido — o relatório de vendas mensal precisa da data real
-- do fechamento (updated_at muda a qualquer edição e mentiria o mês da venda). Setado pelo
-- servidor na transição de estágio; limpo se o card voltar pra uma etapa aberta.
-- proximo_contato: follow-up do SDR (a data do próximo toque no lead; atrasado ganha alerta na UI).
alter table crm_leads add column if not exists fechado_em timestamptz;
alter table crm_leads add column if not exists proximo_contato date;

create index if not exists idx_crm_leads_fechado on crm_leads (fechado_em) where fechado_em is not null;
