-- Fase 0A do Lone Agent V2 (13/09/2026): rastreabilidade.
--   · agent_runs: uma linha por execução do agente (inbound, crons) — origem, quem, custo, desfecho.
--   · llm_calls: um recibo por chamada de modelo, com ou sem execução.
--   · cs_outbound.correlation_id: a mensagem que saiu aponta para a execução.
--   · audit_log (LONE-003): UPDATE guarda o que MUDOU (antes/depois só das colunas alteradas),
--     o autor vem do header x-actor que o painel manda (era "service_role" sem nome em 11.904 de
--     12.347 linhas), update sem mudança real não gera linha, e correlation_id liga ao agent_runs.
--     Passa a cobrir team_members (autoridade) e cs_client_rules (memória do agente).

create table if not exists public.agent_runs (
  id uuid primary key,
  origem text not null,
  ator text,
  papel text,
  iniciado_em timestamptz not null,
  duracao_ms integer,
  chamadas_llm integer not null default 0,
  tokens_prompt integer not null default 0,
  tokens_completion integer not null default 0,
  tokens_cached integer not null default 0,
  custo_usd numeric(12,6),
  custo_completo boolean not null default true,
  modelos text[],
  envios integer not null default 0,
  escritas integer not null default 0,
  notas text[],
  resultado jsonb,
  extra jsonb,
  erro text,
  created_at timestamptz not null default now()
);
create index if not exists idx_agent_runs_iniciado on public.agent_runs (iniciado_em desc);
create index if not exists idx_agent_runs_origem on public.agent_runs (origem, iniciado_em desc);
alter table public.agent_runs enable row level security;
drop policy if exists agent_runs_gestao on public.agent_runs;
create policy agent_runs_gestao on public.agent_runs for select to authenticated
  using (auth.user_role() = any (array['admin','manager','service_role']));

create table if not exists public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  origem text,
  tipo text not null default 'chat',
  modelo text not null,
  tokens_prompt integer not null default 0,
  tokens_completion integer not null default 0,
  tokens_cached integer not null default 0,
  custo_usd numeric(12,6),
  custo_estimado boolean not null default false,
  duracao_ms integer,
  ok boolean not null default true,
  erro text,
  created_at timestamptz not null default now()
);
create index if not exists idx_llm_calls_created on public.llm_calls (created_at desc);
create index if not exists idx_llm_calls_run on public.llm_calls (run_id) where run_id is not null;
alter table public.llm_calls enable row level security;
drop policy if exists llm_calls_gestao on public.llm_calls;
create policy llm_calls_gestao on public.llm_calls for select to authenticated
  using (auth.user_role() = any (array['admin','manager','service_role']));

alter table public.cs_outbound add column if not exists correlation_id uuid;
create index if not exists idx_cs_outbound_correlation on public.cs_outbound (correlation_id) where correlation_id is not null;

alter table public.audit_log add column if not exists correlation_id uuid;
create index if not exists idx_audit_log_correlation on public.audit_log (correlation_id) where correlation_id is not null;

create or replace function public.audit_trigger_func() returns trigger
language plpgsql security definer as $$
declare
  hdrs jsonb := '{}'::jsonb;
  claims jsonb := '{}'::jsonb;
  ator text; papel text; corr uuid;
  o jsonb; n jsonb; antes jsonb := '{}'::jsonb; depois jsonb := '{}'::jsonb; k text;
begin
  begin hdrs := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb; exception when others then hdrs := '{}'::jsonb; end;
  begin claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb; exception when others then claims := '{}'::jsonb; end;
  -- quem: header do painel (lib/obs/ator.ts / execução do agente) > claims do JWT (escrita direta do navegador)
  ator := coalesce(hdrs->>'x-actor', claims->>'user_name', claims->>'email');
  papel := coalesce(hdrs->>'x-actor-role', claims->'app_metadata'->>'user_role', claims->>'user_role', claims->>'role');
  begin corr := (hdrs->>'x-correlation-id')::uuid; exception when others then corr := null; end;

  if TG_OP = 'UPDATE' then
    o := to_jsonb(OLD); n := to_jsonb(NEW);
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at','facebook_password','instagram_password','google_ads_password','meta_token','access_token','password_hash')
         and o->k is distinct from n->k then
        antes := antes || jsonb_build_object(k, o->k);
        depois := depois || jsonb_build_object(k, n->k);
      end if;
    end loop;
    if antes = '{}'::jsonb then return NEW; end if; -- nada mudou de verdade: não é auditoria, é ruído
    insert into public.audit_log (table_name, operation, record_id, user_role, user_name, old_data, new_data, correlation_id)
    values (TG_TABLE_NAME, TG_OP, NEW.id::text, papel, ator, antes, depois, corr);
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.audit_log (table_name, operation, record_id, user_role, user_name, old_data, new_data, correlation_id)
    values (TG_TABLE_NAME, TG_OP, OLD.id::text, papel, ator, to_jsonb(OLD), null, corr);
    return OLD;
  else
    insert into public.audit_log (table_name, operation, record_id, user_role, user_name, old_data, new_data, correlation_id)
    values (TG_TABLE_NAME, TG_OP, NEW.id::text, papel, ator, null, to_jsonb(NEW), corr);
    return NEW;
  end if;
end;
$$;

drop trigger if exists audit_team_members on public.team_members;
create trigger audit_team_members after insert or update or delete on public.team_members
  for each row execute function public.audit_trigger_func();

drop trigger if exists audit_cs_client_rules on public.cs_client_rules;
create trigger audit_cs_client_rules after insert or update or delete on public.cs_client_rules
  for each row execute function public.audit_trigger_func();

notify pgrst, 'reload schema';
