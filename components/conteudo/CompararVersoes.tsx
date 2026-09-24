"use client";

// components/conteudo/CompararVersoes.tsx — versão anterior × atual lado a lado, com o motivo da
// alteração fixado no topo (Leva 7B, N17). Na revisão, o social confere se o pedido foi atendido
// sem abrir o WhatsApp para achar a arte velha; na alteração, o designer vê exatamente o que mudar.

import { useEffect, useState } from "react";
import { Columns2, Pin } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import SignedImage from "@/components/shared/SignedImage";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { parParaComparar, podeComparar, type VersaoArte } from "@/lib/conteudo/versoes";

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function useVersoes(cardId: string, gatilho?: unknown) {
  const [versoes, setVersoes] = useState<VersaoArte[] | null>(null);
  useEffect(() => {
    let vivo = true;
    chamar<{ versoes: VersaoArte[] }>(`/api/conteudo/versoes?cardId=${cardId}`).then((r) => {
      if (vivo) setVersoes(r.ok && r.data ? r.data.versoes : []);
    });
    return () => { vivo = false; };
  }, [cardId, gatilho]);
  return versoes;
}

function Coluna({ versao, rotulo, destaque }: { versao: VersaoArte | null; rotulo: string; destaque?: boolean }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-baseline gap-2">
        <span className={cn("text-xs font-medium", destaque ? "text-primary" : "text-foreground")}>{rotulo}{versao ? ` · V${versao.versao}` : ""}</span>
        {versao && <span className="text-[11px] text-muted-foreground truncate">{versao.por || "—"} · {dataHora(versao.em)}</span>}
      </div>
      {!versao || versao.urls.length === 0 ? (
        <div className="aspect-[4/5] rounded-lg border border-dashed border-border bg-muted flex items-center justify-center text-[11px] text-muted-foreground px-4 text-center">
          {versao ? "Os arquivos desta versão não estão mais guardados." : "Sem versão anterior."}
        </div>
      ) : (
        <div className="space-y-2">
          {versao.urls.map((u, i) => (
            <a key={`${u}-${i}`} href={u} target="_blank" rel="noopener noreferrer"
              className={cn("block rounded-lg overflow-hidden border bg-muted", destaque ? "border-primary/40" : "border-border")}>
              <SignedImage src={u} alt={`V${versao.versao} — arte ${i + 1}`} className="w-full h-auto object-contain" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CompararVersoes({ cardId, alteracaoPendente, gatilho, className, camada }: {
  cardId: string;
  /** Motivo da alteração pedida e ainda não reentregue (card.alteracaoMotivo). */
  alteracaoPendente?: string | null;
  /** Muda quando há entrega nova (recarrega as versões). */
  gatilho?: unknown;
  className?: string;
  /** z-index do diálogo quando ele abre por cima de uma tela cheia (modo foco). */
  camada?: string;
}) {
  const versoes = useVersoes(cardId, gatilho);
  const [aberto, setAberto] = useState(false);
  if (!versoes || versoes.length === 0) return null;
  const par = parParaComparar(versoes, alteracaoPendente);
  const lado = podeComparar(versoes);
  // Com uma versão só não há o que comparar — a não ser que a alteração esteja pedida (o designer vê a
  // arte atual com o motivo fixado).
  if (!lado && !par.pendente) return null;

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:border-primary/40 transition-colors", className)}>
        <Columns2 size={13} aria-hidden="true" />
        {lado ? `Comparar V${par.anterior!.versao} × V${par.atual!.versao}` : `Ver V${par.atual!.versao} com o pedido`}
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className={cn("max-w-4xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden", camada)}>
          <div className="p-5 pr-12 border-b border-border space-y-3">
            <div>
              <DialogTitle className="text-lone-h2 text-foreground">Versões da arte</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                {par.pendente ? "A alteração está pedida — o que precisa mudar na versão atual." : "A versão atual é a resposta ao pedido abaixo. Confira se foi atendido."}
              </DialogDescription>
            </div>
            <div className={cn("rounded-lg border px-3 py-2.5", par.motivo ? "border-lone-warning-border bg-lone-warning-bg" : "border-border bg-muted")}>
              <p className="text-lone-eyebrow uppercase text-muted-foreground flex items-center gap-1.5"><Pin size={11} aria-hidden="true" /> Motivo da alteração</p>
              <p className="mt-1 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{par.motivo ?? "Nenhum motivo registrado para esta versão."}</p>
            </div>
          </div>
          <div className="p-5 overflow-y-auto">
            <div className={cn("grid gap-4", lado ? "sm:grid-cols-2" : "max-w-sm")}>
              {lado && <Coluna versao={par.anterior} rotulo="Anterior" />}
              <Coluna versao={par.atual} rotulo="Atual" destaque />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
