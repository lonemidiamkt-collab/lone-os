"use client";

// "Ver todos os anúncios ativos" — o CEO pediu (24/09) que o cliente veja TODOS os criativos no ar,
// não só os que estão dando certo. Abre uma gaveta (de baixo no celular, da direita no computador)
// com a lista que veio pronta no snapshot (lib/portal/anunciosAtivos.ts): nenhuma chamada à Meta
// sai do navegador. Os anúncios sem resultado aparecem marcados, nunca escondidos. O resultado é o do
// período (N4): conversas, leads ou compras — as palavras acompanham.

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, LayoutGrid, X } from "lucide-react";
// clsx (não cn) onde o tamanho de fonte "lone" encontra uma cor de texto: o twMerge acha que os dois são cor
// e apaga o tamanho.
import { clsx } from "clsx";
import { cn } from "@/lib/utils";
import type { ActiveAdItem, ActiveAdsList, PeriodKind } from "@/lib/portal/types";
import { ordenarAnuncios, situacaoAnuncio, type CriterioAnuncios, type SituacaoAnuncio } from "@/lib/portal/anunciosAtivos";
import {
  formatarBRL, formatarNumero, palavrasDoResultado, type PalavrasResultado, type TipoResultadoPortal,
} from "@/lib/portal/formatos";
import CriativoThumb from "./CriativoThumb";
import { Segmentado } from "./ui";

function selo(situacao: SituacaoAnuncio, p: PalavrasResultado): { texto: string; classes: string } {
  if (situacao === "com_resultado") return { texto: `Com ${p.varios}`, classes: "border-lone-success-border bg-lone-success-bg text-lone-success" };
  if (situacao === "sem_resultado") return { texto: `Sem ${p.varios} no período`, classes: "border-lone-warning-border bg-lone-warning-bg text-lone-warning" };
  return { texto: "Sem veiculação no período", classes: "border-border bg-muted text-muted-foreground" };
}

// "com os números dos últimos 7 dias" — o rótulo do período ("Últimos 7 dias") não encaixa na frase.
const DO_PERIODO: Record<PeriodKind, string> = {
  last_week: "dos últimos 7 dias",
  last_2_weeks: "das últimas 2 semanas",
  this_month: "deste mês",
  last_month: "do mês passado",
};

const resultados = (n: number, p: PalavrasResultado) => `${formatarNumero(n)} ${n === 1 ? p.um : p.varios}`;

export default function AnunciosAtivos({ lista, periodo, tipoResultado }: {
  lista: ActiveAdsList;
  /** De qual período são os números da lista. */
  periodo: PeriodKind;
  /** O que o resultado conta (result_kind do snapshot). Ausente = conversas. */
  tipoResultado?: TipoResultadoPortal | null;
}) {
  const palavras = palavrasDoResultado(tipoResultado);
  const [aberto, setAberto] = useState(false);
  const [criterio, setCriterio] = useState<CriterioAnuncios>("resultado");
  const itens = useMemo(() => ordenarAnuncios(lista.items, criterio), [lista.items, criterio]);
  // Contagem do servidor (antes do limite de itens); snapshot sem ela conta pelos itens.
  const comResultado = lista.with_messages ?? lista.items.filter((a) => a.messages > 0).length;
  const semResultado = Math.max(0, lista.total - comResultado);
  const limitada = lista.total > lista.items.length;

  return (
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      <Dialog.Trigger asChild>
        <button type="button"
          className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <span className="flex min-w-0 items-center gap-2.5">
            <LayoutGrid size={16} className="shrink-0 text-primary" aria-hidden />
            <span className="truncate">Ver todos os anúncios ativos</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5 text-lone-caption tabular-nums">{lista.total}</span>
            <ChevronRight size={16} aria-hidden />
          </span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col border-border bg-background text-foreground shadow-lg focus:outline-none",
            // Celular: gaveta de baixo. Computador: painel da direita.
            "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]",
            "sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[460px] sm:rounded-none sm:rounded-l-2xl sm:border-l sm:border-t-0",
            "duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
            "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-right",
            "motion-reduce:animate-none",
          )}
        >
          <div className="border-b border-border px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="text-lone-h1 font-semibold tracking-tight text-foreground">Anúncios ativos</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-lone-caption text-muted-foreground">
                  Todos os anúncios no ar agora, com os números {DO_PERIODO[periodo]}.
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Fechar">
                <X size={18} aria-hidden />
              </Dialog.Close>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2">
              {([
                ["No ar", lista.total],
                [`Com ${palavras.varios}`, comResultado],
                [`Sem ${palavras.varios}`, semResultado],
              ] as const).map(([rotulo, n]) => (
                <div key={rotulo} className="rounded-lg border border-border bg-card px-3 py-2">
                  <dt className="truncate text-lone-caption text-muted-foreground">{rotulo}</dt>
                  <dd className="text-lone-h2 font-semibold tabular-nums text-foreground">{formatarNumero(n)}</dd>
                </div>
              ))}
            </dl>

            <Segmentado
              className="mt-3"
              rotulo="Ordenar anúncios por"
              tamanho="sm"
              cheio
              opcoes={[{ valor: "resultado", rotulo: `Mais ${palavras.varios}` }, { valor: "custo", rotulo: "Menor custo" }]}
              valor={criterio}
              onChange={setCriterio}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5">
            {itens.length === 0 ? (
              <p className="py-10 text-center text-lone-body text-muted-foreground">Nenhum anúncio no ar agora.</p>
            ) : (
              <ul className="divide-y divide-border">
                {itens.map((a) => <LinhaAnuncio key={a.id} anuncio={a} criterio={criterio} palavras={palavras} />)}
              </ul>
            )}
            <p className="py-4 text-lone-caption text-muted-foreground">
              {limitada ? `Mostrando os ${lista.items.length} que mais renderam, de ${lista.total} anúncios ativos. ` : ""}
              {palavras.Varios} {palavras.atribuidos} em até 7 dias após o clique.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LinhaAnuncio({ anuncio: a, criterio, palavras }: { anuncio: ActiveAdItem; criterio: CriterioAnuncios; palavras: PalavrasResultado }) {
  const { texto: textoSelo, classes: classesSelo } = selo(situacaoAnuncio(a), palavras);
  const porCusto = criterio === "custo";
  return (
    <li className="flex items-start gap-3 py-3">
      <CriativoThumb url={a.thumbnail_url} path={a.thumbnail_path} name={a.name} className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-lone-body font-medium text-foreground">{a.name}</p>
        <span className={cn("mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", classesSelo)}>
          {textoSelo}
        </span>
        <p className="mt-1.5 text-lone-caption text-muted-foreground">
          {a.spend > 0 ? <><span className="tabular-nums text-foreground">{formatarBRL(a.spend)}</span> investido</> : "Nada investido no período"}
          {porCusto
            ? <> · <span className="tabular-nums text-foreground">{resultados(a.messages, palavras)}</span></>
            : a.cpa != null && <> · <span className="tabular-nums text-foreground">{formatarBRL(a.cpa)}</span> {palavras.porUm}</>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {porCusto ? (
          <>
            <p className="text-lone-h2 font-semibold tabular-nums text-foreground">{a.cpa != null ? formatarBRL(a.cpa) : "—"}</p>
            <p className="text-lone-caption text-muted-foreground">{palavras.porUm}</p>
          </>
        ) : (
          <>
            <p className={clsx("text-lone-h2 font-semibold tabular-nums", a.messages > 0 ? "text-foreground" : "text-muted-foreground")}>{formatarNumero(a.messages)}</p>
            <p className="text-lone-caption text-muted-foreground">{a.messages === 1 ? palavras.um : palavras.varios}</p>
          </>
        )}
      </div>
    </li>
  );
}
