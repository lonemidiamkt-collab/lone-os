-- 21/10/2026 — auditoria de erro recuperável, item 5.10.
--
-- Quando a IA falhava na classificação, o inbound respondia "ok, classified:false" — e como o
-- message_id já tinha sido reclamado, a mensagem do cliente nunca mais era lida: o pedido se perdia.
-- (De 25 a 30/09 a OpenAI ficou sem crédito e foi exatamente isso, por cinco dias.)
-- Agora a mensagem que não foi lida entra nesta fila com o texto (já transcrito/descrito), e a rotina
-- cs-nao-lidas (a cada 15 min) a passa de novo pelo inbound — criando a sugestão normalmente quando a
-- IA voltar — e avisa o time quando um grupo de cliente fica com mensagem sem leitura.
-- Regras em lib/cs/nao-lidas.ts; banco em lib/cs/nao-lidas-server.ts; rota app/api/system/cs-nao-lidas.
--
-- PRECISA ESTAR APLICADA ANTES DO DEPLOY: sem ela o inbound não tem onde guardar e volta ao
-- comportamento de antes, só que liberando o message_id (a Evolution pode reenviar).
--
-- Idempotente. RLS ligada sem policy: é conversa de cliente, só o service role lê.

create table if not exists public.cs_mensagens_nao_lidas (
  message_id text primary key,
  group_jid text not null,
  client_id uuid references public.clients(id) on delete set null,
  cliente_nome text,
  author_jid text,
  author_name text,
  -- O texto como o inbound o tinha na hora (áudio já transcrito, imagem já descrita).
  texto text not null,
  recebida_em timestamptz not null default now(),
  erro text,
  tentativas int not null default 0,
  status text not null default 'pendente',
  ultima_tentativa_em timestamptz,
  lida_em timestamptz,
  resultado jsonb,
  avisado_em timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cs_mensagens_nao_lidas_status_check') then
    alter table public.cs_mensagens_nao_lidas add constraint cs_mensagens_nao_lidas_status_check
      check (status in ('pendente', 'lendo', 'lida', 'expirada'));
  end if;
end $$;

create index if not exists idx_cs_mensagens_nao_lidas_fila
  on public.cs_mensagens_nao_lidas (recebida_em) where status in ('pendente', 'lendo');

alter table public.cs_mensagens_nao_lidas enable row level security;

comment on table public.cs_mensagens_nao_lidas is
  'Mensagem de cliente que a IA não conseguiu ler na hora. A rotina cs-nao-lidas relê (lib/cs/nao-lidas.ts).';
comment on column public.cs_mensagens_nao_lidas.status is
  'pendente → lendo (rotina em curso) → lida | expirada (48h sem conseguir; o time foi avisado para ler à mão).';

notify pgrst, 'reload schema';
