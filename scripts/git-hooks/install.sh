#!/usr/bin/env bash
# Instala os git hooks do projeto em .git/hooks/
# Executar após clonar o repositório em nova máquina.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_SRC="$REPO_ROOT/scripts/git-hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

cp "$HOOKS_SRC/pre-commit" "$HOOKS_DST/pre-commit"
chmod +x "$HOOKS_DST/pre-commit"

echo "✓ pre-commit hook instalado em $HOOKS_DST/pre-commit"
