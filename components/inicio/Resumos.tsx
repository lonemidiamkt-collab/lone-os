"use client";

// components/inicio/Resumos.tsx — o bloco de cima do Início, um por papel. Cada bloco tem UMA ação.
// Números de trabalho (clientes, cards, pedidos, leads) — nada de dinheiro da agência.

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Clock } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { infoEtapa } from "@/lib/conteudo/etapas";
import { ROTULO_ESTADO_DESIGN } from "@/lib/conteudo/producao";
import type {
  PedidoArte, ResumoCarteira, ResumoComercial, ResumoDesigner, ResumoSocial, ResumoTrafego,
} from "@/lib/inicio/tipos";

// ── Peças ───────────────────────────────────────────────────────────────────

function Bloco({ eyebrow, titulo, acao, children, className }: {
  eyebrow?: string; titulo: string; acao?: { label: string; href: string }; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-lone-eyebrow uppercase text-muted-foreground">{eyebrow}</p>}
          <h2 className="text-lone-h2 tracking-tight text-foreground">{titulo}</h2>
        </div>
        {acao && (
          <Link href={acao.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
            {acao.label}
            <ChevronRight size={13} aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

type Tom = "neutro" | "perigo" | "aviso" | "bom";
const TOM: Record<Tom, string> = {
  neutro: "text-foreground", perigo: "text-lone-danger", aviso: "text-lone-warning", bom: "text-lone-success",
};

function Numero({ valor, rotulo, tom = "neutro" }: { valor: number; rotulo: string; tom?: Tom }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-lone-h1 tabular-nums tracking-tight", valor > 0 ? TOM[tom] : "text-muted-foreground")}>{valor}</p>
      <p className="text-lone-caption text-muted-foreground">{rotulo}</p>
    </div>
  );
}

const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export function ResumoSkeleton({ altura = "h-40" }: { altura?: string }) {
  return <Skeleton className={cn("rounded-xl", altura)} />;
}

// ── Gestão: estado da carteira ──────────────────────────────────────────────

export function Carteira({ c }: { c: ResumoCarteira }) {
  const { saudavel, atencao, risco, semDado } = c.saude;
  const total = saudavel + atencao + risco + semDado || 1;
  const faixas = [
    { n: risco, rotulo: "Em risco", barra: "bg-lone-danger" },
    { n: atencao, rotulo: "Atenção", barra: "bg-lone-warning" },
    { n: saudavel, rotulo: "Saudáveis", barra: "bg-lone-success" },
    { n: semDado, rotulo: "Sem dado", barra: "bg-muted-foreground" },
  ];
  const pipeline = [
    { n: c.conteudo.pauta, rotulo: infoEtapa("pauta").rotulo },
    { n: c.conteudo.comDesigner, rotulo: infoEtapa("com_designer").rotulo },
    { n: c.conteudo.revisao, rotulo: infoEtapa("revisao").rotulo },
    { n: c.conteudo.comCliente, rotulo: infoEtapa("com_cliente").rotulo },
    { n: c.conteudo.agendados, rotulo: infoEtapa("agendado").rotulo },
  ];
  return (
    <div className="space-y-4">
      <Bloco eyebrow="Carteira" titulo={`${c.clientes} clientes por saúde`} acao={{ label: "Ver saúde da carteira", href: "/saude" }}>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img"
          aria-label={faixas.map((f) => `${f.n} ${f.rotulo.toLowerCase()}`).join(", ")}>
          {faixas.map((f) => f.n > 0 && <span key={f.rotulo} className={f.barra} style={{ width: `${(f.n / total) * 100}%` }} />)}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {faixas.map((f) => (
            <li key={f.rotulo} className="flex items-center gap-2 text-lone-caption text-muted-foreground">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", f.barra)} aria-hidden />
              <span className="flex-1">{f.rotulo}</span>
              <span className="tabular-nums text-foreground">{f.n}</span>
            </li>
          ))}
        </ul>
      </Bloco>

      <Bloco eyebrow="Onboarding" titulo={c.onboarding.emSetup === 1 ? "1 cliente em setup" : `${c.onboarding.emSetup} clientes em setup`}
        acao={{ label: "Abrir onboarding", href: "/clients?filter=onboarding" }}>
        <p className="text-lone-caption text-muted-foreground">
          {c.onboarding.emSetup > 0
            ? `${c.onboarding.nomes.join(", ")}${c.onboarding.emSetup > c.onboarding.nomes.length ? ` e mais ${c.onboarding.emSetup - c.onboarding.nomes.length}` : ""}.`
            : "Ninguém entrando esta semana."}
          {c.onboarding.desatualizados > 0 && ` ${c.onboarding.desatualizados} com o status parado em onboarding — estão no feed.`}
        </p>
      </Bloco>

      <Bloco eyebrow="Conteúdo" titulo={`${c.conteudo.publicadosMes} publicados no mês`} acao={{ label: "Abrir quadro", href: "/social" }}>
        <div className="grid grid-cols-5 gap-2">
          {pipeline.map((p) => (
            <div key={p.rotulo} className="min-w-0 text-center">
              <p className={cn("text-lone-h2 tabular-nums", p.n > 0 ? "text-foreground" : "text-muted-foreground")}>{p.n}</p>
              <p className="truncate text-[10px] text-muted-foreground">{p.rotulo}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-border pt-3 text-lone-caption text-muted-foreground">
          {infoEtapa("com_designer").rotulo}: <span className="tabular-nums text-foreground">{c.design.fila}</span> na fila ·{" "}
          <span className="tabular-nums text-foreground">{c.design.producao}</span> fazendo
        </p>
      </Bloco>
    </div>
  );
}

// ── Social: o dia ───────────────────────────────────────────────────────────

export function SeuDiaSocial({ s }: { s: ResumoSocial }) {
  return (
    <Bloco eyebrow="Seu dia" titulo={`${s.clientes} clientes na sua carteira`} acao={{ label: "Abrir quadro", href: "/social" }}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Numero valor={s.hoje} rotulo="para postar hoje" tom="aviso" />
        <Numero valor={s.prontas} rotulo="artes prontas do designer" tom="aviso" />
        <Numero valor={s.aprovar} rotulo="em aprovação" />
        <Numero valor={s.parados} rotulo="parados há 48h+" tom="perigo" />
      </div>
      {s.postarHoje.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-border pt-3">
          {s.postarHoje.map((k) => (
            <li key={k.id}>
              <Link href={`/social?card=${k.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
                <span className="min-w-0">
                  <span className="block truncate text-lone-body text-foreground">{k.titulo}</span>
                  <span className="block truncate text-lone-caption text-muted-foreground">{k.cliente}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}

// ── Designer: a fila ────────────────────────────────────────────────────────

const SITUACAO: Record<PedidoArte["situacao"], { rotulo: (p: string | null) => string; classe: string }> = {
  atrasado: { rotulo: (p) => `venceu ${p ? ddmm(p) : ""}`, classe: "border-lone-danger-border bg-lone-danger-bg text-lone-danger" },
  hoje: { rotulo: () => "vence hoje", classe: "border-lone-warning-border bg-lone-warning-bg text-lone-warning" },
  no_prazo: { rotulo: (p) => `até ${p ? ddmm(p) : ""}`, classe: "border-border bg-muted text-muted-foreground" },
  sem_prazo: { rotulo: () => "sem prazo", classe: "border-border bg-muted text-muted-foreground" },
};

export function FilaDesigner({ d }: { d: ResumoDesigner }) {
  const total = d.fila + d.producao;
  return (
    <Bloco eyebrow="Sua fila" titulo={total === 1 ? "1 pedido de arte aberto" : `${total} pedidos de arte abertos`} acao={{ label: "Abrir fila de design", href: "/design" }}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Numero valor={d.atrasados} rotulo="atrasados" tom="perigo" />
        <Numero valor={d.hoje} rotulo="vencem hoje" tom="aviso" />
        <Numero valor={d.alteracoes} rotulo="alterações pedidas" tom="aviso" />
        <Numero valor={d.fila} rotulo="na fila" />
        <Numero valor={d.producao} rotulo="fazendo" />
      </div>
      {d.pedidos.length > 0 ? (
        <ul className="mt-4 space-y-1 border-t border-border pt-3">
          {d.pedidos.map((p) => {
            const s = SITUACAO[p.situacao];
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-lone-body text-foreground">{p.titulo}</span>
                  <span className="block truncate text-lone-caption text-muted-foreground">
                    {p.cliente} · {(p.status === "in_progress" ? ROTULO_ESTADO_DESIGN.em_andamento : ROTULO_ESTADO_DESIGN.na_fila).toLowerCase()}
                  </span>
                </span>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", s.classe)}>
                  <Clock size={11} aria-hidden />
                  {s.rotulo(p.prazo)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 border-t border-border pt-3 text-lone-caption text-muted-foreground">Fila vazia — nenhum pedido esperando por você.</p>
      )}
    </Bloco>
  );
}

// ── Tráfego: as contas ──────────────────────────────────────────────────────

export function ResumoContas({ t }: { t: ResumoTrafego }) {
  return (
    <Bloco eyebrow="Suas contas" titulo={`${t.clientes} clientes de tráfego`} acao={{ label: "Abrir Tráfego", href: "/traffic" }}>
      <div className="grid grid-cols-3 gap-4">
        <Numero valor={t.clientes} rotulo="clientes com tráfego" />
        <Numero valor={t.contas} rotulo="contas de anúncio" />
        <Numero valor={t.clientesComAlerta} rotulo="com alerta agora" tom="perigo" />
      </div>
    </Bloco>
  );
}

// ── Comercial: o funil ──────────────────────────────────────────────────────

export function ResumoFunil({ c }: { c: ResumoComercial }) {
  const abertos = c.etapas.lead + c.etapas.orcamento + c.etapas.proposta + c.etapas.reuniao;
  return (
    <Bloco eyebrow="Funil" titulo={abertos === 1 ? "1 negociação aberta" : `${abertos} negociações abertas`} acao={{ label: "Abrir Comercial", href: "/crm" }}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Numero valor={c.etapas.lead} rotulo="leads" />
        <Numero valor={c.etapas.orcamento} rotulo="em orçamento" />
        <Numero valor={c.etapas.proposta} rotulo="com proposta" />
        <Numero valor={c.etapas.reuniao} rotulo="em reunião" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-3">
        <Numero valor={c.followupsVencidos} rotulo="follow-ups atrasados" tom="perigo" />
        <Numero valor={c.followupsHoje} rotulo="follow-ups hoje" tom="aviso" />
        <Numero valor={c.ganhosMes} rotulo="fechados no mês" tom="bom" />
      </div>
      {c.reunioes.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-border pt-3">
          {c.reunioes.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-2 py-1 text-lone-body">
              <span className="truncate text-foreground">{r.nome}</span>
              <span className="shrink-0 text-lone-caption tabular-nums text-muted-foreground">
                reunião {ddmm(r.data)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}
