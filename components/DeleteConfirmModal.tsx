"use client";

import { useState } from "react";
import { AlertTriangle, X, Loader2, Trash2 } from "lucide-react";

interface Props {
  /** Título do alerta. Default: "Tem certeza que deseja apagar?". */
  title?: string;
  /** Mensagem complementar. Default: aviso de irreversibilidade. */
  message?: string;
  /** Item sendo apagado (mostrado em destaque). */
  itemLabel?: string;
  /** Texto do botão de confirmar. Default: "Apagar". */
  confirmLabel?: string;
  /** Callback async que executa o delete. Mostra spinner + erro inline. */
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/**
 * Modal de confirmação destrutiva — usado pra apagar cards/tarefas/clientes.
 * Toda a UI fica em vermelho com warning icon. Confirmação obrigatória.
 */
export default function DeleteConfirmModal({
  title = "Tem certeza que deseja apagar?",
  message = "Esta ação não pode ser desfeita.",
  itemLabel,
  confirmLabel = "Apagar",
  onConfirm,
  onClose,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await Promise.resolve(onConfirm());
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[DeleteConfirmModal] error:", err);
      setError(`Falha ao apagar: ${msg}`);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-card border border-red-500/30 rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.15)] overflow-hidden"
      >
        <div className="h-px w-full bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{message}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </div>

          {itemLabel && (
            <div className="px-4 py-3 rounded-xl bg-red-500/[0.04] border border-red-500/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Será apagado</p>
              <p className="text-sm text-foreground font-medium break-words">{itemLabel}</p>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 hover:border-red-500/50 transition-all disabled:opacity-50 font-medium text-sm"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {submitting ? "Apagando..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
