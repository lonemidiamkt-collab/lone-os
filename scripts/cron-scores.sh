#!/bin/bash
# Grava a saúde de TODOS os clientes com o breakdown (componentes + sinais do Loninho).
#
# A rota /api/scores não fica sob /api/system, então tem script próprio em vez do cron-call.sh.
# Cron: `20 9 * * *` (6h20 BRT) — depois do ig-snapshots das 6h, que atualiza os posts que
# alimentam o componente de entrega.
CRON_SECRET=$(grep "^CRON_SECRET=" /opt/loneos/.env | cut -d"=" -f2)
curl -s -m 300 -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/scores?gravar=1" \
  | head -c 400
echo
