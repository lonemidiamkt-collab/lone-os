"use client";

// components/client/ficha/AbaEntregas.tsx — ENTREGAS: o conteúdo deste cliente nas seis etapas da
// produção (lib/conteudo/etapas.ts, os mesmos nomes do quadro), os pedidos de arte, as tarefas, o
// que foi ao ar no Instagram e as datas do mês. Juntou Conteúdo, Tarefas e o banner de datas.

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, Clock, KanbanSquare, Palette, User } from "lucide-react";
import InstagramOrganico from "@/components/client-tabs/InstagramOrganico";
import MonthObservancesAlert from "@/components/MonthObservancesAlert";
import HolidaysPdfButton from "@/components/HolidaysPdfButton";
import { ETAPAS, estaBloqueado, etapaDoStatus, type Etapa } from "@/lib/conteudo/etapas";
import { estadoDoDesign, ROTULO_ESTADO_DESIGN } from "@/lib/conteudo/producao";
import { pedidoDoCard, paraPedidoDesign } from "@/lib/conteudo/quadro";
import { cn, getPriorityColor, getPriorityLabel, todaySP } from "@/lib/utils";
import type { ContentCard, DesignRequest, Task } from "@/lib/types";
import { Secao, Vazio } from "./Secao";
import { SECAO } from "./abas";
import { dataCurta } from "./rotulos";
import type { FichaCtx } from "./tipos";

/** Quantos cards "No ar" aparecem (os mais recentes) — o histórico inteiro afogaria a aba. */
const NO_AR_VISIVEIS = 8;
const PEDIDOS_VISIVEIS = 12;

const ROTULO_PEDIDO: Record<DesignRequest["status"], string> = {
  queued: "Na fila do designer",
  in_progress: "Designer fazendo",
  done: "Entregue",
};

function LinhaCard({ card, pedidos }: { card: ContentCard; pedidos: DesignRequest[] }) {
  const hoje = todaySP();
  const vencido = !!card.dueDate && card.dueDate.slice(0, 10) < hoje && !["agendado", "no_ar"].includes(etapaDoStatus(card.status));
  const estado = estadoDoDesign(card, paraPedidoDesign(pedidoDoCard(card, pedidos)));
  return (
    <li className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="min-w-0 flex-1 text-lone-body text-foreground [overflow-wrap:anywhere]">{card.title}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lone-caption text-muted-foreground">
        <span>{card.format}</span>
        {card.socialMedia && <span className="inline-flex items-center gap-1"><User size={11} aria-hidden="true" />{card.socialMedia}</span>}
        {estado !== "sem_pedido" && <span className={cn(estaBloqueado(card.status) && "text-destructive")}>{ROTULO_ESTADO_DESIGN[estado]}</span>}
        {card.dueDate && (
          <span className={cn("inline-flex items-center gap-1", vencido && "font-medium text-destructive")}>
            <Calendar size={11} aria-hidden="true" />{dataCurta(card.dueDate.slice(0, 10))}{vencido ? " · atrasado" : ""}
          </span>
        )}
      </span>
    </li>
  );
}

export default function AbaEntregas({ ctx, cards, pedidos, tarefas }: {
  ctx: FichaCtx;
  cards: ContentCard[];
  pedidos: DesignRequest[];
  tarefas: Task[];
}) {
  const { client: c } = ctx;
  const [verTodosPedidos, setVerTodosPedidos] = useState(false);
  const ativos = cards.filter((k) => !k.archivedAt);
  const porEtapa = new Map<Etapa, ContentCard[]>();
  for (const k of ativos) {
    const e = etapaDoStatus(k.status);
    (porEtapa.get(e) ?? porEtapa.set(e, []).get(e)!).push(k);
  }
  // Dentro da etapa: prazo mais próximo primeiro; "No ar": o mais recente primeiro.
  for (const [e, lista] of porEtapa) {
    lista.sort((a, b) => e === "no_ar"
      ? (b.dueDate ?? "").localeCompare(a.dueDate ?? "")
      : (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }
  const pedidosOrdenados = [...pedidos].sort((a, b) =>
    Number(a.status === "done") - Number(b.status === "done") || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const pedidosVisiveis = verTodosPedidos ? pedidosOrdenados : pedidosOrdenados.slice(0, PEDIDOS_VISIVEIS);

  return (
    <div className="space-y-8">
      <Secao id={SECAO.producao} titulo="Produção" semCard
        descricao="Os cards deste cliente nas seis etapas do quadro."
        acoes={
          <Link href={`/social?client=${c.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-accent">
            <KanbanSquare size={13} aria-hidden="true" /> Abrir no quadro
          </Link>
        }>
        {ativos.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-4"><Vazio>Nenhum card para este cliente.</Vazio></div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {ETAPAS.map((e) => {
              const lista = porEtapa.get(e.id) ?? [];
              const visiveis = e.id === "no_ar" ? lista.slice(0, NO_AR_VISIVEIS) : lista;
              return (
                <div key={e.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-lone-h2 text-foreground">
                      <span className={cn("h-2 w-2 rounded-full", e.cor)} aria-hidden="true" /> {e.rotulo}
                    </p>
                    <span className="text-lone-body tabular-nums text-muted-foreground">{lista.length}</span>
                  </div>
                  {visiveis.length === 0 ? (
                    <p className="mt-1 text-lone-caption text-muted-foreground">{e.descricao}</p>
                  ) : (
                    <ul className="mt-1 divide-y divide-border">
                      {visiveis.map((k) => <LinhaCard key={k.id} card={k} pedidos={pedidos} />)}
                    </ul>
                  )}
                  {e.id === "no_ar" && lista.length > NO_AR_VISIVEIS && (
                    <p className="mt-1 text-lone-caption text-muted-foreground">+ {lista.length - NO_AR_VISIVEIS} mais antigos no quadro.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Secao>

      <Secao id={SECAO.pedidosArte} titulo="Pedidos de arte" descricao="O que foi pedido ao designer, aberto primeiro."
        acoes={ctx.role !== "comercial" ? (
          <button onClick={ctx.pedirArte} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">
            <Palette size={13} aria-hidden="true" /> Pedir arte
          </button>
        ) : undefined}>
        {pedidosOrdenados.length === 0 ? <Vazio>Nenhum pedido de arte para este cliente.</Vazio> : (
          <>
            <ul className="divide-y divide-border">
              {pedidosVisiveis.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className={cn("min-w-0 flex-1 text-lone-body [overflow-wrap:anywhere]", p.status === "done" ? "text-muted-foreground" : "text-foreground")}>{p.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lone-caption text-muted-foreground">
                    <span>{p.format}</span>
                    <span className="inline-flex items-center gap-1"><User size={11} aria-hidden="true" />{p.assignedDesigner || c.assignedDesigner || "sem designer"}</span>
                    {p.deadline && <span className="inline-flex items-center gap-1"><Clock size={11} aria-hidden="true" />{dataCurta(p.deadline.slice(0, 10))}</span>}
                    <span className={cn("rounded-full border px-2 py-0.5",
                      p.status === "done" ? "border-lone-success-border bg-lone-success-bg text-lone-success"
                        : p.status === "in_progress" ? "border-lone-info-border bg-lone-info-bg text-lone-info"
                        : "border-border bg-muted text-muted-foreground")}>
                      {ROTULO_PEDIDO[p.status]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {pedidosOrdenados.length > PEDIDOS_VISIVEIS && (
              <button onClick={() => setVerTodosPedidos((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-lone-caption text-primary hover:underline">
                {verTodosPedidos ? "Mostrar menos" : `Ver os ${pedidosOrdenados.length} pedidos`} <ArrowRight size={11} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </Secao>

      <Secao id={SECAO.tarefas} titulo="Tarefas" descricao="Tarefas do time ligadas a este cliente.">
        {tarefas.length === 0 ? <Vazio>Nenhuma tarefa para este cliente.</Vazio> : (
          <ul className="divide-y divide-border">
            {tarefas.map((t) => (
              <li key={t.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <span className={cn("min-w-0 flex-1 text-lone-body [overflow-wrap:anywhere]", t.status === "done" ? "text-muted-foreground line-through" : "text-foreground")}>{t.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-lone-caption text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><User size={11} aria-hidden="true" />{t.assignedTo}</span>
                  {t.dueDate && <span className="inline-flex items-center gap-1"><Clock size={11} aria-hidden="true" />{dataCurta(t.dueDate.slice(0, 10))}</span>}
                  <span className={`badge border ${getPriorityColor(t.priority)}`}>{getPriorityLabel(t.priority)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {t.status === "done" ? "Concluída" : t.status === "in_progress" ? "Em execução" : t.status === "review" ? "Validação" : "Pendente"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao id={SECAO.instagram} titulo="No ar no Instagram" semCard>
        <InstagramOrganico clientId={c.id} />
      </Secao>

      {(c.nicho || c.enderecoCidade || c.enderecoEstado) && (
        <Secao id={SECAO.datas} titulo="Datas do mês" semCard descricao="Datas comemorativas do ramo e feriados da cidade do cliente.">
          <div className="space-y-2">
            <MonthObservancesAlert
              title={`Datas e feriados${c.enderecoCidade ? ` — ${c.enderecoCidade}` : ""}`}
              nichos={c.nicho ? [c.nicho] : []}
              uf={c.enderecoEstado}
              city={c.enderecoCidade}
              compact
            />
            <HolidaysPdfButton
              nichos={c.nicho ? [c.nicho] : undefined}
              uf={c.enderecoEstado}
              city={c.enderecoCidade}
              clientName={c.name}
              label={`Baixar PDF do mês — ${c.name}`}
            />
          </div>
        </Secao>
      )}
    </div>
  );
}
