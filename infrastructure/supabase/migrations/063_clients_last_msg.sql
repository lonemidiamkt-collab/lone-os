-- 063: última mensagem do CLIENTE no grupo (detector de "cliente esfriando" / churn precoce).
-- O inbound carimba isto quando um cliente (não a equipe) manda algo no grupo dele. O cron
-- cs-esfriando alerta quando um cliente que FALAVA some por N dias — sinal de risco antes do churn.
alter table clients add column if not exists last_client_msg_at timestamptz;
