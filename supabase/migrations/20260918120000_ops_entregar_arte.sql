-- FASE 1 do domínio criativo (18/09/2026): ENTREGAR ARTE vira UMA operação, no banco, numa transação.
-- Antes: dois códigos no navegador gravavam card, demanda e anexos em chamadas separadas (e em ordens
-- diferentes) — produziu demanda in_progress com card "entregue". Agora: entregar_arte() valida, marca
-- anexos, registra a versão da entrega, atualiza card e demanda, grava o audit e devolve o estado final.
-- Idempotente por operation_id: o mesmo clique repetido devolve o mesmo resultado, nunca duas entregas.

-- 1) versões de entrega (V1, V2… — reentrega substitui a anterior, não acumula sem marca)
create table if not exists public.creative_deliveries (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.content_cards(id) on delete cascade,
  design_request_id uuid references public.design_requests(id) on delete set null,
  version integer not null,
  delivered_by text not null,
  delivered_at timestamptz not null default now(),
  status text not null default 'entregue' check (status in ('entregue','substituida')),
  revision_reason text,
  operation_id text not null unique,
  correlation_id text,
  created_at timestamptz not null default now(),
  unique (card_id, version)
);
create index if not exists idx_creative_deliveries_card on public.creative_deliveries (card_id, version desc);
alter table public.creative_deliveries enable row level security;
drop policy if exists creative_deliveries_leitura on public.creative_deliveries;
create policy creative_deliveries_leitura on public.creative_deliveries for select to authenticated using (true);

alter table public.card_attachments add column if not exists delivery_id uuid references public.creative_deliveries(id) on delete set null;
create index if not exists idx_card_attachments_delivery on public.card_attachments (delivery_id);

-- 2) "alteração pendente" vira dado (reprovar grava; entregar zera) — a tela deixa de fazer a conta
alter table public.content_cards add column if not exists alteracao_pendente_em timestamptz;
alter table public.content_cards add column if not exists alteracao_motivo text;

-- 3) designer por UUID (nome continua como espelho para as telas que ainda leem por nome)
alter table public.clients add column if not exists default_designer_id uuid references public.team_members(id) on delete set null;
alter table public.design_requests add column if not exists assignee_id uuid references public.team_members(id) on delete set null;
update public.clients c set default_designer_id = t.id from public.team_members t
  where c.default_designer_id is null and c.assigned_designer is not null and t.deleted_at is null and lower(trim(t.name)) = lower(trim(c.assigned_designer));
update public.design_requests d set assignee_id = t.id from public.team_members t
  where d.assignee_id is null and d.assigned_designer is not null and t.deleted_at is null and lower(trim(t.name)) = lower(trim(d.assigned_designer));

-- 4) audit AUTORITATIVO das operações (o navegador tem a trilha; aqui é o servidor, para qualquer origem)
create table if not exists public.ops_log (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null,
  correlation_id text,
  action text not null,
  actor text,
  card_id uuid,
  design_request_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  unique (action, operation_id)
);
create index if not exists idx_ops_log_card on public.ops_log (card_id, created_at desc);
alter table public.ops_log enable row level security;
drop policy if exists ops_log_leitura on public.ops_log;
create policy ops_log_leitura on public.ops_log for select to authenticated using (true);

-- 5) máquina de estados da DEMANDA para esta operação (Fases 2–3 estendem)
create or replace function public.transicao_demanda_valida(p_de text, p_para text) returns boolean
language sql immutable as $$
  select case
    when p_para = 'done' then coalesce(p_de,'queued') in ('queued','in_progress','done')
    when p_para = 'in_progress' then coalesce(p_de,'queued') in ('queued','in_progress','done')
    when p_para = 'queued' then coalesce(p_de,'queued') in ('queued')
    else false end
$$;

-- 6) A OPERAÇÃO
create or replace function public.entregar_arte(
  p_card_id uuid,
  p_design_request_id uuid,
  p_attachment_ids uuid[],
  p_urls_externas text[],
  p_quem text,
  p_operation_id text,
  p_correlation_id text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_card content_cards%rowtype;
  v_dr design_requests%rowtype;
  v_dr_id uuid;
  v_prev jsonb;
  v_delivery_id uuid;
  v_version integer;
  v_urls text[];
  v_n_anexos integer;
  v_before jsonb;
  v_after jsonb;
begin
  if p_operation_id is null or length(p_operation_id) < 8 then
    raise exception 'operation_id obrigatório' using errcode = 'P0001';
  end if;

  -- IDEMPOTÊNCIA: já rodou? devolve o mesmo resultado, sem tocar em nada.
  select after into v_prev from ops_log where action = 'entregar_arte' and operation_id = p_operation_id;
  if v_prev is not null then
    return v_prev || jsonb_build_object('repetida', true);
  end if;

  -- trava o card (duas entregas simultâneas do mesmo card ficam em fila)
  select * into v_card from content_cards where id = p_card_id for update;
  if not found then raise exception 'card não encontrado' using errcode = 'P0002'; end if;
  if v_card.archived_at is not null then raise exception 'card arquivado — desarquive antes de entregar' using errcode = 'P0003'; end if;

  v_dr_id := coalesce(p_design_request_id, v_card.design_request_id);
  if v_dr_id is not null then
    select * into v_dr from design_requests where id = v_dr_id for update;
    if not found then raise exception 'demanda não encontrada' using errcode = 'P0002'; end if;
    if v_dr.content_card_id is not null and v_dr.content_card_id <> p_card_id then
      raise exception 'demanda pertence a outro card' using errcode = 'P0004';
    end if;
    if not transicao_demanda_valida(v_dr.status::text, 'done') then
      raise exception 'demanda em % não pode ser entregue', v_dr.status::text using errcode = 'P0005';
    end if;
  end if;

  -- anexos: têm que ser deste card
  select count(*) into v_n_anexos from card_attachments where id = any(coalesce(p_attachment_ids, '{}')) and card_id = p_card_id;
  if v_n_anexos <> coalesce(array_length(p_attachment_ids, 1), 0) then
    raise exception 'anexo não pertence a este card' using errcode = 'P0006';
  end if;
  if v_n_anexos = 0 and coalesce(array_length(p_urls_externas, 1), 0) = 0 then
    raise exception 'entrega sem arte: anexe pelo menos uma arte ou um link' using errcode = 'P0007';
  end if;

  v_before := jsonb_build_object(
    'card', jsonb_build_object('status', v_card.status::text, 'designer_delivered_at', v_card.designer_delivered_at, 'alteracao_pendente_em', v_card.alteracao_pendente_em),
    'demanda', case when v_dr_id is null then null else jsonb_build_object('status', v_dr.status::text, 'attachments', to_jsonb(v_dr.attachments)) end);

  -- versão: a anterior vira "substituída"
  select coalesce(max(version), 0) + 1 into v_version from creative_deliveries where card_id = p_card_id;
  update creative_deliveries set status = 'substituida' where card_id = p_card_id and status = 'entregue';
  insert into creative_deliveries (card_id, design_request_id, version, delivered_by, status, revision_reason, operation_id, correlation_id)
    values (p_card_id, v_dr_id, v_version, p_quem, 'entregue', v_card.alteracao_motivo, p_operation_id, p_correlation_id)
    returning id into v_delivery_id;

  -- anexos desta entrega: tipo entrega + vínculo com a versão
  update card_attachments set tipo = 'entrega', delivery_id = v_delivery_id
    where id = any(coalesce(p_attachment_ids, '{}'));
  select coalesce(array_agg(url order by position), '{}') into v_urls from card_attachments where delivery_id = v_delivery_id;
  v_urls := v_urls || coalesce(p_urls_externas, '{}');

  -- card: entregue, alteração pendente zerada; link externo vira capa legada só sem anexo
  update content_cards set
    designer_delivered_at = now(), designer_delivered_by = p_quem,
    alteracao_pendente_em = null, alteracao_motivo = null,
    image_url = case when v_n_anexos = 0 then p_urls_externas[1] else image_url end,
    updated_at = now()
    where id = p_card_id;

  -- demanda: done, com os anexos da entrega (coluna mantida como ESPELHO para quem ainda lê dela)
  if v_dr_id is not null then
    update design_requests set status = 'done', attachments = coalesce(attachments, '{}') || v_urls, updated_at = now() where id = v_dr_id;
  end if;

  select jsonb_build_object(
    'delivery', jsonb_build_object('id', v_delivery_id, 'version', v_version, 'urls', to_jsonb(v_urls)),
    'card', (select jsonb_build_object('id', c.id, 'status', c.status::text, 'designer_delivered_at', c.designer_delivered_at, 'designer_delivered_by', c.designer_delivered_by, 'image_url', c.image_url, 'alteracao_pendente_em', c.alteracao_pendente_em) from content_cards c where c.id = p_card_id),
    'demanda', (select jsonb_build_object('id', d.id, 'status', d.status::text, 'attachments', to_jsonb(d.attachments)) from design_requests d where d.id = v_dr_id)
  ) into v_after;

  insert into ops_log (operation_id, correlation_id, action, actor, card_id, design_request_id, before, after)
    values (p_operation_id, p_correlation_id, 'entregar_arte', p_quem, p_card_id, v_dr_id, v_before, v_after);

  return v_after;
end $$;

revoke all on function public.entregar_arte(uuid, uuid, uuid[], text[], text, text, text) from public;
grant execute on function public.entregar_arte(uuid, uuid, uuid[], text[], text, text, text) to service_role;
notify pgrst, 'reload schema';
