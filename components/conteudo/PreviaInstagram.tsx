"use client";

// components/conteudo/PreviaInstagram.tsx — o post como ele aparece no feed (Leva 7B, N13).
//
// Moldura 4:5 (o retrato do feed), carrossel que desliza com o dedo/mouse ou pelas setas, e a
// legenda cortada onde o Instagram corta (~125 caracteres) com o "mais" — quem aprova vê se o gancho
// cabe antes do corte. A moldura imita o app, então as cores do "app" (branco do post, cinza do
// texto secundário) seguem o tema do painel: é prévia de conteúdo, não réplica de marca.

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Bookmark, ImageIcon } from "lucide-react";
import SignedImage from "@/components/shared/SignedImage";
import { cn } from "@/lib/utils";
import { cortarLegenda } from "@/lib/conteudo/previa";

export default function PreviaInstagram({ imagens, legenda, usuario, avatar, className }: {
  imagens: string[];
  /** Legenda completa (texto + hashtags). */
  legenda: string;
  /** @ do cliente, sem o arroba. */
  usuario?: string | null;
  avatar?: string | null;
  className?: string;
}) {
  const [indice, setIndice] = useState(0);
  const [expandida, setExpandida] = useState(false);
  const [arraste, setArraste] = useState(0);
  const inicio = useRef<{ x: number; largura: number } | null>(null);
  const total = imagens.length;
  const atual = Math.min(indice, Math.max(0, total - 1));
  const { visivel, cortada } = cortarLegenda(legenda);
  const nome = (usuario ?? "").replace(/^@/, "").trim() || "cliente";

  const ir = (n: number) => { setIndice(Math.max(0, Math.min(total - 1, n))); setArraste(0); };

  const soltar = () => {
    const i = inicio.current;
    inicio.current = null;
    if (!i) return;
    const limiar = i.largura * 0.2;
    if (arraste < -limiar) ir(atual + 1);
    else if (arraste > limiar) ir(atual - 1);
    else setArraste(0);
  };

  return (
    <div className={cn("w-full max-w-[340px] rounded-xl border border-border bg-card overflow-hidden shadow-sm", className)} aria-label="Prévia do post no Instagram">
      {/* Cabeçalho do post */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-7 h-7 rounded-full overflow-hidden bg-muted shrink-0 flex items-center justify-center">
          {avatar ? <SignedImage src={avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] font-medium text-muted-foreground">{nome[0]?.toUpperCase()}</span>}
        </div>
        <span className="text-[12px] font-medium text-foreground truncate">{nome}</span>
      </div>

      {/* Mídia 4:5 com carrossel */}
      <div
        className="relative w-full aspect-[4/5] bg-muted overflow-hidden select-none touch-pan-y"
        onPointerDown={(e) => { if (total > 1) { inicio.current = { x: e.clientX, largura: e.currentTarget.clientWidth }; (e.target as Element).setPointerCapture?.(e.pointerId); } }}
        onPointerMove={(e) => { if (inicio.current) setArraste(e.clientX - inicio.current.x); }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.stopPropagation(); ir(atual + 1); } if (e.key === "ArrowLeft") { e.stopPropagation(); ir(atual - 1); } }}
        tabIndex={total > 1 ? 0 : -1}
        role={total > 1 ? "region" : undefined}
        aria-roledescription={total > 1 ? "carrossel" : undefined}
      >
        {total === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <ImageIcon size={22} aria-hidden="true" />
            <span className="text-[11px]">Sem arte ainda</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex transition-transform duration-200 ease-out"
            style={{ transform: `translateX(calc(${-atual * 100}% + ${arraste}px))`, transitionDuration: inicio.current ? "0ms" : undefined }}>
            {imagens.map((src, i) => (
              <div key={`${src}-${i}`} className="w-full h-full shrink-0">
                <SignedImage src={src} alt={`Arte ${i + 1} de ${total}`} className="w-full h-full object-cover pointer-events-none" />
              </div>
            ))}
          </div>
        )}
        {total > 1 && (
          <>
            <span className="absolute top-2 right-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-overlay text-overlay-foreground tabular-nums">{atual + 1}/{total}</span>
            {atual > 0 && (
              <button type="button" onClick={() => ir(atual - 1)} aria-label="Arte anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-overlay text-overlay-foreground flex items-center justify-center">
                <ChevronLeft size={16} />
              </button>
            )}
            {atual < total - 1 && (
              <button type="button" onClick={() => ir(atual + 1)} aria-label="Próxima arte"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-overlay text-overlay-foreground flex items-center justify-center">
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Ações e bolinhas do carrossel */}
      <div className="relative flex items-center gap-3 px-3 pt-2.5 text-foreground">
        <Heart size={18} aria-hidden="true" />
        <MessageCircle size={18} aria-hidden="true" />
        <Send size={18} aria-hidden="true" />
        {total > 1 && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1" aria-hidden="true">
            {imagens.map((_, i) => (
              <span key={i} className={cn("w-1.5 h-1.5 rounded-full", i === atual ? "bg-primary" : "bg-muted-foreground/40")} />
            ))}
          </div>
        )}
        <Bookmark size={18} className="ml-auto" aria-hidden="true" />
      </div>

      {/* Legenda com o corte do feed */}
      <div className="px-3 pt-2 pb-3 text-[12px] leading-snug text-foreground">
        {legenda.trim() ? (
          <p className="whitespace-pre-wrap break-words">
            <span className="font-medium">{nome}</span>{" "}
            {expandida || !cortada ? legenda.trim() : visivel}
            {cortada && !expandida && (
              <>
                <span className="text-muted-foreground">… </span>
                <button type="button" onClick={() => setExpandida(true)} className="text-muted-foreground hover:text-foreground">mais</button>
              </>
            )}
          </p>
        ) : (
          <p className="text-muted-foreground">Sem legenda ainda.</p>
        )}
        {cortada && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            O feed mostra só até “{visivel.slice(-24).trim()}” — o gancho precisa caber aí.
          </p>
        )}
      </div>
    </div>
  );
}
