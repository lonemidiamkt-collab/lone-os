"use client";

// Uma linha da Central de Agentes: o agente do catálogo + o estado real. Abre para mostrar dono,
// interruptores (com o estado de cada um), rotinas, etiquetas e arquivos.

import Link from "next/link";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_ALCANCE, type Alcance, type Gatilho } from "@/lib/agentes/catalogo";
import type { Estado, EstadoInterruptor, RotinaDoAgente } from "@/lib/agentes/estado";
import type { LinhaAgente as Linha } from "@/lib/agentes/central-server";
import { automacaoPorId } from "@/lib/automacoes/registro";
import { dataHora, haQuanto } from "@/lib/automacoes/formato";

export const ESTADO_UI: Record<Estado, { rotulo: string; ponto: string; texto: string }> = {
  funcionando: { rotulo: "Funcionando", ponto: "bg-lone-success", texto: "text-lone-success" },
  falhando: { rotulo: "Falhando", ponto: "bg-lone-danger", texto: "text-lone-danger" },
  parado: { rotulo: "Parado", ponto: "bg-lone-warning", texto: "text-lone-warning" },
  desligado: { rotulo: "Desligado", ponto: "bg-muted-foreground", texto: "text-muted-foreground" },
  "sem-registro": { rotulo: "Sem registro", ponto: "border border-muted-foreground", texto: "text-muted-foreground" },
};

const ALCANCE_UI: Record<Alcance, string> = {
  sugere: "border-border text-muted-foreground",
  grava: "border-border text-foreground",
  time: "border-lone-info-border bg-lone-info-bg text-lone-info",
  cliente: "border-lone-warning-border bg-lone-warning-bg text-lone-warning",
  meta: "border-lone-danger-border bg-lone-danger-bg text-lone-danger",
};

/** O gatilho em uma frase. A agenda da rotina vem da Central de Automações. */
export function textoGatilho(g: Gatilho, rotinas: readonly RotinaDoAgente[]): string {
  switch (g.tipo) {
    case "cron": {
      const agenda = rotinas.find((r) => r.id === g.automacao)?.agendaBRT ?? automacaoPorId(g.automacao)?.agendaBRT;
      return agenda ? `Agenda: ${agenda}` : `Rotina ${g.automacao}`;
    }
    case "webhook": return g.quando;
    case "botao": return `Botão: ${g.onde}`;
    case "evento": return g.quando;
    case "manual": return g.como;
  }
}

function Ponto({ estado }: { estado: Estado }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", ESTADO_UI[estado].ponto)} />;
}

function PontoInterruptor({ i }: { i: EstadoInterruptor }) {
  return (
    <span
      aria-hidden
      className={cn("mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        i.ligado === true ? "bg-lone-success" : i.ligado === false ? "bg-lone-danger" : "border border-muted-foreground")}
    />
  );
}

const FONTE: Record<"ia" | "execucao" | "rotina", string> = {
  ia: "chamada de IA",
  execucao: "execução",
  rotina: "rodada da rotina",
};

export default function LinhaAgente({ linha: l, agora, aberta, onAbrir }: {
  linha: Linha;
  agora: number;
  aberta: boolean;
  onAbrir: () => void;
}) {
  const a = l.agente;
  const ui = ESTADO_UI[l.estado];
  const temProblema = l.estado === "falhando" || l.estado === "parado";

  return (
    <div className={cn("px-4 py-3", aberta && "bg-muted/30")}>
      <div className="grid grid-cols-2 items-start gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_8.5rem_14rem_9.5rem_7rem_2rem] xl:items-center">
        {/* Agente */}
        <div className="col-span-2 min-w-0 sm:col-span-3 xl:col-span-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Ponto estado={l.estado} />
            <button type="button" onClick={onAbrir} className="text-left text-sm font-medium text-foreground hover:text-primary">
              {a.nome}
            </button>
            <span className={cn("text-lone-caption", ui.texto)}>{ui.rotulo}</span>
            {a.situacao === "sombra" && (
              <span className="rounded-full border border-border px-2 py-0.5 text-lone-caption text-muted-foreground" title="Grava o resultado e não manda para ninguém">em sombra</span>
            )}
            {a.atencao && (
              <span className="inline-flex items-center gap-1 rounded-full border border-lone-warning-border bg-lone-warning-bg px-2 py-0.5 text-lone-caption text-lone-warning" title={a.atencao}>
                <AlertTriangle size={11} aria-hidden /> atenção
              </span>
            )}
          </div>
          <p className="mt-0.5 text-lone-caption text-muted-foreground xl:line-clamp-1" title={a.faz}>{a.faz}</p>
          {l.motivo && (
            <p className={cn("mt-0.5 text-lone-caption", temProblema || l.estado === "desligado" ? ui.texto : "text-muted-foreground")}>{l.motivo}</p>
          )}
        </div>

        {/* Alcance */}
        <div className="min-w-0 text-xs">
          <p className="text-lone-eyebrow uppercase text-muted-foreground xl:hidden">Alcance</p>
          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-lone-caption", ALCANCE_UI[a.alcance])}>
            {ROTULO_ALCANCE[a.alcance]}
          </span>
        </div>

        {/* Gatilho */}
        <div className="min-w-0 text-xs">
          <p className="text-lone-eyebrow uppercase text-muted-foreground xl:hidden">Quando roda</p>
          <p className="line-clamp-2 text-foreground" title={a.gatilhos.map((g) => textoGatilho(g, l.rotinas)).join(" · ")}>
            {textoGatilho(a.gatilhos[0], l.rotinas)}
          </p>
          {a.gatilhos.length > 1 && <p className="text-muted-foreground">e mais {a.gatilhos.length - 1}</p>}
        </div>

        {/* Última execução */}
        <div className="min-w-0 text-xs">
          <p className="text-lone-eyebrow uppercase text-muted-foreground xl:hidden">Última execução</p>
          {l.ultimaEm ? (
            <>
              <p className="text-foreground" title={dataHora(l.ultimaEm)}>{haQuanto(l.ultimaEm, agora)}</p>
              {l.ultimaFonte && <p className="text-muted-foreground">{FONTE[l.ultimaFonte]}</p>}
            </>
          ) : (
            <p className="text-muted-foreground">nenhuma em 90 dias</p>
          )}
        </div>

        {/* 7 dias */}
        <div className="text-xs">
          <p className="text-lone-eyebrow uppercase text-muted-foreground xl:hidden">7 dias</p>
          {l.uso.chamadas7d === 0 && l.falhas7d === 0 ? (
            <p className="text-muted-foreground">—</p>
          ) : (
            <p className="flex flex-wrap gap-x-2">
              {l.uso.chamadas7d > 0 && <span className="text-foreground">{l.uso.chamadas7d} chamada{l.uso.chamadas7d > 1 ? "s" : ""}</span>}
              {l.falhas7d > 0 && <span className="text-lone-danger">{l.falhas7d} falha{l.falhas7d > 1 ? "s" : ""}</span>}
            </p>
          )}
        </div>

        <button
          type="button" onClick={onAbrir} aria-expanded={aberta} aria-label={aberta ? "Fechar detalhes" : "Ver detalhes"}
          className="col-span-2 ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground sm:col-span-3 xl:col-span-1"
        >
          <ChevronDown size={16} className={cn("transition-transform", aberta && "rotate-180")} />
        </button>
      </div>

      {aberta && (
        <div className="mt-3 space-y-3">
          {a.atencao && (
            <p className="flex items-start gap-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3 text-xs text-foreground">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-lone-warning" />
              {a.atencao}
            </p>
          )}

          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Quem responde</dt>
              <dd className="text-foreground">{a.dono}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Modelo</dt>
              <dd className="text-foreground">{a.modelo}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Etiqueta das chamadas</dt>
              <dd className="break-all font-mono text-foreground">{a.origens.join("  ·  ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Últimos 7 dias</dt>
              <dd className="text-foreground">
                {l.uso.chamadas7d} chamada{l.uso.chamadas7d === 1 ? "" : "s"} de IA · {l.uso.falhasIa7d} com falha
                {l.uso.errosExecucao7d > 0 && ` · ${l.uso.errosExecucao7d} execuç${l.uso.errosExecucao7d > 1 ? "ões" : "ão"} com erro`}
              </dd>
            </div>
          </dl>

          {l.uso.ultimaFalhaIa && (
            <p className="text-xs text-muted-foreground">
              Última falha de IA {haQuanto(l.uso.ultimaFalhaIa.em, agora)}:{" "}
              <span className="break-all font-mono text-[11px] text-foreground">{l.uso.ultimaFalhaIa.erro || "sem mensagem"}</span>
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-lone-eyebrow uppercase text-muted-foreground">O que põe para rodar</p>
              <ul className="space-y-1 text-xs text-foreground">
                {a.gatilhos.map((g, i) => <li key={i}>{textoGatilho(g, l.rotinas)}</li>)}
              </ul>
              {l.rotinas.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Rotina{l.rotinas.length > 1 ? "s" : ""}:{" "}
                  {l.rotinas.map((r, i) => (
                    <span key={r.id}>
                      {i > 0 && " · "}
                      <Link href={`/automations?busca=${encodeURIComponent(r.id)}`} className="text-foreground underline underline-offset-2 hover:text-primary">{r.nome}</Link>
                    </span>
                  ))}
                </p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-lone-eyebrow uppercase text-muted-foreground">O que desliga</p>
              {l.interruptores.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nada próprio: só para se a IA inteira parar (chave ou crédito da OpenAI).</p>
              ) : (
                <ul className="space-y-1.5">
                  {l.interruptores.map((i, k) => (
                    <li key={k} className="flex items-start gap-2 text-xs">
                      <PontoInterruptor i={i} />
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{i.rotulo}</span>
                        <span className="text-muted-foreground"> — {i.detalhe}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="break-all text-[11px] text-muted-foreground">
            Código: <span className="font-mono">{a.arquivos.join("  ·  ")}</span>
          </p>
        </div>
      )}
    </div>
  );
}
