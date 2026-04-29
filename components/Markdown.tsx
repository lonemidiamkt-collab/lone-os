"use client";

import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Heading } from "lucide-react";

// ─── htmlToMarkdown — converter de dados legacy ─────────────
// Briefings já gravados via contentEditable WYSIWYG estão como HTML.
// Convertemos pra MD pra renderizar com react-markdown sem mostrar tags.
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function htmlToMarkdown(input: string | undefined | null): string {
  if (!input) return "";
  // Se não tem tags HTML, decodifica entities (caso venha de copy/paste) e retorna
  if (!/<\/?[a-z][\s\S]*?>/i.test(input)) {
    return /&(?:nbsp|amp|lt|gt|quot|#39);/.test(input) ? decodeEntities(input) : input;
  }

  let md = input;
  // Headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n\n");
  // Bold/italic (vários formatos que o execCommand gera)
  md = md.replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi, "**$1**");
  md = md.replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi, "*$1*");
  // Underline → italic (md não tem underline standard)
  md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, "*$1*");
  // Listas
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner: string) =>
    "\n" + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n") + "\n",
  );
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner: string) => {
    let i = 0;
    return "\n" + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, () => `${++i}. $1\n`).replace(/\$1/g, (m) => m) + "\n";
  });
  // Links
  md = md.replace(/<a [^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  // Quebras
  md = md.replace(/<br\s*\/?>/gi, "  \n");
  md = md.replace(/<\/p>/gi, "\n\n");
  md = md.replace(/<p[^>]*>/gi, "");
  md = md.replace(/<div[^>]*>/gi, "");
  md = md.replace(/<\/div>/gi, "\n");
  // Strip qualquer tag remanescente
  md = md.replace(/<[^>]+>/g, "");
  // Decode entities básicas
  md = decodeEntities(md);
  // Limpa quebras excessivas
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  return md;
}

// ─── MarkdownView — render only ─────────────────────────────
export function MarkdownView({ source, className }: { source: string | undefined | null; className?: string }) {
  const md = htmlToMarkdown(source);
  if (!md) return null;
  return (
    <div className={`prose prose-sm prose-invert max-w-none break-words
        prose-headings:text-foreground
        prose-h1:text-2xl prose-h1:font-bold prose-h1:mt-6 prose-h1:mb-3
        prose-h2:text-xl prose-h2:font-bold prose-h2:mt-5 prose-h2:mb-2.5
        prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2
        prose-h4:text-base prose-h4:font-semibold prose-h4:mt-3 prose-h4:mb-1.5
        prose-strong:text-foreground prose-strong:font-semibold
        prose-em:text-foreground/90
        prose-p:text-foreground/85 prose-li:text-foreground/85
        prose-a:text-[#3b6ff5] prose-a:no-underline hover:prose-a:underline
        prose-code:text-[#3b6ff5] prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
        prose-blockquote:border-l-[#0d4af5] prose-blockquote:text-foreground/70
        prose-hr:border-border
        ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links abrem em nova aba por segurança
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#3b6ff5] hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
}

// ─── markdownPlainText — strip pra previews compactos ───────
export function markdownPlainText(source: string | undefined | null): string {
  if (!source) return "";
  const md = htmlToMarkdown(source); // primeiro converte HTML legacy → MD
  return md
    .replace(/^#{1,6}\s+/gm, "")           // headings
    .replace(/\*\*([^*]+)\*\*/g, "$1")     // bold
    .replace(/\*([^*]+)\*/g, "$1")         // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → texto
    .replace(/^[-*]\s+/gm, "")             // listas bullet
    .replace(/^\d+\.\s+/gm, "")            // listas numéricas
    .replace(/`([^`]+)`/g, "$1")           // inline code
    .replace(/\n{2,}/g, " · ")             // parágrafos como separadores
    .trim();
}

// ─── MarkdownEditor — textarea + toolbar de atalhos ─────────
interface EditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  className?: string;
}

export function MarkdownEditor({ value, onChange, placeholder, minHeight = 120, autoFocus, className }: EditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Autoresize: cresce com conteúdo
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [value, minHeight]);

  // Wrap selection com prefix/suffix (ex.: **bold**)
  const wrap = (prefix: string, suffix = prefix) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = value.slice(0, start);
    const sel = value.slice(start, end);
    const after = value.slice(end);
    const next = `${before}${prefix}${sel || "texto"}${suffix}${after}`;
    onChange(next);
    setTimeout(() => {
      el.focus();
      const cursorStart = before.length + prefix.length;
      el.setSelectionRange(cursorStart, cursorStart + (sel.length || "texto".length));
    }, 0);
  };

  const insertLine = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const before = value.slice(0, start);
    const after = value.slice(start);
    const lineStart = before.lastIndexOf("\n") + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    setTimeout(() => {
      el.focus();
      const newPos = start + prefix.length;
      el.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const insertLink = () => {
    const url = window.prompt("URL do link (https://...):");
    if (!url) return;
    wrap(`[`, `](${url})`);
  };

  return (
    <div className={`rounded-lg border border-border overflow-hidden ${className ?? "bg-[#0a0a0a]"}`}>
      <div className="flex items-center gap-1 bg-muted px-2 py-1.5 border-b border-border">
        <ToolbarBtn icon={Heading} title="Título (## )" onClick={() => insertLine("## ")} />
        <ToolbarBtn icon={Bold} title="Negrito (Cmd+B)" onClick={() => wrap("**")} />
        <ToolbarBtn icon={Italic} title="Itálico (Cmd+I)" onClick={() => wrap("*")} />
        <ToolbarBtn icon={List} title="Lista (- )" onClick={() => insertLine("- ")} />
        <ToolbarBtn icon={ListOrdered} title="Lista numerada (1. )" onClick={() => insertLine("1. ")} />
        <ToolbarBtn icon={LinkIcon} title="Link" onClick={insertLink} />
        <span className="ml-auto text-[9px] text-muted-foreground">Markdown</span>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Atalhos teclado
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); wrap("**"); }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") { e.preventDefault(); wrap("*"); }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-zinc-700 outline-none resize-none leading-relaxed font-mono"
        style={{ minHeight: `${minHeight}px`, overflow: "hidden" }}
      />
    </div>
  );
}

function ToolbarBtn({ icon: Icon, onClick, title }: { icon: typeof Bold; onClick: () => void; title: string }) {
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
