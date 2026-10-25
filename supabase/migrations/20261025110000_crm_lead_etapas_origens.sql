-- Comercial · onda 5 do erro recuperável (25/10/2026): toda mudança de etapa do lead grava o histórico.
--
-- POR QUE: crm_lead_etapas (20261023100000) só recebia a tela, a criação pela tela e a reunião marcada. O primeiro
-- contato que tira o lead de Novo, o Desfazer desse registro, a proposta gerada pelo painel, a importação/Rota Lagos,
-- o lead do site/Loninho e o da prospecção mudavam a etapa sem deixar linha. O código (lib/crm/etapas-historico.ts)
-- passa a gravar todos; estas quatro origens novas dizem de onde veio:
--   contato    — o primeiro toque (ligação, WhatsApp, e-mail, reunião, visita) moveu Novo → Contato feito
--   proposta   — "Gerar proposta" no painel moveu para Proposta
--   importacao — planilha/oportunidades ou Rota Lagos criou o lead ou avançou a etapa
--   desfazer   — o "Desfazer" do registro voltou a etapa
-- Enquanto esta migration não for aplicada, o código grava com a origem antiga equivalente (tela/lote) — nada se perde.

alter table public.crm_lead_etapas drop constraint if exists crm_lead_etapas_origem_check;
alter table public.crm_lead_etapas add constraint crm_lead_etapas_origem_check
  check (origem in ('tela', 'criacao', 'reuniao', 'lote', 'carga', 'contato', 'proposta', 'importacao', 'desfazer'));

notify pgrst, 'reload schema';
