# Portal de Resultados — Documentação

Portal público interativo onde clientes acessam seus resultados de anúncios via link único.
Não requer login. Acesso por token UUID gerado internamente.

---

## URL pública

```
https://resultados.lonemidia.com/portal/{token}
```

O token é um UUID v4 gerado via `crypto.randomUUID()` e armazenado em `clients.public_report_token`.

---

## Rota no Next.js

```
app/portal/[token]/page.tsx   ← Server Component (Phase 3)
```

Deployed sob o subdomínio `resultados.lonemidia.com`. O Nginx redireciona o subdomínio
para a mesma app Next.js (`painel.lonemidia.com`), que responde pela rota `/portal/[token]`.

---

## Variáveis de ambiente

| Variável | Onde | Descrição |
|----------|------|-----------|
| `NEXT_PUBLIC_PORTAL_DOMAIN` | cliente + servidor | URL base do portal (ex: `https://resultados.lonemidia.com`) |

Adicionar ao `.env.local` em desenvolvimento e ao arquivo de environment do VPS em produção.

---

## Infraestrutura

### Cloudflare
Adicionar registro CNAME no painel Cloudflare da `lonemidia.com`:
- **Name**: `resultados`
- **Target**: `painel.lonemidia.com`
- **Proxy**: ativado (modo laranja)

### Nginx (VPS)
Adicionar bloco ao `nginx.conf`:

```nginx
server {
    listen 80;
    server_name resultados.lonemidia.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

SSL é gerenciado pelo Cloudflare proxy — nenhum certificado local necessário.

---

## API Routes

Todas as rotas abaixo ficam em `app/api/clients/[id]/portal/`.

| Método | Rota | Role | Descrição |
|--------|------|------|-----------|
| POST | `generate-token` | admin/manager | Gera token UUID, ativa portal |
| POST | `revoke` | admin/manager | Revoga token, desativa portal |
| POST | `rotate` | admin | Revoga e gera novo token atomicamente |
| PATCH | `settings` | admin/manager | Atualiza `whatsapp_team_phone` e `portal_welcome_message` |
| GET | `stats` | autenticado | Retorna `total_accesses` e `last_accessed_at` |

---

## Tabelas

| Tabela | Descrição |
|--------|-----------|
| `clients` | Campos `public_report_*`, `whatsapp_team_phone`, `portal_welcome_message` |
| `client_report_snapshots` | Cache de snapshots por período (`period_kind`) |
| `agency_actions` | Timeline manual da agência visível ao cliente |
| `public_report_access_log` | Log de acessos (ip_truncated, was_valid) — LGPD |

Migração: `infrastructure/supabase/migrations/042_public_report_portal.sql`

---

## Segurança

- O portal **não usa RLS**. A rota `app/portal/[token]/page.tsx` (Server Component)
  acessa o banco via `supabaseAdmin` (service_role) após validar o token.
- Token inválido ou `public_report_token_revoked_at IS NOT NULL` → 404 customizado.
- Log de acesso registra IP truncado ao /24 (sem quarto octeto) — compliance LGPD.
- Headers de resposta: `X-Robots-Tag: noindex`, `Cache-Control: private, no-cache`.

---

## Cron

```
# Gerar snapshots diariamente às 06:00 BRT (09:00 UTC)
0 9 * * * curl -s -X POST https://painel.lonemidia.com/api/system/generate-snapshots \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/loneos-snapshots.log 2>&1
```

- `last_week`: gerado todo dia
- `last_month`: gerado apenas no dia 1 de cada mês

---

## Checklist pré-lançamento

Ver `docs/PORTAL_TODO_BEFORE_LAUNCH.md`.
