-- Enviar o contrato para assinatura pela D4Sign a partir do Lone OS (28/10/2026, leva 3).
-- O envio tem 3 chamadas (subir o PDF, cadastrar quem assina, mandar para assinar); se uma falhar no meio, a etapa
-- fica gravada e o botão CONTINUA de onde parou — nunca sobe o mesmo contrato duas vezes (cada envio gasta 1 dos
-- envios do mês do plano da D4Sign).
--   d4sign_envio_etapa   subido | signatarios | enviado  (null = ainda não começou)
--   d4sign_enviado_em    quando foi para assinatura
--   d4sign_envio_por     quem clicou
--   d4sign_envio_erro    o último motivo de falha (some quando dá certo)
alter table contracts add column if not exists d4sign_envio_etapa text;
alter table contracts add column if not exists d4sign_enviado_em timestamptz;
alter table contracts add column if not exists d4sign_envio_por text;
alter table contracts add column if not exists d4sign_envio_erro text;
do $$ begin
  alter table contracts add constraint contracts_d4sign_envio_etapa_check check (d4sign_envio_etapa in ('subido', 'signatarios', 'enviado'));
exception when duplicate_object then null; end $$;
