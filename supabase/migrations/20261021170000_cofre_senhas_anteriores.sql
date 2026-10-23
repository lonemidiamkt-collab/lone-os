-- 21/10/2026 (auditoria de erro recuperável, item 3.5): trocar a senha no cofre da ficha apagava a
-- anterior. Digitou errado, colou a senha de outro cliente, o cliente voltou atrás — não havia volta.
-- Agora /api/client-vault guarda a senha que estava lá ANTES de gravar a nova, com quem trocou e quando,
-- e "Desfazer" restaura por aqui.
--
-- A senha guardada é SEMPRE cifrada (formato v1: de lib/crypto/vault.ts) — linha antiga em texto puro é
-- cifrada antes de entrar. RLS ligado sem política: só o servidor (service role) lê e escreve; nem o
-- admin logado lê direto pelo navegador.
--
-- APLICAR ANTES DO DEPLOY: sem a tabela, a rota recusa trocar senha (prefere não trocar a perder a anterior).
begin;

create table if not exists public.cofre_senhas_anteriores (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  tabela            text not null check (tabela in ('clients', 'client_onboarding_submissions')),
  campo             text not null,
  valor_cifrado     text not null,
  motivo            text not null default 'troca' check (motivo in ('troca', 'remocao', 'restauracao')),
  trocado_por_id    uuid,
  trocado_por_email text,
  trocado_em        timestamptz not null default now()
);
comment on table public.cofre_senhas_anteriores is
  'Senha que estava no cofre antes de cada troca (cifrada). Permite desfazer troca errada. Só service role.';

create index if not exists cofre_senhas_anteriores_campo
  on public.cofre_senhas_anteriores (client_id, tabela, campo, trocado_em desc);

alter table public.cofre_senhas_anteriores enable row level security;
revoke all on public.cofre_senhas_anteriores from anon, authenticated;

commit;
notify pgrst, 'reload schema';
