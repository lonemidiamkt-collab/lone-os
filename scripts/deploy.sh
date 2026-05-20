#!/bin/bash
# deploy.sh — Script oficial de deploy do Lone OS na VPS
#
# Uso:
#   Local → VPS:  bash scripts/deploy.sh
#   Na VPS:       cd /opt/loneos && bash scripts/deploy.sh
#
# O script executa EXATAMENTE o fluxo correto, incluindo --env-file .env
# para que as variáveis NEXT_PUBLIC_* sejam passadas como build args.
#
# NUNCA substituir por: git reset --hard, docker build sem --env-file,
# ou docker-compose sem o arquivo correto.

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"
SERVICE="app"

echo ""
echo "=== Lone OS Deploy ==="
echo "Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 1. Garantir que está no diretório correto
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERRO: $COMPOSE_FILE não encontrado. Execute na raiz /opt/loneos."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: $ENV_FILE não encontrado. Sem esse arquivo não há segredos para o build."
  exit 1
fi

# 2. Atualizar código
echo "[1/4] Atualizando código (git pull)..."
git pull origin main
echo "Commit atual: $(git log --oneline -1)"

# 3. Build com variáveis corretas — --env-file é OBRIGATÓRIO
echo ""
echo "[2/4] Buildando imagem Docker (com --env-file para NEXT_PUBLIC_* vars)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build "$SERVICE"

# 4. Restart
echo ""
echo "[3/4] Reiniciando container..."
docker compose -f "$COMPOSE_FILE" up -d "$SERVICE"

# 5. Verificação de saúde
echo ""
echo "[4/4] Verificando saúde do container..."
sleep 5
STATUS=$(docker inspect --format='{{.State.Status}}' loneos-app-1 2>/dev/null || echo "unknown")
echo "Status: $STATUS"
docker logs loneos-app-1 --tail 5 2>&1

echo ""
if [[ "$STATUS" == "running" ]]; then
  echo "✓ Deploy concluído com sucesso."
  echo "  URL: https://painel.lonemidia.com"
else
  echo "✗ Container não está running. Verifique os logs acima."
  exit 1
fi
