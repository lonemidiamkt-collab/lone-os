-- Fase 0.4 — o status "Bloqueado" existe no CÓDIGO mas NÃO no enum do banco.
-- Sintoma: mover um card pra coluna "Bloqueado (Design)" falhava em SILÊNCIO (o UPDATE era
-- rejeitado pelo Postgres e a UI seguia como se tivesse dado certo).
-- Usado em: app/social/page.tsx (coluna do kanban), lib/context/AppStateContext.tsx (máquina de
-- estados), app/api/cs/inbound/route.ts. Enum original: 001_initial_schema.sql:13.
-- ALTER TYPE ... ADD VALUE é idempotente com IF NOT EXISTS (PG 12+).
ALTER TYPE content_status ADD VALUE IF NOT EXISTS 'blocked' AFTER 'in_production';
