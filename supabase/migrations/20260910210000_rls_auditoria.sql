-- 10/09/2026 — auditoria geral do sistema. Duas falhas de RLS, com efeitos opostos.
--
-- (A) TRÊS TELAS QUE SALVAM NO VAZIO. client_nps, daily_checklists e strategy_annotations têm RLS
-- LIGADA e NENHUMA policy. Componentes do navegador (ClientNPS.tsx, TrafficChecklist.tsx,
-- ResultsTab.tsx) leem e gravam nelas com o cliente anon/authenticated. Resultado medido no banco
-- hoje: as três com ZERO linhas. Conferido com `set role authenticated`: o select devolve 0 e o
-- insert responde "new row violates row-level security policy". As telas mostram "salvo" porque não
-- olham o erro — as pessoas avaliaram NPS e preencheram checklist meses a fio sem gravar nada.
-- communication_logs está no mesmo estado (0 linhas) e é escrita pelo servidor; entra junto.
alter table client_nps           enable row level security;
alter table daily_checklists     enable row level security;
alter table strategy_annotations enable row level security;
alter table communication_logs   enable row level security;

drop policy if exists nps_all on client_nps;
create policy nps_all on client_nps for all to authenticated using (true) with check (true);

drop policy if exists checklist_all on daily_checklists;
create policy checklist_all on daily_checklists for all to authenticated using (true) with check (true);

drop policy if exists anotacoes_all on strategy_annotations;
create policy anotacoes_all on strategy_annotations for all to authenticated using (true) with check (true);

drop policy if exists comunicacao_all on communication_logs;
create policy comunicacao_all on communication_logs for all to authenticated using (true) with check (true);

-- (B) SEIS TABELAS SEM RLS NENHUMA — o erro oposto: qualquer login lê tudo. São as que EU criei
-- nas migrations desta semana (reunião como ativo operacional e offboarding) e esqueci de fechar.
-- É a mesma lição da auditoria de jul/2026, quando 6 tabelas cs_* estavam assim.
-- Guardam registro de reunião, motivo de saída de cliente e anexos: nada disso é público.
alter table client_lifecycles       enable row level security;
alter table client_offboardings     enable row level security;
alter table meeting_attachments     enable row level security;
alter table meeting_events          enable row level security;
alter table offboarding_attachments enable row level security;
alter table offboarding_events      enable row level security;

drop policy if exists ciclos_all on client_lifecycles;
create policy ciclos_all on client_lifecycles for all to authenticated using (true) with check (true);

drop policy if exists offb_all on client_offboardings;
create policy offb_all on client_offboardings for all to authenticated using (true) with check (true);

drop policy if exists reuniao_anexo_all on meeting_attachments;
create policy reuniao_anexo_all on meeting_attachments for all to authenticated using (true) with check (true);

drop policy if exists reuniao_evento_all on meeting_events;
create policy reuniao_evento_all on meeting_events for all to authenticated using (true) with check (true);

drop policy if exists offb_anexo_all on offboarding_attachments;
create policy offb_anexo_all on offboarding_attachments for all to authenticated using (true) with check (true);

drop policy if exists offb_evento_all on offboarding_events;
create policy offb_evento_all on offboarding_events for all to authenticated using (true) with check (true);
