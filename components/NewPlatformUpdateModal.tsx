"use client";

import { useState } from "react";
import { X, Loader2, Check } from "lucide-react";

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string | null;
  created_by: string | null;
  created_at: string;
}

interface Props {
  /** Mantido pra compatibilidade do call-site, mas não enviado no body — server usa session. */
  adminEmail?: string;
  onClose: () => void;
  onCreated: (update: PlatformUpdate) => void;
}

const CATEGORIES = [
  { value: "feature",      label: "Feature",        color: "bg-[#0d4af5]/10 text-[#3b6ff5] border-[#0d4af5]/30" },
  { value: "fix",          label: "Fix",            color: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  { value: "announcement", label: "Anúncio",        color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30" },
  { value: "breaking",     label: "Breaking change", color: "bg-red-500/10 text-red-400 border-red-500/30" },
];

const SUGGESTED_ICONS = ["📦", "🚀", "✨", "🐛", "⚠️", "🤖", "📧", "💰", "🎨", "📝", "📊", "🔒", "⚡", "🎯", "📅"];

export default function NewPlatformUpdateModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("feature");
  const [icon, setIcon] = useState("✨");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim().length >= 3 && description.trim().length >= 10;

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/platform-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: title.trim(),
          description: description.trim(),
          category,
          icon,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar atualização");
        return;
      }
      onCreated(data.update);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl bg-card border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-foreground">Nova Atualização</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Aparece no widget da Dashboard pro time todo</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Datas comemorativas no calendário"
              maxLength={120}
              className="w-full bg-muted border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
            />
            <p className="text-[10px] text-muted-foreground">{title.length}/120</p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que mudou e por quê. Foque em o que o time precisa saber pra usar a feature."
              rows={4}
              maxLength={500}
              className="w-full bg-muted border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors resize-none"
            />
            <p className="text-[10px] text-muted-foreground">{description.length}/500</p>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Categoria</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  type="button"
                  className={`text-xs px-3 py-2 rounded-lg border transition-all ${
                    category === c.value
                      ? c.color
                      : "bg-muted border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ícone (emoji)</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value.slice(0, 4))}
                maxLength={4}
                className="w-14 bg-muted border border-border rounded-lg px-3 py-2 text-base text-center outline-none focus:border-primary/50 transition-colors"
              />
              <span className="text-[10px] text-muted-foreground">ou escolha:</span>
              <div className="flex flex-wrap gap-1">
                {SUGGESTED_ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                      icon === i ? "bg-[#0d4af5]/15 ring-1 ring-[#0d4af5]/40" : "bg-muted hover:bg-muted/70"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Preview</label>
            <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/40">
              <div className="w-9 h-9 rounded-lg bg-[#0d4af5]/10 flex items-center justify-center shrink-0 text-lg">
                {icon || "📦"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{title || "Título da atualização"}</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                    category === "feature" ? "bg-[#0d4af5]/10 text-[#3b6ff5] border-[#0d4af5]/20" :
                    category === "fix" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                    category === "breaking" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                    "bg-muted text-muted-foreground border-border"
                  }`}>{category}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description || "Descrição da atualização aparece aqui."}</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || submitting}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#1a56ff] text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {submitting ? "Publicando..." : "Publicar atualização"}
          </button>
        </div>
      </div>
    </div>
  );
}
