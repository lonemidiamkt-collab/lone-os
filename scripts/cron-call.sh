#!/bin/bash
# Wrapper de cron: chama /api/system/<endpoint> com o CRON_SECRET no header.
# Uso: cron-call.sh <endpoint> [METHOD]   (METHOD default = POST)
#
# Central de Automações (/automations): antes de chamar, pergunta se o job está ligado
# (automacoes/pode-rodar); depois, registra duração, HTTP e o começo da resposta
# (automacoes/registrar). A Central fora do ar NUNCA impede o job de rodar.
#   CRON_JOB=<nome>  registra com outro nome (padrão: o endpoint sem a query)
#   CRON_JOB=-       chama sem portão nem registro (chamada interna de outro script)
#   CRON_MAX_TIME=N  tempo máximo da chamada, em segundos (padrão: sem limite, como antes)
# A saída continua sendo só o corpo da resposta — os logs e os scripts que leem ela não mudam.
ENDPOINT="$1"
METHOD="${2:-POST}"
BASE="http://localhost:3000/api/system"
CRON_SECRET=$(grep "^CRON_SECRET=" /opt/loneos/.env | cut -d"=" -f2)
JOB="${CRON_JOB:-${ENDPOINT%%\?*}}"

chamar() {
  curl -s ${CRON_MAX_TIME:+-m "$CRON_MAX_TIME"} -X "$METHOD" "$BASE/$ENDPOINT" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" "$@"
}

# Nome fora do padrão (ou CRON_JOB=-): chamada simples, como sempre foi.
case "$JOB" in
  ""|-|*[!a-z0-9/_-]*) chamar; exit $? ;;
esac

agora_ms() {
  local t
  t=$(date +%s%3N 2>/dev/null)
  case "$t" in ""|*[!0-9]*) echo $(( $(date +%s) * 1000 )) ;; *) echo "$t" ;; esac
}

registrar() {
  curl -s -m 10 -X POST "$BASE/automacoes/registrar" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    --data-binary "$1" > /dev/null 2>&1 || true
}

INICIO_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ── Portão: desligado/pausado na Central? ────────────────────────────────────
PODE=$(curl -s -m 10 "$BASE/automacoes/pode-rodar?job=$JOB" -H "Authorization: Bearer $CRON_SECRET" 2>/dev/null || true)
if printf '%s' "$PODE" | grep -q '"rodar":false'; then
  MOTIVO=$(printf '%s' "$PODE" | sed -n 's/.*"motivo":"\([^"]*\)".*/\1/p')
  echo "[cron-call] $JOB pulado: ${MOTIVO:-desligado na Central de Automações}" >&2
  registrar "{\"job\":\"$JOB\",\"skipped\":true,\"started_at\":\"$INICIO_ISO\"}"
  exit 0
fi

# ── Execução ─────────────────────────────────────────────────────────────────
CORPO=$(mktemp 2>/dev/null || echo "/tmp/cron-call.$$")
trap 'rm -f "$CORPO"' EXIT
T0=$(agora_ms)
HTTP=$(chamar -o "$CORPO" -w '%{http_code}')
RC=$?
T1=$(agora_ms)
cat "$CORPO"

# ── Registro (nunca derruba o job) ───────────────────────────────────────────
PAYLOAD=""
if command -v python3 > /dev/null 2>&1; then
  PAYLOAD=$(J="$JOB" INI="$INICIO_ISO" DUR="$((T1 - T0))" HC="${HTTP:-0}" python3 -c '
import json, os, sys
corpo = open(sys.argv[1], "rb").read().decode("utf-8", "replace")
ok = None
try:
    d = json.loads(corpo)
    if isinstance(d, dict) and isinstance(d.get("ok"), bool):
        ok = d["ok"]
except Exception:
    pass
hc = os.environ.get("HC", "0")
print(json.dumps({"job": os.environ["J"], "started_at": os.environ["INI"], "duration_ms": int(os.environ["DUR"]),
                  "http_status": int(hc) if hc.isdigit() else 0, "resumo": corpo[:300], "corpo_ok": ok}))
' "$CORPO" 2>/dev/null)
elif command -v jq > /dev/null 2>&1; then
  PAYLOAD=$(jq -n --arg job "$JOB" --arg ini "$INICIO_ISO" --argjson dur "$((T1 - T0))" \
    --argjson hc "$(( 10#${HTTP:-0} ))" --rawfile corpo "$CORPO" \
    '{job:$job, started_at:$ini, duration_ms:$dur, http_status:$hc, resumo:($corpo[0:300])}' 2>/dev/null)
fi
[ -n "$PAYLOAD" ] && registrar "$PAYLOAD"

exit $RC
