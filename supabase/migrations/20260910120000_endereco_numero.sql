-- 10/09/2026 — Roberto, revisando o contrato do Max (Celmapel): "Rua Iza Domingues Eurico, Centro,
-- Araruama/RJ, CEP 28979-162. Não aparece número do imóvel."
--
-- Fui olhar o schema: não existia coluna de número. O endereço do contrato era montado com
-- endereco_rua + bairro + cidade/UF + CEP, então o número só apareceria se alguém o tivesse digitado
-- dentro do nome da rua. Não é falha de preenchimento de um cadastro — é lacuna do modelo de dados,
-- e valia para os 52 clientes.
alter table clients add column if not exists endereco_numero text;
alter table clients add column if not exists endereco_complemento text;

comment on column clients.endereco_numero is 'Número do imóvel. Contrato exige — sem ele o endereço da CONTRATANTE fica incompleto.';
comment on column clients.endereco_complemento is 'Sala, loja, andar, bloco. Opcional.';

-- Resgata o número quando já foi digitado junto da rua ("Rua X, 120" / "Av. Y 45"), para não
-- obrigar a redigitar 52 endereços. Só quando o final da string é claramente um número de imóvel.
update clients
   set endereco_numero = trim(substring(endereco_rua from ',?\s*(\d{1,6})\s*$')),
       endereco_rua = trim(trailing ' ,' from regexp_replace(endereco_rua, ',?\s*\d{1,6}\s*$', ''))
 where endereco_numero is null
   and endereco_rua ~ ',?\s*\d{1,6}\s*$';
