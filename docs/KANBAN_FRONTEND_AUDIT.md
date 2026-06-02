# Auditoria Frontend — Kanban Multi-Art (Fase 3)

Data: 2026-06-02  
Branch: feature/kanban-multi-art-frontend  
Objetivo: mapear o estado atual antes de implementar Ctrl+V, multi-artes e galeria

---

## Pré-flight

| Check | Status |
|---|---|
| Backup VPS mais recente | `loneos_20260602_0300.dump.gz` — 6.8MB — hoje às 03:00 ✅ |
| Working tree limpa | `On branch main / nothing to commit, working tree clean` ✅ |
| Branch criada | `feature/kanban-multi-art-frontend` ✅ |

---

## 1. Componente do card editor (modal)

**Arquivo:** `components/ContentCardModal.tsx`  
**Função exportada:** `ContentCardModal({ card, onClose })`  
**Usado em:**
- `app/social/page.tsx:2122` — quando `selectedCard` é setado via `onCardClick`
- `app/design/page.tsx:1165` — mesmo componente reutilizado para o designer

### Fluxo de imagem atual (UMA imagem por vez)

```
state: imageUrl = card.imageUrl ?? ""

handleFileChange(e)
  → validações client (tamanho ≤ 25MB, tipo permitido)
  → POST /api/upload-art   { file, cardId }
  → res.json() → data.url
  → setImageUrl(data.url)
  → updateContentCard(card.id, { imageUrl: data.url })   // auto-save imediato

handleSave()
  → updateContentCard(card.id, { ..., imageUrl: imageUrl || undefined })
```

**Onde fica o campo de imagem no JSX** (linha ~224–283):
- Coluna esquerda de `w-72`, com `<SignedImage>` ou fallback
- Botão "Anexar arte / arquivo" → `fileInputRef.current?.click()`
- `<input type="file" hidden>` aceita: `image/png, image/jpeg, image/webp, image/gif, application/pdf, video/mp4, video/webm`
- Toast inline de sucesso/erro

---

## 2. Card pequeno no Kanban

**Arquivo:** `app/social/page.tsx`  
**Localização:** linha ~1717–1735 (dentro de `renderCard` prop do `KanbanBoard`)

### JSX atual do card pequeno

```tsx
{card.imageUrl ? (
  <div className="aspect-video w-full overflow-hidden bg-muted">
    <SignedImage
      src={card.imageUrl!}
      alt={card.title}
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
    />
  </div>
) : (
  <div className="aspect-video w-full flex items-center justify-center bg-muted text-muted-foreground">
    <ImageIcon size={20} />
  </div>
)}
```

**Também usa `card.imageUrl` em:**
- Linha ~1784: botão "Baixar Arte" com `href={card.imageUrl}` e `download`

---

## 3. Como o SignedImage funciona

**Arquivo:** `components/shared/SignedImage.tsx`

| Aspecto | Comportamento |
|---|---|
| Aceita | URL completa (buckets públicos) ou path relativo (buckets privados) |
| Bucket `arts` | público — URL completa direto do Supabase Storage |
| Bucket `legal-docs` | privado — chama `/api/storage/signed-url` |
| Skeleton | `animate-pulse` durante loading |
| Erro | 1 retry automático (`?r=timestamp`), depois mostra fallback |
| Fallback padrão | `<ImageIcon>` + "Sem imagem" |
| Invariante crítica | NUNCA passar URL `http://supabase-kong-1` — upload-art já garante URLs corretas |

**Para as artes do kanban:** o bucket `arts` é público. O SignedImage recebe a URL completa e renderiza direto — sem chamada adicional de signed URL.

---

## 4. Estado em produção (cards legados vs novos)

```
total_cards | com_image_url_legado | com_attachments_novo
-------------+----------------------+----------------------
          18 |                   16 |                    0
```

**Interpretação:**
- 18 cards no total
- 16 têm `image_url` preenchido (legado — campo direto na tabela `content_cards`)
- 0 cards têm entradas na tabela `card_attachments` (ninguém usou o novo sistema ainda)
- 2 cards sem imagem nenhuma

**Conclusão:** Toda a frota está no modelo legado. A migração silenciosa (via `upload-art`) ainda não rodou em nenhum card. O frontend precisa lidar 100% com `imageUrl` como estado inicial e migrar progressivamente.

---

## 5. Verificação: a query de cards traz attachments?

**Fluxo de fetch:**
```
useContentStore.init()
  → GET /api/data/content
  → db.fetchContentCards()   (queries.ts:313)
  → SELECT * FROM content_cards ORDER BY created_at DESC
  → snakeToContentCard(row) — mapeia image_url → imageUrl
```

**Não inclui card_attachments.** A query atual não faz JOIN ou sub-select em `card_attachments`. Os attachments precisam ser buscados separadamente via `GET /api/cards/[id]/attachments`.

**Implicação para Fase 3.3 (card pequeno no Kanban):** há duas opções:
- A) Buscar attachments por card individualmente (N+1 — ruim para 18+ cards)
- B) Ajustar `fetchContentCards` para incluir attachments no payload inicial (JOIN ou select em lote)

**Recomendação:** opção B — incluir attachments no fetch inicial em lote. Precisa de aprovação antes de tocar o backend (Fase 3.2.5 conforme especificado).

---

## 6. Tipo `CardAttachment` — estado atual

Já existe em `lib/types.ts:204`:

```typescript
export interface CardAttachment {
  id: string;
  cardId: string;
  url: string;
  path: string;
  position: number;
  createdAt: string; // ISO
}
```

**Atenção:** a API retorna snake_case (`card_id`, `created_at`). O tipo usa camelCase. Vai precisar de conversão no frontend (similar ao `snakeToContentCard`).

---

## 7. Arquivos que serão tocados na Fase 3

### Novos (criar)
| Arquivo | Fase | Descrição |
|---|---|---|
| `hooks/useImagePaste.ts` | 3.1.1 | Hook de Ctrl+V |
| `components/kanban/CardArtAttachments.tsx` | 3.1.2 | Componente de galeria/upload |
| `app/dev/kanban-art-test/page.tsx` | 3.1.4 | Página de teste isolada |

### Modificados (editar)
| Arquivo | Fase | O que muda |
|---|---|---|
| `components/ContentCardModal.tsx` | 3.2.1 | Substitui campo único por `<CardArtAttachments>` |
| `app/social/page.tsx` | 3.3.1 | Card pequeno: `imageUrl` → lógica attachments + badge "+N" |
| `lib/supabase/queries.ts` | 3.3.1* | Incluir attachments no fetch (se aprovado) |
| `app/api/data/content/route.ts` | 3.3.1* | Caso precise ajuste de payload |

*Requer aprovação explícita — toca backend que está em produção.

---

## Questão para CHECKPOINT 0

Antes de prosseguir para Fase 3.1, preciso de decisão sobre **como os cards no Kanban vão buscar attachments**:

**Opção A — Busca lazy (N+1):**
- Cada card no kanban busca `GET /api/cards/[id]/attachments` ao montar
- Simples, sem tocar backend
- Problema: para 18+ cards renderizados, são 18+ requests simultâneos

**Opção B — Batch no fetch inicial (recomendada):**
- `fetchContentCards` em `queries.ts` inclui attachments em lote (1 query extra)
- Adiciona `cardAttachments: CardAttachment[]` ao `ContentCard`
- Sem N+1, sem requests extras no kanban
- Toca `queries.ts` e `snakeToContentCard` — backend em produção

Qual das duas preferes?
