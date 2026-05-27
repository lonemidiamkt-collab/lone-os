# Testes Manuais — Kanban Multi-Art

Branch: `feature/kanban-multi-art`  
Data de criação: 2026-05-27  
Autor: gerado automaticamente na Fase 2 (backend)

---

## Pré-requisitos

### Cards de teste (VPS — produção)

```
CARD_LEGADO = 94b19708-488d-48f0-8254-6609ef65858e
  title:      Telha portuguesa
  image_url:  preenchido (arte existente)
  attachments: 0

CARD_NOVO = 7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f
  title:      Produtos de promoção
  image_url:  NULL
  attachments: 0
```

> **ATENÇÃO — Cenário 7 é destrutivo:**  
> Ele migra `image_url` do `CARD_LEGADO` para `card_attachments` (seta `image_url = NULL`).  
> Para restaurar depois dos testes: `UPDATE content_cards SET image_url = '<url_original>' WHERE id = '94b19708-488d-48f0-8254-6609ef65858e';`  
> Recupera a URL original com: `SELECT url FROM card_attachments WHERE card_id = '94b19708-488d-48f0-8254-6609ef65858e' AND position = 0;`

### Autenticação

Todos os curls usam LocalSession (admin). Substitua pelo Bearer token se preferir Supabase auth real.

```bash
AUTH="Authorization: LocalSession lonemidiamkt@gmail.com"
BASE="https://painel.lonemidia.com"
```

### Arquivos de teste

```bash
# Cria PNG mínimo válido (magic bytes corretos, 67 bytes)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/test.png

# Cria arquivo PDF de teste
printf '%%PDF-1.4\n%%' > /tmp/test.pdf

# Cria arquivo grande (11MB — para teste de limite de tamanho)
dd if=/dev/zero of=/tmp/large.bin bs=1M count=11 2>/dev/null

# Cria PNG corrompido (bytes errados, content-type forjado)
echo 'NOT_A_PNG' > /tmp/fake.png
```

---

## Cenários

### 1. Upload de 1 arte em card novo → OK

```bash
curl -s -X POST "$BASE/api/upload-art" \
  -H "$AUTH" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "cardId=7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f" \
  | jq .
```

**Resultado esperado:**
```json
{
  "attachments": [
    {
      "id": "<uuid>",
      "card_id": "7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f",
      "url": "https://painel.lonemidia.com/...",
      "path": "7afbb7f1-.../..._0.png",
      "position": 0,
      "created_at": "<timestamp>"
    }
  ]
}
```

**Validação no banco:**
```sql
SELECT id, position, url FROM card_attachments
WHERE card_id = '7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f'
ORDER BY position;
-- Esperado: 1 linha, position = 0
```

---

### 2. Upload de 5 artes em card novo → OK

Usando o mesmo `CARD_NOVO` após limpar os attachments do cenário 1:

```bash
# Limpa attachments do cenário 1 primeiro
# (faça via curl DELETE usando o ID retornado no cenário 1,
#  ou via SQL no banco de teste)

# Upload de 5 arquivos em uma única requisição
curl -s -X POST "$BASE/api/upload-art" \
  -H "$AUTH" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "cardId=7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f" \
  | jq '.attachments | length'
```

**Resultado esperado:** `5`

**Validação no banco:**
```sql
SELECT count(*), max(position) FROM card_attachments
WHERE card_id = '7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f';
-- Esperado: count=5, max=4
```

---

### 3. Upload de 6ª arte → 400 "limite atingido"

Após o cenário 2 (card com 5 attachments):

```bash
curl -s -X POST "$BASE/api/upload-art" \
  -H "$AUTH" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "cardId=7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f" \
  | jq .
```

**Resultado esperado:**
```json
{ "error": "Limite de 5 artes por card atingido (existentes: 5, tentando adicionar: 1)" }
```
HTTP Status: `400`

---

### 4. Upload de arquivo .pdf → 415 "tipo não suportado"

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload-art" \
  -H "$AUTH" \
  -F "file=@/tmp/test.pdf;type=application/pdf" \
  -F "cardId=7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f"
```

**Resultado esperado:** `415`

```bash
# Para ver o body:
curl -s -X POST "$BASE/api/upload-art" \
  -H "$AUTH" \
  -F "file=@/tmp/test.pdf;type=application/pdf" \
  -F "cardId=7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f" \
  | jq .error
```

**Resultado esperado:** `"Tipo não suportado (application/pdf). Aceitos: PNG, JPEG, WebP, GIF"`

---

### 5. Upload de arquivo 11MB → 413 "excede 10MB"

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload-art" \
  -H "$AUTH" \
  -F "file=@/tmp/large.bin;type=image/png" \
  -F "cardId=7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f"
```

**Resultado esperado:** `413`

```bash
# Para ver o body:
curl -s -X POST "$BASE/api/upload-art" \
  -H "$AUTH" \
  -F "file=@/tmp/large.bin;type=image/png" \
  -F "cardId=7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f" \
  | jq .error
```

**Resultado esperado:** `"Arquivo muito grande (11.0MB). Máximo: 10MB"`

---

### 6. PNG com content-type forjado → 415 (magic number falha)

Arquivo com bytes inválidos enviado como `image/png`:

```bash
curl -s -X POST "$BASE/api/upload-art" \
  -H "$AUTH" \
  -F "file=@/tmp/fake.png;type=image/png" \
  -F "cardId=7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f" \
  | jq .
```

**Resultado esperado:**
```json
{ "error": "Conteúdo do arquivo não corresponde ao tipo declarado (image/png)" }
```
HTTP Status: `415`

> Valida que a checagem de magic numbers está funcionando além do Content-Type.

---

### 7. Upload em card LEGADO (com image_url) → migração silenciosa

> **DESTRUTIVO:** seta `image_url = NULL` no `CARD_LEGADO`.

Antes do teste, confirma o estado inicial:

```sql
SELECT image_url IS NOT NULL AS has_url,
       (SELECT count(*) FROM card_attachments WHERE card_id = cc.id) AS att_count
FROM content_cards cc
WHERE id = '94b19708-488d-48f0-8254-6609ef65858e';
-- Esperado: has_url = true, att_count = 0
```

Executa o upload:

```bash
curl -s -X POST "$BASE/api/upload-art" \
  -H "$AUTH" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "cardId=94b19708-488d-48f0-8254-6609ef65858e" \
  | jq .
```

**Resultado esperado:**
```json
{
  "attachments": [
    { "position": 1, ... }
  ]
}
```

> position = 1 porque a RPC criou position = 0 para a arte legada, e o novo upload recebe position = 1.

**Validação no banco:**

```sql
-- image_url deve ser NULL
SELECT image_url FROM content_cards
WHERE id = '94b19708-488d-48f0-8254-6609ef65858e';
-- Esperado: NULL

-- 2 attachments: position 0 (arte legada migrada) + position 1 (nova)
SELECT position, url FROM card_attachments
WHERE card_id = '94b19708-488d-48f0-8254-6609ef65858e'
ORDER BY position;
-- Esperado:
-- 0 | <url da arte original>
-- 1 | <url da nova arte>
```

---

### 8. DELETE de attachment → linha some + arquivo some do Storage

Primeiro, pega um `attachment_id` válido:

```bash
ATTACH_ID=$(curl -s "$BASE/api/cards/7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f/attachments" \
  -H "$AUTH" | jq -r '.attachments[0].id')
echo "Attachment ID: $ATTACH_ID"
```

Executa o DELETE:

```bash
curl -s -X DELETE \
  "$BASE/api/cards/7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f/attachments/$ATTACH_ID" \
  -H "$AUTH" \
  | jq .
```

**Resultado esperado:**
```json
{ "ok": true }
```
HTTP Status: `200`

**Validação no banco:**
```sql
SELECT count(*) FROM card_attachments
WHERE id = '<ATTACH_ID>';
-- Esperado: 0

-- Valida no Storage (via API Supabase ou interface gráfica):
-- O arquivo em path correspondente não deve existir mais no bucket "arts"
```

---

### 9. DELETE com erro de Storage → banco não é tocado

> Este cenário simula falha no Storage. Para testar: deletar o arquivo do Storage manualmente
> antes de rodar o endpoint (arquivo já não existe → Supabase Storage retorna erro).

```bash
# 1. Pega o path do attachment:
curl -s "$BASE/api/cards/7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f/attachments" \
  -H "$AUTH" | jq '.attachments[0]'

# 2. Delete o arquivo do Storage manualmente (via Supabase Studio ou psql)
#    ou renomeie o bucket temporariamente para forçar o erro

# 3. Tenta deletar via endpoint:
curl -s -X DELETE \
  "$BASE/api/cards/7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f/attachments/$ATTACH_ID" \
  -H "$AUTH"
```

**Resultado esperado:** HTTP `500`, `{ "error": "Falha ao remover arquivo do Storage: ..." }`

**Validação no banco:**
```sql
SELECT id FROM card_attachments WHERE id = '<ATTACH_ID>';
-- Esperado: linha ainda existe (banco não foi tocado)
```

> **Nota:** Em produção, Supabase Storage retorna sucesso (não erro) ao tentar deletar arquivo
> que não existe. Para forçar o erro seria necessário revogar permissões do service_role no bucket.
> Este cenário é melhor testado em ambiente de staging com mock de Storage.

---

### 10. GET attachments de card com artes → ordenado por position

```bash
curl -s "$BASE/api/cards/7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f/attachments" \
  -H "$AUTH" | jq '.attachments | map({id, position})'
```

**Resultado esperado:** array com objetos em ordem crescente de `position`.

```json
[
  { "id": "<uuid>", "position": 0 },
  { "id": "<uuid>", "position": 1 },
  ...
]
```

**Validação no banco:**
```sql
SELECT id, position FROM card_attachments
WHERE card_id = '7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f'
ORDER BY position;
-- Esperado: mesma ordem retornada pelo endpoint
```

---

### 11. GET attachments de card legado intocado → array vazio

Card que nunca recebeu attachment (e não sofreu migração silenciosa):

```bash
# Pega qualquer card com image_url e 0 attachments
# Todos os 5 listados no pré-requisito servem (menos o CARD_LEGADO se já testou cenário 7)

curl -s "$BASE/api/cards/c255d77b-345f-4743-b72e-e31f86949135/attachments" \
  -H "$AUTH" | jq .
```

**Resultado esperado:**
```json
{ "attachments": [] }
```

> Frontend usa `card.imageUrl` como fallback para cards que retornam `[]` aqui.

---

### 12. Tentativa sem autenticação → 401

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload-art" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "cardId=7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f"
```

**Resultado esperado:** `401`

```bash
# GET sem auth:
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE/api/cards/7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f/attachments"
```

**Resultado esperado:** `401`

---

## Verificação rápida no Supabase banco (overview)

```sql
-- Estado atual do CARD_LEGADO após todos os testes
SELECT
  cc.id,
  cc.title,
  cc.image_url,
  count(ca.id) AS attachment_count,
  array_agg(ca.position ORDER BY ca.position) AS positions
FROM content_cards cc
LEFT JOIN card_attachments ca ON ca.card_id = cc.id
WHERE cc.id IN (
  '94b19708-488d-48f0-8254-6609ef65858e',
  '7afbb7f1-26e9-4bf6-ae98-7ec1518ace5f'
)
GROUP BY cc.id, cc.title, cc.image_url;
```

---

## Sequência recomendada de execução

1. Cenário 12 (sem auth) — validação de segurança, rápida
2. Cenário 4 (PDF) — validação de tipo, rápida
3. Cenário 5 (11MB) — validação de tamanho, rápida
4. Cenário 6 (magic number) — validação real de MIME, rápida
5. Cenário 1 (1 arte, card novo) — fluxo básico
6. Cenário 10 (GET ordenado) — usa resultado do cenário 1
7. Cenário 8 (DELETE) — usa resultado do cenário 1
8. Cenário 11 (GET card legado, sem attachments)
9. Cenário 7 (migração silenciosa) — DESTRUTIVO, fazer por último para CARD_LEGADO
10. Cenário 2 (5 artes) — limpa CARD_NOVO antes
11. Cenário 3 (6ª arte) — usa resultado do cenário 2
12. Cenário 9 (Storage error) — opcional, difícil de simular em produção
