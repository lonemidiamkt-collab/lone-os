"use client";

// Meu Trabalho — a casa das tarefas. Antes eram três telas para as mesmas tarefas (/my-work, /tarefas e
// /calendar), cada uma com um pedaço. Agora são três VISTAS aqui dentro, reaproveitando os mesmos
// componentes; /tarefas e /calendar continuam de pé e redirecionam pra cá.
//
//   /my-work                → Hoje (o que está com você agora)
//   /my-work?view=tarefas   → Tarefas (lista do time, filtros, concluir)
//   /my-work?view=agenda    → Agenda (calendário; aceita &d=AAAA-MM-DD)
//   &acao=nova-tarefa       → abre o formulário de nova tarefa (atalho da busca ⌘K)

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sun, ClipboardCheck, Calendar } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Header from "@/components/Header";
import { useRole } from "@/lib/context/RoleContext";
import { cn } from "@/lib/utils";
import Hoje from "./Hoje";
import Tarefas from "@/app/tarefas/Tarefas";
import { BotaoNovaTarefa } from "@/app/tarefas/NovaTarefa";
import Agenda from "@/app/calendar/Agenda";

type Vista = "hoje" | "tarefas" | "agenda";

const VISTAS: { id: Vista; rotulo: string; icone: LucideIcon }[] = [
  { id: "hoje", rotulo: "Hoje", icone: Sun },
  { id: "tarefas", rotulo: "Tarefas", icone: ClipboardCheck },
  { id: "agenda", rotulo: "Agenda", icone: Calendar },
];

function lerVista(v: string | null): Vista {
  return v === "tarefas" || v === "agenda" ? v : "hoje";
}

export default function MeuTrabalho() {
  const router = useRouter();
  const pathname = usePathname() || "/my-work";
  const params = useSearchParams();
  const { role, currentUser } = useRole();
  const isGestao = role === "admin" || role === "manager";

  const vista = lerVista(params?.get("view") ?? null);
  const acao = params?.get("acao") ?? null;
  // ?area=trafego: Tarefas já abre filtrada (atalho "Tarefas do tráfego" do /traffic).
  const area = params?.get("area") ?? null;

  // Vista já aberta fica montada (escondida): voltar pra ela não refaz a busca de reuniões nem perde
  // o mês que estava na agenda.
  const [visitadas, setVisitadas] = useState<Set<Vista>>(() => new Set([vista]));
  useEffect(() => {
    setVisitadas((v) => (v.has(vista) ? v : new Set(v).add(vista)));
  }, [vista]);

  const montada = (v: Vista) => v === vista || visitadas.has(v);

  function trocarVista(v: Vista) {
    router.replace(v === "hoje" ? pathname : `${pathname}?view=${v}`, { scroll: false });
  }

  // Tira o ?acao= da URL depois de abrir o formulário (senão reabre no F5).
  function limparAcao() {
    const resto = new URLSearchParams(params?.toString() ?? "");
    resto.delete("acao");
    const q = resto.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  const vistaAtual = VISTAS.find((v) => v.id === vista)!;

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Meu Trabalho" subtitle={vistaAtual.rotulo} />

      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Vistas do Meu Trabalho" className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
            {VISTAS.map((v) => {
              const ativa = v.id === vista;
              const Icone = v.icone;
              return (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={ativa}
                  onClick={() => trocarVista(v.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ativa ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icone size={14} className={ativa ? "text-primary" : undefined} />
                  {v.rotulo}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <p className="hidden md:block text-lone-caption text-muted-foreground">
              {isGestao ? "Tudo o que está com o time" : `O que está com ${currentUser}`}
            </p>
            <BotaoNovaTarefa abrirAoMontar={acao === "nova-tarefa"} aoAbrir={limparAcao} />
          </div>
        </div>

        {montada("hoje") && <div role="tabpanel" hidden={vista !== "hoje"}><Hoje /></div>}
        {montada("tarefas") && (
          <div role="tabpanel" hidden={vista !== "tarefas"}>
            <Tarefas area={area} onLimparArea={() => router.replace(`${pathname}?view=tarefas`, { scroll: false })} />
          </div>
        )}
        {montada("agenda") && <div role="tabpanel" hidden={vista !== "agenda"}><Agenda embutido /></div>}
      </div>
    </div>
  );
}
