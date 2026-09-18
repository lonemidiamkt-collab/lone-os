#!/bin/bash
# E2E NO NAVEGADOR (VPS): login como social descartável → /social › Board → Novo Conteúdo → "A fazer",
# UM clique cada, sem reload, com rede lenta e busca em voo. Confere tela, banco e trilha_navegador.
# Uso (na VPS): scp scripts/qa/social-criar-e-a-fazer.* root@vps:/tmp/ && bash /tmp/social-criar-e-a-fazer.sh
# Espera: card na tela em 5 s; "A fazer · na fila" sem botão; 1 demanda; content_cards.design_request_id
# preenchido; trilha com novo-conteudo:submit → card:criar:ok → a-fazer:clique → demanda:criar:ok → a-fazer:ok.
set -e; cd /opt/loneos
SRV=$(grep -h "^SUPABASE_SERVICE_ROLE_KEY=" .env | cut -d= -f2- | tr -d '"'); K=http://127.0.0.1:8000; TOKB=$(grep -h "^BROWSERLESS_TOKEN=" .env | cut -d= -f2- | tr -d '"')
EMAIL="qa-social-$(date +%s)@lonemidia.com"; PASS="Qa!$(openssl rand -hex 8)"
UID_=$(curl -s -X POST "$K/auth/v1/admin/users" -H "apikey: $SRV" -H "Authorization: Bearer $SRV" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
docker exec supabase-db-1 psql -U postgres -d loneos -tAq -c "insert into team_members (name, role, email, is_active) values ('QA Social', 'social', '$EMAIL', true)" >/dev/null
ANTES=$(docker exec supabase-db-1 psql -U postgres -d loneos -tA -c "select coalesce(assigned_social,'') from clients where name='🧪 Agente CS (teste)'")
docker exec supabase-db-1 psql -U postgres -d loneos -tAq -c "update clients set assigned_social='QA Social' where name='🧪 Agente CS (teste)'" >/dev/null
limpar() { curl -s -X DELETE "$K/auth/v1/admin/users/$UID_" -H "apikey: $SRV" -H "Authorization: Bearer $SRV" >/dev/null; docker exec supabase-db-1 psql -U postgres -d loneos -tAq -c "delete from team_members where email='$EMAIL'; update clients set assigned_social=nullif('$ANTES','') where name='🧪 Agente CS (teste)'" >/dev/null; }
trap limpar EXIT
sed "s/__PASS__/$PASS/" /tmp/social-criar-e-a-fazer.browser.js > /tmp/social-criar-e-a-fazer.run.js
curl -s -m 170 -X POST "http://172.16.2.3:3000/function?token=$TOKB&timeout=120000" -H "Content-Type: application/javascript" --data-binary @/tmp/social-criar-e-a-fazer.run.js -o /tmp/social-criar-e-a-fazer.out -w "HTTP %{http_code}\n"
python3 - <<PY
import json
try: d=json.load(open("/tmp/social-criar-e-a-fazer.out"))
except Exception: print(open("/tmp/social-criar-e-a-fazer.out").read()[:1500]); raise SystemExit
for p in d.get("passos",[]): print("PASSO", json.dumps(p, ensure_ascii=False)[:600])
print("REQS:"); [print("  ", r) for r in d.get("reqs",[])]
print("LOG:"); [print("  ", l) for l in d.get("log",[])[:8]]
print("TITULO:", d.get("titulo"))
PY
T=$(python3 -c 'import json;print(json.load(open("/tmp/social-criar-e-a-fazer.out")).get("titulo",""))')
echo "── BANCO ──"
docker exec supabase-db-1 psql -U postgres -d loneos -tA -c "select 'card: '||count(*)||' | dr_id no card: '||coalesce(string_agg(coalesce(design_request_id::text,'∅'),','),'-') from content_cards where title='$T'"
docker exec supabase-db-1 psql -U postgres -d loneos -tA -c "select 'demandas: '||count(*)||' | card vinculado: '||coalesce(string_agg((content_card_id is not null)::text,','),'-') from design_requests where title='Arte: $T'"
echo "── TRILHA ──"
docker exec supabase-db-1 psql -U postgres -d loneos -tA -c "select to_char(created_at at time zone 'America/Sao_Paulo','HH24:MI:SS'), acao, left(detalhe::text,140) from trilha_navegador where quem='$EMAIL' order by id"
