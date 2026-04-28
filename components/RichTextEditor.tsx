"use client";

import { useRef, useEffect } from "react";
import { Bold, Italic, List, Link as LinkIcon, ListOrdered } from "lucide-react";

interface Props {
  value: string;                       // HTML string
  onChange: (html: string) => void;
  placeholder?: string;
  /** Altura mínima do editor. Default: 100px. */
  minHeight?: number;
  autoFocus?: boolean;
  /** Render textareawith different style. Default: surface escuro padrão dos modais. */
  className?: string;
}

/**
 * Editor WYSIWYG simples baseado em contentEditable + execCommand.
 * Saída: HTML string (preserva <strong>, <em>, <ul>, <ol>, <a>).
 *
 * Reutilizado em:
 *  - QuickCreateModal (/calendar) — briefing
 *  - NewContentCardModal (/social) — briefing
 *  - ContentCardModal (/social) — briefing (edição inline)
 */
export default function RichTextEditor({ value, onChange, placeholder, minHeight = 100, autoFocus, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Sincroniza valor externo → DOM apenas quando o editor não está focado,
  // pra não atrapalhar o cursor enquanto o usuário digita.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  // Set valor inicial
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.innerHTML && value) el.innerHTML = value;
    if (autoFocus) el.focus();
  }, [autoFocus, value]);

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    ref.current?.focus();
    // dispara onChange manualmente após exec
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const insertLink = () => {
    const url = window.prompt("URL do link (começa com https://):");
    if (!url) return;
    exec("createLink", url);
  };

  const handleInput = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  return (
    <div className={`rounded-lg border border-border overflow-hidden ${className ?? "bg-[#0a0a0a]"}`}>
      <div className="flex items-center gap-1 bg-muted px-2 py-1.5 border-b border-border">
        <ToolbarButton icon={Bold} onClick={() => exec("bold")} title="Negrito (Cmd+B)" />
        <ToolbarButton icon={Italic} onClick={() => exec("italic")} title="Itálico (Cmd+I)" />
        <ToolbarButton icon={List} onClick={() => exec("insertUnorderedList")} title="Lista com marcadores" />
        <ToolbarButton icon={ListOrdered} onClick={() => exec("insertOrderedList")} title="Lista numerada" />
        <ToolbarButton icon={LinkIcon} onClick={insertLink} title="Inserir link" />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="px-4 py-3 text-sm text-foreground outline-none leading-relaxed prose prose-sm prose-invert max-w-none [&[data-placeholder]:empty]:before:content-[attr(data-placeholder)] [&[data-placeholder]:empty]:before:text-zinc-700 [&[data-placeholder]:empty]:before:pointer-events-none"
        style={{ minHeight: `${minHeight}px`, wordBreak: "break-word" }}
      />
    </div>
  );
}

function ToolbarButton({ icon: Icon, onClick, title }: { icon: typeof Bold; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
    >
      <Icon size={13} />
    </button>
  );
}

/**
 * Strip de HTML tags pra previews compactos (line-clamp em cards).
 * Decodifica entities básicas (&amp;, &lt;, &gt;, &nbsp;).
 */
export function briefingPlainText(briefing: string | undefined | null): string {
  if (!briefing) return "";
  if (!/<\/?[a-z][\s\S]*>/i.test(briefing)) return briefing; // já é plain text
  return briefing
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Helper pra renderizar HTML do briefing como leitura. Trata texto plano
 * legado (sem tags) como pre-formatted, e HTML como rich text.
 */
export function renderBriefingHtml(briefing: string | undefined | null): { __html: string } {
  if (!briefing) return { __html: "" };
  // Se contém tags HTML, renderiza direto
  if (/<\/?[a-z][\s\S]*>/i.test(briefing)) {
    return { __html: briefing };
  }
  // Plain text legado — escapa e converte \n em <br>
  const escaped = briefing
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br/>");
  return { __html: escaped };
}
