#!/bin/bash
set -e

echo "==> Puxando atualizações..."
git pull origin main

echo "==> Reconstruindo containers..."
docker compose -f docker-compose.prod.yml up -d --build app

echo "==> Recarregando schema cache do PostgREST..."
docker exec supabase-db-1 psql -U postgres -d loneos -c "NOTIFY pgrst, 'reload schema';"

echo "==> Deploy finalizado com sucesso!"
