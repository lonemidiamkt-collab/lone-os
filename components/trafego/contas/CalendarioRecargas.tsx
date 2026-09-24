"use client";

// components/trafego/contas/CalendarioRecargas.tsx — Calendário de recargas Pix/boleto (Leva 7A, N3),
// dentro de Tráfego › Contas & Verba.
//
// Quem paga por Pix ou boleto precisa recarregar antes do saldo acabar. Aqui fica, por data, quem
// precisa recarregar e até quando (o aporte combinado ou o fim do saldo no ritmo atual — o que vier
// antes), com um RASCUNHO de lembrete. Quem manda é uma pessoa: "Copiar" ou "Abrir no WhatsApp" (o
// texto vai pronto, o envio é de quem clicou). Regras em lib/trafego/recargas.ts.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, Copy, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { montarRecargas, type ContaRecarga, type Recarga, type UrgenciaRecarga } from "@/lib/trafego/recargas";

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const diaSemana = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");

const URGENCIA: Record<UrgenciaRecarga, { rotulo: string; cls: string }> = {
  atrasada: { rotulo: "Atrasada",      cls: "bg-lone-danger-bg text-lone-danger border-lone-danger-border" },
  hoje:     { rotulo: "Hoje",          cls: "bg-lone-warning-bg text-lone-warning border-lone-warning-border" },
  semana:   { rotulo: "Nesta semana",  cls: "bg-lone-info-bg text-lone-info border-lone-info-border" },
  depois:   { rotulo: "Mais adiante",  cls: "bg-muted text-muted-foreground border-border" },
  sem_data: { rotulo: "Sem data",      cls: "bg-muted text-muted-foreground border-border" },
};

const FORMA: Record<Recarga["forma"], string> = { pix: "Pix", boleto: "Boleto", pre: "Pré-pago" };

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Mensagem copiada — confira e mande pelo WhatsApp do financeiro.");
  } catch {
    toast.error("Não consegui copiar. Selecione o texto e copie à mão.");
  }
}

export default function CalendarioRecargas({ contas, hoje }: { contas: ContaRecarga[]; hoje: string }) {
  const recargas = useMemo(() => montarRecargas(contas, hoje), [contas, hoje]);
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState<string | null>(null);
  if (recargas.length === 0) return null;

  const atrasadas = recargas.filter((r) => r.urgencia === "atrasada").length;
  const hojeN = recargas.filter((r) => r.urgencia === "hoje").length;
  const semana = recargas.filter((r) => r.urgencia === "semana").length;

  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby="titulo-recargas">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls="lista-recargas"
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left"
      >
        <span id="titulo-recargas" className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarClock size={16} className="text-muted-foreground" aria-hidden="true" />
          Calendário de recargas Pix/boleto
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {atrasadas > 0 && <span className={cn("rounded-full border px-2 py-0.5 font-medium", URGENCIA.atrasada.cls)}>{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</span>}
          {hojeN > 0 && <span className={cn("rounded-full border px-2 py-0.5 font-medium", URGENCIA.hoje.cls)}>{hojeN} hoje</span>}
          {semana > 0 && <span className={cn("rounded-full border px-2 py-0.5 font-medium", URGENCIA.semana.cls)}>{semana} nesta semana</span>}
          <span className="text-muted-foreground">{recargas.length} conta{recargas.length > 1 ? "s" : ""} pré-paga{recargas.length > 1 ? "s" : ""}</span>
        </span>
        <ChevronDown size={16} className={cn("ml-auto shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} aria-hidden="true" />
      </button>

      {aberto && (
        <div id="lista-recargas" className="border-t border-border">
          <p className="px-4 pt-3 text-[11px] text-muted-foreground">
            Prazo = o aporte combinado ou 1 dia antes do saldo acabar no ritmo dos últimos 3 dias (boleto: 3 dias antes) — o que vier primeiro.
            O lembrete é um rascunho: quem manda é você.
          </p>
          <ul className="divide-y divide-border">
            {recargas.map((r) => {
              const u = URGENCIA[r.urgencia];
              const vendo = lendo === r.id;
              return (
                <li key={r.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[92px_minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex items-center gap-2 sm:block">
                    {r.prazo ? (
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {ddmm(r.prazo)} <span className="text-[11px] font-normal text-muted-foreground">{diaSemana(r.prazo)}</span>
                      </p>
                    ) : <p className="text-sm text-muted-foreground">—</p>}
                    <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium sm:mt-1", u.cls)}>{u.rotulo}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{r.clientName}</p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {FORMA[r.forma]}
                      {r.saldo != null && <> · saldo {brl0(r.saldo)}</>}
                      {r.ritmoDia != null && <> · {brl0(r.ritmoDia)}/dia</>}
                      {r.acabaEm && <> · acaba ~{ddmm(r.acabaEm)}</>}
                      {r.proximoAporte && <> · aporte combinado {ddmm(r.proximoAporte)}</>}
                    </p>
                    {vendo && (
                      <p className="mt-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs leading-relaxed text-foreground">{r.mensagem}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setLendo(vendo ? null : r.id)}
                      className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                      {vendo ? "Esconder" : "Ver lembrete"}
                    </button>
                    <button type="button" onClick={() => copiar(r.mensagem)} title="Copiar o rascunho do lembrete"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:border-primary/30">
                      <Copy size={13} aria-hidden="true" /> Copiar
                    </button>
                    {r.linkWhatsApp ? (
                      <a href={r.linkWhatsApp} target="_blank" rel="noopener noreferrer"
                        title="Abre o WhatsApp com o texto pronto — você confere e envia"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:border-lone-success-border hover:text-lone-success">
                        <MessageCircle size={13} aria-hidden="true" /> WhatsApp
                      </a>
                    ) : (
                      <span className="text-[11px] text-muted-foreground" title="Cadastre o telefone financeiro em Verba e alertas">sem telefone</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
