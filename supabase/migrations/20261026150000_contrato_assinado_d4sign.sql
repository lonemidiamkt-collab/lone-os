-- 20261026150000_contrato_assinado_d4sign.sql — contrato pela D4Sign, do envio ao PDF assinado na ficha.
--
-- Pedido do Roberto (26/10/2026): a equipe esquecia de olhar a D4Sign e perguntava ao cliente se ele
-- tinha assinado, quando ele já tinha. Depois: "faça toda essa integração" — enviar pelo Lone OS, PDF
-- assinado anexado sozinho, quem falta assinar, lembrete (desligado) e o Lone Finance lendo o resultado.
-- O código mora em lib/contracts/{d4sign,assinatura,d4sign-envio,d4sign-lembrete,d4sign-cota}.ts.
--
-- d4sign_documentos: um registro por documento da D4Sign que o Lone OS já viu (ou mandou). É também a
-- TRAVA do aviso "assinou o contrato": `aviso_reservado_em` é marcado com `update … where
-- aviso_reservado_em is null` ANTES de mandar — webhook repetido, retry da D4Sign e a consulta caem na
-- mesma linha e só um manda. Envio que falha solta a trava; envio incerto não.
--   signatarios  [{nome, email, papel, assinou, assinadoEm, chave}] — "quem falta assinar"; chave é o
--                key_signer da D4Sign (o lembrete precisa dele). E-mail e chave nunca saem para o Finance.
--   pdf_*        o PDF assinado baixado da D4Sign (legal-docs/contracts-signed/…), uma vez por documento.
--   envio_etapa  quando o Lone OS manda o contrato: subido → signatarios → enviado. Falha no meio continua
--                de onde parou (não sobe o arquivo duas vezes nem duplica signatário).
--   lembrado_em  último lembrete da D4Sign ao cliente (rotina contratos-d4sign-lembrete, NASCE DESLIGADA).
-- Só o servidor lê e grava (service role): RLS ligado e sem policy. A tela lê por /api/contracts/d4sign.
--
-- d4sign_chamadas: cada chamada à API da D4Sign. O limite padrão da conta é 10 por HORA; a consulta de
-- rotina para antes de gastar as últimas (sobram para o envio, o PDF e o webhook).
--
-- contracts.d4sign_assinado_em / clients.contrato_assinado_em: quando a D4Sign fechou TODAS as
-- assinaturas. O PDF assinado baixado sozinho fecha o contrato pela MESMA regra do "Upload assinado"
-- (signed_pdf_path + signed_at + status active), só se ele ainda não tiver PDF — nunca troca um que já existe.
--
-- APLICAR ANTES DO DEPLOY: sem as tabelas o webhook devolve 503 (a D4Sign tenta de novo por até 27 h), a
-- consulta devolve erro e o envio recusa — nada sai sem o registro que impede repetir.
begin;

create table if not exists public.d4sign_documentos (
  document_uuid text primary key,
  nome text,
  -- pendente (aguardando assinaturas) · assinado (todas) · cancelado · outro (processando, editando…)
  status text not null default 'pendente' check (status in ('pendente', 'assinado', 'cancelado', 'outro')),
  status_id text,
  tipo text check (tipo in ('contrato', 'documento')),
  contract_id uuid references public.contracts(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  -- Como o documento foi ligado ao cadastro: documento (já ligado antes / enviado pelo Lone OS), email, nome.
  vinculo text check (vinculo in ('documento', 'email', 'nome')),
  signatarios jsonb not null default '[]'::jsonb,
  -- Quando os signatários foram incluídos (o documento saiu para assinatura) e quando o último assinou.
  enviado_em timestamptz,
  assinado_em timestamptz,
  visto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  origem text check (origem in ('webhook', 'consulta', 'envio')),
  envio_etapa text check (envio_etapa in ('subido', 'signatarios', 'enviado')),
  enviado_por text,
  aviso_reservado_em timestamptz,
  aviso_enviado_em timestamptz,
  -- Por que não avisou (assinado antes da integração, fora da janela, envio incerto, erro).
  aviso_motivo text,
  pdf_path text,
  pdf_sha256 text,
  pdf_tamanho integer,
  pdf_baixado_em timestamptz,
  pdf_tentativas integer not null default 0,
  pdf_erro text,
  -- Última vez que entrou na linha "contrato sem assinatura" do resumo da manhã.
  cobrado_em timestamptz,
  lembrado_em timestamptz,
  leitura_erro text
);

-- Quem já rodou a versão anterior desta migration (só a trava do aviso) ganha as colunas novas.
alter table public.d4sign_documentos add column if not exists tipo text check (tipo in ('contrato', 'documento'));
alter table public.d4sign_documentos add column if not exists signatarios jsonb not null default '[]'::jsonb;
alter table public.d4sign_documentos add column if not exists envio_etapa text check (envio_etapa in ('subido', 'signatarios', 'enviado'));
alter table public.d4sign_documentos add column if not exists enviado_por text;
alter table public.d4sign_documentos add column if not exists pdf_path text;
alter table public.d4sign_documentos add column if not exists pdf_sha256 text;
alter table public.d4sign_documentos add column if not exists pdf_tamanho integer;
alter table public.d4sign_documentos add column if not exists pdf_baixado_em timestamptz;
alter table public.d4sign_documentos add column if not exists pdf_tentativas integer not null default 0;
alter table public.d4sign_documentos add column if not exists pdf_erro text;
alter table public.d4sign_documentos add column if not exists lembrado_em timestamptz;
alter table public.d4sign_documentos drop constraint if exists d4sign_documentos_origem_check;
alter table public.d4sign_documentos add constraint d4sign_documentos_origem_check check (origem in ('webhook', 'consulta', 'envio'));

comment on table public.d4sign_documentos is
  'Documentos da D4Sign vistos ou enviados pelo Lone OS: signatários, PDF assinado e a trava do aviso (lib/contracts/assinatura.ts).';

create index if not exists d4sign_documentos_pendentes_idx
  on public.d4sign_documentos (enviado_em) where status = 'pendente';
create index if not exists d4sign_documentos_cliente_idx
  on public.d4sign_documentos (client_id) where client_id is not null;

alter table public.d4sign_documentos enable row level security;

create table if not exists public.d4sign_chamadas (
  id bigserial primary key,
  em timestamptz not null default now(),
  caminho text not null,
  origem text not null
);
create index if not exists d4sign_chamadas_em_idx on public.d4sign_chamadas (em desc);
alter table public.d4sign_chamadas enable row level security;
comment on table public.d4sign_chamadas is
  'Cada chamada à API da D4Sign (limite da conta: 10 por hora, salvo combinado com a D4Sign). lib/contracts/d4sign-cota.ts.';

-- As chaves da D4Sign coladas no painel (Configurações › Jurídico, só admin). Uma linha só. Os segredos
-- ficam CIFRADOS com a VAULT_KEY do servidor (lib/crypto/vault.ts); o cofre não é segredo. RLS sem policy:
-- nem o texto cifrado chega ao navegador. historico = [{quem, quando, acao, campos}] — nunca o valor.
-- O .env da VPS (D4SIGN_*) continua valendo para o campo que o painel deixar vazio.
create table if not exists public.d4sign_config (
  id smallint primary key default 1 check (id = 1),
  token text,
  crypt_key text,
  hmac text,
  cofre text,
  atualizado_em timestamptz,
  atualizado_por text,
  testado_em timestamptz,
  teste_ok boolean,
  teste_resultado text,
  historico jsonb not null default '[]'::jsonb
);
alter table public.d4sign_config enable row level security;
comment on table public.d4sign_config is
  'Chaves da D4Sign coladas no painel, cifradas com a VAULT_KEY (lib/contracts/d4sign-config.ts). Só o servidor lê.';

alter table public.contracts add column if not exists d4sign_document_uuid text;
alter table public.contracts add column if not exists d4sign_assinado_em timestamptz;
-- Trava do "Enviar pela D4Sign": dois cliques ao mesmo tempo não sobem dois documentos.
alter table public.contracts add column if not exists d4sign_enviando_em timestamptz;
create index if not exists contracts_d4sign_document_idx
  on public.contracts (d4sign_document_uuid) where d4sign_document_uuid is not null;

comment on column public.contracts.d4sign_assinado_em is
  'Quando a D4Sign fechou todas as assinaturas. O contrato fecha (signed_at/status) quando o PDF assinado entra na ficha — sozinho, baixado da D4Sign, ou pelo Upload assinado.';

alter table public.clients add column if not exists contrato_assinado_em timestamptz;
comment on column public.clients.contrato_assinado_em is
  'Última vez que a D4Sign fechou as assinaturas de um contrato deste cliente.';

-- O lembrete pela D4Sign fala com o CLIENTE (e-mail da D4Sign): NASCE DESLIGADO. Liga na Central de
-- Automações, com o ok do Roberto. E mesmo sem esta linha a rota não manda: exige o job ligado de propósito.
do $$
begin
  if to_regclass('public.automation_settings') is not null then
    insert into public.automation_settings (job, enabled, updated_by, updated_at)
    values ('contratos-d4sign-lembrete', false, 'migration 20261026150000 (nasce desligado)', now())
    on conflict (job) do nothing;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
