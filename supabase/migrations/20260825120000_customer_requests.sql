-- customer_requests — a pergunta do cliente vira ENTIDADE, não conclusão a ser reconstruída.
--
-- PRA QUE (análise de arquitetura revisada com o Roberto, 25/08/2026): hoje o sistema sabe que uma
-- mensagem chegou, mas não existe nada no banco dizendo "esta pergunta está aberta há 37 minutos e
-- ninguém assumiu". Descobrir isso exige varrer o corpus e inferir toda vez.
--
-- Uma MENSAGEM é algo que aconteceu. Uma REQUEST continua existindo até ser resolvida.
--
-- DELIBERADAMENTE MÍNIMA. A proposta original previa ~20 tabelas novas (threads, people, ai_runs,
-- ai_decisions…). Para 50 clientes e ~200 perguntas/mês no expediente, isso é fundação cara demais
-- para o valor: a tabela que não existe não tem bug, e a que existe precisa ser mantida. Começa com
-- o que responde à pergunta de negócio — "o que está aberto e há quanto tempo?" — e cresce sob
-- demanda real.

create table if not exists customer_requests (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  group_jid           text not null,

  -- De onde veio. Guarda o texto junto: o corpus é podado e a request precisa sobreviver a isso.
  origin_message_id   text,
  origin_text         text not null,
  author_name         text,

  -- O que é. `topico` decide quem sabe responder e de qual fonte de fato.
  tipo                text not null default 'pergunta'
                      check (tipo in ('pergunta','pedido','informacao')),
  topico              text not null default 'outro'
                      check (topico in ('anuncio','arte','prazo','financeiro','outro')),

  -- ESTADO. "respondida" não é o mesmo que "alguém falou depois": um "bom dia" no grupo não
  -- responde "os anúncios estão rodando?". Só 1,5% dos casos medidos, mas o modelo não deve
  -- depender de proximidade temporal para decidir se houve resposta.
  status              text not null default 'aberta'
                      check (status in ('aberta','respondida','expirada','descartada')),

  aberta_em           timestamptz not null default now(),
  vence_em            timestamptz not null,
  respondida_em       timestamptz,
  resposta_message_id text,
  respondida_por      text,

  -- Quem fechou: o time, o agente, ou o tempo. Sem isto não dá pra medir se o agente ajudou.
  fechada_por         text check (fechada_por in ('time','agente','tempo','descarte')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- A consulta quente é sempre "o que está aberto e já venceu".
create index if not exists idx_customer_requests_abertas
  on customer_requests (vence_em) where status = 'aberta';
create index if not exists idx_customer_requests_cliente
  on customer_requests (client_id, aberta_em desc);
-- Uma mensagem gera no máximo uma request: o webhook do WhatsApp reenvia o mesmo evento.
create unique index if not exists uq_customer_requests_origem
  on customer_requests (origin_message_id) where origin_message_id is not null;

alter table customer_requests enable row level security;

drop policy if exists customer_requests_read on customer_requests;
create policy customer_requests_read on customer_requests
  for select to authenticated using (true);

comment on table customer_requests is
  'Pergunta/pedido do cliente que continua aberto ate ser resolvido. Alimenta o SLA e o alerta de ninguem respondeu.';
