-- 24/10/2026 (auditoria de erro recuperável, item 3.13): depois do primeiro envio do PDF assinado
-- não havia como trocar um PDF errado. Agora "Trocar PDF assinado" (ficha › Contratos) substitui o
-- atual e guarda a referência do anterior aqui, com quem enviou e quem trocou — o arquivo antigo
-- continua no storage (cada envio tem caminho próprio em legal-docs/contracts-signed/).
--
-- Cada item: { path, assinadoEm, enviadoPor, metodo, substituidoEm, substituidoPor }, o mais recente
-- primeiro. Quem grava é só /api/contracts/upload-signed (service role).
--
-- APLICAR ANTES DO DEPLOY: sem a coluna, a rota RECUSA a troca (prefere não trocar a perder a
-- referência do PDF que valia). O primeiro envio do assinado funciona com ou sem ela.
begin;

alter table public.contracts
  add column if not exists signed_pdf_anteriores jsonb not null default '[]'::jsonb;

comment on column public.contracts.signed_pdf_anteriores is
  'PDFs assinados que já valeram para este contrato (trocados pela tela), o mais recente primeiro.';

commit;
notify pgrst, 'reload schema';
