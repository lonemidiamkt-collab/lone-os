# Testes manuais — Kanban Multi-Art (Fase 2)

Card de teste: `7d2b3653-02dc-4e66-ac12-53ca233cd90f` (TEST_KANBAN_MULTI_ART)

## Como obter o TOKEN

```bash
TOKEN=$(curl -s -X POST 'https://painel.lonemidia.com/supabase/auth/v1/token?grant_type=password' \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"lonemidiamkt@gmail.com","password":"<sua-senha>"}' | jq -r '.access_token')
echo "TOKEN: ${TOKEN:0:40}..."
```

CARD=7d2b3653-02dc-4e66-ac12-53ca233cd90f

---

## BLOCO A — Autenticação (3 testes)

### A1 — Upload sem auth → 401
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "https://painel.lonemidia.com/api/upload-art" \
  -F "cardId=$CARD" \
  -F "file=@/tmp/test.png;type=image/png"
# Esperado: 401
```

### A2 — GET attachments sem auth → 401
```bash
curl -s -o /dev/null -w "%{http_code}" \
  "https://painel.lonemidia.com/api/cards/$CARD/attachments"
# Esperado: 401
```

### A3 — DELETE sem auth → 401
```bash
curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "https://painel.lonemidia.com/api/cards/$CARD/attachments/00000000-0000-0000-0000-000000000000"
# Esperado: 401
```

---

## BLOCO B — Listagem de attachments (1 teste)

### B1 — GET attachments de card vazio → [] vazio
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://painel.lonemidia.com/api/cards/$CARD/attachments"
# Esperado: {"attachments":[]}
```

---

## BLOCO C — Upload válido (3 testes)

Crie um PNG de teste:
```bash
# Imagem 1x1 pixel PNG válida (magic number correto)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/test.png
```

### C1 — Upload 1 arquivo PNG → attachment criado
```bash
curl -s -X POST "https://painel.lonemidia.com/api/upload-art" \
  -H "Authorization: Bearer $TOKEN" \
  -F "cardId=$CARD" \
  -F "file=@/tmp/test.png;type=image/png"
# Esperado: {"attachments":[{"id":"...","card_id":"7d2b3653...","url":"https://...","path":"7d2b3653.../...","position":0,...}]}
# Salvar o id do attachment retornado: ATTACH1=<id>
```

### C2 — GET após upload → lista com 1 attachment
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://painel.lonemidia.com/api/cards/$CARD/attachments"
# Esperado: {"attachments":[{"id":"...","position":0,...}]}  — 1 item
```

### C3 — Upload 2 arquivos simultaneamente → 2 attachments com positions 1 e 2
```bash
curl -s -X POST "https://painel.lonemidia.com/api/upload-art" \
  -H "Authorization: Bearer $TOKEN" \
  -F "cardId=$CARD" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "file=@/tmp/test.png;type=image/png"
# Esperado: {"attachments":[{..., "position":1},{..., "position":2}]}
```

---

## BLOCO D — Validações de upload (4 testes)

### D1 — Arquivo maior que 10MB → 413
```bash
dd if=/dev/urandom of=/tmp/big.bin bs=1M count=11 2>/dev/null
curl -s -o /dev/null -w "%{http_code}" -X POST "https://painel.lonemidia.com/api/upload-art" \
  -H "Authorization: Bearer $TOKEN" \
  -F "cardId=$CARD" \
  -F "file=@/tmp/big.bin;type=image/png"
# Esperado: 413
```

### D2 — Tipo não suportado em card mode (PDF) → 415
```bash
echo "%PDF-1.4" > /tmp/test.pdf
curl -s -o /dev/null -w "%{http_code}" -X POST "https://painel.lonemidia.com/api/upload-art" \
  -H "Authorization: Bearer $TOKEN" \
  -F "cardId=$CARD" \
  -F "file=@/tmp/test.pdf;type=application/pdf"
# Esperado: 415
```

### D3 — Magic number adulterado (PDF renomeado como PNG) → 415
```bash
echo "%PDF-1.4 fake pdf content" > /tmp/fake.png
curl -s -w "\n" -X POST "https://painel.lonemidia.com/api/upload-art" \
  -H "Authorization: Bearer $TOKEN" \
  -F "cardId=$CARD" \
  -F "file=@/tmp/fake.png;type=image/png"
# Esperado: 415 com mensagem "Conteúdo do arquivo não corresponde ao tipo declarado"
```

### D4 — Limite de 5 artes atingido → 400
```bash
# Após C1+C3, o card tem 3 attachments. Subir 3 mais deve ser bloqueado.
curl -s -w "\n" -X POST "https://painel.lonemidia.com/api/upload-art" \
  -H "Authorization: Bearer $TOKEN" \
  -F "cardId=$CARD" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "file=@/tmp/test.png;type=image/png" \
  -F "file=@/tmp/test.png;type=image/png"
# Esperado: 400 com mensagem "Limite de 5 artes por card atingido"
```

---

## BLOCO E — DELETE (2 testes)

### E1 — DELETE attachment existente → ok
```bash
# Usar ATTACH1 salvo no teste C1
ATTACH1=<id-do-attachment-C1>
curl -s -w "\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "https://painel.lonemidia.com/api/cards/$CARD/attachments/$ATTACH1"
# Esperado: {"ok":true}
```

### E2 — DELETE attachment inexistente → 404
```bash
curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "https://painel.lonemidia.com/api/cards/$CARD/attachments/00000000-0000-0000-0000-000000000000"
# Esperado: 404
```

---

## BLOCO F — Misc mode (1 teste)

### F1 — Upload misc sem cardId → comportamento original
```bash
curl -s -X POST "https://painel.lonemidia.com/api/upload-art" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/test.png;type=image/png"
# Esperado: {"url":"https://...","path":"misc/...","size":...,"type":"image/png"}
# NÃO deve ter campo "attachments"
```

---

## LIMPEZA PÓS-TESTES

Após todos os testes passarem, limpar o card de teste:

```bash
# Listar todos os attachments do card de teste
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://painel.lonemidia.com/api/cards/$CARD/attachments" | jq '.attachments[].id'

# Deletar cada um com o comando E1
```

---

## Resultado esperado: 14 testes passando

| Teste | Endpoint | Esperado |
|-------|----------|----------|
| A1 | POST /api/upload-art | 401 |
| A2 | GET /api/cards/.../attachments | 401 |
| A3 | DELETE /api/cards/.../attachments/... | 401 |
| B1 | GET /api/cards/.../attachments | 200 `[]` |
| C1 | POST /api/upload-art (1 PNG) | 200 `{attachments:[...]}` |
| C2 | GET /api/cards/.../attachments | 200 `[1 item]` |
| C3 | POST /api/upload-art (2 PNGs) | 200 `{attachments:[2 itens]}` |
| D1 | POST /api/upload-art (>10MB) | 413 |
| D2 | POST /api/upload-art (PDF em card mode) | 415 |
| D3 | POST /api/upload-art (magic adulterado) | 415 |
| D4 | POST /api/upload-art (excede limite 5) | 400 |
| E1 | DELETE attachment existente | 200 `{ok:true}` |
| E2 | DELETE attachment inexistente | 404 |
| F1 | POST /api/upload-art (misc mode) | 200 `{url,...}` |
