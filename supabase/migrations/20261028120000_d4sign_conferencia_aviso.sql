-- Conferência do aviso da D4Sign (28/10/2026). Em 27/10 a D4Sign avisou 24 vezes que o Matheus assinou Boali e
-- Dominos, e o Lone OS recusou todas: o código do cabeçalho Content-Hmac não bateu com o segredo colado no painel.
-- O evento agora é relido na D4Sign mesmo assim (lib/contracts/assinatura.ts), e o painel mostra quando o código
-- bate e quando não bate, para o segredo ser trocado. Nada aqui guarda segredo — só datas e o nome da variante.
alter table public.d4sign_config add column if not exists hmac_conferiu_em timestamptz;
alter table public.d4sign_config add column if not exists hmac_variante text;
alter table public.d4sign_config add column if not exists hmac_falhou_em timestamptz;
alter table public.d4sign_config add column if not exists hmac_recebido text;
