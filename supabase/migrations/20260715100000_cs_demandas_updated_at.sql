-- updated_at: rastreia o último REPOST de uma demanda pendente (debounce da rajada do Agente CS).
-- Só é setado quando o agente reposta o "🔁 juntei" — assim o repost sai no máx. 1x/90s por demanda.
ALTER TABLE cs_demandas ADD COLUMN IF NOT EXISTS updated_at timestamptz;
