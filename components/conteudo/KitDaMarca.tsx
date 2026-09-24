"use client";

// components/conteudo/KitDaMarca.tsx — o KIT DA MARCA ao lado da tarefa de arte (Leva 7B, N16): logo,
// paleta, tipografia, tom, o que não usar e as últimas 6 peças aprovadas. Um painel só, no card do
// designer e no modo foco — sem abrir ficha, Drive e WhatsApp para lembrar a cara do cliente.

import { useEffect, useState } from "react";
import { Ban, Copy, Download, Palette, Type, MessageSquareQuote, ImageIcon, Loader } from "lucide-react";
import SignedImage from "@/components/shared/SignedImage";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import type { KitDaMarca as Kit } from "@/lib/conteudo/kit-marca";
import { copiarTexto } from "@/components/conteudo/CobrarCliente";

const cache = new Map<string, Kit>();

export function useKitDaMarca(clientId: string | null | undefined, cardId?: string | null) {
  const chave = clientId ? `${clientId}|${cardId ?? ""}` : "";
  const [kit, setKit] = useState<Kit | null>(chave ? cache.get(chave) ?? null : null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let vivo = true;
    setErro(null);
    if (cache.has(chave)) setKit(cache.get(chave)!);
    const q = new URLSearchParams({ clientId });
    if (cardId) q.set("cardId", cardId);
    chamar<Kit>(`/api/conteudo/kit-marca?${q}`).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui carregar o kit."); return; }
      cache.set(chave, r.data);
      setKit(r.data);
    });
    return () => { vivo = false; };
  }, [clientId, cardId, chave]);
  return { kit, erro };
}

function Bloco({ icone: Icone, titulo, children }: { icone: typeof Palette; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-lone-eyebrow uppercase text-muted-foreground flex items-center gap-1.5"><Icone size={11} aria-hidden="true" /> {titulo}</p>
      {children}
    </div>
  );
}

export default function KitDaMarca({ clientId, cardId, className, compacto }: {
  clientId: string;
  cardId?: string | null;
  className?: string;
  /** No card aberto: começa recolhido. */
  compacto?: boolean;
}) {
  const { kit, erro } = useKitDaMarca(clientId, cardId);
  const [aberto, setAberto] = useState(!compacto);

  const corpo = !kit ? (
    erro ? <p className="text-xs text-destructive">{erro}</p>
      : <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader size={13} className="animate-spin" aria-hidden="true" /> Carregando o kit…</div>
  ) : (
    <div className="space-y-4">
      {kit.logos.length > 0 && (
        <Bloco icone={ImageIcon} titulo="Logo">
          <div className="flex flex-wrap gap-2">
            {kit.logos.map((l) => (
              <a key={l.url} href={l.url} download target="_blank" rel="noopener noreferrer" title={`Baixar: ${l.nome}`}
                className="group relative w-16 h-16 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center hover:border-primary/40 transition-colors">
                <SignedImage src={l.url} alt={l.nome} className="max-w-full max-h-full object-contain p-1" />
                <span className="absolute inset-x-0 bottom-0 hidden group-hover:flex justify-center bg-overlay text-overlay-foreground py-0.5"><Download size={10} aria-hidden="true" /></span>
              </a>
            ))}
          </div>
        </Bloco>
      )}

      {kit.paleta.length > 0 && (
        <Bloco icone={Palette} titulo="Paleta">
          <div className="flex flex-wrap gap-1.5">
            {kit.paleta.map((c) => (
              <button key={c.hex} type="button" onClick={() => void copiarTexto(c.hex, `${c.hex} copiado.`)} title={`${c.nome} — clique para copiar`}
                className="inline-flex items-center gap-1.5 h-7 pl-1 pr-2 rounded-md border border-border bg-card text-[11px] text-foreground hover:border-primary/40 transition-colors">
                {/* Cor da marca do cliente é DADO (vem do briefing), não cor da interface. */}
                <span className="w-5 h-5 rounded border border-border" style={{ backgroundColor: c.hex }} aria-hidden="true" />
                <span className="font-mono tabular-nums">{c.hex}</span>
                <Copy size={10} className="text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        </Bloco>
      )}

      {(kit.tipografia || kit.tom) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {kit.tipografia && <Bloco icone={Type} titulo="Tipografia"><p className="text-xs text-foreground leading-relaxed">{kit.tipografia}</p></Bloco>}
          {kit.tom && <Bloco icone={MessageSquareQuote} titulo="Tom"><p className="text-xs text-foreground leading-relaxed">{kit.tom}</p></Bloco>}
        </div>
      )}

      {kit.resumoVisual && <p className="text-xs text-muted-foreground leading-relaxed">{kit.resumoVisual}</p>}

      {(kit.naoUsar.length > 0 || kit.regrasDeArte.length > 0) && (
        <Bloco icone={Ban} titulo="Não usar">
          {kit.naoUsar.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {kit.naoUsar.map((p) => (
                <span key={p} className="text-[11px] px-2 py-0.5 rounded-md border border-destructive/20 bg-destructive/10 text-destructive">{p}</span>
              ))}
            </div>
          )}
          {kit.regrasDeArte.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-foreground list-disc pl-4">
              {kit.regrasDeArte.slice(0, 6).map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </Bloco>
      )}

      <Bloco icone={ImageIcon} titulo={`Últimas aprovadas${kit.aprovadas.length ? ` (${kit.aprovadas.length})` : ""}`}>
        {kit.aprovadas.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Nenhuma peça aprovada com arte no painel ainda.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {kit.aprovadas.map((p) => (
              <a key={p.cardId} href={p.url} target="_blank" rel="noopener noreferrer" title={p.titulo}
                className="block aspect-[4/5] rounded-md overflow-hidden border border-border bg-muted hover:border-primary/40 transition-colors">
                <SignedImage src={p.url} alt={p.titulo} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </Bloco>

      {!kit.logos.length && !kit.paleta.length && !kit.tom && !kit.naoUsar.length && (
        <p className="text-[11px] text-lone-warning bg-lone-warning-bg border border-lone-warning-border rounded-lg px-3 py-2">
          O briefing deste cliente não tem logo, paleta nem tom cadastrados. Peça ao social para completar a ficha.
        </p>
      )}
    </div>
  );

  return (
    <section aria-label="Kit da marca" className={cn("rounded-xl border border-border bg-card", className)}>
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <Palette size={14} className="text-primary" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground flex-1">Kit da marca{kit?.cliente ? ` — ${kit.cliente}` : ""}</span>
        <span className="text-[11px] text-muted-foreground">{aberto ? "Recolher" : "Abrir"}</span>
      </button>
      {aberto && <div className="px-4 pb-4">{corpo}</div>}
    </section>
  );
}
