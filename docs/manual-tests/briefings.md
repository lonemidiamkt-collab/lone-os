# Testes Manuais — Banco de Briefings

## Pré-requisito
Migration 043 aplicada. App rodando localmente ou em produção.

---

## Bloco A — Schema (pós-migration, antes da API)

Execute via psql ou Supabase Studio.

### A1. Tabela existe com colunas corretas
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'client_briefings'
ORDER BY ordinal_position;
```
**Esperado:** 33 colunas listadas, sem erro.

### A2. Índices criados
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'client_briefings'
ORDER BY indexname;
```
**Esperado:** 5 índices:
- `client_briefings_pkey`
- `idx_client_briefings_one_current` (partial: WHERE is_current = true)
- `idx_client_briefings_client_id`
- `idx_client_briefings_created_at`
- `idx_client_briefings_client_version`
- `uq_client_version` (unique constraint)

### A3. RLS ativa
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'client_briefings';
```
**Esperado:** `rowsecurity = true`

### A4. Policies criadas
```sql
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'client_briefings';
```
**Esperado:** 2 policies:
- `briefings_read_authenticated` — SELECT — authenticated
- `briefings_write_service_role` — ALL — service_role

### A5. Função de completude existe e é IMMUTABLE
```sql
SELECT proname, provolatile
FROM pg_proc
WHERE proname = 'calculate_briefing_completeness';
```
**Esperado:** `provolatile = 'i'` (i = IMMUTABLE)

### A6. View existe
```sql
SELECT viewname FROM pg_views WHERE viewname = 'current_client_briefings';
```
**Esperado:** 1 linha retornada.

### A7. View retorna vazio (sem briefings ainda)
```sql
SELECT COUNT(*) FROM current_client_briefings;
```
**Esperado:** `0`

---

## Bloco B — RLS (inserção direta via psql como authenticated)

### B1. SELECT como authenticated — deve funcionar
```sql
SET ROLE authenticated;
SELECT COUNT(*) FROM client_briefings;
-- Esperado: 0 (sem erro)
RESET ROLE;
```

### B2. INSERT como authenticated — deve falhar
```sql
SET ROLE authenticated;
INSERT INTO client_briefings (client_id, version, is_current)
VALUES (gen_random_uuid(), 1, true);
-- Esperado: ERROR: new row violates row-level security policy
RESET ROLE;
```

### B3. INSERT como service_role — deve funcionar
```sql
-- (já é o comportamento padrão do psql como postgres/service_role)
-- Inserir registro de teste com um client_id válido:
INSERT INTO client_briefings (client_id, version, is_current, resumo_estrategico)
VALUES (
  (SELECT id FROM clients LIMIT 1),
  1,
  true,
  'briefing de teste RLS'
)
RETURNING id, version, completeness_percent; -- completeness via função
-- Esperado: linha inserida, completeness_percent = 5 (1/21 campos)

-- Limpar após teste:
DELETE FROM client_briefings WHERE resumo_estrategico = 'briefing de teste RLS';
```

### B4. Constraint UNIQUE (client_id, version)
```sql
-- Inserir duas vezes com mesmo client_id e version:
DO $$
DECLARE v_client UUID := (SELECT id FROM clients LIMIT 1);
BEGIN
  INSERT INTO client_briefings (client_id, version, is_current) VALUES (v_client, 99, false);
  INSERT INTO client_briefings (client_id, version, is_current) VALUES (v_client, 99, false);
END $$;
-- Esperado: ERROR: duplicate key value violates unique constraint "uq_client_version"
-- Limpar:
DELETE FROM client_briefings WHERE version = 99;
```

### B5. Índice partial: só 1 is_current por cliente
```sql
DO $$
DECLARE v_client UUID := (SELECT id FROM clients LIMIT 1);
BEGIN
  INSERT INTO client_briefings (client_id, version, is_current) VALUES (v_client, 10, true);
  INSERT INTO client_briefings (client_id, version, is_current) VALUES (v_client, 11, true);
END $$;
-- Esperado: ERROR: duplicate key value violates unique constraint "idx_client_briefings_one_current"
-- Limpar:
DELETE FROM client_briefings WHERE version IN (10, 11);
```

### B6. Constraint enum tom_voz
```sql
INSERT INTO client_briefings (client_id, version, is_current, tom_voz)
VALUES ((SELECT id FROM clients LIMIT 1), 20, false, 'invalido');
-- Esperado: ERROR: new row for relation "client_briefings" violates check constraint "chk_tom_voz"
-- (sem limpeza necessária — insert falhou)
```

---

## Bloco C — Função de completude

### C1. Briefing vazio → 0%
```sql
SELECT calculate_briefing_completeness(cb)
FROM client_briefings cb
WHERE version = 1 -- ajustar para um id real após inserção de teste
LIMIT 1;
-- Se todos campos NULL/vazio: esperado 0
```

### C2. Cálculo com campos preenchidos
Após inserir via API (Fase 2), verificar que completeness_percent
aumenta proporcionalmente a cada campo preenchido.
Referência: cada campo vale ~4.76% (1/21 × 100).

---

## Bloco D — View current_client_briefings

### D1. Retorna NULL para created_by_name quando created_by é NULL
```sql
INSERT INTO client_briefings (client_id, version, is_current, created_by)
VALUES ((SELECT id FROM clients LIMIT 1), 30, true, NULL)
RETURNING id;

SELECT created_by_name FROM current_client_briefings
WHERE client_id = (SELECT id FROM clients LIMIT 1);
-- Esperado: created_by_name = NULL (não erro)

DELETE FROM client_briefings WHERE version = 30;
```

### D2. View não retorna versões antigas (is_current = false)
```sql
DO $$
DECLARE v_client UUID := (SELECT id FROM clients OFFSET 1 LIMIT 1);
BEGIN
  INSERT INTO client_briefings (client_id, version, is_current) VALUES (v_client, 1, false);
  INSERT INTO client_briefings (client_id, version, is_current) VALUES (v_client, 2, true);
END $$;

SELECT COUNT(*) FROM current_client_briefings
WHERE client_id = (SELECT id FROM clients OFFSET 1 LIMIT 1);
-- Esperado: 1 (apenas a versão 2)

DELETE FROM client_briefings
WHERE client_id = (SELECT id FROM clients OFFSET 1 LIMIT 1);
```

---

## Rollback

Se a migration precisar ser revertida:

```sql
-- ROLLBACK 043 — executar na ordem inversa
DROP VIEW  IF EXISTS current_client_briefings;
DROP FUNCTION IF EXISTS calculate_briefing_completeness(client_briefings);
DROP TABLE IF EXISTS client_briefings;
```

**Atenção:** o DROP TABLE remove todos os dados de briefings inseridos.
Fazer backup antes se já houver dados em produção.
