"use client";

import { useState, useRef, useCallback } from "react";
import { X, Plus, Upload, ImageIcon, ChevronLeft, ChevronRight, Download, Loader2, AlertCircle } from "lucide-react";
import type { CardAttachment } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useImagePaste } from "@/lib/hooks/useImagePaste";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

interface CardArtAttachmentsProps {
  cardId: string;
  existingAttachments: CardAttachment[];
  legacyImageUrl?: string | null;
  onAttachmentsChange: (attachments: CardAttachment[]) => void;
  maxItems?: number;
  readOnly?: boolean;
}

interface PendingUpload {
  tempId: string;
  name: string;
  error?: string;
}

function makeLegacyAttachment(cardId: string, url: string): CardAttachment {
  return { id: "legacy", card_id: cardId, url, path: "", position: 0, created_at: "" };
}

function buildVisibleArts(
  attachments: CardAttachment[],
  cardId: string,
  legacyImageUrl?: string | null,
): CardAttachment[] {
  if (attachments.length > 0) return attachments;
  if (legacyImageUrl) return [makeLegacyAttachment(cardId, legacyImageUrl)];
  return [];
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  arts,
  initialIndex,
  onClose,
}: {
  arts: CardAttachment[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const current = arts[idx];

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(arts.length - 1, i + 1));

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    },
    [onClose],
  );

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={handleKey}
      tabIndex={-1}
      autoFocus
    >
      {/* Prev */}
      {idx > 0 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label="Arte anterior"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Image */}
      <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={current.url}
          alt={`Arte ${idx + 1}`}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-white/60 text-xs">
            {idx + 1} / {arts.length}
          </span>
          <a
            href={current.url}
            download
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors"
          >
            <Download size={12} /> Baixar
          </a>
        </div>
      </div>

      {/* Next */}
      {idx < arts.length - 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label="Próxima arte"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Close */}
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        onClick={onClose}
        aria-label="Fechar (ESC)"
      >
        <X size={18} />
      </button>
    </div>
  );
}

// ── Confirmation dialog ───────────────────────────────────────────────────────

function ConfirmRemoveDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center" onClick={onCancel}>
      <div
        className="bg-card border border-border rounded-xl p-5 max-w-xs w-full mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-foreground font-medium">Remover esta arte?</p>
        <p className="text-xs text-muted-foreground">
          O arquivo será deletado do Storage e não poderá ser recuperado.
        </p>
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CardArtAttachments({
  cardId,
  existingAttachments,
  legacyImageUrl,
  onAttachmentsChange,
  maxItems = 5,
  readOnly = false,
}: CardArtAttachmentsProps) {
  const [attachments, setAttachments] = useState<CardAttachment[]>(() =>
    buildVisibleArts(existingAttachments, cardId, legacyImageUrl),
  );
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  // ── helpers ────────────────────────────────────────────────────────────────

  const reloadAttachments = useCallback(async (): Promise<CardAttachment[]> => {
    const res = await authedFetch(`/api/cards/${cardId}/attachments`);
    if (!res.ok) return attachments;
    const data = await res.json();
    return (data.attachments as CardAttachment[]) ?? [];
  }, [cardId, attachments]);

  const updateAttachments = useCallback(
    (next: CardAttachment[]) => {
      setAttachments(next);
      onAttachmentsChange(next);
    },
    [onAttachmentsChange],
  );

  // ── client-side validation ─────────────────────────────────────────────────

  function validateFiles(files: File[]): string | null {
    // Count real (non-legacy) attachments
    const realCount = attachments.filter((a) => a.id !== "legacy").length;
    if (realCount + files.length > maxItems) {
      return `Limite de ${maxItems} artes por card`;
    }
    for (const f of files) {
      if (!ACCEPTED_TYPES.has(f.type)) {
        return `Tipo não suportado: ${f.type || f.name}. Use PNG, JPEG, WebP ou GIF`;
      }
      if (f.size > MAX_SIZE_BYTES) {
        return `"${f.name}" excede 10MB (${(f.size / 1024 / 1024).toFixed(1)}MB)`;
      }
    }
    return null;
  }

  // ── upload ─────────────────────────────────────────────────────────────────

  const handleUpload = useCallback(
    async (files: File[]) => {
      setGlobalError(null);

      const validErr = validateFiles(files);
      if (validErr) {
        setGlobalError(validErr);
        return;
      }

      const tempIds = files.map((_, i) => `pending_${Date.now()}_${i}`);
      setPending((prev) => [
        ...prev,
        ...files.map((f, i) => ({ tempId: tempIds[i], name: f.name })),
      ]);

      try {
        const formData = new FormData();
        formData.append("cardId", cardId);
        for (const f of files) formData.append("file", f);

        const res = await authedFetch("/api/upload-art", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

        if (!res.ok) {
          const msg = data.error || `Erro no upload (HTTP ${res.status})`;
          setPending((prev) =>
            prev.map((p) => (tempIds.includes(p.tempId) ? { ...p, error: msg } : p)),
          );
          // Limpa erros após 4s
          setTimeout(() => setPending((prev) => prev.filter((p) => !tempIds.includes(p.tempId))), 4000);
          return;
        }

        // Upload OK — busca lista atualizada (inclui migração silenciosa se rolou)
        const fresh = await reloadAttachments();
        updateAttachments(fresh);
      } finally {
        setPending((prev) => prev.filter((p) => !tempIds.includes(p.tempId)));
      }
    },
    [cardId, attachments, maxItems, reloadAttachments, updateAttachments],
  );

  // ── paste ──────────────────────────────────────────────────────────────────

  useImagePaste({
    enabled: isFocused && !readOnly,
    onPaste: handleUpload,
    containerRef,
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  const confirmRemove = useCallback(
    async (attachmentId: string) => {
      setConfirmRemoveId(null);

      if (attachmentId === "legacy") {
        // Card legado sem attachment real — apenas limpa visualmente (não chama API)
        updateAttachments([]);
        return;
      }

      const res = await authedFetch(`/api/cards/${cardId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGlobalError(data.error || "Erro ao remover arte");
        return;
      }

      const next = attachments.filter((a) => a.id !== attachmentId);
      updateAttachments(next);
    },
    [cardId, attachments, updateAttachments],
  );

  // ── drag-and-drop ──────────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setIsDragging(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      isDraggingRef.current = false;
      setIsDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    isDraggingRef.current = false;
    setIsDragging(false);
    if (readOnly) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files);
  };

  // ── file picker ────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) handleUpload(files);
    e.target.value = "";
  };

  // ── render ─────────────────────────────────────────────────────────────────

  const slots = attachments.length + pending.length;
  const showAddSlot = slots < maxItems && !readOnly;

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="Artes do card"
        className={`outline-none rounded-xl transition-colors ${
          isDragging
            ? "ring-2 ring-[#0d4af5]/60 bg-[#0d4af5]/5"
            : isFocused
            ? "ring-1 ring-border"
            : ""
        }`}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsFocused(false);
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Grid */}
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(maxItems, 5)}, 1fr)` }}>
          {/* Existing attachments */}
          {attachments.map((art, idx) => (
            <div
              key={art.id}
              className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border group cursor-pointer"
              onClick={() => setLightboxIdx(idx)}
              aria-label={`Arte ${idx + 1}, clique pra ampliar`}
            >
              <img
                src={art.url}
                alt={`Arte ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              {/* Remove button */}
              {!readOnly && (
                <button
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                  onClick={(e) => { e.stopPropagation(); setConfirmRemoveId(art.id); }}
                  aria-label="Remover arte"
                >
                  <X size={11} />
                </button>
              )}
              {/* Position badge */}
              {art.id !== "legacy" && (
                <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white rounded px-1 py-0.5">
                  {art.position + 1}
                </span>
              )}
              {art.id === "legacy" && (
                <span className="absolute bottom-1 left-1 text-[9px] bg-amber-500/80 text-white rounded px-1 py-0.5">
                  capa
                </span>
              )}
            </div>
          ))}

          {/* Pending uploads */}
          {pending.map((p) => (
            <div
              key={p.tempId}
              className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border flex flex-col items-center justify-center gap-1"
            >
              {p.error ? (
                <>
                  <AlertCircle size={14} className="text-red-400" />
                  <span className="text-[9px] text-red-400 text-center px-1 leading-tight">{p.error}</span>
                </>
              ) : (
                <>
                  <Loader2 size={14} className="text-primary animate-spin" />
                  <span className="text-[9px] text-muted-foreground">enviando...</span>
                </>
              )}
            </div>
          ))}

          {/* Add slot */}
          {showAddSlot && (
            <button
              className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/50 transition-all"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              aria-label="Adicionar arte"
            >
              <Plus size={16} />
              <span className="text-[9px] text-center leading-tight">Adicionar arte</span>
            </button>
          )}
        </div>

        {/* Hint */}
        {!readOnly && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Upload size={10} />
            {isFocused
              ? "Cole com Ctrl+V · Arraste · ou clique em +"
              : "Foque aqui e cole com Ctrl+V (Cmd+V)"}
          </div>
        )}

        {/* Global error */}
        {globalError && (
          <div className="mt-2 flex items-start gap-1.5 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1.5">
            <AlertCircle size={11} className="shrink-0 mt-0.5" />
            <span>{globalError}</span>
            <button
              className="ml-auto shrink-0 text-red-400 hover:text-red-300"
              onClick={() => setGlobalError(null)}
            >
              <X size={10} />
            </button>
          </div>
        )}

        {/* Empty state */}
        {attachments.length === 0 && pending.length === 0 && !readOnly && (
          <div className="mt-2 flex flex-col items-center gap-2 py-4 border border-dashed border-border rounded-lg text-muted-foreground">
            <ImageIcon size={24} />
            <p className="text-xs text-center">Nenhuma arte ainda</p>
            <p className="text-[10px] text-center text-muted-foreground/60">
              Arraste, cole (Ctrl+V) ou clique em +
            </p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          arts={attachments}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {/* Confirm remove */}
      {confirmRemoveId !== null && (
        <ConfirmRemoveDialog
          onConfirm={() => confirmRemove(confirmRemoveId)}
          onCancel={() => setConfirmRemoveId(null)}
        />
      )}
    </>
  );
}
