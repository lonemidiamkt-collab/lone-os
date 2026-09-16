"use client";

// components/prospeccao/ui.tsx — peças pequenas compartilhadas pelas abas da Prospecção.
// Só tokens do design system (claro + escuro), sem emoji, sem cor literal.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export const fmtDataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";
export const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }) : "—";
export const fmtHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";
export const fmtExtenso = (iso: string | null | undefined) =>
  iso ? `${new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })} às ${fmtHora(iso)}` : "—";
export const haQuanto = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} d`;
};
export const usd = (v: number | null | undefined) => (v == null ? "—" : `US$ ${v.toFixed(2)}`);
export const telFmt = (d: string | null | undefined) => {
  if (!d) return "—";
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d;
};

export const ROTULO_ESTAGIO: Record<string, string> = {
  descoberto: "Descoberto", enriquecido: "Enriquecido", icp_aprovado: "ICP aprovado", fila_prospeccao: "Fila do dia",
  abordado: "Abordado", aguardando_resposta: "Aguardando resposta", followup: "Em follow-up",
  atendente: "Falou com recepção", decisor_identificado: "Decisor identificado", decisor_contatado: "Conversando com decisor",
  interesse: "Interesse", horario_proposto: "Horário proposto", aguardando_confirmacao: "Aguardando confirmação",
  reuniao_agendada: "Reunião agendada", handoff: "Handoff Lone", reuniao_realizada: "Reunião realizada",
  no_show: "No-show", proposta: "Proposta", cliente: "Cliente",
  momento_ruim: "Momento ruim", nutricao_30d: "Nutrição 30d", nutricao_90d: "Nutrição 90d",
  sem_interesse: "Sem interesse", nao_perturbe: "Não perturbe", fora_icp: "Fora do ICP", perdido: "Perdido",
};

const TOM_ESTAGIO: Record<string, string> = {
  descoberto: "bg-muted text-muted-foreground border-border",
  enriquecido: "bg-muted text-muted-foreground border-border",
  icp_aprovado: "bg-lone-info-bg text-lone-info border-lone-info-border",
  fila_prospeccao: "bg-primary/10 text-primary border-primary/20",
  abordado: "bg-primary/10 text-primary border-primary/20",
  aguardando_resposta: "bg-primary/10 text-primary border-primary/20",
  followup: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  atendente: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  decisor_identificado: "bg-lone-info-bg text-lone-info border-lone-info-border",
  decisor_contatado: "bg-lone-info-bg text-lone-info border-lone-info-border",
  interesse: "bg-lone-success-bg text-lone-success border-lone-success-border",
  horario_proposto: "bg-lone-success-bg text-lone-success border-lone-success-border",
  aguardando_confirmacao: "bg-lone-success-bg text-lone-success border-lone-success-border",
  reuniao_agendada: "bg-lone-success-bg text-lone-success border-lone-success-border",
  handoff: "bg-lone-success-bg text-lone-success border-lone-success-border",
  reuniao_realizada: "bg-lone-success-bg text-lone-success border-lone-success-border",
  proposta: "bg-lone-success-bg text-lone-success border-lone-success-border",
  cliente: "bg-lone-success-bg text-lone-success border-lone-success-border",
  no_show: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  momento_ruim: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  nutricao_30d: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  nutricao_90d: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  sem_interesse: "bg-lone-danger-bg text-lone-danger border-lone-danger-border",
  nao_perturbe: "bg-lone-danger-bg text-lone-danger border-lone-danger-border",
  fora_icp: "bg-muted text-muted-foreground border-border",
  perdido: "bg-lone-danger-bg text-lone-danger border-lone-danger-border",
};

export function ChipEstagio({ estagio }: { estagio: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-lone-caption font-medium ${TOM_ESTAGIO[estagio] ?? "bg-muted text-muted-foreground border-border"}`}>
      {ROTULO_ESTAGIO[estagio] ?? estagio}
    </span>
  );
}

export function ChipClasse({ classe, score }: { classe: string | null; score?: number | null }) {
  const tom = classe === "A" ? "bg-lone-success-bg text-lone-success border-lone-success-border"
    : classe === "B" ? "bg-primary/10 text-primary border-primary/20"
    : classe === "C" ? "bg-lone-warning-bg text-lone-warning border-lone-warning-border"
    : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-lone-caption font-medium tabular-nums ${tom}`}>
      {classe ?? "—"}{score != null && <span className="opacity-70">{score}</span>}
    </span>
  );
}

export function Kpi({ icon: Icon, label, value, sub, tone }: { icon?: LucideIcon; label: string; value: string | number; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const cor = tone === "good" ? "text-lone-success" : tone === "warn" ? "text-lone-warning" : tone === "bad" ? "text-lone-danger" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-lone-caption text-muted-foreground">{Icon && <Icon size={13} />} {label}</div>
      <div className={`mt-1.5 text-lone-hero tracking-tight tabular-nums ${cor}`}>{value}</div>
      {sub && <div className="mt-0.5 text-lone-caption text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Secao({ titulo, acao, children, className = "" }: { titulo: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lone-h2 tracking-tight text-foreground">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-lone-body text-muted-foreground">{texto}</p>;
}

export function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-lone-body text-lone-danger">{texto}</p>;
}

export const inputCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none";
export const labelCls = "text-lone-caption text-muted-foreground";

export function Campo({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Linha({ rotulo, valor, fonte }: { rotulo: string; valor: ReactNode; fonte?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-lone-body">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="text-right text-foreground">
        {valor ?? "—"}
        {fonte && <span className="ml-1 text-lone-caption text-muted-foreground">({fonte})</span>}
      </span>
    </div>
  );
}
