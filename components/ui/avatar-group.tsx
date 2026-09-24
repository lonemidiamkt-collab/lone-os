"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { estiloDasIniciais, iniciais as iniciaisDe } from "@/lib/notificacoes/visual";

export interface ItemDoGrupo {
  id: string;
  nome: string;
  detalhe?: string;
  imagem?: string | null;
  iniciais?: string;
  /** Pessoa = círculo; marca/cliente = quadrado arredondado (a logo não é cortada). */
  forma?: "circulo" | "quadrado";
}

const TAMANHO = {
  sm: { px: 24, texto: "text-[10px]", quadrado: "rounded-md" },
  md: { px: 28, texto: "text-[11px]", quadrado: "rounded-lg" },
  lg: { px: 36, texto: "text-xs", quadrado: "rounded-xl" },
} as const;

// O anel tem a cor da superfície de trás: é ele que "recorta" um avatar do outro.
const ANEL = { popover: "ring-popover", background: "ring-background", card: "ring-card" } as const;

interface Dica { chave: string; nome: string; detalhe?: string; x: number; base: number }

export interface AvatarGroupProps {
  items: ItemDoGrupo[];
  max?: number;
  tamanho?: keyof typeof TAMANHO;
  forma?: "circulo" | "quadrado";
  anel?: keyof typeof ANEL;
  className?: string;
}

export default function AvatarGroup({ items, max = 4, tamanho = "md", forma = "circulo", anel = "background", className }: AvatarGroupProps) {
  const [dica, setDica] = useState<Dica | null>(null);
  const [montado, setMontado] = useState(false);
  const t = TAMANHO[tamanho];
  const visiveis = items.slice(0, max);
  const resto = items.slice(max);

  useEffect(() => setMontado(true), []);

  // A dica é fixa na tela (portal): rolar a lista a deixaria flutuando longe do avatar.
  useEffect(() => {
    if (!dica) return;
    const sumir = () => setDica(null);
    window.addEventListener("scroll", sumir, true);
    return () => window.removeEventListener("scroll", sumir, true);
  }, [dica]);

  const mostrar = (e: React.MouseEvent<HTMLElement>, chave: string, nome: string, detalhe?: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setDica({ chave, nome, detalhe, x: r.left + r.width / 2, base: window.innerHeight - r.top + 8 });
  };

  const total = visiveis.length + (resto.length ? 1 : 0);

  return (
    <MotionConfig reducedMotion="user">
      <div role="group" aria-label={items.map((i) => i.nome).join(", ")} className={cn("flex items-center", className)}>
        {visiveis.map((it, i) => {
          const quadrado = (it.forma ?? forma) === "quadrado";
          return (
            <motion.div
              key={it.id}
              aria-hidden
              onMouseEnter={(e) => mostrar(e, it.id, it.nome, it.detalhe)}
              onMouseLeave={() => setDica(null)}
              whileHover={{ scale: 1.08, y: -1 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className={cn("relative", i > 0 && "-ml-2")}
              style={{ zIndex: dica?.chave === it.id ? total + 1 : total - i }}
            >
              <Avatar
                className={cn("ring-2", ANEL[anel], quadrado ? cn(t.quadrado, "bg-card") : "rounded-full")}
                style={{ width: t.px, height: t.px }}
              >
                {it.imagem && <AvatarImage src={it.imagem} alt="" className={quadrado ? "object-contain p-px" : "object-cover"} />}
                <AvatarFallback
                  delayMs={it.imagem ? 500 : undefined}
                  className={cn("rounded-[inherit] font-semibold", t.texto)}
                  style={estiloDasIniciais(it.nome)}
                >
                  {it.iniciais ?? iniciaisDe(it.nome)}
                </AvatarFallback>
              </Avatar>
            </motion.div>
          );
        })}
        {resto.length > 0 && (
          <motion.div
            aria-hidden
            onMouseEnter={(e) => mostrar(e, "+", `mais ${resto.length}`, resto.slice(0, 4).map((r) => r.nome).join(", ") + (resto.length > 4 ? "…" : ""))}
            onMouseLeave={() => setDica(null)}
            whileHover={{ scale: 1.08, y: -1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className={cn("relative -ml-2 flex items-center justify-center rounded-full bg-muted font-semibold tabular-nums text-muted-foreground ring-2", ANEL[anel], t.texto)}
            style={{ width: t.px, height: t.px, zIndex: dica?.chave === "+" ? total + 1 : 0 }}
          >
            +{resto.length}
          </motion.div>
        )}
      </div>
      {montado && createPortal(
        <AnimatePresence>
          {dica && (
            <motion.div
              key={dica.chave}
              role="tooltip"
              initial={{ opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96, transition: { duration: 0.12 } }}
              transition={{ type: "spring", stiffness: 320, damping: 20 }}
              style={{ position: "fixed", left: dica.x, bottom: dica.base, x: "-50%", transformOrigin: "bottom center" }}
              className="pointer-events-none z-[300] max-w-[240px] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-sm"
            >
              <p className="truncate text-xs font-semibold">{dica.nome}</p>
              {dica.detalhe && <p className="truncate text-[11px] text-muted-foreground">{dica.detalhe}</p>}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </MotionConfig>
  );
}
