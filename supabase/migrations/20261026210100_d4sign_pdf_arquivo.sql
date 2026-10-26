-- Arquivo de contratos por mês (Roberto, 26/10/2026: "deveria ter uma área de arquivos para vermos
-- contratos de cada mês, e podermos baixar eles também"). O PDF assinado de cada documento finalizado
-- nos cofres de contrato é baixado da D4Sign UMA vez e guardado em legal-docs/contracts-signed/…, no
-- mesmo lugar do "Upload assinado". lib/contracts/arquivo-d4sign.ts.
--   pdf_path        legal://contracts-signed/…  (null = ainda não baixado)
--   pdf_tentativas  trava otimista + teto de tentativas (5) por documento
--   pdf_erro        o último motivo de falha, para a tela dizer por que falta
alter table public.d4sign_documentos add column if not exists pdf_path text;
alter table public.d4sign_documentos add column if not exists pdf_sha256 text;
alter table public.d4sign_documentos add column if not exists pdf_tamanho integer;
alter table public.d4sign_documentos add column if not exists pdf_baixado_em timestamptz;
alter table public.d4sign_documentos add column if not exists pdf_tentativas integer not null default 0;
alter table public.d4sign_documentos add column if not exists pdf_erro text;
create index if not exists d4sign_documentos_sem_pdf_idx on public.d4sign_documentos (assinado_em desc)
  where status = 'assinado' and pdf_path is null;
