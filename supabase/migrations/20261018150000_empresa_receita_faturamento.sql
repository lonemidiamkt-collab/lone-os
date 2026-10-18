-- Cadastro inteligente pelo CNPJ (18/10/2026) — ver lib/empresa/receita.ts.
--
-- O que a Receita Federal diz da empresa (via BrasilAPI) e a faixa de faturamento que o PRÓPRIO
-- cliente declara. São coisas diferentes de propósito: a Receita não informa faturamento; o porte
-- (MEI/ME/EPP/Demais) é enquadramento legal com teto anual, uma pista — nunca o faturamento.
--
-- Mesmas colunas no cadastro em andamento (client_onboarding_submissions) e no cliente (clients):
-- o envio do formulário copia de um para o outro, como já faz com razão social e CNPJ.

do $$
declare t text;
begin
  foreach t in array array['clients', 'client_onboarding_submissions'] loop
    execute format('alter table public.%I add column if not exists faturamento_faixa text', t);
    execute format('alter table public.%I add column if not exists porte_receita text', t);
    execute format('alter table public.%I add column if not exists cnae_principal text', t);
    execute format('alter table public.%I add column if not exists cnae_descricao text', t);
    execute format('alter table public.%I add column if not exists cnaes_secundarios jsonb', t);
    execute format('alter table public.%I add column if not exists capital_social numeric', t);
    execute format('alter table public.%I add column if not exists situacao_cadastral text', t);
    execute format('alter table public.%I add column if not exists receita_consultada_em timestamptz', t);

    execute format('alter table public.%I drop constraint if exists %I', t, t || '_faturamento_faixa_check');
    execute format($c$alter table public.%I add constraint %I check (faturamento_faixa is null or faturamento_faixa in
      ('ate_30k','30k_50k','50k_100k','100k_200k','200k_500k','acima_500k','nao_informado'))$c$, t, t || '_faturamento_faixa_check');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_porte_receita_check');
    execute format($c$alter table public.%I add constraint %I check (porte_receita is null or porte_receita in ('MEI','ME','EPP','DEMAIS'))$c$,
      t, t || '_porte_receita_check');
  end loop;
end $$;

comment on column public.clients.faturamento_faixa is 'Faturamento médio MENSAL declarado pelo cliente (faixa). Não vem da Receita.';
comment on column public.clients.porte_receita is 'Enquadramento na Receita (MEI/ME/EPP/DEMAIS): teto legal anual, não faturamento.';

notify pgrst, 'reload schema';
