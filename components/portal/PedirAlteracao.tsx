"use client";

// "Pedir alteração" numa arte ou post agendado do portal (N35). O texto do cliente vira demanda do
// time na hora: a rota /api/portal/[token]/approve (action "ajuste") passa pelo mesmo caminho do
// WhatsApp — volta pro designer, reabre o pedido de arte e avisa o time.

import { useState } from "react";
import { CheckCircle2, Pencil } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";

export default function PedirAlteracao({ token, cardId, titulo, compacto = false, onEnviado }: {
  token: string;
  cardId: string;
  /** Nome da arte, para o leitor de tela. */
  titulo: string;
  /** Botão menor, para cartões pequenos (galeria, lista da agenda). */
  compacto?: boolean;
  onEnviado?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    const comentario = texto.trim();
    if (!comentario) return;
    setEnviando(true);
    setErro(null);
    const r = await chamar(`/api/portal/${token}/approve`, { cardId, action: "ajuste", comment: comentario });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.status === 0 ? "Sem conexão agora. Tenta de novo em instantes?" : (r.erro || "Não consegui enviar agora. Tenta de novo em instantes?"));
      return;
    }
    setEnviado(true);
    setAberto(false);
    setTexto("");
    onEnviado?.();
  }

  if (enviado) {
    return (
      <p className="inline-flex items-center gap-1.5 py-1.5 text-lone-caption font-medium text-lone-success" role="status">
        <CheckCircle2 size={14} aria-hidden /> Pedido enviado ao time. A arte volta para ajuste.
      </p>
    );
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        aria-label={`Pedir alteração em ${titulo}`}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card font-medium text-secondary-foreground transition-colors hover:bg-accent",
          compacto ? "min-h-[36px] px-2.5 text-xs" : "min-h-[44px] w-full px-3 text-sm",
        )}>
        <Pencil size={compacto ? 13 : 15} aria-hidden /> Pedir alteração
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={500}
        aria-label={`O que mudar em ${titulo}?`}
        placeholder="O que você quer que a gente mude?"
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
      {erro && <p className="text-lone-caption text-lone-warning" role="alert">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={enviando || !texto.trim()} onClick={enviar}
          className="min-h-[40px] flex-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {enviando ? "Enviando…" : "Enviar pedido"}
        </button>
        <button type="button" onClick={() => { setAberto(false); setTexto(""); setErro(null); }}
          className="min-h-[40px] rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </div>
  );
}
