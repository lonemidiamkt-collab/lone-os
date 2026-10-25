"use client";

// components/conteudo/ErroCargaCards.tsx — os cards de conteúdo NÃO carregaram (25/10/2026, onda 5 do erro recuperável).
//
// Antes a leitura que falhava no servidor voltava como lista vazia: o quadro abria "sem cards", o Hoje dizia que não
// havia nada, a carga da equipe mostrava zero. Agora /api/data/content responde 503, o store marca `loadError`, e
// toda tela que mostra cards usa este aviso: diz que não carregou e oferece "Tentar de novo" (o polling também
// tenta sozinho). Sem erro, não renderiza nada.

import { useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useContentStore } from "@/stores/useContentStore";
import { cn } from "@/lib/utils";

export default function ErroCargaCards({ variante = "bloco", className }: { variante?: "bloco" | "faixa"; className?: string }) {
  const loadError = useContentStore((s) => s.loadError);
  const init = useContentStore((s) => s.init);
  const [tentando, setTentando] = useState(false);
  if (!loadError) return null;

  const tentar = async () => {
    setTentando(true);
    try { await init(); } finally { setTentando(false); }
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
        <p className="text-sm text-lone-danger">
          Não consegui carregar os cards de conteúdo — o que depende deles nesta tela pode estar incompleto. Não é &quot;nenhum card&quot;.
        </p>
        {botao}
      </div>
    );
  }
  return (
    <div role="alert" className={cn("text-center py-12 px-4 rounded-xl border border-lone-danger-border bg-lone-danger-bg", className)}>
      <AlertTriangle size={22} className="mx-auto mb-3 text-lone-danger" aria-hidden="true" />
      <p className="text-sm font-medium text-lone-danger">Não consegui carregar os cards</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">Não é que não exista nenhum: a leitura falhou. O quadro também tenta de novo sozinho.</p>
      {botao}
    </div>
  );
}
