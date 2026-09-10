-- 10/09/2026 — Roberto: "o sistema ainda não entende que são dois designers diferentes e que cada um
-- deve ter sua tela (...) o designer Rhodrigo está vendo as coisas do designer Gabriel."
--
-- A causa: `design_requests` não tinha NENHUMA coluna de designer. O board do designer filtrava os
-- cards por `clients.assigned_designer`, mas as DEMANDAS vinham todas, com um comentário no código
-- dizendo "o designer da agência atende todos os clientes" — verdade quando havia um só. O contorno
-- que sobrou foi escrever o nome no título: 13 demandas com "[Gabriel]", "[Rodrigo]", "[TESTE]".
--
-- Modelo: NULL = a demanda é de quem cuida do cliente (clients.assigned_designer). Preenchido =
-- alguém assumiu essa demanda específica, e aí manda o campo. Assim o padrão acompanha a carteira
-- sozinho e a exceção (um ajuda o outro) fica registrada.
alter table design_requests add column if not exists assigned_designer text;

comment on column design_requests.assigned_designer is
  'Designer dono desta demanda. NULL = herda de clients.assigned_designer. Preencher só quando alguém assume uma demanda que não é da sua carteira.';

create index if not exists idx_design_requests_designer on design_requests (assigned_designer);

-- Migra o contorno manual: "[Gabriel] SEX 11 - Quatree" vira assigned_designer='Gabriel Sodre' com
-- o título limpo. Casa o prefixo com o PRIMEIRO NOME do time — no cadastro ele é "Gabriel Sodre",
-- no título estava "Gabriel", e é por isso que os dois nunca bateram.
update design_requests d
   set assigned_designer = t.name,
       title = trim(regexp_replace(d.title, '\[[A-Za-z]+\]\s*', '', 'g'))
  from team_members t
 where d.assigned_designer is null
   and d.title ~ '\[[A-Za-z]+\]'
   and lower(split_part(t.name, ' ', 1)) = lower(substring(d.title from '\[([A-Za-z]+)\]'));
