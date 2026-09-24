"use client";

// Busca rápida (⌘K / Ctrl+K) — abre de qualquer tela, inclusive com o cursor dentro de um campo.
//
// Cobre: telas e abas do menu (lib/navegacao/menu.ts, já filtradas pelo papel — ninguém acha pela busca
// uma tela que não veria no menu), ações rápidas, clientes, cards de conteúdo e tarefas. Tudo sai dos
// stores que o AppShell já carregou no login: a busca não faz nenhuma chamada nova ao servidor.

import { ABRIR_BUSCA } from "@/components/TopActions";
import { useState, useEffect, useRef, useMemo, useCallback, useId } from "react";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useRole } from "@/lib/context/RoleContext";
import type { Role } from "@/lib/types";
import { GESTAO, normalizar, papelVe, telasParaBusca } from "@/lib/navegacao/menu";
import { useIrPara } from "@/components/navegacao/useIrPara";
import { cn } from "@/lib/utils";
import {
  Search, Users, FileText, Instagram, UserPlus, Plus, FileSignature, ListChecks, CornerDownLeft,
  ArrowUp, ArrowDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Tipo = "action" | "page" | "client" | "content" | "task";

interface Resultado {
  id: string;
  tipo: Tipo;
  titulo: string;
  subtitulo: string;
  href: string;
  aba?: string;
  icone: LucideIcon;
}

const ROTULO_TIPO: Record<Tipo, string> = {
  action: "Ações",
  page: "Telas",
  client: "Clientes",
  content: "Conteúdos",
  task: "Tarefas",
};

// Quanto cada tipo mostra, no máximo — sem isso, "a" devolvia 16 clientes e nenhuma tela.
const LIMITE: Record<Tipo, number> = { action: 4, page: 8, client: 6, content: 5, task: 5 };

interface Acao extends Resultado { papeis?: readonly Role[] }

function acoesDoPapel(role: Role): Resultado[] {
  // Nova tarefa abre o mesmo formulário da tela de Tarefas; quem tem Meu Trabalho cai na vista de lá.
  const novaTarefa = papelVe(role, "/my-work?view=tarefas")
    ? "/my-work?view=tarefas&acao=nova-tarefa"
    : "/tarefas?acao=nova-tarefa";
  const acoes: Acao[] = [
    { id: "a-nova-tarefa", tipo: "action", titulo: "Nova tarefa", subtitulo: "Criar tarefa pra você ou pro time", href: novaTarefa, icone: ListChecks },
    { id: "a-novo-conteudo", tipo: "action", titulo: "Novo conteúdo", subtitulo: "Criar card de social media", href: "/social?action=new-content", icone: Plus, papeis: ["admin", "manager", "social", "designer"] },
    { id: "a-novo-cliente", tipo: "action", titulo: "Novo cliente", subtitulo: "Cadastrar cliente novo", href: "/clients?action=new", icone: UserPlus, papeis: GESTAO },
    { id: "a-novo-contrato", tipo: "action", titulo: "Novo contrato", subtitulo: "Gerar contrato pra cliente", href: "/contratos", icone: FileSignature, papeis: GESTAO },
  ];
  return acoes.filter((a) => !a.papeis || a.papeis.includes(role));
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Começa com o termo vale mais que contém; título vale mais que o resto. */
function nota(titulo: string, resto: string, q: string): number {
  const t = normalizar(titulo);
  if (t.startsWith(q)) return 3;
  if (t.includes(q)) return 2;
  return normalizar(resto).includes(q) ? 1 : 0;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const irPara = useIrPara();
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const tasks = useOperationalStore((s) => s.tasks);
  const { role } = useRole();
  const idBase = useId();

  const telas = useMemo(() => telasParaBusca(role), [role]);
  const acoes = useMemo(() => acoesDoPapel(role), [role]);
  const hrefTarefas = useMemo(() => (papelVe(role, "/my-work?view=tarefas") ? "/my-work?view=tarefas" : "/tarefas"), [role]);

  // ⌘K / Ctrl+K abre e fecha. Na fase de CAPTURA: editor, modal ou campo que pare a propagação da
  // tecla não "engole" o atalho.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
    };
    const abrir = () => setOpen(true);
    window.addEventListener("keydown", handler, true);
    window.addEventListener(ABRIR_BUSCA, abrir);
    return () => {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener(ABRIR_BUSCA, abrir);
    };
  }, []);

  // Esc fecha de qualquer lugar enquanto a busca está aberta.
  useEffect(() => {
    if (!open) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo<Resultado[]>(() => {
    const q = normalizar(query).trim();
    // Sem termo: ações + as telas principais (as abas internas só aparecem quando se digita).
    if (!q) {
      return [...acoes, ...telas.filter((t) => !t.aba).map((t): Resultado => ({
        id: t.id, tipo: "page", titulo: t.titulo, subtitulo: t.subtitulo, href: t.href, aba: t.aba, icone: t.icone,
      }))];
    }

    const qDigits = digitsOnly(q);
    const porTipo: Record<Tipo, { r: Resultado; n: number }[]> = { action: [], page: [], client: [], content: [], task: [] };

    for (const a of acoes) {
      const n = nota(a.titulo, a.subtitulo, q);
      if (n) porTipo.action.push({ r: a, n });
    }

    for (const t of telas) {
      const n = nota(t.titulo, t.texto, q);
      if (n) porTipo.page.push({ r: { id: t.id, tipo: "page", titulo: t.titulo, subtitulo: t.subtitulo, href: t.href, aba: t.aba, icone: t.icone }, n });
    }

    // Clientes: nome, nome fantasia, nicho/segmento e CNPJ (se digitou número).
    for (const c of clients) {
      const { nicho, cnpj, nomeFantasia } = c;
      const segmento = nicho || c.industry || "";
      let n = nota(c.name, [nomeFantasia, nicho, c.industry].join(" "), q);
      const casaCnpj = qDigits.length >= 4 && !!cnpj && digitsOnly(cnpj).includes(qDigits);
      if (!n && casaCnpj) n = 1;
      if (!n) continue;
      porTipo.client.push({
        n,
        r: {
          id: `c-${c.id}`, tipo: "client", titulo: c.name,
          subtitulo: casaCnpj && cnpj ? `CNPJ ${cnpj}`
            : nomeFantasia && nomeFantasia !== c.name ? `${nomeFantasia}${segmento ? ` · ${segmento}` : ""}` : segmento,
          href: `/clients/${c.id}`, icone: Users,
        },
      });
    }

    for (const c of contentCards) {
      const n = nota(c.title, c.clientName, q);
      if (!n) continue;
      porTipo.content.push({
        n,
        r: {
          id: `cc-${c.id}`, tipo: "content", titulo: c.title, subtitulo: `${c.clientName} · ${c.format}`,
          href: `/social?card=${c.id}`, // o /social abre o card direto com ?card=<id>
          icone: Instagram,
        },
      });
    }

    for (const t of tasks) {
      const n = nota(t.title, t.clientName, q);
      if (!n) continue;
      porTipo.task.push({
        n,
        r: {
          id: `t-${t.id}`, tipo: "task", titulo: t.title,
          subtitulo: [t.clientName, t.assignedTo, t.status === "done" ? "concluída" : null].filter(Boolean).join(" · "),
          // Tarefa geral (clientId vazio) abria /clients/undefined.
          href: t.clientId ? `/clients/${t.clientId}` : hrefTarefas,
          icone: FileText,
        },
      });
    }

    const ordem: Tipo[] = ["action", "page", "client", "content", "task"];
    return ordem.flatMap((tipo) =>
      porTipo[tipo].sort((a, b) => b.n - a.n).slice(0, LIMITE[tipo]).map((x) => x.r),
    );
  }, [query, clients, tasks, contentCards, acoes, telas, hrefTarefas]);

  useEffect(() => { setSelectedIndex(0); }, [results]);

  // A seleção pelo teclado sempre à vista (a lista rola).
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-indice="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open]);

  const abrirResultado = useCallback((r: Resultado) => {
    setOpen(false);
    irPara({ href: r.href, aba: r.aba });
  }, [irPara]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      abrirResultado(results[selectedIndex]);
    }
  };

  if (!open) return null;

  const idLista = `${idBase}-lista`;
  const idOpcao = (i: number) => `${idBase}-opcao-${i}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true" aria-label="Busca rápida">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={() => setOpen(false)} />

      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-sm overflow-hidden animate-fade-in">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={18} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar telas, clientes, conteúdos, tarefas…"
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-activedescendant={results[selectedIndex] ? idOpcao(selectedIndex) : undefined}
            aria-autocomplete="list"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-mono border border-border">
            Esc
          </kbd>
        </div>

        <div ref={listRef} id={idLista} role="listbox" aria-label="Resultados" className="max-h-[50vh] overflow-auto py-2">
          {results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nada encontrado para &quot;{query}&quot;
            </p>
          )}
          {results.map((r, i) => {
            const Icon = r.icone;
            const isSelected = i === selectedIndex;
            const novoGrupo = i === 0 || results[i - 1].tipo !== r.tipo;
            return (
              <div key={r.id} role="presentation">
                {novoGrupo && (
                  <p className={cn("px-4 pb-1 text-lone-eyebrow uppercase text-muted-foreground", i > 0 ? "pt-3" : "pt-1")} role="presentation">
                    {ROTULO_TIPO[r.tipo]}
                  </p>
                )}
                <button
                  id={idOpcao(i)}
                  role="option"
                  aria-selected={isSelected}
                  data-indice={i}
                  tabIndex={-1}
                  onClick={() => abrirResultado(r)}
                  onMouseMove={() => { if (!isSelected) setSelectedIndex(i); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                    isSelected ? "bg-primary/10" : "hover:bg-muted/50",
                  )}
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", isSelected ? "bg-primary/15" : "bg-muted")}>
                    <Icon size={15} className={isSelected ? "text-primary" : "text-muted-foreground"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium truncate", isSelected ? "text-primary" : "text-foreground")}>
                      {r.titulo}
                    </p>
                    {r.subtitulo && <p className="text-[11px] text-muted-foreground truncate">{r.subtitulo}</p>}
                  </div>
                  {isSelected && <CornerDownLeft size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted border border-border font-mono">
              <ArrowUp size={10} /><ArrowDown size={10} />
            </kbd>
            navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-muted border border-border font-mono">
              <CornerDownLeft size={10} />
            </kbd>
            abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono">Esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
}
