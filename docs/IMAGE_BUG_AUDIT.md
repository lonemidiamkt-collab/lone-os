# Image Pipeline Bug Audit

**Data:** 2026-05-13  
**Branch:** fix/image-pipeline  
**Status:** Fase 1 completa — aguardando aprovação para Fase 2

---

## Resumo executivo

**CAUSA A confirmada com evidência numérica em produção.**  
O upload de artes (`/api/upload-art`) usa `supabaseAdmin.storage.getPublicUrl()` que gera URLs com o hostname Docker interno (`http://supabase-kong-1:8000/...`). Este hostname é inacessível por qualquer browser. As URLs quebradas são persistidas no banco de dados e exibidas para todos os usuários — incluindo quem fez o upload (que "vê" via blob URL temporária durante o upload, não pela URL salva).

**Causas B, C e D: não confirmadas.** RLS do bucket `arts` é aberto para leitura, não há race condition de upload, e as páginas são client-side (não Server Components com caching).

---

## 1. Tabela de pontos de UPLOAD

| Local | Endpoint | Bucket | Tabela atualizada | Coluna | URL gerada | Bug? |
|-------|----------|--------|-------------------|--------|------------|------|
| Designer / Social — arte e referência | `POST /api/upload-art` | `arts` (public) | `content_cards` | `image_url` | `supabaseAdmin.getPublicUrl()` → **URL interna Docker** | ✅ **SIM** |
| Designer / Social — briefing attachments | `POST /api/upload-art` | `arts` (public) | `design_requests` | `attachments[]` | `supabaseAdmin.getPublicUrl()` → **URL interna Docker** | ✅ **SIM** |
| Onboarding cliente — documentos e logo | `POST /api/onboarding/upload` | `onboarding-docs` (public) e `brand-assets` (public) | `clients` | `doc_logo`, etc. | Path relativo `/storage/v1/object/public/...` via nginx | ✅ OK |
| Contrato legado (PDF upload) | `POST /api/contracts/upload-legacy` | `legal-docs` (privado) | `contracts` | `signed_pdf_path` | Path `legal://...` — acesso via signed URL admin-only | ✅ OK |
| Contrato assinado (PDF upload) | `POST /api/contracts/upload-signed` | `legal-docs` (privado) | `contracts` | `signed_pdf_path` | Path `legal://...` — acesso via signed URL admin-only | ✅ OK |

**Conclusão de upload:** Apenas `/api/upload-art` tem o bug. O problema é uma linha de código.

---

## 2. Tabela de pontos de EXIBIÇÃO

| Componente / Página | Como busca URL | Tipo de URL esperada | Bug? |
|--------------------|---------------|----------------------|------|
| `app/design/page.tsx:828` | `item.imageUrl` (estado React) | `content_cards.image_url` do banco | ✅ **SIM** — recebe URL Docker interna |
| `app/design/page.tsx:275` | `artLink` (preview de attachment) | `design_requests.attachments[]` do banco | ✅ **SIM** |
| `app/social/page.tsx:1727` | `card.imageUrl` (estado React) | `content_cards.image_url` do banco | ✅ **SIM** |
| `components/ContentCardModal.tsx:232` | `imageUrl` (estado local do modal) | `card.imageUrl` do banco | ✅ **SIM** |
| `app/my-work/page.tsx:327` | `card.imageUrl` | `content_cards.image_url` do banco | ✅ **SIM** |
| `app/clients/[id]/page.tsx:1435` | `asset.url` | `clients.doc_logo` etc. — path relativo | ✅ OK (onboarding usa path relativo) |
| `app/clients/pending/page.tsx:393` | `resolved` | `clients.doc_logo` etc. | ✅ OK |
| `app/onboarding/[token]/page.tsx:162` | `previewSrc` | URLs locais / bucket público | ✅ OK |
| Portal público — top criativos | `thumbnail_url` da Meta CDN | URL Meta (expirável, mas regenerada diariamente via cron) | ⚠️ OK por enquanto |

---

## 3. Storage RLS policies

```
Bucket   | Policy                    | CMD    | Resultado
---------+---------------------------+--------+-----------
storage.objects | storage_objects_service | ALL | service_role: tudo
storage.objects | storage_objects_auth_all | ALL | authenticated: tudo
storage.objects | arts_select_public | SELECT | bucket_id = 'arts' — qualquer autenticado lê
storage.objects | arts_insert_authenticated | INSERT | bucket_id = 'arts'
storage.objects | arts_update_authenticated | UPDATE | bucket_id = 'arts'
storage.objects | arts_delete_authenticated | DELETE | bucket_id = 'arts'
```

**Conclusão de RLS:** CAUSA B descartada. O bucket `arts` tem `public = true` e política `arts_select_public` que permite leitura a qualquer usuário autenticado. O problema não é de permissão — é de URL incorreta.

---

## 4. Evidência numérica em produção

### `content_cards.image_url` — últimos 5 registros

| Título | URL armazenada | Acessível? |
|--------|---------------|------------|
| Cômoda Baião | `http://supabase-kong-1:8000/storage/v1/object/public/arts/...` | ❌ QUEBRADO |
| Post aquecimento promoção Dia das Mães | `https://painel.lonemidia.com/supabase/storage/v1/object/public/arts/...` | ✅ OK |
| Arte de cliente | `http://supabase-kong-1:8000/storage/v1/object/public/arts/...` | ❌ QUEBRADO |
| teste 2 | `http://supabase-kong-1:8000/storage/v1/object/public/arts/...` | ❌ QUEBRADO |
| teste | `http://supabase-kong-1:8000/storage/v1/object/public/arts/...` | ❌ QUEBRADO |

### `design_requests.attachments` — últimos registros com URL

| Título | URL armazenada | Acessível? |
|--------|---------------|------------|
| Arte: Produtos de promoção | `http://supabase-kong-1:8000/...` (5 URLs) | ❌ QUEBRADO |
| Arte: 5 erros na pintura | `http://supabase-kong-1:8000/...` | ❌ QUEBRADO |
| Arte: Telha portuguesa | `https://painel.lonemidia.com/supabase/...` | ✅ OK |

**Taxa de contaminação: ~80% dos uploads recentes têm URL quebrada.**

A URL correta (`https://painel.lonemidia.com/supabase/...`) aparece em uploads anteriores — provavelmente de quando `SUPABASE_INTERNAL_URL` ainda não estava configurada na variável de ambiente do container.

---

## 5. Root cause técnico

### O problema em código

**Arquivo:** `app/api/upload-art/route.ts:99-100`

```typescript
// LINHA 99 — BUGADA
const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
// pub.publicUrl = "http://supabase-kong-1:8000/storage/v1/object/public/arts/{path}"
//                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                  Hostname Docker interno — inacessível pelo browser

return NextResponse.json({ url: pub.publicUrl, path, size: blob.size, type: blob.type });
```

`supabaseAdmin` usa `SUPABASE_INTERNAL_URL = http://supabase-kong-1:8000` como base. `getPublicUrl()` não faz request HTTP — só concatena a base com o path. Resultado: URL inacessível externamente.

### Por que o `signed-url` funciona e `upload-art` não

`app/api/storage/signed-url/route.ts:50-51` já tem o rewrite correto:
```typescript
if (internalBase && publicBase && signedUrl.startsWith(internalBase)) {
  signedUrl = publicBase + signedUrl.slice(internalBase.length);
}
```
`upload-art` não tem esse rewrite.

### Por que "quem fez upload geralmente vê"

O componente de upload mostra um preview via `URL.createObjectURL(file)` (blob URL local) durante/após o upload. O usuário vê a imagem via blob URL temporária na sessão atual. Ao recarregar a página ou quando outro usuário abre, o blob não existe mais — só a URL quebrada do banco é carregada.

---

## 6. Causas — análise final

| Causa | Descrição | Status |
|-------|-----------|--------|
| **A — URL pública vs interna** | `getPublicUrl()` via `supabaseAdmin` retorna hostname Docker inacessível | ✅ **CONFIRMADA — causa principal** |
| B — RLS do bucket | Bucket `arts` é público, política `arts_select_public` permite leitura livre | ❌ Descartada |
| C — Race condition | Upload + DB update ambos bem-sucedidos, sem atomicidade missing. Problema é na URL, não na sequência | ❌ Não relevante |
| D — Cache Next.js | Páginas afetadas são client-side (React state stores), não Server Components com cache | ❌ Não relevante |

---

## 7. Testes manuais (análise de código — sem browser)

Os testes 1.4 do plano requerem browser. Com base na análise de código, posso prever:

**TESTE 1 (Social → Designer):**  
Social Media faz upload → `upload-art` retorna `http://supabase-kong-1:8000/...` → salva em `content_cards.image_url` → Designer abre → browser tenta `http://supabase-kong-1:8000/...` → DNS não resolve → imagem quebrada. ✅ Confirmado pela evidência no banco.

**TESTE 2 (Designer → Social):**  
Mesmo fluxo. Designer faz upload de arte final → mesmo endpoint → URL interna salva em `design_requests.attachments` → Social abre → quebrado. ✅ Confirmado pela evidência no banco.

**TESTE 3 (Admin depois de 30min):**  
O problema não é de expiração. URL interna nunca funciona externamente, independente do tempo. Ao abrir qualquer card com URL contaminada, Admin verá imagem quebrada.

**TESTE 4 (Meta thumbnails em /traffic):**  
URLs vêm diretamente da Meta CDN (domínio `scontent.fbcdn.net` ou similar). Não passam por Storage Supabase. Comportamento de quebra em /traffic seria diferente — URLs Meta expiram mas são regeneradas via cron diário. A confirmar manualmente.

---

## 8. Dados contaminados no banco

Registros que precisam ter a URL corrigida após o fix do código:

```sql
-- content_cards com URL interna
SELECT COUNT(*) FROM content_cards
WHERE image_url LIKE 'http://supabase-kong-1%';
-- Estimativa: maioria dos registros com image_url

-- design_requests com URL interna
SELECT COUNT(*) FROM design_requests
WHERE attachments::text LIKE '%supabase-kong-1%';
```

Precisarão ser corrigidos via migration de dados (substituir hostname interno pelo público).

---

## 9. Proposta de correção (para aprovação)

### Prioridade 1 — Fix em `upload-art/route.ts` (1 linha de código)

Após `getPublicUrl()`, aplicar o mesmo rewrite que `signed-url` já faz:

```typescript
let resolvedUrl = pub.publicUrl;
const internalBase = process.env.SUPABASE_INTERNAL_URL ?? "";
const publicBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (internalBase && publicBase && resolvedUrl.startsWith(internalBase)) {
  resolvedUrl = publicBase + resolvedUrl.slice(internalBase.length);
}
return NextResponse.json({ url: resolvedUrl, path, ... });
```

### Prioridade 2 — Migration de dados corrompidos

Script `scripts/fix-image-urls.ts`:
- Modo `--dry-run`: mostra quantos registros afetados
- Modo `--execute`: substitui `http://supabase-kong-1:8000` → `https://painel.lonemidia.com` em `content_cards.image_url` e `design_requests.attachments`
- Rodar `--dry-run` primeiro, aguardar OK antes de `--execute`

### Prioridade 3 — `<SignedImage>` (Fase 2 do plano original)

Após o fix urgente estar em produção, criar componente unificado que evita recorrência. Não bloqueia a correção imediata.

---

## 10. Não fazer nesta fase

- NÃO criar `<SignedImage>` antes do fix urgente estar em produção
- NÃO ativar Realtime Supabase
- NÃO alterar estrutura de buckets
- NÃO tocar em contratos / onboarding (não afetados)
