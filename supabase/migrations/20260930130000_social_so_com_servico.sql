-- 20260930130000_social_so_com_servico.sql — SOCIAL MEDIA SÓ EM QUEM CONTRATOU SOCIAL.
--
-- Roberto (30/09/2026): "mesmo selecionando a assessoria de tráfego pago, ainda alguns clientes
-- estão aparecendo nos boards do social media, principalmente o Dr. Júnior e JP Barbearia
-- aparecendo para o social media Carlos."
--
-- Os dois são `assessoria_trafego` com `assigned_social = 'Carlos Augusto'`. O cadastro de cliente
-- novo já limpava o social de quem é só tráfego; o que não limpava era a TROCA de serviço depois:
-- o formulário de edição mantém quem já estava gravado (de propósito — campo escondido não pode
-- apagar dado) e não oferecia opção vazia pra tirar. Resultado: o social ficava pra sempre.
--
-- Uns 60 lugares leem `assigned_social` (quadro do social, cobrança do agente, saúde da carteira,
-- PDFs por responsável…). Consertar leitor por leitor é enxugar gelo; o dado é que está errado.
-- Então a regra mora aqui, no banco, e vale para QUALQUER caminho de gravação.
--
-- O conjunto espelha COM_SOCIAL de lib/clients/servico.ts — mudou lá, muda aqui.

create or replace function public.limpar_social_sem_servico()
returns trigger
language plpgsql
as $$
begin
  if coalesce(lower(trim(new.service_type)), '') not in
     ('lone_growth', 'assessoria_social', 'trafego_social_site', 'assessoria_design') then
    new.assigned_social := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_social_so_com_servico on public.clients;
create trigger trg_social_so_com_servico
  before insert or update of service_type, assigned_social on public.clients
  for each row execute function public.limpar_social_sem_servico();

-- Quem já está errado hoje (30/09: DR. JUNIOR VARGAS e JP barbearia). Passa pelo gatilho acima.
update public.clients
   set assigned_social = null
 where coalesce(lower(trim(service_type)), '') not in
       ('lone_growth', 'assessoria_social', 'trafego_social_site', 'assessoria_design')
   and nullif(trim(assigned_social), '') is not null;
