"use client";

// components/conteudo/ParaAgendar.tsx — "Copiar legenda" e "Baixar artes (.zip)" (Leva 7B, N14).
// Para agendar no mLabs sem redigitar a legenda nem baixar arte por arte. O zip é montado no
// servidor (/api/conteudo/artes-zip): só as entregas do designer, na ordem do carrossel, com a
// legenda em legenda.txt.

import { useState } from "react";
import { Copy, Download, Loader } from "lucide-react";
import { toast } from "sonner";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { cn } from "@/lib/utils";
import { legendaCompleta } from "@/lib/conteudo/previa";
import { copiarTexto } from "@/components/conteudo/CobrarCliente";

/** Baixa o .zip das artes dos cards. true = baixou. A falha vira toast com a frase do servidor. */
export async function baixarArtesZip(cardIds: string[]): Promise<boolean> {
  try {
    // Binário: chamar() só lê JSON, então aqui é o fetch cru, com cada falha dita.
    const r = await authedFetch("/api/conteudo/artes-zip", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardIds }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({})) as { error?: string };
      toast.error(d.error || `Não consegui montar o zip (erro ${r.status}).`);
      return false;
    }
    const nome = r.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "artes.zip";
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
    return true;
  } catch {
    toast.error("Sem conexão para baixar as artes. Tenta de novo?");
    return false;
  }
}

export default function ParaAgendar({ cardId, caption, hashtags, temArte, className }: {
  cardId: string;
  caption?: string | null;
  hashtags?: string | null;
  temArte: boolean;
  className?: string;
}) {
  const [baixando, setBaixando] = useState(false);
  const texto = legendaCompleta(caption, hashtags);
  const botao = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:border-primary/40 transition-colors disabled:opacity-40 disabled:pointer-events-none";
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button type="button" disabled={!texto} onClick={() => void copiarTexto(texto, "Legenda copiada — com as hashtags.")}
        title={texto ? "Legenda + hashtags, prontas para colar no mLabs" : "O card ainda não tem legenda"} className={botao}>
        <Copy size={13} aria-hidden="true" /> Copiar legenda
      </button>
      <button type="button" disabled={!temArte || baixando}
        onClick={async () => { setBaixando(true); await baixarArtesZip([cardId]); setBaixando(false); }}
        title={temArte ? "As artes entregues, na ordem do carrossel, com a legenda em legenda.txt" : "O card ainda não tem arte"} className={botao}>
        {baixando ? <Loader size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
        {baixando ? "Montando o zip…" : "Baixar artes (.zip)"}
      </button>
    </div>
  );
}
