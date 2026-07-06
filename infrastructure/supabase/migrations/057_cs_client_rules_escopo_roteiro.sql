-- 057_cs_client_rules_escopo_roteiro.sql — permite escopo 'roteiro' nas regras do cliente
-- (preferências de estilo de roteiro aprendidas pelo Agente Lone). Aplicar manual no banco.
ALTER TABLE cs_client_rules DROP CONSTRAINT IF EXISTS chk_escopo;
ALTER TABLE cs_client_rules ADD CONSTRAINT chk_escopo
  CHECK (escopo = ANY (ARRAY['sempre','promocao','arte','social','trafego','roteiro']));
