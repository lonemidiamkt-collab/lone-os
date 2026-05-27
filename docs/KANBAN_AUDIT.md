# Kanban Multi-Art — Auditoria do Fluxo Atual

Branch: `feature/kanban-multi-art`
Data: 2026-05-27

---

## 1. Estado atual do banco

### Tabela `content_cards` (campos relevantes)

```
image_url  TEXT  nullable  -- URL pública única da arte atual
```

**Cardinalidade:**
- 17 cards no total
- 16 com `image_url` preenchido
- 1 sem imagem

Não há tabela de attachments. Cada card tem 0 ou 1 arte.

---

## 2. Fluxo de upload atual

```
Social Media
  → ContentCardModal.tsx (componente editor)
    → handleFileChange() [linha ~114]
      → POST /api/upload-art  (FormData: file + cardId)
        → valida MIME e tamanho (25MB max)
        → supabaseAdmin.storage.from("arts").upload()
          → path: {cardId}/{timestamp}.{ext}
        → retorna { url, path, size, type }
      → updateContentCard({ imageUrl })  ← auto-salva imediatamente
        → PATCH /api/content-cards/update
          → UPDATE content_cards SET image_url = $1
```

### Bucket Storage
- Nome: `"arts"` (público — leitura sem auth)
- Path: `{cardId}/{timestamp}.{ext}`
- RLS: leitura pública, escrita/deleção para autenticados

### Componentes envolvidos

| Arquivo | Responsabilidade |
|---|---|
| `components/ContentCardModal.tsx` | Editor/criação de card, campo de arte única |
| `app/social/page.tsx` (linha ~1717) | Preview do card no Kanban — renderiza via `SignedImage` |
| `app/api/upload-art/route.ts` | Upload pro Storage, retorna URL pública |
| `app/api/content-cards/update/route.ts` | Persiste `image_url` no banco |
| `components/shared/SignedImage.tsx` | Renderiza imagem com fallback + Sentry |
| `lib/types.ts` (linha ~171) | `imageUrl?: string` no tipo `ContentCard` |

---

## 3. Opções de armazenamento para múltiplas artes

### Opção A — Array column `image_urls TEXT[]`
Adiciona coluna array à tabela existente.

```sql
ALTER TABLE content_cards ADD COLUMN image_urls TEXT[] DEFAULT '{}';
```

**Prós:** Simples, sem JOIN, compatível com ORM.  
**Contras:** Arrays em Postgres não carregam metadata por item (sem `created_at` por arte, sem `uploaded_by`, sem path para deleção do Storage). Difícil adicionar metadados depois sem nova migration. Manipulação de array (remover item específico) é verbosa no SQL.

---

### Opção B — Tabela separada `card_attachments` ← RECOMENDADA

```sql
CREATE TABLE card_attachments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id    UUID NOT NULL REFERENCES content_cards(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  path       TEXT NOT NULL,   -- para deleção no Storage
  position   SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Prós:**
- Metadados por attachment (criado em, posição, path para deletar do Storage)
- DELETE de arte individual = `DELETE FROM card_attachments WHERE id = $1` (limpo)
- RLS granular se necessário
- Sem array manipulation em SQL
- Futuro: tags por arte, status, etc. sem nova migration
- **Compatibilidade perfeita**: `image_url` antigo fica intacto na tabela principal. Frontend lê `image_url` + `card_attachments` e monta lista unificada. Cards antigos continuam funcionando sem migração forçada.

**Contras:** Requer JOIN para buscar artes junto com card. Um endpoint a mais (list attachments).

---

### Opção C — JSONB `attachments`

```sql
ALTER TABLE content_cards ADD COLUMN attachments JSONB DEFAULT '[]';
```

**Prós:** Flexível, sem JOIN.  
**Contras:** Menos type-safe, GIN index necessário para queries eficientes, manipulação de item específico exige `jsonb_agg` + reconstrução do array.

---

## 4. Recomendação: Opção B

**Justificativa principal:** o `path` de cada arquivo no Storage é necessário para deletar o arquivo quando o usuário remove uma arte. Sem `path` por item, teríamos que derivá-lo da URL (frágil) ou deixar arquivos órfãos no bucket. A tabela separada resolve isso nativamente e dá espaço para `position` (ordem das artes no grid) sem custo extra.

**Estratégia de compatibilidade:**
- `image_url` permanece na tabela — zero risco para cards antigos
- Frontend monta lista: `[card.imageUrl, ...attachments].filter(Boolean)`
- No save de card novo, primeiro attachment vai para `card_attachments` (não para `image_url`)
- Migration apenas CRIA — não toca dados existentes

---

## 5. Arquivos que serão modificados/criados

### Banco
- `infrastructure/supabase/migrations/044_card_attachments.sql` ← novo

### Backend
- `app/api/upload-art/route.ts` — estender para multi-upload + inserir em `card_attachments`
- `app/api/cards/[id]/attachments/route.ts` ← novo (GET list)
- `app/api/cards/[id]/attachments/[attachmentId]/route.ts` ← novo (DELETE)

### Frontend
- `lib/types.ts` — adicionar tipo `CardAttachment`, atualizar `ContentCard`
- `hooks/useImagePaste.ts` ← novo
- `components/kanban/CardArtAttachments.tsx` ← novo
- `components/ContentCardModal.tsx` — substituir campo único por `<CardArtAttachments>`
- `app/social/page.tsx` — atualizar preview do card (capa + badge "+N")

### Docs
- `docs/manual-tests/kanban-multi-art.md` ← novo (Fase 2)
