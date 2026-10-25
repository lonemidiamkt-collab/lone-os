"use client";

// components/tarefas/ErroCargaTarefas.tsx — as tarefas NÃO carregaram (25/10/2026, auditoria 13.4/6.4).
//
// Antes a falha virava lista vazia: a tela de Tarefas dizia "Nenhuma tarefa em aberto" e o Hoje "Tudo em dia!". Agora o
// store marca `tarefasErro` e toda tela que lista tarefas usa este aviso, com "Tentar de novo". Sem erro, não renderiza.

import { useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { cn } from "@/lib/utils";

export default function ErroCargaTarefas({ variante = "bloco", className }: { variante?: "bloco" | "faixa"; className?: string }) {
  const erro = useOperationalStore((s) => s.tarefasErro);
  const recarregar = useOperationalStore((s) => s.recarregar);
  const [tentando, setTentando] = useState(false);
  if (!erro) return null;

  const tentar = async () => {
    setTentando(true);
    try { await recarregar(); } finally { setTentando(false); }
  };
  const botao = (
    <button type="button" onClick={() => void tentar()} disabled={tentando}
      className="inline-flex items-center gap-1.5 rounded-lg border border-lone-danger-border bg-card px-3 py-1.5 text-xs font-medium text-lone-danger hover:opacity-90 disabled:opacity-60">
      <RotateCcw size={12} aria-hidden="true" className={tentando ? "animate-spin" : undefined} /> {tentando ? "Tentando…" : "Tentar de novo"}
    </button>
  );

  if (variante === "faixa") {
    return (
      <div role="alert" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3", className)}>
        <p className="text-sm text-lone-danger">{erro}. O que depende das tarefas nesta tela pode estar incompleto — não é &quot;nenhuma tarefa&quot;.</p>
        {botao}
      </div>
    );
  }
  return (
    <div role="alert" className={cn("text-center py-12 px-4 rounded-xl border border-lone-danger-border bg-lone-danger-bg", className)}>
      <AlertTriangle size={22} className="mx-auto mb-3 text-lone-danger" aria-hidden="true" />
      <p className="text-sm font-medium text-lone-danger">Não consegui carregar as tarefas</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">Não é que não exista nenhuma: a leitura falhou. ({erro})</p>
      {botao}
    </div>
  );
}
