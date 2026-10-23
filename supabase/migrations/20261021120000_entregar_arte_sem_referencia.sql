-- 21/10/2026 — entregar_arte() nunca transforma REFERÊNCIA em ENTREGA (auditoria de erro recuperável, 2.1).
--
-- A tela "Entregar arte" mandava os ids de TODOS os anexos do card, inclusive o print de referência
-- que o social anexou pro designer. A função marcava tudo como tipo='entrega', e o "Enviar pro
-- cliente" mandava a referência ao grupo do cliente como se fosse a arte. A tela foi corrigida; aqui
-- é a garantia no banco, para qualquer origem (aba antiga aberta durante o deploy, outra tela):
--   · anexo de referência que chega na lista é IGNORADO (continua referência, não ganha delivery_id);
--   · se só havia referência e nenhum link, a entrega é recusada ("entrega sem arte"), em vez de
--     registrar uma versão vazia;
--   · o resultado conta quantas referências foram ignoradas (referencias_ignoradas).
-- Anexo SEM classificação (legado de antes de 09/08) continua podendo virar entrega: é a pessoa
-- dizendo que é a arte final. Assinatura e permissões iguais às da 20260918120000.

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
  v_n_entrega integer;
  v_n_referencia integer;
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

  -- REFERÊNCIA NÃO É ENTREGA: só conta (e só marca) o que não é referência do social.
  select count(*) into v_n_entrega from card_attachments
    where id = any(coalesce(p_attachment_ids, '{}')) and card_id = p_card_id and tipo is distinct from 'referencia';
  v_n_referencia := v_n_anexos - v_n_entrega;

  if v_n_entrega = 0 and coalesce(array_length(p_urls_externas, 1), 0) = 0 then
    if v_n_referencia > 0 then
      raise exception 'entrega sem arte: só veio referência do social — anexe a arte final ou cole o link' using errcode = 'P0007';
    end if;
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

  -- anexos desta entrega: tipo entrega + vínculo com a versão — NUNCA a referência
  update card_attachments set tipo = 'entrega', delivery_id = v_delivery_id
    where id = any(coalesce(p_attachment_ids, '{}')) and card_id = p_card_id and tipo is distinct from 'referencia';
  select coalesce(array_agg(url order by position), '{}') into v_urls from card_attachments where delivery_id = v_delivery_id;
  v_urls := v_urls || coalesce(p_urls_externas, '{}');

  -- card: entregue, alteração pendente zerada; link externo vira capa legada só sem anexo
  update content_cards set
    designer_delivered_at = now(), designer_delivered_by = p_quem,
    alteracao_pendente_em = null, alteracao_motivo = null,
    image_url = case when v_n_entrega = 0 then p_urls_externas[1] else image_url end,
    updated_at = now()
    where id = p_card_id;

  -- demanda: done, com os anexos da entrega (coluna mantida como ESPELHO para quem ainda lê dela)
  if v_dr_id is not null then
    update design_requests set status = 'done', attachments = coalesce(attachments, '{}') || v_urls, updated_at = now() where id = v_dr_id;
  end if;

  select jsonb_build_object(
    'delivery', jsonb_build_object('id', v_delivery_id, 'version', v_version, 'urls', to_jsonb(v_urls)),
    'card', (select jsonb_build_object('id', c.id, 'status', c.status::text, 'designer_delivered_at', c.designer_delivered_at, 'designer_delivered_by', c.designer_delivered_by, 'image_url', c.image_url, 'alteracao_pendente_em', c.alteracao_pendente_em) from content_cards c where c.id = p_card_id),
    'demanda', (select jsonb_build_object('id', d.id, 'status', d.status::text, 'attachments', to_jsonb(d.attachments)) from design_requests d where d.id = v_dr_id),
    'referencias_ignoradas', v_n_referencia
  ) into v_after;

  insert into ops_log (operation_id, correlation_id, action, actor, card_id, design_request_id, before, after)
    values (p_operation_id, p_correlation_id, 'entregar_arte', p_quem, p_card_id, v_dr_id, v_before, v_after);

  return v_after;
end $$;

revoke all on function public.entregar_arte(uuid, uuid, uuid[], text[], text, text, text) from public;
grant execute on function public.entregar_arte(uuid, uuid, uuid[], text[], text, text, text) to service_role;
notify pgrst, 'reload schema';
