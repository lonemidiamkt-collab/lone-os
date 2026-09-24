"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useRole } from "@/lib/context/RoleContext";
import type { Role } from "@/lib/types";
import {
  Search, Users, FileText, TrendingUp, Instagram,
  Palette, Calendar, Lock, Inbox,
  LayoutDashboard, Thermometer, ShieldAlert,
  Zap, Target, UserPlus, Plus, FileSignature, Info,
  Handshake, Radar, Bot, BookOpen, ClipboardCheck, Plug,
} from "lucide-react";

interface SearchResult {
  id: string;
  type: "client" | "task" | "content" | "page" | "action";
  title: string;
  subtitle: string;
  href: string;
  icon: typeof Users;
  /** Quem vê o item. Ausente = todos. */
  roles?: Role[];
}

const OPERACAO: Role[] = ["admin", "manager", "traffic", "social", "designer"];
const GESTAO: Role[] = ["admin", "manager"];

const PAGES: SearchResult[] = [
  { id: "p-dash", type: "page", title: "Dashboard", subtitle: "Visão geral", href: "/", icon: LayoutDashboard, roles: OPERACAO },
  { id: "p-mywork", type: "page", title: "Meu Trabalho", subtitle: "Tarefas atribuídas a você", href: "/my-work", icon: Inbox, roles: OPERACAO },
  { id: "p-tarefas", type: "page", title: "Tarefas", subtitle: "Gerenciador de tarefas do time", href: "/tarefas", icon: ClipboardCheck },
  { id: "p-processos", type: "page", title: "Processos", subtitle: "Como cada coisa é feita aqui", href: "/processos", icon: BookOpen },
  { id: "p-traffic", type: "page", title: "Tráfego Pago", subtitle: "Campanhas e anúncios", href: "/traffic", icon: TrendingUp, roles: ["admin", "manager", "traffic"] },
  { id: "p-social", type: "page", title: "Social Media", subtitle: "Kanban de conteúdo", href: "/social", icon: Instagram, roles: ["admin", "manager", "social", "designer"] },
  { id: "p-design", type: "page", title: "Designer", subtitle: "Fila de design", href: "/design", icon: Palette, roles: ["admin", "manager", "designer", "social"] },
  { id: "p-clients", type: "page", title: "Clientes", subtitle: "Lista de clientes", href: "/clients", icon: Users, roles: GESTAO },
  { id: "p-crm", type: "page", title: "Comercial", subtitle: "Funil de vendas (CRM)", href: "/crm", icon: Handshake, roles: ["admin", "manager", "comercial"] },
  { id: "p-prospeccao", type: "page", title: "Prospecção", subtitle: "Piloto SDR e fila do dia", href: "/prospeccao", icon: Radar, roles: GESTAO },
  { id: "p-contratos", type: "page", title: "Contratos", subtitle: "Lista global de contratos", href: "/contratos", icon: FileSignature, roles: GESTAO },
  { id: "p-churn", type: "page", title: "Termômetro de Churn", subtitle: "Score preditivo de risco", href: "/churn", icon: Thermometer, roles: GESTAO },
  { id: "p-defesa", type: "page", title: "Defesa Ativa", subtitle: "Anomalias em Meta Ads", href: "/defesa", icon: ShieldAlert, roles: ["admin", "manager", "traffic"] },
  { id: "p-calendar", type: "page", title: "Calendário", subtitle: "Agenda de publicações", href: "/calendar", icon: Calendar, roles: OPERACAO },
  { id: "p-integrations", type: "page", title: "Conexão Meta", subtitle: "Token e contas de anúncio", href: "/integrations", icon: Plug, roles: ["admin", "manager", "traffic"] },
  { id: "p-agente", type: "page", title: "Agente Lone", subtitle: "Prioridades e decisões do agente", href: "/agente", icon: Bot, roles: GESTAO },
  { id: "p-automations", type: "page", title: "Automações", subtitle: "Regras e gatilhos do sistema", href: "/automations", icon: Zap, roles: GESTAO },
  { id: "p-goals", type: "page", title: "Metas & OKRs", subtitle: "Objetivos do time", href: "/goals", icon: Target, roles: GESTAO },
  { id: "p-sobre", type: "page", title: "Sobre o Sistema", subtitle: "Documentação interna", href: "/sobre", icon: Info, roles: OPERACAO },
  { id: "p-ceo", type: "page", title: "Área CEO", subtitle: "Visão da diretoria", href: "/ceo", icon: Lock, roles: ["admin"] },
];

// Ações rápidas — abrem a página de destino onde a ação acontece (mesmo padrão do Header)
const ACTIONS: SearchResult[] = [
  { id: "a-novo-cliente", type: "action", title: "Novo Cliente", subtitle: "Cadastrar cliente novo", href: "/clients?action=new", icon: UserPlus, roles: GESTAO },
  { id: "a-novo-conteudo", type: "action", title: "Novo Conteúdo", subtitle: "Criar card de social media", href: "/social?action=new-content", icon: Plus, roles: ["admin", "manager", "social", "designer"] },
  { id: "a-novo-contrato", type: "action", title: "Novo Contrato", subtitle: "Gerar contrato pra cliente", href: "/contratos", icon: FileSignature, roles: GESTAO },
];

// "Grafica" acha "Gráfica": o time digita sem acento no celular.
function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const tasks = useOperationalStore((s) => s.tasks);
  const { role } = useRole();
  const pages = useMemo(() => PAGES.filter((p) => !p.roles || p.roles.includes(role)), [role]);
  const actions = useMemo(() => ACTIONS.filter((a) => !a.roles || a.roles.includes(role)), [role]);

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
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
    const q = norm(query).trim();
    // Sem query: mostra ações + páginas (ações primeiro pra ficarem em destaque)
    if (!q) return [...actions, ...pages];

    const qDigits = digitsOnly(q);
    const items: SearchResult[] = [];

    // Ações rápidas
    actions.forEach((a) => {
      if (norm(a.title).includes(q) || norm(a.subtitle).includes(q)) {
        items.push(a);
      }
    });

    // Pages
    pages.forEach((p) => {
      if (norm(p.title).includes(q) || norm(p.subtitle).includes(q)) {
        items.push(p);
      }
    });

    // Clients (busca por nome, nome fantasia, nicho/industry, e CNPJ se digitou número)
    clients.forEach((c) => {
      const { nicho, cnpj, nomeFantasia } = c;
      const subtitle = nicho || c.industry || "";
      const matchesText =
        norm(c.name).includes(q) ||
        norm(nomeFantasia).includes(q) ||
        norm(nicho).includes(q) ||
        norm(c.industry).includes(q);
      const matchesCnpj = qDigits.length >= 4 && cnpj && digitsOnly(cnpj).includes(qDigits);
      if (matchesText || matchesCnpj) {
        items.push({
          id: `c-${c.id}`,
          type: "client",
          title: c.name,
          subtitle: matchesCnpj && cnpj ? `CNPJ ${cnpj}` : nomeFantasia && nomeFantasia !== c.name ? `${nomeFantasia}${subtitle ? ` · ${subtitle}` : ""}` : subtitle,
          href: `/clients/${c.id}`,
          icon: Users,
        });
      }
    });

    // Tasks
    tasks.forEach((t) => {
      if (norm(t.title).includes(q) || norm(t.clientName).includes(q)) {
        items.push({
          id: `t-${t.id}`,
          type: "task",
          title: t.title,
          subtitle: [t.clientName, t.assignedTo].filter(Boolean).join(" · "),
          // Tarefa geral (clientId vazio) abria /clients/undefined.
          href: t.clientId ? `/clients/${t.clientId}` : "/tarefas",
          icon: FileText,
        });
      }
    });

    // Content cards
    contentCards.forEach((c) => {
      if (norm(c.title).includes(q) || norm(c.clientName).includes(q)) {
        items.push({
          id: `cc-${c.id}`,
          type: "content",
          title: c.title,
          subtitle: `${c.clientName} · ${c.format}`,
          href: `/social?card=${c.id}`, // abre o card direto (o social já trata ?card=<id>)
          icon: Instagram,
        });
      }
    });

    return items.slice(0, 16);
  }, [query, clients, tasks, contentCards, actions, pages]);

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
    action: "Ação",
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
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
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
                  {TYPE_LABELS[result.type]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
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
