"use client";

// components/inicio/FeedAtencao.tsx — o feed ÚNICO de atenção do Início, agrupado por gravidade.
// Um item por (cliente, problema), com uma ação. Os itens chegam prontos de /api/inicio/atencao.

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertOctagon, AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Handshake, Info, KeyRound,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { estiloDasIniciais, iniciais } from "@/lib/notificacoes/visual";
import type { Area, ItemAtencao, Severidade } from "@/lib/inicio/tipos";

const EASE = [0.16, 1, 0.3, 1] as const;
const POR_GRUPO = 5;

const GRUPO: Record<Severidade, { titulo: string; dica: string; barra: string; texto: string; Icone: typeof Info }> = {
  critical: { titulo: "Agir hoje", dica: "Cliente, prazo ou verba em jogo agora", barra: "bg-lone-danger", texto: "text-lone-danger", Icone: AlertOctagon },
  warning: { titulo: "Esta semana", dica: "Resolver antes de virar urgência", barra: "bg-lone-warning", texto: "text-lone-warning", Icone: AlertTriangle },
  info: { titulo: "Acompanhar", dica: "Sem pressa, mas não esquecer", barra: "bg-lone-info", texto: "text-lone-info", Icone: Info },
};

const AREA: Record<Area, string> = {
  relacionamento: "Relacionamento", producao: "Produção", design: "Design", trafego: "Tráfego",
  cadastro: "Cadastro", tarefas: "Tarefas", comercial: "Comercial", sistema: "Sistema",
};

const ICONE_SEM_CLIENTE: Partial<Record<Area, typeof Info>> = { tarefas: ClipboardCheck, comercial: Handshake, sistema: KeyRound };

function Rosto({ item }: { item: ItemAtencao }) {
  if (item.cliente) {
    return (
      <Avatar className="h-8 w-8 rounded-lg bg-card ring-1 ring-border" title={item.cliente.nome}>
        {item.cliente.logo && <AvatarImage src={item.cliente.logo} alt="" className="object-contain p-0.5" />}
        <AvatarFallback delayMs={item.cliente.logo ? 500 : undefined} className="rounded-[inherit] text-[11px] font-semibold" style={estiloDasIniciais(item.cliente.nome)}>
          {iniciais(item.cliente.nome)}
        </AvatarFallback>
      </Avatar>
    );
  }
  const Icone = ICONE_SEM_CLIENTE[item.area] ?? Building2;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
      <Icone size={15} aria-hidden />
    </span>
  );
}

function Linha({ item, i }: { item: ItemAtencao; i: number }) {
  const g = GRUPO[item.severidade];
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, delay: Math.min(i, 5) * 0.03, ease: EASE }}
      className="relative flex flex-col gap-3 rounded-xl border border-border bg-card py-3 pl-4 pr-3 sm:flex-row sm:items-center"
    >
      <span className={cn("absolute bottom-3 left-0 top-3 w-[3px] rounded-full", g.barra)} aria-hidden />
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Rosto item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lone-caption text-muted-foreground">
            <span className="font-medium text-foreground/80">{item.cliente?.nome ?? item.sujeito}</span>
            <span aria-hidden> · </span>
            {AREA[item.area]}
          </p>
          <p className="text-lone-body font-medium leading-snug text-foreground">{item.titulo}</p>
          <p className="mt-0.5 line-clamp-2 text-lone-caption text-muted-foreground">{item.motivo}</p>
        </div>
      </div>
      <Link
        href={item.acao.href}
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1 self-start rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary sm:self-center"
      >
        {item.acao.label}
        <ChevronRight size={13} aria-hidden />
      </Link>
    </motion.li>
  );
}

function Grupo({ sev, itens, abertoDeInicio }: { sev: Severidade; itens: ItemAtencao[]; abertoDeInicio: boolean }) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [todos, setTodos] = useState(false);
  const g = GRUPO[sev];
  const visiveis = todos ? itens : itens.slice(0, POR_GRUPO);
  return (
    <section aria-labelledby={`grupo-${sev}`}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="mb-2 flex w-full items-center gap-2 rounded-lg py-1 text-left"
      >
        <g.Icone size={15} className={g.texto} aria-hidden />
        <h3 id={`grupo-${sev}`} className="text-lone-h2 tracking-tight text-foreground">{g.titulo}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-lone-caption tabular-nums text-muted-foreground">{itens.length}</span>
        <span className="hidden text-lone-caption text-muted-foreground sm:inline">{g.dica}</span>
        <ChevronDown size={15} className={cn("ml-auto text-muted-foreground transition-transform", !aberto && "-rotate-90")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            <ul className="space-y-2">
              {visiveis.map((it, i) => <Linha key={it.id} item={it} i={i} />)}
            </ul>
            {itens.length > POR_GRUPO && (
              <button
                type="button"
                onClick={() => setTodos((v) => !v)}
                className="mt-2 text-xs font-medium text-primary hover:underline"
              >
                {todos ? "Mostrar menos" : `Ver mais ${itens.length - POR_GRUPO}`}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function FeedAtencaoSkeleton({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando o que precisa de atenção">
      <Skeleton className="mb-3 h-5 w-40" />
      {Array.from({ length: linhas }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
    </div>
  );
}

export default function FeedAtencao({ itens, vazio }: { itens: ItemAtencao[]; vazio: { titulo: string; subtitulo: string } }) {
  if (itens.length === 0) {
    return <EmptyState icon={<CheckCircle2 size={20} />} title={vazio.titulo} subtitle={vazio.subtitulo} />;
  }
  const por = (s: Severidade) => itens.filter((i) => i.severidade === s);
  const urgentes = por("critical").length + por("warning").length;
  return (
    <div className="space-y-5">
      {(["critical", "warning", "info"] as const).map((s) => {
        const lista = por(s);
        if (!lista.length) return null;
        // "Acompanhar" começa fechado quando há coisa mais urgente — não disputa a atenção.
        return <Grupo key={s} sev={s} itens={lista} abertoDeInicio={s !== "info" || urgentes === 0} />;
      })}
    </div>
  );
}
