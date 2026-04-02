"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import {
  Search, Users, FileText, TrendingUp, Instagram,
  Palette, MessageCircle, X, Calendar, Lock,
  LayoutDashboard,
} from "lucide-react";

interface SearchResult {
  id: string;
  type: "client" | "task" | "content" | "page";
  title: string;
  subtitle: string;
  href: string;
  icon: typeof Users;
}

const PAGES: SearchResult[] = [
  { id: "p-dash", type: "page", title: "Dashboard", subtitle: "Visão geral", href: "/", icon: LayoutDashboard },
  { id: "p-traffic", type: "page", title: "Tráfego Pago", subtitle: "Campanhas e anúncios", href: "/traffic", icon: TrendingUp },
  { id: "p-social", type: "page", title: "Social Media", subtitle: "Kanban de conteúdo", href: "/social", icon: Instagram },
  { id: "p-design", type: "page", title: "Designer", subtitle: "Fila de design", href: "/design", icon: Palette },
  { id: "p-clients", type: "page", title: "Clientes", subtitle: "Lista de clientes", href: "/clients", icon: Users },
  { id: "p-calendar", type: "page", title: "Calendário", subtitle: "Agenda de publicações", href: "/calendar", icon: Calendar },
  { id: "p-comms", type: "page", title: "Comunicação", subtitle: "Chat global e por cliente", href: "/communications", icon: MessageCircle },
  { id: "p-ceo", type: "page", title: "Área CEO", subtitle: "Visão da diretoria", href: "/ceo", icon: Lock },
];

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { clients, tasks, contentCards } = useAppState();

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Build search results
  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q) return PAGES;

    const items: SearchResult[] = [];

    // Pages
    PAGES.forEach((p) => {
      if (p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q)) {
        items.push(p);
      }
    });

    // Clients
    clients.forEach((c) => {
      if (c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q)) {
        items.push({
          id: `c-${c.id}`,
          type: "client",
          title: c.name,
          subtitle: c.industry,
          href: `/clients/${c.id}`,
          icon: Users,
        });
      }
    });

    // Tasks
    tasks.forEach((t) => {
      if (t.title.toLowerCase().includes(q) || t.clientName.toLowerCase().includes(q)) {
        items.push({
          id: `t-${t.id}`,
          type: "task",
          title: t.title,
          subtitle: `${t.clientName} · ${t.assignedTo}`,
          href: `/clients/${t.clientId}`,
          icon: FileText,
        });
      }
    });

    // Content cards
    contentCards.forEach((c) => {
      if (c.title.toLowerCase().includes(q) || c.clientName.toLowerCase().includes(q)) {
        items.push({
          id: `cc-${c.id}`,
          type: "content",
          title: c.title,
          subtitle: `${c.clientName} · ${c.format}`,
          href: "/social",
          icon: Instagram,
        });
      }
    });

    return items.slice(0, 12);
  }, [query, clients, tasks, contentCards]);

  // Reset selected on results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const navigate = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      navigate(results[selectedIndex].href);
    }
  };

  if (!open) return null;

  const TYPE_LABELS: Record<string, string> = {
    page: "Página",
    client: "Cliente",
    task: "Tarefa",
    content: "Conteúdo",
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Search modal */}
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={18} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar clientes, tarefas, páginas..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-mono border border-border">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-auto py-2">
          {results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum resultado para &quot;{query}&quot;
            </p>
          )}
          {results.map((result, i) => {
            const Icon = result.icon;
            const isSelected = i === selectedIndex;
            return (
              <button
                key={result.id}
                onClick={() => navigate(result.href)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isSelected ? "bg-primary/20" : "bg-muted"
                }`}>
                  <Icon size={15} className={isSelected ? "text-primary" : "text-muted-foreground"} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                    {result.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">{result.subtitle}</p>
                </div>
                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider shrink-0">
                  {TYPE_LABELS[result.type]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground/50">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono">↑↓</kbd> navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono">↵</kbd> abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono">esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
}
