"use client";

// components/design/HojeDoDesigner.tsx — o Meu Trabalho › Hoje do DESIGNER (set/2026). Rodrigo abria o
// Hoje e via "Tarefas 10 · Design 1": a lista era de tarefas, e a arte — o trabalho dele o dia todo —
// era um número no canto. Aqui a fila de arte vem primeiro, na ordem em que ela deve ser feita:
// ajustes pedidos (arte que já devia estar pronta), prazo de hoje ou vencido, e as próximas da fila.
// A conta é a da fila do /design (lib/conteudo/fila-designer.ts → agendaDoDesigner).

import Link from "next/link";
import { ChevronRight, Focus, Palette, RotateCcw, Undo2 } from "lucide-react";
import LogoDoCliente from "@/components/design/LogoDoCliente";
import SeloPrazo from "@/components/design/SeloPrazo";
import { cn } from "@/lib/utils";
import { formatoDaPeca, type AgendaDoDesigner } from "@/lib/conteudo/fila-designer";
import type { ItemQuadro } from "@/lib/conteudo/quadro";
import type { Client } from "@/lib/types";

function Linha({ it, hoje, cliente, ajuste }: { it: ItemQuadro; hoje: string; cliente?: Client; ajuste?: boolean }) {
  const { card, pedido } = it;
  const nome = cliente?.nomeFantasia || cliente?.name || card.clientName;
  const formato = formatoDaPeca(card.format || pedido?.format);
  return (
    <Link href={`/design?card=${card.id}`}
      className={cn("flex items-center gap-3 p-2.5 rounded-lg border transition-colors",
        ajuste ? "border-destructive/20 bg-destructive/5 hover:border-destructive/40" : "border-border bg-muted/30 hover:border-primary/30")}>
      <LogoDoCliente nome={nome} logo={cliente?.logo} className="h-8 w-8 rounded-lg" texto="text-[11px]" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{card.title}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {nome} · {formato.rotulo}{formato.medida ? ` · ${formato.medida}` : ""}
          {it.estado === "em_andamento" ? " · fazendo" : ""}
        </p>
        {ajuste && card.alteracaoMotivo && <p className="text-[11px] text-destructive truncate mt-0.5">{card.alteracaoMotivo}</p>}
      </div>
      <SeloPrazo prazo={it.prazoArte} hora={card.dueDate ? card.dueTime : null} hoje={hoje} className="shrink-0" />
      <ChevronRight size={13} className="text-muted-foreground shrink-0" aria-hidden="true" />
    </Link>
  );
}

function Grupo({ titulo, icone: Icone, tom, itens, hoje, clientes, ajuste }: {
  titulo: string;
  icone?: typeof Palette;
  tom?: string;
  itens: ItemQuadro[];
  hoje: string;
  clientes: Map<string, Client>;
  ajuste?: boolean;
}) {
  if (!itens.length) return null;
  return (
    <div className="space-y-2">
      <p className={cn("text-lone-eyebrow uppercase flex items-center gap-1.5", tom ?? "text-muted-foreground")}>
        {Icone && <Icone size={11} aria-hidden="true" />} {titulo} · {itens.length}
      </p>
      <div className="space-y-1.5">
        {itens.map((it) => <Linha key={it.card.id} it={it} hoje={hoje} cliente={clientes.get(it.card.clientId)} ajuste={ajuste} />)}
      </div>
    </div>
  );
}

export default function HojeDoDesigner({ agenda, hoje, clientes }: { agenda: AgendaDoDesigner; hoje: string; clientes: Client[] }) {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const nada = agenda.total === 0;
  return (
    <section aria-label="Sua fila de arte" className="card space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <Palette size={15} className="text-chart-4" aria-hidden="true" />
        <h3 className="text-lone-h2 text-foreground tracking-tight">Sua fila de arte</h3>
        <span className="text-xs text-muted-foreground">{nada ? "nada com você agora" : `${agenda.total} com você`}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {!nada && (
            <Link href="/design?foco=1" title="Um card por vez, em tela cheia: cole a arte e Enter entrega"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:border-primary/40 transition-colors">
              <Focus size={13} aria-hidden="true" /> Modo foco
            </Link>
          )}
          <Link href="/design" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
            Abrir a fila <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </span>
      </header>

      {nada ? (
        <p className="text-sm text-muted-foreground">Fila zerada. Quando o social pedir uma arte, ela aparece aqui, do prazo mais perto.</p>
      ) : (
        <>
          <Grupo titulo="Ajustes pedidos" icone={RotateCcw} tom="text-destructive" itens={agenda.ajustes} hoje={hoje} clientes={porId} ajuste />
          <Grupo titulo="Para hoje" tom="text-lone-warning" itens={agenda.paraHoje} hoje={hoje} clientes={porId} />
          <Grupo titulo={agenda.ajustes.length || agenda.paraHoje.length ? "Depois, na fila" : "Próximas na fila"} itens={agenda.proximas} hoje={hoje} clientes={porId} />
        </>
      )}
      {(() => {
        const resto = agenda.total - agenda.ajustes.length - agenda.paraHoje.length - agenda.proximas.length;
        return resto > 0 ? (
          <Link href="/design" className="block text-[11px] text-muted-foreground hover:text-foreground">+{resto} na fila — abrir a fila completa</Link>
        ) : null;
      })()}
      {agenda.devolvidos.length > 0 && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Undo2 size={12} aria-hidden="true" />
          {agenda.devolvidos.length} devolvido{agenda.devolvidos.length > 1 ? "s" : ""} ao social, esperando resposta.
        </p>
      )}
    </section>
  );
}
