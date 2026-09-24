-- LEVA 4 — TRÁFEGO (24/09/2026). Duas peças, as duas para tirar dado do navegador.
--
-- 1) meta_campaign_cache — a aba "Anúncios Meta" chamava a Meta direto do browser (~3 chamadas por
--    campanha, a cada visita, com o token da agência no navegador). Agora o servidor busca
--    (lib/trafego/anuncios-server.ts, a mesma leitura do relatório semanal), guarda aqui por
--    cliente+período e a aba só lê. "Atualizar agora" regrava a linha; falha guarda o erro e
--    MANTÉM a última leitura boa (nunca vira zero).
--
-- 2) clients.next_payment_date — a "Data do próximo aporte" (Pix/Boleto) do antigo Controle de
--    Investimento vivia só no localStorage de quem digitou. Vira coluna; a tela Contas & Verba é o
--    único lugar que edita verba, forma de pagamento e aporte.
--
-- Idempotente. Antes de rodar, o painel funciona igual: a aba mantém a leitura em memória do
-- servidor e a data do aporte fica sem salvar (a tela avisa).

create table if not exists public.meta_campaign_cache (
  client_id uuid not null references public.clients(id) on delete cascade,
  -- "7d" | "14d" | "30d" | "90d" | "AAAA-MM-DD_AAAA-MM-DD" (lib/trafego/anuncios.ts → chavePeriodo)
  period text not null,
  meta_ad_account_id text,
  -- Saída de fetchCampaignInsights (lib/meta/insights-server.ts), crua: o mapeamento é feito na leitura.
  campaigns jsonb not null default '[]'::jsonb,
  demographics jsonb,
  -- Última leitura BOA. É o "atualizado há X min" da tela.
  synced_at timestamptz,
  -- Última tentativa (boa ou não). É por ela que conta o intervalo mínimo entre atualizações.
  attempted_at timestamptz,
  -- NULL = última tentativa deu certo · 'token_invalido' = a Meta recusou o token · outro texto = falha.
  error text,
  primary key (client_id, period)
);

create index if not exists idx_meta_campaign_cache_period on public.meta_campaign_cache (period, synced_at desc);

-- Só o service role lê/escreve (as rotas /api/trafego/anuncios checam o papel). RLS ligada, sem policy.
alter table public.meta_campaign_cache enable row level security;

comment on table public.meta_campaign_cache is 'Campanhas Meta por cliente+período, lidas pelo servidor. A aba Anúncios Meta só lê daqui.';

alter table public.clients add column if not exists next_payment_date date;
comment on column public.clients.next_payment_date is 'Próximo aporte (Pix/Boleto) na conta de anúncio. Editado em Tráfego › Contas & Verba.';

notify pgrst, 'reload schema';
