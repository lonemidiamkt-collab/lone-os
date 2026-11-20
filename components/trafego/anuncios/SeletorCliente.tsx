"use client";

// Escolha do cliente na aba Anúncios Meta (19/11/2026). Antes eram 53 botões soltos em cima da tela (uma parede que
// empurrava os números para baixo). Agora: um botão com o cliente aberto e uma lista com busca — Enter abre o primeiro,
// setas navegam, Esc fecha.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LayoutGrid, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function SeletorCliente({ clientes, selecionado, onEscolher }: {
  clientes: { id: string; name: string }[];
  selecionado: string; // "all" ou id
  onEscolher: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const ordenados = useMemo(() => [...clientes].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [clientes]);
  const opcoes = useMemo(() => {
    const q = norm(busca.trim());
    const lista = ordenados.filter((c) => !q || norm(c.name).includes(q));
    return q ? lista : [{ id: "all", name: "Todos os clientes (carteira)" }, ...lista];
  }, [ordenados, busca]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    setTimeout(() => campo.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  useEffect(() => setFoco(0), [busca]);

  const escolher = (id: string) => { onEscolher(id); setAberto(false); setBusca(""); };
  const atual = selecionado === "all" ? null : clientes.find((c) => c.id === selecionado);

  return (
    <div ref={caixa} className="relative">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setAberto(!aberto)} aria-haspopup="listbox" aria-expanded={aberto}
          className="flex h-9 min-w-[240px] max-w-[320px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-sm hover:border-primary/40">
          {atual ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : <LayoutGrid size={14} className="shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate">{atual ? atual.name : "Todos os clientes"}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{clientes.length}</span>
          <ChevronDown size={14} className={cn("shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} />
        </button>
        {atual && (
          <button type="button" onClick={() => onEscolher("all")} title="Voltar para a carteira" aria-label="Voltar para a carteira"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>
      {aberto && (
        <div className="absolute left-0 top-10 z-40 w-[320px] overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <div className="relative border-b border-border">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input ref={campo} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => Math.min(opcoes.length - 1, f + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(0, f - 1)); }
                else if (e.key === "Enter" && opcoes[foco]) { e.preventDefault(); escolher(opcoes[foco].id); }
                else if (e.key === "Escape") setAberto(false);
              }}
              className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none" />
          </div>
          <ul role="listbox" className="max-h-[320px] overflow-y-auto p-1">
            {opcoes.map((c, i) => (
              <li key={c.id} role="option" aria-selected={selecionado === c.id}>
                <button type="button" onMouseEnter={() => setFoco(i)} onClick={() => escolher(c.id)}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm",
                    i === foco ? "bg-muted" : "", c.id === "all" && "font-medium")}>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {selecionado === c.id && <Check size={14} className="shrink-0 text-primary" />}
                </button>
              </li>
            ))}
            {!opcoes.length && <li className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum cliente encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
