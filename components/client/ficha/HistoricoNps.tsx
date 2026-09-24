"use client";

// components/client/ficha/HistoricoNps.tsx — as notas que o CLIENTE deu depois das reuniões
// (lib/cs/nps.ts). Substitui o antigo "NPS" de estrelas, que era o time avaliando o cliente.

import { categoriaNps, JANELA_RESPOSTA_H, ROTULO_CATEGORIA, type CategoriaNps } from "@/lib/cs/nps";
import type { ItemHistoricoNps } from "@/lib/cs/nps-server";
import { cn } from "@/lib/utils";
import { Vazio } from "./Secao";
import { dataCurta } from "./rotulos";

const COR: Record<CategoriaNps, string> = {
  promotor: "border-lone-success-border bg-lone-success-bg text-lone-success",
  neutro: "border-lone-warning-border bg-lone-warning-bg text-lone-warning",
  detrator: "border-lone-danger-border bg-lone-danger-bg text-lone-danger",
};

function situacao(i: ItemHistoricoNps, agora: number): string {
  if (i.nota !== null) return i.status === "aguardando_motivo" ? "esperando o “o que faria virar 10”" : "respondido";
  if (i.status === "sem_resposta") return "sem resposta";
  if (i.status === "aguardando" && agora - new Date(i.perguntadoEm).getTime() > JANELA_RESPOSTA_H * 3600_000) return "sem resposta";
  return "esperando a nota";
}

export default function HistoricoNps({ itens, erro }: { itens: ItemHistoricoNps[]; erro: string | null }) {
  const agora = Date.now();
  if (erro && !itens.length) return <Vazio>{erro}</Vazio>;
  if (!itens.length) {
    return (
      <Vazio>
        Nenhuma pesquisa ainda. Depois de cada reunião marcada como realizada, o Agente pergunta ao cliente, no
        grupo, a nota de 0 a 10 — quando a automação “NPS depois da reunião” estiver ligada na Central de Automações.
      </Vazio>
    );
  }
  const respondidas = itens.filter((i) => i.nota !== null);
  return (
    <div className="space-y-3">
      {respondidas.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-lone-body text-muted-foreground">
            Última nota: <span className="text-lone-h2 text-foreground">{respondidas[0].nota}</span>
          </p>
          {respondidas.length > 1 && (
            <p className="text-lone-caption text-muted-foreground">
              Média das {respondidas.length} últimas: {(respondidas.reduce((s, i) => s + (i.nota ?? 0), 0) / respondidas.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            </p>
          )}
        </div>
      )}
      <ul className="divide-y divide-border">
        {itens.map((i) => {
          const cat = i.nota !== null ? categoriaNps(i.nota) : null;
          return (
            <li key={i.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-3">
              <span className="w-24 shrink-0 text-lone-caption text-muted-foreground">Perguntado {dataCurta(i.perguntadoEm)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  {i.nota !== null && cat ? (
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-lone-caption", COR[cat])}>
                      <span className="font-medium tabular-nums">{i.nota}</span> · {ROTULO_CATEGORIA[cat]}
                    </span>
                  ) : null}
                  <span className="text-lone-caption text-muted-foreground">{situacao(i, agora)}{i.respondidoEm ? ` em ${dataCurta(i.respondidoEm)}` : ""}</span>
                </span>
                {i.motivo && <span className="mt-1 block text-lone-body text-foreground [overflow-wrap:anywhere]">“{i.motivo}”</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
