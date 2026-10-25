-- 25/10/2026 — auditoria de erro recuperável (segunda rodada), item 11.1.
--
-- O áudio de cliente que não era transcrito (Whisper sem crédito, mídia que não baixava, IA desligada,
-- áudio de mais de ~6 MB) sumia sem rastro: a mensagem já estava reservada em cs_processed_messages e
-- o inbound respondia "ok, skip". O onboarding respondido por áudio ficava parado no mesmo passo.
--
-- Agora o áudio entra na mesma fila de não lidas (20261021130003), com o tipo "audio" e, em `midia`,
-- o key + message que a Evolution mandou — é com eles que a rotina cs-nao-lidas baixa e transcreve de
-- novo. Regras em lib/cs/audio-nao-lido.ts e lib/cs/nao-lidas.ts.
--
-- PRECISA ESTAR APLICADA ANTES DO DEPLOY para o áudio entrar na fila. Sem ela, o texto continua
-- funcionando como antes; o áudio não guardado vira aviso imediato ao time ("ouve no grupo"), nunca
-- silêncio.
--
-- Idempotente.

alter table public.cs_mensagens_nao_lidas add column if not exists tipo text not null default 'texto';
alter table public.cs_mensagens_nao_lidas add column if not exists midia jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cs_mensagens_nao_lidas_tipo_check') then
    alter table public.cs_mensagens_nao_lidas add constraint cs_mensagens_nao_lidas_tipo_check
      check (tipo in ('texto', 'audio'));
  end if;
end $$;

comment on column public.cs_mensagens_nao_lidas.tipo is
  'texto = a IA não classificou; audio = nota de voz que não foi transcrita (texto vazio, midia preenchida).';
comment on column public.cs_mensagens_nao_lidas.midia is
  'Áudio: key + message da Evolution para baixar de novo; onboardingPasso quando era resposta do onboarding.';

notify pgrst, 'reload schema';
