-- Por que uma regra saiu do ar.
--
-- A faxina de 02/09 desativou 148 das 363 regras ativas. Sem registrar o motivo, daqui a três meses
-- ninguém sabe se aquilo foi decisão, engano ou bug — e a primeira tentativa de gravar isso em
-- `origem` bateu no CHECK da coluna, que só aceita valores conhecidos. Motivo tem coluna própria.
ALTER TABLE cs_client_rules ADD COLUMN IF NOT EXISTS motivo_desativacao text;
ALTER TABLE cs_client_rules ADD COLUMN IF NOT EXISTS desativada_em timestamptz;
COMMENT ON COLUMN cs_client_rules.motivo_desativacao IS
  'Por que saiu do ar: anuncio_vazio, processo_interno, generica, catalogo, promocao, efemero, narrativa — ou texto livre quando foi decisão humana.';
