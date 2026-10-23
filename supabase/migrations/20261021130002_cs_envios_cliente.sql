-- 21/10/2026 — auditoria de erro recuperável, item 5.7.
--
-- "Loninho, cobra as pendências do X pro cliente" (e o check-in "pro cliente") mandavam direto no
-- grupo do cliente: o cliente era achado por nome aproximado, o texto da cobrança era da IA, ninguém
-- via antes, e o time recebia "✅ Mandei" mesmo quando o envio falhava. Agora o agente mostra no
-- grupo interno o CLIENTE e o TEXTO e só manda depois de um "ok" que cite essa prévia.
-- Esta tabela guarda a prévia até a decisão. Regras em lib/cs/envio-cliente.ts; banco e WhatsApp em
-- lib/cs/envio-cliente-server.ts.
--
-- PRECISA ESTAR APLICADA ANTES DO DEPLOY: sem ela o comando avisa "não consegui preparar o envio"
-- e devolve o texto para a pessoa mandar à mão (não manda nada sozinho).
--
-- Idempotente. RLS ligada sem policy: só o service role lê e grava.

create table if not exists public.cs_envios_cliente (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  cliente_nome text not null,
  -- Destino (grupo do cliente) e onde a prévia foi mostrada (grupo interno).
  grupo_cliente text not null,
  grupo_interno text not null,
  texto text not null,
  -- Dedup do envio (ex.: pendencias:<cliente>:<dia>, a mesma chave de cs_cobrancas).
  chave text,
  -- O que o envio precisa depois de sair (ex.: a pergunta do check-in, para registrar na ficha).
  dados jsonb,
  pedido_por text,
  msg_id_previa text,
  status text not null default 'aguardando',
  decidido_por text,
  decidido_em timestamptz,
  enviado_em timestamptz,
  erro text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cs_envios_cliente_status_check') then
    alter table public.cs_envios_cliente add constraint cs_envios_cliente_status_check
      check (status in ('aguardando', 'enviando', 'enviado', 'cancelado', 'falhou', 'incerto', 'expirado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cs_envios_cliente_tipo_check') then
    alter table public.cs_envios_cliente add constraint cs_envios_cliente_tipo_check
      check (tipo in ('cobranca_pendencias', 'checkin'));
  end if;
end $$;

-- O inbound procura a prévia citada a cada "ok" no grupo interno.
create index if not exists idx_cs_envios_cliente_previa on public.cs_envios_cliente (msg_id_previa);
create index if not exists idx_cs_envios_cliente_aguardando
  on public.cs_envios_cliente (grupo_interno, created_at desc) where status = 'aguardando';

alter table public.cs_envios_cliente enable row level security;

comment on table public.cs_envios_cliente is
  'Mensagem que o Loninho vai mandar no grupo do cliente a pedido do time: fica aguardando o "ok" citado na prévia (lib/cs/envio-cliente.ts).';
comment on column public.cs_envios_cliente.status is
  'aguardando (prévia mostrada) → enviando → enviado | cancelado ("não") | incerto (WhatsApp não respondeu a tempo; não reenvia) | expirado (prévia com mais de 24h). Falha volta para aguardando com o erro.';

notify pgrst, 'reload schema';
