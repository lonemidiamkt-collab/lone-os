"use client";

// components/inicio/HojeDoCs.tsx — a porta do Início para o "Hoje" do CS (Leva 6A).
//
// O CS (a gestão) tinha quatro lugares disputando o começo do dia: Início, Agente Lone, Jornada CS e
// Termômetro de Churn. O dia começa no feed de prioridades do agente (/agente); aqui só o resumo —
// quantas estão no seu nome e as três primeiras — com UMA ação: abrir o Hoje do CS.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";

interface Item { id: string; titulo: string }
interface Resposta { itens: Item[]; total: number }

export default function HojeDoCs() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    chamar<Resposta>("/api/priority/feed?escopo=meu&limite=3").then((r) => {
      if (r.ok && r.data) setDados(r.data);
      else setErro(true);
    });
  }, []);

  const total = dados?.total ?? 0;
  return (
    <section aria-labelledby="titulo-hoje-cs" className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-lone-eyebrow uppercase text-muted-foreground">Hoje do CS</p>
          <h2 id="titulo-hoje-cs" className="text-lone-h2 tracking-tight text-foreground">
            {!dados ? "Prioridades do agente" : total === 0 ? "Nada aberto no seu nome" : total === 1 ? "1 prioridade no seu nome" : `${total} prioridades no seu nome`}
          </h2>
        </div>
        <Link href="/agente" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
          Abrir <ChevronRight size={13} aria-hidden />
        </Link>
      </div>
      {!dados && !erro ? (
        <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
      ) : erro ? (
        <p className="text-lone-caption text-muted-foreground">Não consegui ler o feed agora. O Hoje do CS continua em Agente Lone.</p>
      ) : total === 0 ? (
        <p className="text-lone-caption text-muted-foreground">O feed recalcula de hora em hora; se algo surgir, aparece aqui.</p>
      ) : (
        <ol className="space-y-1.5">
          {dados!.itens.map((i) => (
            // O título do feed já vem com o cliente ("Império: 10 posts atrasados").
            <li key={i.id} className="truncate text-lone-caption text-foreground/80" title={i.titulo}>{i.titulo}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
