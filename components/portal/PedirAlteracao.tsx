"use client";

// "Pedir alteração" numa arte ou post agendado do portal (N35). O texto do cliente vira demanda do
// time na hora: a rota /api/portal/[token]/approve (action "ajuste") passa pelo mesmo caminho do
// WhatsApp — volta pro designer, reabre o pedido de arte e avisa o time.
//
// 25/10/2026 (onda 6 da auditoria de erro recuperável, 12.5): o pedido age na hora e tirava o post da
// agenda sem volta — clique no card errado, ou um "tá ótimo" escrito aqui, desagendava. Agora o campo
// avisa o que acontece ao enviar, e depois de enviado há "Desfazer" por 10 minutos (enquanto ninguém do
// time mexeu na arte). Desfeito, a arte volta exatamente para onde estava.

import { useEffect, useState } from "react";
import { CheckCircle2, Pencil, Undo2 } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";

type Enviado = { desfazerId: string | null; ate: number | null };

const horaSP = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

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
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);
  const [desfeito, setDesfeito] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  // O botão "Desfazer" some sozinho quando o prazo acaba.
  useEffect(() => {
    if (!enviado?.ate) return;
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [enviado?.ate]);

  async function enviar() {
    const comentario = texto.trim();
    if (!comentario) return;
    setEnviando(true);
    setErro(null);
    const r = await chamar<{ desfazer?: { id: string; ate: string } | null }>(`/api/portal/${token}/approve`, { cardId, action: "ajuste", comment: comentario });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.status === 0 ? "Sem conexão agora. Tenta de novo em instantes?" : (r.erro || "Não consegui enviar agora. Tenta de novo em instantes?"));
      return;
    }
    const d = r.data?.desfazer ?? null;
    setEnviado({ desfazerId: d?.id ?? null, ate: d?.ate ? new Date(d.ate).getTime() : null });
    setAgora(Date.now());
    setAberto(false);
    setTexto("");
    onEnviado?.();
  }

  async function desfazer() {
    if (!enviado?.desfazerId || desfazendo) return;
    setDesfazendo(true);
    setErro(null);
    const r = await chamar(`/api/portal/${token}/approve`, { cardId, action: "desfazer_ajuste", desfazerId: enviado.desfazerId });
    setDesfazendo(false);
    if (!r.ok) {
      setErro(r.status === 0 ? "Sem conexão agora. Tenta de novo em instantes?" : (r.erro || "Não consegui desfazer agora."));
      return;
    }
    setEnviado(null);
    setDesfeito(true);
    onEnviado?.();
  }

  if (desfeito) {
    return (
      <p className="inline-flex items-center gap-1.5 py-1.5 text-lone-caption font-medium text-lone-success" role="status">
        <Undo2 size={14} aria-hidden /> Pedido desfeito. A arte voltou para onde estava.
      </p>
    );
  }

  if (enviado) {
    const podeDesfazer = !!enviado.desfazerId && !!enviado.ate && agora < enviado.ate;
    return (
      <div className="space-y-1.5" role="status">
        <p className="inline-flex items-center gap-1.5 py-1 text-lone-caption font-medium text-lone-success">
          <CheckCircle2 size={14} aria-hidden /> Pedido enviado ao time. A arte voltou para o designer ajustar.
        </p>
        {podeDesfazer && (
          <button type="button" onClick={desfazer} disabled={desfazendo}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-secondary-foreground hover:bg-accent disabled:opacity-50">
            <Undo2 size={13} aria-hidden /> {desfazendo ? "Desfazendo…" : `Desfazer (até ${horaSP(enviado.ate!)})`}
          </button>
        )}
        {erro && <p className="text-lone-caption text-lone-warning" role="alert">{erro}</p>}
      </div>
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
        aria-describedby={`pedir-alteracao-aviso-${cardId}`}
        placeholder="O que você quer que a gente mude?"
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
      {/* Diz ANTES o que o envio faz: a arte sai da agenda e volta para produção. */}
      <p id={`pedir-alteracao-aviso-${cardId}`} className="text-lone-caption text-muted-foreground">
        Ao enviar, esta arte volta para o designer refazer (e sai da agenda, se já estava marcada). Se foi engano, dá para desfazer por 10 minutos.
      </p>
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
