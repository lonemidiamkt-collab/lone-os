-- 20261026150000_contrato_assinado_d4sign.sql — "Cliente X assinou o contrato" no grupo de cadastro.
--
-- Pedido do Roberto (26/10/2026): a equipe esquecia de olhar a D4Sign e perguntava ao cliente se ele
-- tinha assinado, quando ele já tinha. Agora a D4Sign avisa o Lone OS (webhook 2.0 do cofre) e uma
-- consulta de hora em hora pega o que o webhook não trouxe (lib/contracts/assinatura.ts).
--
-- d4sign_documentos: um registro por documento da D4Sign que o Lone OS já viu. É também a TRAVA do
-- aviso: `aviso_reservado_em` é marcado com `update … where aviso_reservado_em is null` ANTES de mandar
-- a mensagem — webhook repetido, retry da D4Sign e a consulta de hora em hora caem na mesma linha e
-- só um manda. Envio que falha solta a trava; envio incerto (o WhatsApp não respondeu a tempo) não.
-- Só o servidor lê e grava (service role): RLS ligado e sem policy.
--
-- contracts.d4sign_assinado_em / clients.contrato_assinado_em: quando a D4Sign fechou TODAS as
-- assinaturas. Não mexe em signed_at nem em status — o contrato só fecha com o PDF assinado na ficha,
-- como sempre; a tela passa a mostrar "assinado na D4Sign em dd/mm" e ninguém pergunta ao cliente.
--
-- APLICAR ANTES DO DEPLOY: sem a tabela o webhook devolve 503 (a D4Sign tenta de novo por até 27 h) e a
-- consulta devolve erro — nada sai para o grupo sem o registro que impede repetir.
begin;

create table if not exists public.d4sign_documentos (
  document_uuid text primary key,
  nome text,
  -- pendente (aguardando assinaturas) · assinado (todas) · cancelado · outro (processando, editando…)
  status text not null default 'pendente' check (status in ('pendente', 'assinado', 'cancelado', 'outro')),
  status_id text,
  contract_id uuid references public.contracts(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  -- Como o documento foi ligado ao cadastro: documento (já ligado antes), email (do signatário), nome.
  vinculo text check (vinculo in ('documento', 'email', 'nome')),
  -- Quando os signatários foram incluídos (o documento saiu para assinatura) e quando o último assinou.
  enviado_em timestamptz,
  assinado_em timestamptz,
  visto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  origem text check (origem in ('webhook', 'consulta')),
  aviso_reservado_em timestamptz,
  aviso_enviado_em timestamptz,
  -- Por que não avisou (assinado antes da integração, fora da janela, envio incerto, erro).
  aviso_motivo text,
  -- Última vez que entrou na linha "contrato sem assinatura" do resumo da manhã.
  cobrado_em timestamptz,
  leitura_erro text
);

comment on table public.d4sign_documentos is
  'Documentos da D4Sign vistos pelo Lone OS e a trava do aviso "assinou o contrato" (lib/contracts/assinatura.ts).';

create index if not exists d4sign_documentos_pendentes_idx
  on public.d4sign_documentos (enviado_em) where status = 'pendente';

alter table public.d4sign_documentos enable row level security;

alter table public.contracts add column if not exists d4sign_document_uuid text;
alter table public.contracts add column if not exists d4sign_assinado_em timestamptz;
create index if not exists contracts_d4sign_document_idx
  on public.contracts (d4sign_document_uuid) where d4sign_document_uuid is not null;

comment on column public.contracts.d4sign_assinado_em is
  'Quando a D4Sign fechou todas as assinaturas. Não é signed_at: o contrato fecha com o PDF assinado na ficha.';

alter table public.clients add column if not exists contrato_assinado_em timestamptz;
comment on column public.clients.contrato_assinado_em is
  'Última vez que a D4Sign fechou as assinaturas de um contrato deste cliente.';

commit;
notify pgrst, 'reload schema';
