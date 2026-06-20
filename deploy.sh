#!/bin/bash
set -e

echo "==> Puxando atualizações..."
# Puxa a branch que está realmente em checkout no VPS (produção roda deploy/budget-only,
# não main). Hardcodar "main" fazia o deploy puxar a branch errada.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "    branch: $BRANCH"
git pull origin "$BRANCH"

echo "==> Reconstruindo containers..."
docker compose -f docker-compose.prod.yml up -d --build app

echo "==> Recarregando schema cache do PostgREST..."
docker exec supabase-db-1 psql -U postgres -d loneos -c "NOTIFY pgrst, 'reload schema';"

echo "==> Deploy finalizado com sucesso!"
