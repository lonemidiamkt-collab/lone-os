-- Cadastro pelo link (23/10/2026): número e complemento do endereço.
-- POR QUE: o formulário não tinha campo de número — o CEP preenchia a rua sozinho e o número nunca era pedido; dos
-- clientes ativos, 18 tinham CEP e rua e só 3 tinham número (digitado à mão). clients já tem endereco_numero e
-- endereco_complemento; a tabela do formulário não tinha onde guardar.
alter table public.client_onboarding_submissions add column if not exists endereco_numero text;
alter table public.client_onboarding_submissions add column if not exists endereco_complemento text;

-- Clientes antigos: quando o número foi digitado junto da rua ("Rua das Flores, 123" / "Av. Brasil nº 45"), separa.
update public.clients
set endereco_numero = substring(endereco_rua from '(?:,|\snº|\sn°|\sno\.)\s*(\d+[A-Za-z]?)\s*$')
where endereco_numero is null
  and endereco_rua ~ '(?:,|\snº|\sn°|\sno\.)\s*\d+[A-Za-z]?\s*$';

notify pgrst, 'reload schema';
