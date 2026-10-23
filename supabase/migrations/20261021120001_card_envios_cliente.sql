-- 21/10/2026 — registro dos envios de arte ao grupo do CLIENTE ("Enviar pro cliente"; auditoria de
-- erro recuperável, 2.2).
--
-- Antes não havia registro nenhum: clicar de novo mandava tudo de novo ao grupo do cliente, e se a
-- rota caía no meio ninguém sabia o que tinha saído. Agora a rota grava a linha ANTES de mandar
-- (status 'enviando'), atualiza depois de cada arte e fecha com o resultado. A repetição do mesmo
-- conjunto de artes (mesma `chave`) só passa com "reenviar" explícito, que é uma nova `tentativa`;
-- o índice único (chave, tentativa) barra o clique duplo mesmo com duas requisições ao mesmo tempo.
--
-- A rota (app/api/cs/enviar-aprovacao) NÃO manda nada se não conseguir gravar aqui — então esta
-- migration precisa estar aplicada ANTES do deploy desse código.

create table if not exists public.card_envios_cliente (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.content_cards(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  -- card + conjunto de artes (lib/cs/envio-aprovacao.ts → chaveDoEnvio)
  chave text not null,
  -- 1 = primeiro envio deste conjunto; 2, 3… = reenvio explícito
  tentativa integer not null default 1 check (tentativa >= 1),
  -- 'primeiro' | 'todas' (reenviar tudo) | 'faltantes' (só as que não chegaram)
  modo text not null default 'primeiro' check (modo in ('primeiro','todas','faltantes')),
  reenvio_de uuid references public.card_envios_cliente(id) on delete set null,
  grupo_jid text not null,
  grupo_nome text,
  -- o texto que foi como legenda da 1ª arte que chegou; null = o texto já tinha ido antes
  texto text,
  -- [{id, url}] na ordem do envio
  artes jsonb not null,
  -- [{id, url, ok, incerto?, naoTentada?, comTexto?, erro?}] — atualizado arte a arte
  resultado jsonb not null default '[]'::jsonb,
  status text not null default 'enviando' check (status in ('enviando','enviado','parcial','falhou','incerto')),
  enviadas integer not null default 0,
  total integer not null,
  enviado_por text,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unique (chave, tentativa)
);

create index if not exists idx_card_envios_cliente_card on public.card_envios_cliente (card_id, criado_em desc);

alter table public.card_envios_cliente enable row level security;
drop policy if exists card_envios_cliente_leitura on public.card_envios_cliente;
create policy card_envios_cliente_leitura on public.card_envios_cliente for select to authenticated using (true);
-- escrita só pelo servidor (service_role ignora RLS)

notify pgrst, 'reload schema';
