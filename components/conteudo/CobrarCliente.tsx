"use client";

// components/conteudo/CobrarCliente.tsx — "Cobrar cliente" (Leva 7B, N11). O card parado em "Com o
// cliente" há 24h/48h mostra o botão; o clique abre o RASCUNHO para o social copiar e mandar ele
// mesmo. Não há botão de enviar: nada daqui vai para o grupo do cliente (lib/conteudo/cobrar-cliente.ts).

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircleWarning } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn, todaySP } from "@/lib/utils";
import { cobrancaDoCard, type Cobranca } from "@/lib/conteudo/cobrar-cliente";
import { duracaoCurta } from "@/lib/conteudo/capacidade";
import type { ContentCard } from "@/lib/types";

/** A cobrança do card agora (recalcula a cada minuto, sem depender de re-render do quadro). */
export function useCobranca(card: ContentCard, contato?: string | null): Cobranca | null {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return cobrancaDoCard(card, { agoraMs: agora, hoje: todaySP(), contato });
}

export async function copiarTexto(texto: string, aviso = "Copiado."): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
    return true;
  } catch {
    toast.error("Não consegui copiar — selecione o texto e use Ctrl+C.");
    return false;
  }
}

export default function CobrarCliente({ card, contato, variante = "cartao" }: {
  card: ContentCard;
  /** Nome do responsável do cliente, para a saudação. */
  contato?: string | null;
  /** "cartao" = botão pequeno no quadro; "card" = linha no card aberto. */
  variante?: "cartao" | "card";
}) {
  const cobranca = useCobranca(card, contato);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [copiado, setCopiado] = useState(false);
  if (!cobranca) return null;

  const abrir = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTexto(cobranca.rascunho);
    setCopiado(false);
    setAberto(true);
  };
  const tom = cobranca.nivel === 48 ? "text-destructive bg-destructive/10 hover:bg-destructive/20" : "text-lone-warning bg-lone-warning-bg hover:opacity-90";

  return (
    <>
      {variante === "cartao" ? (
        <button type="button" onClick={abrir} title={`Com o cliente há ${duracaoCurta(cobranca.horas * 3_600_000)} — rascunho de cobrança para copiar`}
          className={cn("text-[11px] px-2 py-1 rounded-md transition-colors inline-flex items-center gap-1 font-medium", tom)}>
          <MessageCircleWarning size={11} aria-hidden="true" /> Cobrar cliente
        </button>
      ) : (
        <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
          cobranca.nivel === 48 ? "border-destructive/30 bg-destructive/10" : "border-lone-warning-border bg-lone-warning-bg")}>
          <MessageCircleWarning size={14} className={cobranca.nivel === 48 ? "text-destructive" : "text-lone-warning"} aria-hidden="true" />
          <p className="flex-1 min-w-0 text-xs text-foreground">
            Com o cliente há <span className="font-medium">{duracaoCurta(cobranca.horas * 3_600_000)}</span> sem resposta.
          </p>
          <button type="button" onClick={abrir}
            className="h-7 px-3 rounded-md bg-card border border-border text-[11px] font-medium text-foreground hover:border-primary/40 transition-colors">
            Cobrar cliente
          </button>
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="p-5 pr-12 border-b border-border">
            <DialogTitle className="text-lone-h2 text-foreground">Cobrar cliente · {cobranca.nivel}h</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Rascunho para você copiar e mandar no grupo de {card.clientName}. Nada é enviado daqui.
            </DialogDescription>
          </div>
          <div className="p-5 space-y-2">
            <textarea value={texto} onChange={(e) => { setTexto(e.target.value); setCopiado(false); }} rows={8} aria-label="Rascunho da mensagem"
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground leading-relaxed outline-none focus:border-primary/50 resize-y" />
            <p className="text-[11px] text-muted-foreground">Ajuste o que quiser antes de copiar — é a sua voz com o cliente.</p>
          </div>
          <div className="p-5 border-t border-border flex gap-2">
            <button type="button" onClick={() => setAberto(false)} className="flex-1 h-9 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Fechar</button>
            <button type="button" onClick={async () => { if (await copiarTexto(texto, "Mensagem copiada — cole no grupo do cliente.")) setCopiado(true); }}
              className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5">
              {copiado ? <><Check size={14} aria-hidden="true" /> Copiada</> : <><Copy size={14} aria-hidden="true" /> Copiar mensagem</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
