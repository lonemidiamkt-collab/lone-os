-- Fase 0B do Lone Agent V2 (14/09/2026): execução confiável.
--   · outbox: o evento nasce na MESMA transação da escrita (trigger). O relay (lib/fila/outbox.ts)
--     leva para o pg-boss, que cuida de retry, backoff e dead-letter.
--   · cs_outbound.idem_key: chave de idempotência de envio — retry de job não manda duas vezes.
--   · schema `pgboss`: o próprio pg-boss cria na primeira subida do worker.

create table if not exists public.outbox (
  id uuid primary key default gen_random_uuid(),
  evento text not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  criado_em timestamptz not null default now(),
  processado_em timestamptz,
  tentativas integer not null default 0,
  erro text
);
create index if not exists idx_outbox_pendente on public.outbox (criado_em) where processado_em is null;
alter table public.outbox enable row level security; -- sem policy: só o service_role / conexão direta

alter table public.cs_outbound add column if not exists idem_key text;
create index if not exists idx_cs_outbound_idem on public.cs_outbound (idem_key) where idem_key is not null;

-- Emite o evento com o correlation_id da request que escreveu (header x-actor/x-correlation-id
-- que o client admin manda — lib/supabase/server.ts). Escrita fora do painel (psql, script) → null.
create or replace function public.outbox_emitir() returns trigger
language plpgsql security definer as $$
declare
  hdrs jsonb := '{}'::jsonb;
  corr uuid;
  evento text := TG_ARGV[0];
  payload jsonb;
begin
  begin hdrs := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb; exception when others then hdrs := '{}'::jsonb; end;
  begin corr := (hdrs->>'x-correlation-id')::uuid; exception when others then corr := null; end;
  if TG_TABLE_NAME = 'content_cards' then
    payload := jsonb_build_object(
      'id', NEW.id, 'client_id', NEW.client_id, 'client_name', NEW.client_name, 'title', NEW.title,
      'social_media', NEW.social_media, 'requested_by_traffic', NEW.requested_by_traffic,
      'due_date', NEW.due_date, 'status', NEW.status, 'created_at', NEW.created_at);
  elsif TG_TABLE_NAME = 'design_requests' then
    payload := jsonb_build_object(
      'id', NEW.id, 'client_id', NEW.client_id, 'client_name', NEW.client_name, 'title', NEW.title,
      'requested_by', NEW.requested_by, 'status', NEW.status, 'created_at', NEW.created_at);
  else
    payload := to_jsonb(NEW);
  end if;
  insert into public.outbox (evento, payload, correlation_id) values (evento, payload, corr);
  return NEW;
end;
$$;

drop trigger if exists outbox_content_cards on public.content_cards;
create trigger outbox_content_cards after insert on public.content_cards
  for each row execute function public.outbox_emitir('content_card.created');

drop trigger if exists outbox_design_requests on public.design_requests;
create trigger outbox_design_requests after insert on public.design_requests
  for each row execute function public.outbox_emitir('design_request.created');

notify pgrst, 'reload schema';
