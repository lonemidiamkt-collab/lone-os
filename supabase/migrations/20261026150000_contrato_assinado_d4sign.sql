-- 20261026150000_contrato_assinado_d4sign.sql — quem assinou e quem falta na D4Sign, avisado no grupo de cadastro.
--
-- Pedido do Roberto (26/10/2026): "a maior questão é a gente saber quem assinou, quem não assinou; se o cliente
-- assinou, enviar lá no nosso grupo de cadastro 'cliente acabou de assinar o contrato', ou 'o cliente ainda não
-- assinou o contrato'". O código mora em lib/contracts/{d4sign,assinatura,d4sign-config,d4sign-cota,
-- d4sign-signatarios,d4sign-resumo}.ts.
--
-- d4sign_documentos: um registro por documento da D4Sign que o Lone OS já viu.
--   signatarios        [{nome, email, papel, assinou, assinadoEm}] — quem assinou e quem falta, a cada leitura.
--   aviso_reservado_em TRAVA do aviso final ("assinou o contrato"): marcada com `update … where … is null`
--                      ANTES de mandar — webhook repetido, retry da D4Sign e a consulta caem na mesma linha.
--   aviso_parcial      TRAVA do aviso parcial ("assinado por X · falta Y"): o resumo de quem já tinha assinado
--                      no último aviso. Só manda quando muda, uma vez por mudança.
-- Só o servidor lê e grava (service role): RLS ligado e sem policy. A tela lê por /api/contracts/d4sign.
--
-- d4sign_chamadas: cada chamada à API da D4Sign (a conta responde a 10 por HORA); as rotinas param antes de
-- gastar as últimas, que ficam para o webhook.
--
-- d4sign_config: as chaves coladas no painel (Configurações › Jurídico, só admin), CIFRADAS com a VAULT_KEY
-- do servidor. Nem o texto cifrado vai para o navegador. O .env (D4SIGN_*) vale para o campo vazio.
--
-- contracts.d4sign_assinado_em / clients.contrato_assinado_em: quando a D4Sign fechou TODAS as assinaturas.
-- Não mexe em signed_at nem em status: o contrato fecha com o PDF assinado na ficha, como sempre.
--
-- APLICAR ANTES DO DEPLOY: sem as tabelas o webhook devolve 503 (a D4Sign tenta de novo por até 27 h) e as
-- rotinas devolvem erro — nada sai para o grupo sem o registro que impede repetir.
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
  -- Como o documento foi ligado ao cadastro: documento (já ligado antes), email (do signatário), nome.
  vinculo text check (vinculo in ('documento', 'email', 'nome')),
  signatarios jsonb not null default '[]'::jsonb,
  -- Quando os signatários foram incluídos (o documento saiu para assinatura) e quando o último assinou.
  enviado_em timestamptz,
  assinado_em timestamptz,
  visto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  origem text check (origem in ('webhook', 'consulta', 'manha')),
  aviso_reservado_em timestamptz,
  aviso_enviado_em timestamptz,
  -- Por que não avisou (assinado antes da integração, fora da janela, envio incerto, erro).
  aviso_motivo text,
  aviso_parcial text,
  leitura_erro text
);

comment on table public.d4sign_documentos is
  'Documentos da D4Sign vistos pelo Lone OS: quem assinou e quem falta, e as travas dos avisos (lib/contracts/assinatura.ts).';

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

-- As chaves da D4Sign coladas no painel. Uma linha só. Os segredos ficam CIFRADOS com a VAULT_KEY do servidor
-- (lib/crypto/vault.ts); o cofre e os e-mails de quem assina pela Lone não são segredo. RLS sem policy.
-- historico = [{quem, quando, acao, campos}] — nunca o valor.
create table if not exists public.d4sign_config (
  id smallint primary key default 1 check (id = 1),
  token text,
  crypt_key text,
  hmac text,
  cofre text,
  emails_lone text,
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
create index if not exists contracts_d4sign_document_idx
  on public.contracts (d4sign_document_uuid) where d4sign_document_uuid is not null;

comment on column public.contracts.d4sign_assinado_em is
  'Quando a D4Sign fechou todas as assinaturas. Não é signed_at: o contrato fecha com o PDF assinado na ficha.';

alter table public.clients add column if not exists contrato_assinado_em timestamptz;
comment on column public.clients.contrato_assinado_em is
  'Última vez que a D4Sign fechou as assinaturas de um contrato deste cliente.';

commit;
notify pgrst, 'reload schema';
