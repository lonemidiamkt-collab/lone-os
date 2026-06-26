-- A3 (redator): guarda o briefing rico gerado e o responsável resolvido por demanda.
ALTER TABLE cs_demandas ADD COLUMN IF NOT EXISTS briefing text;
ALTER TABLE cs_demandas ADD COLUMN IF NOT EXISTS responsavel text;
