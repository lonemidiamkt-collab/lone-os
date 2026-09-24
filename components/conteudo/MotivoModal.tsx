"use client";

// components/conteudo/MotivoModal.tsx — a pergunta "por quê?" antes de uma transição que precisa de
// motivo: pedir alteração da arte (social) e devolver o card ao social (designer).

import { useState } from "react";
import { RotateCcw, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Motivos prontos de devolução — os mesmos que o designer usava no quadro antigo. */
export const MOTIVOS_DEVOLUCAO = [
  "Falta de dados / briefing incompleto",
  "Texto/copy muito longo ou inadequado",
  "Referência visual ruim ou ausente",
  "Aguardando aprovação prévia",
  "Assets do cliente não recebidos",
  "Formato/dimensão indefinido",
];

export type TipoMotivo = "alteracao" | "devolver";

const TEXTOS: Record<TipoMotivo, { titulo: string; ajuda: string; placeholder: string; botao: string }> = {
  alteracao: {
    titulo: "Pedir alteração da arte",
    ajuda: "O card volta pro designer com este pedido. A entrega anterior fica no histórico.",
    placeholder: "O que precisa mudar? Ex.: trocar a foto do produto, preço errado no rodapé…",
    botao: "Mandar pro designer",
  },
  devolver: {
    titulo: "Devolver ao social",
    ajuda: "O card fica marcado como bloqueado até o social resolver. Ele é avisado.",
    placeholder: "Ou descreva o que está faltando…",
    botao: "Devolver card",
  },
};

export default function MotivoModal({ tipo, tituloCard, onConfirmar, onClose, inicial }: {
  tipo: TipoMotivo;
  tituloCard: string;
  /** Texto que já vem escrito (ex.: "Falta no pedido: briefing, formato."). */
  inicial?: string;
  /** Devolve true quando deu certo (fecha o modal); false mantém aberto com o texto. */
  onConfirmar: (motivo: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = TEXTOS[tipo];
  const [motivo, setMotivo] = useState(inicial ?? "");
  const [enviando, setEnviando] = useState(false);
  const Icone = tipo === "alteracao" ? RotateCcw : Undo2;

  const confirmar = async () => {
    const m = motivo.trim();
    if (!m || enviando) return;
    setEnviando(true);
    const ok = await onConfirmar(m);
    setEnviando(false);
    if (ok) onClose();
  };

  // Dialog do Radix (não um div fixo): abre por cima do card aberto sem perder o foco nem o clique.
  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="p-5 pr-12 border-b border-border">
          <DialogTitle className="text-lone-h2 text-foreground flex items-center gap-2"><Icone size={15} className="text-destructive" aria-hidden="true" /> {t.titulo}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 truncate">{tituloCard}</DialogDescription>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">{t.ajuda}</p>
          {tipo === "devolver" && (
            <div className="space-y-1.5">
              {MOTIVOS_DEVOLUCAO.map((m) => (
                <button key={m} type="button" onClick={() => setMotivo(m)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors ${
                    motivo === m ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void confirmar(); }}
            rows={3}
            autoFocus={tipo === "alteracao"}
            placeholder={t.placeholder}
            aria-label="Motivo"
            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none"
          />
        </div>
        <div className="p-5 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancelar</button>
          <button onClick={() => void confirmar()} disabled={!motivo.trim() || enviando}
            className="flex-1 h-9 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 text-sm font-medium hover:bg-destructive/20 transition-colors disabled:opacity-40">
            {enviando ? "Enviando…" : t.botao}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
